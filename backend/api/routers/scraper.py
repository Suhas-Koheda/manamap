from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import Tender, District, Department
from backend.scraper.crawler import TelanganaTenderScraper
from scraper.pipeline import DISTRICT_COORDINATES
from datetime import datetime, timedelta
import random
import logging

router = APIRouter(prefix="/api/scraper", tags=["Scraper Controls"])
logger = logging.getLogger(__name__)

def parse_date(date_str: str) -> datetime:
    """Parses date strings safely, returning fallback if malformed."""
    if not date_str:
        return datetime.utcnow()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%B %d %Y", "%b %d %Y %I:%M %p"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return datetime.utcnow()

async def run_scraper_task(db_session: Session):
    """Core background aggregation task that crawls pages, normalizes, and saves to PostgreSQL."""
    logger.info("Executing async eProcurement scraper aggregation run...")
    scraper = TelanganaTenderScraper()
    
    offset = 0
    limit = 50
    inserted_count = 0
    updated_count = 0
    
    try:
        await scraper.refresh_session()
        
        while True:
            logger.info(f"Crawling page range starting at offset: {offset}")
            records = await scraper.fetch_page(start=offset, length=limit)
            
            if not records:
                logger.info(f"No records returned at offset {offset}. Crawling completed.")
                break
                
            for record in records:
                # Structure can be list of columns or dictionary depending on JSON format
                # Let's support both formats robustly:
                if isinstance(record, dict):
                    t_id = record.get("tenderId") or record.get("enquiryId") or record.get("tenderNoticeNo")
                    title = record.get("tenderSubject") or record.get("subject") or "Infrastructure Project"
                    dept_name = record.get("deptName") or record.get("department") or "Roads & Buildings (R&B)"
                    dist_name = record.get("districtName") or record.get("district") or "Hyderabad"
                    val_str = str(record.get("estimatedCost") or record.get("tenderValue") or "0.0").replace(",", "")
                    closing_str = record.get("closingDate") or record.get("bidSubmissionClosingDate")
                    publication_str = record.get("publicationDate") or record.get("bidSubmissionStartDate")
                    status = record.get("status") or "open"
                    pdf_url = record.get("pdfUrl") or record.get("documentUrl")
                elif isinstance(record, list) and len(record) >= 5:
                    t_id = record[0]
                    dept_name = record[1]
                    title = record[2]
                    val_str = str(record[3]).replace(",", "")
                    closing_str = record[4]
                    publication_str = None
                    dist_name = "Hyderabad"
                    status = "open"
                    pdf_url = None
                else:
                    logger.warning(f"Skipping malformed raw record: {record}")
                    continue
                    
                if not t_id:
                    continue
                    
                # Parse cost/value
                try:
                    val = float(val_str)
                except ValueError:
                    val = 0.0
                    
                # Clean strings
                t_id = str(t_id).strip()
                title = str(title).strip()
                dept_name = str(dept_name).strip()
                dist_name = str(dist_name).strip()
                status = str(status).strip().lower()
                
                # Align status
                if status not in ["open", "awarded", "completed"]:
                    status = "open"
                    
                # Map coordinates
                coords = DISTRICT_COORDINATES.get(dist_name, (17.8500, 79.1500))
                jitter_lat = random.uniform(-0.015, 0.015)
                jitter_lng = random.uniform(-0.015, 0.015)
                
                # Check for existing
                existing_tender = db_session.query(Tender).filter(Tender.tender_id == t_id).first()
                if existing_tender:
                    # Update fields if changed
                    changed = False
                    if existing_tender.title != title:
                        existing_tender.title = title
                        changed = True
                    if existing_tender.status != status:
                        existing_tender.status = status
                        changed = True
                    if existing_tender.tender_value != val:
                        existing_tender.tender_value = val
                        changed = True
                        
                    if changed:
                        existing_tender.updated_at = datetime.utcnow()
                        existing_tender.raw_payload = record
                        updated_count += 1
                else:
                    # Insert new record
                    new_tender = Tender(
                        tender_id=t_id,
                        title=title,
                        department=dept_name,
                        district=dist_name,
                        tender_value=val,
                        closing_date=parse_date(closing_str),
                        publication_date=parse_date(publication_str) if publication_str else datetime.utcnow() - timedelta(days=5),
                        status=status,
                        pdf_url=pdf_url,
                        raw_payload=record,
                        latitude=coords[0] + jitter_lat,
                        longitude=coords[1] + jitter_lng
                    )
                    db_session.add(new_tender)
                    inserted_count += 1
                    
            db_session.commit()
            offset += limit
            
            # Rate limit/politeness pause
            await asyncio.sleep(1.0)
            
        logger.info(f"Scraper run completed successfully. Inserted: {inserted_count}, Updated: {updated_count} tenders.")
        
    except Exception as e:
        logger.error(f"Scraper job failed: {e}")
        db_session.rollback()
    finally:
        await scraper.close()

@router.post("/run")
def trigger_scraper(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Triggers the async scraper pipeline background execution."""
    background_tasks.add_task(run_scraper_task, db)
    return {"status": "success", "message": "Scraper run triggered successfully in the background."}

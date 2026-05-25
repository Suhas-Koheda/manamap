from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import Tender, District, Department
from backend.scraper.crawler import TelanganaTenderScraper
from backend.constants.districts import DISTRICT_COORDINATES
from datetime import datetime, timedelta
import random
import logging
import asyncio
import os
import re

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
                elif isinstance(record, list) and len(record) >= 6:
                    # Map from the actual list data returned by the portal:
                    # Index 0: Department Name
                    # Index 1: Tender ID
                    # Index 2: Enquiry Number
                    # Index 3: Tender Category
                    # Index 4: Name of Work (Title)
                    # Index 5: Estimated Contract Value (Rupees)
                    # Index 6: Published Date & Time
                    # Index 7: Bid Start Date
                    # Index 8: Bid Closing Date
                    # Index 9: Action HTML
                    dept_name = record[0]
                    t_id = record[1]
                    title = record[4]
                    val_str = str(record[5]).replace(",", "")
                    publication_str = record[6] if len(record) >= 7 else None
                    closing_str = record[8] if len(record) >= 9 else None
                    
                    # Deduce district from title or department
                    dist_name = "Hyderabad"
                    for district_candidate in DISTRICT_COORDINATES.keys():
                        if district_candidate.lower() in title.lower() or district_candidate.lower() in dept_name.lower():
                            dist_name = district_candidate
                            break
                    status = "open"
                    pdf_url = None
                else:
                    logger.warning(f"Skipping malformed raw record: {record}")
                    continue
                    
                if not t_id:
                    continue
                    
                # Parse cost/value
                try:
                    # Estimated cost is in Rupees from portal, convert to Lakhs
                    val = float(val_str) / 100000.0
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
                
                # Extract detail parameters from raw action link (record[9])
                indent_id, category_id, procurement_id = None, None, None
                if isinstance(record, list) and len(record) >= 10:
                    action_html = record[9]
                    btn_match = re.search(r"viewBtn\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", action_html)
                    if btn_match:
                        indent_id = btn_match.group(1)
                        category_id = btn_match.group(2)
                        procurement_id = btn_match.group(3)
                
                # Fetch details, documents and extract text if parameters found
                detail_page_url = None
                nit_pdf_url = None
                boq_pdf_url = None
                extracted_text = ""
                road_name = None
                village = None
                mandal = None
                chainage_start = None
                chainage_end = None
                raw_documents_metadata = None
                
                if indent_id and procurement_id:
                    detail_page_url = f"https://tender.telangana.gov.in/ViewTender.html?hdnIndentID={indent_id}&hdnProcurementID={procurement_id}"
                    
                    # 1. Fetch detail fields
                    detail_fields = await scraper.fetch_tender_details(indent_id, category_id, procurement_id)
                    
                    # 2. Fetch document attachments list
                    docs_list = await scraper.fetch_tender_documents_list(indent_id, procurement_id)
                    raw_documents_metadata = docs_list
                    
                    # 3. Download attachments and parse text
                    storage_dir = f"storage/pdfs/{dist_name}/{t_id}"
                    os.makedirs(storage_dir, exist_ok=True)
                    
                    downloaded_texts = []
                    for doc in docs_list:
                        doc_name = doc["doc_name"]
                        doc_id = doc["doc_id"]
                        path_type = doc["path_type"]
                        
                        # Identify URL patterns for NIT/BOQ
                        is_nit = "nit" in doc_name.lower() or "notice" in doc_name.lower() or "tender" in doc_name.lower()
                        is_boq = "boq" in doc_name.lower() or "quantity" in doc_name.lower() or "schedule" in doc_name.lower()
                        
                        local_path = await scraper.download_document(doc_id, doc_name, path_type, storage_dir)
                        if local_path:
                            # Extract text
                            doc_text = scraper.extract_text_from_file(local_path)
                            if doc_text:
                                downloaded_texts.append(doc_text)
                                
                            doc_web_url = f"https://tender.telangana.gov.in/DownLoadFile.html?hdndocIds={doc_id}&hdndocName={doc_name}&hdnsPath={path_type}"
                            if is_nit:
                                nit_pdf_url = doc_web_url
                            elif is_boq:
                                boq_pdf_url = doc_web_url
                                
                    if downloaded_texts:
                        extracted_text = "\n\n".join(downloaded_texts)
                        
                # Parse infrastructure metadata using regex
                text_to_search = f"{title}\n{extracted_text}"
                
                # Road name patterns
                road_match = re.search(r"(?:Road\s+from\s+([A-Za-z0-9\s\-]+?)\s+to\s+([A-Za-z0-9\s\-]+))|(?:Widening\s+of\s+([A-Za-z0-9\s\-\/]{5,}))|(?:MDR\s+road\s+([A-Za-z0-9\s\-]{5,}))|(?:BT\s+road\s+([A-Za-z0-9\s\-]{5,}))", text_to_search, re.IGNORECASE)
                if road_match:
                    if road_match.group(1) and road_match.group(2):
                        road_name = f"Road from {road_match.group(1).strip()} to {road_match.group(2).strip()}"
                    else:
                        non_empty = [g for g in road_match.groups() if g]
                        if non_empty:
                            road_name = non_empty[0].strip()
                            
                # Village pattern
                village_match = re.search(r"(?:at\s+village\s+([A-Za-z0-9\s\-]+))|(?:([A-Za-z0-9\s\-]+)\s+village)|(?:at\s+([A-Za-z0-9\s\-]+)\s+habitations?)", text_to_search, re.IGNORECASE)
                if village_match:
                    village = [g for g in village_match.groups() if g][0].strip()
                    
                # Mandal pattern
                mandal_match = re.search(r"(?:mandal\s+([A-Za-z0-9\s\-]+))|(?:in\s+([A-Za-z0-9\s\-]+)\s+mandal)", text_to_search, re.IGNORECASE)
                if mandal_match:
                    mandal = [g for g in mandal_match.groups() if g][0].strip()
                    
                # Chainage pattern (e.g. km 2/4 to km 8/6)
                chainage_match = re.search(r"(?:km|ch|chainage)\s*(\d+/\d+)\s*to\s*(?:km|ch|chainage)?\s*(\d+/\d+)", text_to_search, re.IGNORECASE)
                if chainage_match:
                    chainage_start = chainage_match.group(1).strip()
                    chainage_end = chainage_match.group(2).strip()
                    
                # Map coordinates - exact centroid from DISTRICT_COORDINATES (no jitter or random spreading)
                coords = DISTRICT_COORDINATES.get(dist_name, (17.8500, 79.1500))
                latitude = coords[0]
                longitude = coords[1]
                
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
                    if existing_tender.road_name != road_name:
                        existing_tender.road_name = road_name
                        changed = True
                    if existing_tender.village != village:
                        existing_tender.village = village
                        changed = True
                    if existing_tender.mandal != mandal:
                        existing_tender.mandal = mandal
                        changed = True
                    if existing_tender.chainage_start != chainage_start:
                        existing_tender.chainage_start = chainage_start
                        changed = True
                    if existing_tender.chainage_end != chainage_end:
                        existing_tender.chainage_end = chainage_end
                        changed = True
                    if existing_tender.extracted_text != extracted_text:
                        existing_tender.extracted_text = extracted_text
                        changed = True
                    if existing_tender.nit_pdf_url != nit_pdf_url:
                        existing_tender.nit_pdf_url = nit_pdf_url
                        changed = True
                    if existing_tender.boq_pdf_url != boq_pdf_url:
                        existing_tender.boq_pdf_url = boq_pdf_url
                        changed = True
                        
                    if changed:
                        existing_tender.updated_at = datetime.utcnow()
                        existing_tender.raw_payload = record
                        existing_tender.raw_documents_metadata = raw_documents_metadata
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
                        nit_pdf_url=nit_pdf_url,
                        boq_pdf_url=boq_pdf_url,
                        detail_page_url=detail_page_url,
                        extracted_text=extracted_text,
                        road_name=road_name,
                        village=village,
                        mandal=mandal,
                        chainage_start=chainage_start,
                        chainage_end=chainage_end,
                        raw_documents_metadata=raw_documents_metadata,
                        latitude=latitude,
                        longitude=longitude
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

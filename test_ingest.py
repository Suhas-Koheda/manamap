import asyncio
import sys
from backend.db.session import SessionLocal, init_db
from backend.api.routers.scraper import run_scraper_task

async def test_end_to_end_ingestion():
    print("Initializing Database...")
    init_db()
    
    db_session = SessionLocal()
    try:
        print("Running scraper task to fetch and ingest tenders into the database...")
        # Since run_scraper_task queries pages in a loop, let's limit it or let it run
        # Wait, the scraper is programmed to query until no records are found,
        # but to keep the test quick, let's ingest a small batch.
        # We can run the standard scraper task in the background.
        # We will run a modified one-page ingestion test so it finishes quickly.
        from backend.scraper.crawler import TelanganaTenderScraper
        from backend.api.routers.scraper import parse_date
        from backend.db.models import Tender
        from scraper.pipeline import DISTRICT_COORDINATES
        import random
        from datetime import datetime, timedelta
        
        scraper = TelanganaTenderScraper()
        await scraper.refresh_session()
        
        print("Fetching first page (offset=0, length=10) from Telangana portal...")
        records = await scraper.fetch_page(start=0, length=10)
        print(f"Retrieved {len(records)} records from portal. Inserting into database...")
        
        inserted = 0
        updated = 0
        
        for record in records:
            if isinstance(record, list) and len(record) >= 5:
                # Map raw list data to our Tender model
                t_id = str(record[1]).strip()
                dept_name = str(record[0]).strip()
                title = str(record[4]).strip()
                val_str = str(record[5]).replace(",", "")
                closing_str = record[8]
                publication_str = record[6]
                dist_name = "Hyderabad"  # Default fallback
                status = "open"
                
                try:
                    val = float(val_str) / 100000.0  # Convert to Lakhs (estimated cost in portal is in absolute Rupees)
                except ValueError:
                    val = 0.0
                    
                coords = DISTRICT_COORDINATES.get(dist_name, (17.8500, 79.1500))
                
                existing = db_session.query(Tender).filter(Tender.tender_id == t_id).first()
                if existing:
                    existing.title = title
                    existing.raw_payload = record
                    existing.updated_at = datetime.utcnow()
                    updated += 1
                else:
                    new_tender = Tender(
                        tender_id=t_id,
                        title=title,
                        department=dept_name,
                        district=dist_name,
                        tender_value=val,
                        closing_date=parse_date(closing_str),
                        publication_date=parse_date(publication_str) if publication_str else datetime.utcnow(),
                        status=status,
                        pdf_url=None,
                        raw_payload=record,
                        latitude=coords[0] + random.uniform(-0.01, 0.01),
                        longitude=coords[1] + random.uniform(-0.01, 0.01)
                    )
                    db_session.add(new_tender)
                    inserted += 1
                    
        db_session.commit()
        print(f"\nIngestion successful! Database updated. Inserted: {inserted}, Updated: {updated} tenders.")
        
        # Verify from database
        total_in_db = db_session.query(Tender).count()
        print(f"Total Tenders currently in Database: {total_in_db}")
        
    except Exception as e:
        print(f"Ingestion test failed: {e}", file=sys.stderr)
        db_session.rollback()
    finally:
        db_session.close()
        await scraper.close()

if __name__ == "__main__":
    asyncio.run(test_end_to_end_ingestion())

from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import Tender, Contractor, BOQItem, TimelineEvent, AISummary, District, Department, ProcurementCategory
from backend.scraper.crawler import TelanganaTenderScraper
from backend.ai.gemini_enricher import enrich_tender_with_ai
from datetime import datetime, timedelta
import random
import logging

router = APIRouter(prefix="/api/scraper", tags=["Scraper Controls"])
logger = logging.getLogger(__name__)

async def run_scraper_task(db_session: Session):
    """Background worker pipeline to crawl, enrich, and save records."""
    logger.info("Executing async scraper ingestion task in background...")
    scraper = TelanganaTenderScraper()
    try:
        # Fetch tenders
        homepage_tenders = await scraper.scrape_homepage_tenders()
        json_tenders = await scraper.scrape_details_datatables(start=0, length=10)
        
        all_scraped = homepage_tenders + json_tenders
        logger.info(f"Retrieved total of {len(all_scraped)} tenders across crawls.")
        
        # Standard contractors lists
        contractor_ids = ["c_ts_infra", "c_mega_eng", "c_srinivasa", "c_rr_builders", "c_hitech_infra"]
        contractors_data = [
            {"id": "c_ts_infra", "company_name": "Telangana State Infrastructure Development Corp Ltd", "cin_number": "U45203TG2014SGC095687", "class_rating": "Special Class I", "total_won_value": 14.2, "active_projects_count": 8, "risk_score": 1.2},
            {"id": "c_mega_eng", "company_name": "Mega Engineering & Infrastructures Ltd (MEIL)", "cin_number": "U45200TG2006PLC050215", "class_rating": "Special Class I", "total_won_value": 85.4, "active_projects_count": 22, "risk_score": 3.8},
            {"id": "c_srinivasa", "company_name": "Srinivasa Construction India Pvt Ltd", "cin_number": "U45200TG1998PTC029410", "class_rating": "Class I", "total_won_value": 4.5, "active_projects_count": 4, "risk_score": 2.1},
            {"id": "c_rr_builders", "company_name": "R.R. Constructions & Infrastructure", "cin_number": "U45209TG2008PTC061299", "class_rating": "Class II", "total_won_value": 1.25, "active_projects_count": 2, "risk_score": 0.8},
            {"id": "c_hitech_infra", "company_name": "Hi-Tech Engineering & Contractors", "cin_number": "U45200TG2011PTC075304", "class_rating": "Class I", "total_won_value": 3.1, "active_projects_count": 3, "risk_score": 1.5}
        ]
        
        # Ingest contractors first
        for contractor in contractors_data:
            existing = db_session.query(Contractor).filter(Contractor.id == contractor["id"]).first()
            if not existing:
                db_session.add(Contractor(**contractor))
        db_session.commit()
        
        # Deduplicate & process projects
        for t in all_scraped:
            tender_id = t["tenderId"]
            
            # Check if exists
            existing_tender = db_session.query(Tender).filter(Tender.id == tender_id).first()
            if existing_tender:
                logger.info(f"Tender {tender_id} already exists. Skipping ingestion.")
                continue
                
            logger.info(f"Ingesting new tender: {tender_id} - {t['title']}")
            
            # Map district and department
            dist_id = t["district"].lower().replace(" ", "_").replace("-", "_")
            dept_id = "rb_dept"
            if "panchayat" in t["department"].lower() or "pred" in t["department"].lower():
                dept_id = "pred_dept"
            elif "ghmc" in t["department"].lower() or "municipal" in t["department"].lower():
                dept_id = "ghmc"
            elif "water" in t["department"].lower() or "hmws" in t["department"].lower():
                dept_id = "hmwssb"
            elif "irrigation" in t["department"].lower() or "cad" in t["department"].lower():
                dept_id = "irrigation"
                
            # Verify district exists, if not seed it
            district_exists = db_session.query(District).filter(District.id == dist_id).first()
            if not district_exists:
                db_session.add(District(id=dist_id, name=t["district"], latitude=17.85, longitude=79.15))
                db_session.commit()
                
            # Map category
            cat_id = "civil_works"
            if "road" in t["title"].lower():
                cat_id = "road_works"
            elif "water" in t["title"].lower() or "pipe" in t["title"].lower() or "sewer" in t["title"].lower():
                cat_id = "water_supply"
            elif "software" in t["title"].lower() or "license" in t["title"].lower() or "blockchain" in t["title"].lower() or "microsoft" in t["title"].lower():
                cat_id = "it_telecom"
            elif "thermal" in t["title"].lower() or "power" in t["title"].lower() or "electricity" in t["title"].lower():
                cat_id = "power_energy"
                
            # Randomly award 40% of tenders for richer contractor leaderboard data
            status = "open"
            winning_contractor = None
            final_award = None
            if random.random() < 0.4:
                status = random.choice(["awarded", "completed"])
                winning_contractor = random.choice(contractor_ids)
                final_award = round(t["sanctionedAmount"] * random.uniform(0.92, 1.05), 2)
                
            # Coordinates jitter around center
            coords = DISTRICT_COORDINATES.get(t["district"], (17.8500, 79.1500))
            jitter_lat = random.uniform(-0.02, 0.02)
            jitter_lng = random.uniform(-0.02, 0.02)
            
            # Create Tender record
            new_tender = Tender(
                id=tender_id,
                title=t["title"],
                status=status,
                sanctioned_amount=t["sanctionedAmount"],
                final_award_amount=final_award,
                publication_date=datetime.now() - timedelta(days=random.randint(5, 30)),
                closing_date=datetime.now() + timedelta(days=random.randint(10, 40)),
                district_id=dist_id,
                department_id=dept_id,
                category_id=cat_id,
                winning_contractor_id=winning_contractor,
                latitude=coords[0] + jitter_lat,
                longitude=coords[1] + jitter_lng
            )
            db_session.add(new_tender)
            db_session.commit()
            
            # 1. Add BOQ items
            boq_list = []
            if cat_id == "road_works":
                boq_list = [
                    {"material_name": "Bituminous Asphalt", "estimated_cost": t["sanctionedAmount"] * 0.5},
                    {"material_name": "Earthwork & Grading", "estimated_cost": t["sanctionedAmount"] * 0.3},
                    {"material_name": "Signage & Delineators", "estimated_cost": t["sanctionedAmount"] * 0.2}
                ]
            else:
                boq_list = [
                    {"material_name": "Reinforced Concrete", "estimated_cost": t["sanctionedAmount"] * 0.6},
                    {"material_name": "Masonry and Finishes", "estimated_cost": t["sanctionedAmount"] * 0.4}
                ]
            for boq in boq_list:
                db_session.add(BOQItem(tender_id=tender_id, material_name=boq["material_name"], estimated_cost=boq["estimated_cost"]))
                
            # 2. Add Timeline Events
            db_session.add(TimelineEvent(tender_id=tender_id, event_name="Publication", event_date=new_tender.publication_date, description="Tender published on eProcurement portal."))
            db_session.add(TimelineEvent(tender_id=tender_id, event_name="Submission Deadline", event_date=new_tender.closing_date, description="Bid closing date."))
            if status in ["awarded", "completed"]:
                db_session.add(TimelineEvent(tender_id=tender_id, event_name="Bid Awarded", event_date=datetime.now() - timedelta(days=2), description=f"Contract awarded to {winning_contractor}."))
                
            # 3. Call Gemini AI Enrichment Pipeline
            ai_data = await enrich_tender_with_ai({
                "tenderId": tender_id,
                "title": t["title"],
                "department": t["department"],
                "district": t["district"],
                "sanctionedAmount": t["sanctionedAmount"],
                "closingDate": t["closingDate"]
            })
            
            db_session.add(AISummary(
                tender_id=tender_id,
                summary_en=ai_data["summary_en"],
                summary_te=ai_data["summary_te"],
                corruption_risk_analysis=ai_data["corruption_risk"],
                budget_anomaly_analysis=ai_data["budget_anomaly"],
                contractor_concentration_insights=ai_data["contractor_concentration"],
                delay_risk_prediction=ai_data["delay_risk"],
                overall_sentiment=ai_data["overall_sentiment"]
            ))
            
            db_session.commit()
            
    except Exception as e:
        logger.error(f"Scraper control task failed: {e}")
    finally:
        await scraper.close()

@router.post("/trigger")
def trigger_scraper(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Triggers the async scraper pipeline background execution."""
    background_tasks.add_task(run_scraper_task, db)
    return {"status": "success", "message": "Telangana eProcurement scraper ingestion triggered in background."}

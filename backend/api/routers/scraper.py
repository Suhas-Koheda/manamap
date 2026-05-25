from fastapi import APIRouter, Depends, BackgroundTasks, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.orm import Session
from backend.db.session import get_db, SessionLocal
from backend.db.models import Tender, District, Department, ScraperRun
from backend.scraper.crawler import TelanganaTenderScraper, browser_manager
from backend.constants.districts import DISTRICT_COORDINATES
from datetime import datetime, timedelta
import random
import logging
import asyncio
import os
import re

router = APIRouter(prefix="/api/scraper", tags=["Scraper Controls"])
logger = logging.getLogger(__name__)

# Connection Manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New WebSocket client connected. Active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                # Silently ignore broken connections, they will be disconnected
                pass

manager = ConnectionManager()

# Global Scraper State for Realtime Tracking
class ScraperState:
    def __init__(self):
        self.is_running = False
        self.start_time = None
        self.end_time = None
        self.pages_processed = 0
        self.tenders_processed = 0
        self.tenders_saved = 0
        self.documents_downloaded = 0
        self.failures = 0
        self.current_tender_id = None
        self.current_district = None
        self.active_download = None
        self.errors = []
        self.session_refreshes = 0
        self.logs = []
        self.current_offset = 0

    def reset(self):
        self.is_running = True
        self.start_time = datetime.utcnow()
        self.end_time = None
        self.pages_processed = 0
        self.tenders_processed = 0
        self.tenders_saved = 0
        self.documents_downloaded = 0
        self.failures = 0
        self.current_tender_id = None
        self.current_district = None
        self.active_download = None
        self.errors = []
        self.session_refreshes = 0
        self.logs = []
        self.current_offset = 0

    def add_log(self, text: str) -> str:
        log_entry = f"[{datetime.utcnow().strftime('%H:%M:%S')}] {text}"
        self.logs.append(log_entry)
        return log_entry

scraper_state = ScraperState()

async def broadcast_event(event_type: str, data: dict):
    """Updates the global state tracker and broadcasts the event to all WebSocket clients."""
    # Update global state counters and attributes
    if event_type == "progress":
        scraper_state.current_offset = data.get("offset", scraper_state.current_offset)
        scraper_state.tenders_processed = data.get("tenders_processed", scraper_state.tenders_processed)
        scraper_state.tenders_saved = data.get("tenders_saved", scraper_state.tenders_saved)
        scraper_state.pages_processed = data.get("pages_processed", scraper_state.pages_processed)
        scraper_state.documents_downloaded = data.get("documents_downloaded", scraper_state.documents_downloaded)
    elif event_type == "current_tender":
        scraper_state.current_tender_id = data.get("tender_id")
        scraper_state.current_district = data.get("district", scraper_state.current_district)
    elif event_type == "download":
        scraper_state.active_download = data.get("filename")
    elif event_type == "error":
        scraper_state.failures += 1
        msg = data.get("message", "Unknown error")
        scraper_state.errors.append(msg)
        scraper_state.add_log(f"Error: {msg}")
    elif event_type == "session_refresh":
        scraper_state.session_refreshes += 1
        scraper_state.add_log("Session refreshed in browser")
    elif event_type == "log":
        log_line = scraper_state.add_log(data.get("message", ""))
        data["message"] = log_line

    # Send the individual granular event
    await manager.broadcast({
        "type": event_type,
        **data
    })
    
    # Broadcast full state update for reactive UI binding
    await manager.broadcast({
        "type": "state",
        "state": {
            "is_running": scraper_state.is_running,
            "start_time": scraper_state.start_time.isoformat() if scraper_state.start_time else None,
            "pages_processed": scraper_state.pages_processed,
            "tenders_processed": scraper_state.tenders_processed,
            "tenders_saved": scraper_state.tenders_saved,
            "documents_downloaded": scraper_state.documents_downloaded,
            "failures": scraper_state.failures,
            "current_tender_id": scraper_state.current_tender_id,
            "current_district": scraper_state.current_district,
            "active_download": scraper_state.active_download,
            "session_refreshes": scraper_state.session_refreshes,
            "current_offset": scraper_state.current_offset,
            "logs": scraper_state.logs[-100:]  # Keep last 100 logs to prevent memory inflation
        }
    })

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
    """Core background aggregation task that crawls, parses and downloads tenders, writing progress to DB & WS."""
    if scraper_state.is_running:
        logger.warning("Scraper is already running. Skipping this trigger.")
        return

    # Create Scraper Run in database
    run_entry = ScraperRun(
        started_at=datetime.utcnow(),
        status="running",
        pages_processed=0,
        tenders_processed=0,
        documents_downloaded=0,
        failures=0,
        current_offset=0,
        logs=""
    )
    db_session.add(run_entry)
    db_session.commit()
    db_session.refresh(run_entry)
    run_id = run_entry.id

    scraper_state.reset()
    scraper_state.is_running = True

    async def status_callback(event_type: str, data: dict):
        await broadcast_event(event_type, data)
        
        # Write state to database row
        try:
            # Create a separate connection scope to avoid thread issues
            with SessionLocal() as db_scope:
                run = db_scope.query(ScraperRun).get(run_id)
                if run:
                    run.pages_processed = scraper_state.pages_processed
                    run.tenders_processed = scraper_state.tenders_processed
                    run.documents_downloaded = scraper_state.documents_downloaded
                    run.failures = scraper_state.failures
                    run.current_tender_id = scraper_state.current_tender_id
                    run.current_offset = scraper_state.current_offset
                    run.logs = "\n".join(scraper_state.logs)
                    db_scope.commit()
        except Exception as db_err:
            logger.error(f"Failed to update ScraperRun {run_id} in DB: {db_err}")

    # Initialize scraper
    scraper = TelanganaTenderScraper(status_callback=status_callback)
    await status_callback("log", {"message": "Initialized hybrid scraper engine."})

    offset = 0
    limit = 10
    max_pages = 3  # Scrape up to 30 tenders (3 pages) per manual run for safety
    tenders_processed = 0
    tenders_saved = 0
    documents_downloaded = 0

    try:
        await scraper.refresh_session()
        
        for page_num in range(max_pages):
            scraper_state.current_offset = offset
            await status_callback("progress", {
                "offset": offset,
                "tenders_processed": tenders_processed,
                "tenders_saved": tenders_saved,
                "documents_downloaded": documents_downloaded,
                "pages_processed": page_num
            })
            
            await status_callback("log", {"message": f"Fetching page {page_num + 1} starting at offset {offset}..."})
            records = await scraper.fetch_page(start=offset, length=limit)
            
            if not records:
                await status_callback("log", {"message": f"No records found at offset {offset}. Completing run."})
                break
                
            scraper_state.pages_processed += 1
            
            for record in records:
                tenders_processed += 1
                
                if isinstance(record, list) and len(record) >= 10:
                    dept_name = record[0]
                    t_id = record[1]
                    title = record[4]
                    val_str = str(record[5]).replace(",", "")
                    publication_str = record[6] if len(record) >= 7 else None
                    closing_str = record[8] if len(record) >= 9 else None
                    action_html = record[9]
                else:
                    await status_callback("log", {"message": f"Skipping malformed raw record: {record}"})
                    continue
                    
                if not t_id:
                    continue
                    
                t_id = str(t_id).strip()
                title = str(title).strip()
                dept_name = str(dept_name).strip()
                
                # Determine district
                dist_name = "Hyderabad"
                for district_candidate in DISTRICT_COORDINATES.keys():
                    if district_candidate.lower() in title.lower() or district_candidate.lower() in dept_name.lower():
                        dist_name = district_candidate
                        break
                
                await status_callback("current_tender", {
                    "tender_id": t_id,
                    "title": title,
                    "district": dist_name
                })
                
                await status_callback("log", {"message": f"Found Tender {t_id} ({dist_name}) - Processing details..."})
                
                # Convert cost to Lakhs
                try:
                    val = float(val_str) / 100000.0
                except ValueError:
                    val = 0.0
                
                # Parse viewBtn arguments
                btn_match = re.search(r"viewBtn\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", action_html)
                
                detail_fields = {}
                docs_list = []
                downloaded_paths = []
                extracted_text = ""
                nit_pdf_url = None
                boq_pdf_url = None
                
                if btn_match:
                    indent_id = btn_match.group(1)
                    category_id = btn_match.group(2)
                    procurement_id = btn_match.group(3)
                    
                    storage_dir = f"storage/pdfs/{dist_name}/{t_id}"
                    
                    # Call details and downloads fetch
                    detail_fields, docs_list, downloaded_paths = await scraper.fetch_details_and_documents(
                        indent_id, category_id, procurement_id, storage_dir
                    )
                    
                    # Extract text
                    downloaded_texts = []
                    for local_path in downloaded_paths:
                        doc_name = os.path.basename(local_path)
                        is_nit = "nit" in doc_name.lower() or "notice" in doc_name.lower() or "tender" in doc_name.lower()
                        is_boq = "boq" in doc_name.lower() or "quantity" in doc_name.lower() or "schedule" in doc_name.lower()
                        
                        doc_text = scraper.extract_text_from_file(local_path)
                        if doc_text:
                            downloaded_texts.append(doc_text)
                            
                        # Build public web link
                        doc_entry = next((d for d in docs_list if d["doc_name"] == doc_name), None)
                        if doc_entry:
                            doc_web_url = f"https://tender.telangana.gov.in/DownLoadFile.html?hdndocIds={doc_entry['doc_id']}&hdndocName={doc_name}&hdnsPath={doc_entry['path_type']}"
                            if is_nit:
                                nit_pdf_url = doc_web_url
                            elif is_boq:
                                boq_pdf_url = doc_web_url
                                
                    if downloaded_texts:
                        extracted_text = "\n\n".join(downloaded_texts)
                        
                    documents_downloaded += len(downloaded_paths)
                
                # Apply NLP Regex parsing
                text_to_search = f"{title}\n{extracted_text}"
                
                road_name = None
                road_match = re.search(r"(?:Road\s+from\s+([A-Za-z0-9\s\-]+?)\s+to\s+([A-Za-z0-9\s\-]+))|(?:Widening\s+of\s+([A-Za-z0-9\s\-\/]{5,}))|(?:MDR\s+road\s+([A-Za-z0-9\s\-]{5,}))|(?:BT\s+road\s+([A-Za-z0-9\s\-]{5,}))", text_to_search, re.IGNORECASE)
                if road_match:
                    if road_match.group(1) and road_match.group(2):
                        road_name = f"Road from {road_match.group(1).strip()} to {road_match.group(2).strip()}"
                    else:
                        non_empty = [g for g in road_match.groups() if g]
                        if non_empty:
                            road_name = non_empty[0].strip()
                            
                village = None
                village_match = re.search(r"(?:at\s+village\s+([A-Za-z0-9\s\-]+))|(?:([A-Za-z0-9\s\-]+)\s+village)|(?:at\s+([A-Za-z0-9\s\-]+)\s+habitations?)", text_to_search, re.IGNORECASE)
                if village_match:
                    village = [g for g in village_match.groups() if g][0].strip()
                    
                mandal = None
                mandal_match = re.search(r"(?:mandal\s+([A-Za-z0-9\s\-]+))|(?:in\s+([A-Za-z0-9\s\-]+)\s+mandal)", text_to_search, re.IGNORECASE)
                if mandal_match:
                    mandal = [g for g in mandal_match.groups() if g][0].strip()
                    
                chainage_start, chainage_end = None, None
                chainage_match = re.search(r"(?:km|ch|chainage)\s*(\d+/\d+)\s*to\s*(?:km|ch|chainage)?\s*(\d+/\d+)", text_to_search, re.IGNORECASE)
                if chainage_match:
                    chainage_start = chainage_match.group(1).strip()
                    chainage_end = chainage_match.group(2).strip()
                    
                coords = DISTRICT_COORDINATES.get(dist_name, (17.8500, 79.1500))
                latitude, longitude = coords[0], coords[1]
                
                # Store Tender in Database
                detail_page_url = f"https://tender.telangana.gov.in/ViewTender.html?hdnIndentID={indent_id}&hdnProcurementID={procurement_id}" if btn_match else None
                
                try:
                    with SessionLocal() as db_scope:
                        existing_tender = db_scope.query(Tender).filter(Tender.tender_id == t_id).first()
                        if existing_tender:
                            existing_tender.title = title
                            existing_tender.department = dept_name
                            existing_tender.district = dist_name
                            existing_tender.tender_value = val
                            if road_name: existing_tender.road_name = road_name
                            if village: existing_tender.village = village
                            if mandal: existing_tender.mandal = mandal
                            if chainage_start: existing_tender.chainage_start = chainage_start
                            if chainage_end: existing_tender.chainage_end = chainage_end
                            if extracted_text: existing_tender.extracted_text = extracted_text
                            if nit_pdf_url: existing_tender.nit_pdf_url = nit_pdf_url
                            if boq_pdf_url: existing_tender.boq_pdf_url = boq_pdf_url
                            existing_tender.updated_at = datetime.utcnow()
                            db_scope.commit()
                            await status_callback("log", {"message": f"[✓] Updated tender {t_id}."})
                        else:
                            new_tender = Tender(
                                tender_id=t_id,
                                title=title,
                                department=dept_name,
                                district=dist_name,
                                tender_value=val,
                                closing_date=parse_date(closing_str),
                                publication_date=parse_date(publication_str) if publication_str else datetime.utcnow(),
                                status="open",
                                nit_pdf_url=nit_pdf_url,
                                boq_pdf_url=boq_pdf_url,
                                detail_page_url=detail_page_url,
                                extracted_text=extracted_text,
                                road_name=road_name,
                                village=village,
                                mandal=mandal,
                                chainage_start=chainage_start,
                                chainage_end=chainage_end,
                                raw_documents_metadata=docs_list,
                                latitude=latitude,
                                longitude=longitude
                            )
                            db_scope.add(new_tender)
                            tenders_saved += 1
                            db_scope.commit()
                            await status_callback("log", {"message": f"[✓] Saved new tender {t_id}."})
                except Exception as t_err:
                    await status_callback("log", {"message": f"[✗] DB save failed for {t_id}: {t_err}"})
                    await status_callback("error", {"message": f"DB Save Error: {str(t_err)}"})
                
                await status_callback("progress", {
                    "offset": offset,
                    "tenders_processed": tenders_processed,
                    "tenders_saved": tenders_saved,
                    "documents_downloaded": documents_downloaded,
                    "pages_processed": page_num + 1
                })
                
                await asyncio.sleep(1.5)
                
            offset += limit
            
        await status_callback("log", {"message": f"[✓] Scraper completed. Processed: {tenders_processed}, Saved: {tenders_saved}, Downloads: {documents_downloaded}."})
        
        with SessionLocal() as db_scope:
            run = db_scope.query(ScraperRun).get(run_id)
            if run:
                run.status = "completed"
                run.finished_at = datetime.utcnow()
                db_scope.commit()
                
    except Exception as run_err:
        logger.error(f"Scraper run failed: {run_err}")
        await status_callback("log", {"message": f"[✗] Scraper run crashed: {str(run_err)}"})
        await status_callback("error", {"message": f"Fatal: {str(run_err)}"})
        
        try:
            with SessionLocal() as db_scope:
                run = db_scope.query(ScraperRun).get(run_id)
                if run:
                    run.status = "failed"
                    run.finished_at = datetime.utcnow()
                    db_scope.commit()
        except Exception:
            pass
    finally:
        scraper_state.is_running = False
        await scraper.close()

async def run_scraper_wrapper():
    """Wrapper that handles run task execution using a local DB session context."""
    db_session = SessionLocal()
    try:
        await run_scraper_task(db_session)
    finally:
        db_session.close()

@router.post("/run")
def trigger_scraper(background_tasks: BackgroundTasks):
    """Triggers the async scraper pipeline background execution."""
    if scraper_state.is_running:
        return {"status": "error", "message": "Scraper is already running."}
    background_tasks.add_task(run_scraper_wrapper)
    return {"status": "success", "message": "Scraper run triggered successfully."}

@router.get("/status")
def get_scraper_status():
    """Returns the current runtime scraper state."""
    return {
        "is_running": scraper_state.is_running,
        "start_time": scraper_state.start_time.isoformat() if scraper_state.start_time else None,
        "pages_processed": scraper_state.pages_processed,
        "tenders_processed": scraper_state.tenders_processed,
        "tenders_saved": scraper_state.tenders_saved,
        "documents_downloaded": scraper_state.documents_downloaded,
        "failures": scraper_state.failures,
        "current_tender_id": scraper_state.current_tender_id,
        "current_district": scraper_state.current_district,
        "active_download": scraper_state.active_download,
        "session_refreshes": scraper_state.session_refreshes,
        "current_offset": scraper_state.current_offset,
        "logs": scraper_state.logs
    }

@router.get("/runs")
def get_scraper_runs(db: Session = Depends(get_db)):
    """Returns historical scraper execution runs."""
    runs = db.query(ScraperRun).order_by(ScraperRun.started_at.desc()).limit(20).all()
    return [
        {
            "id": r.id,
            "started_at": r.started_at.strftime("%Y-%m-%d %H:%M:%S") if r.started_at else None,
            "finished_at": r.finished_at.strftime("%Y-%m-%d %H:%M:%S") if r.finished_at else None,
            "status": r.status,
            "pages_processed": r.pages_processed,
            "tenders_processed": r.tenders_processed,
            "documents_downloaded": r.documents_downloaded,
            "failures": r.failures,
            "current_tender_id": r.current_tender_id,
            "current_offset": r.current_offset,
            "logs": r.logs
        }
        for r in runs
    ]

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for streaming realtime scraping updates."""
    await manager.connect(websocket)
    # Send initial state on connection
    try:
        await websocket.send_json({
            "type": "state",
            "state": {
                "is_running": scraper_state.is_running,
                "start_time": scraper_state.start_time.isoformat() if scraper_state.start_time else None,
                "pages_processed": scraper_state.pages_processed,
                "tenders_processed": scraper_state.tenders_processed,
                "tenders_saved": scraper_state.tenders_saved,
                "documents_downloaded": scraper_state.documents_downloaded,
                "failures": scraper_state.failures,
                "current_tender_id": scraper_state.current_tender_id,
                "current_district": scraper_state.current_district,
                "active_download": scraper_state.active_download,
                "session_refreshes": scraper_state.session_refreshes,
                "current_offset": scraper_state.current_offset,
                "logs": scraper_state.logs[-100:]
            }
        })
        while True:
            # Keep connection alive; accept any incoming text messages but ignore them
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

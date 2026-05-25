from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.db.session import init_db, SessionLocal
from backend.api.routers import tenders, districts, departments, scraper
from backend.api.routers.scraper import run_scraper_task
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ManaMap Ledger API",
    description="Bloomberg Terminal for Telangana Infrastructure Procurement Intelligence",
    version="1.0.0"
)

# Set up CORS middleware for Vite React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register simplified routers
app.include_router(tenders.router)
app.include_router(districts.router)
app.include_router(departments.router)
app.include_router(scraper.router)

scheduler = AsyncIOScheduler()

async def scheduled_scraper_job():
    logger.info("Starting scheduled scraper run (15 minute interval)...")
    db = SessionLocal()
    try:
        await run_scraper_task(db)
        logger.info("Scheduled scraper run completed successfully.")
    except Exception as e:
        logger.error(f"Error in scheduled scraper run: {e}")
    finally:
        db.close()

@app.on_event("startup")
def on_startup():
    logger.info("Initializing database...")
    init_db()
    logger.info("Database initialized successfully.")
    
    logger.info("Starting APScheduler background tasks...")
    scheduler.add_job(scheduled_scraper_job, "interval", minutes=15, id="scraper_job")
    scheduler.start()
    logger.info("Scheduled scraper job registered for 15-minute intervals.")

@app.on_event("shutdown")
async def on_shutdown():
    logger.info("Shutting down background scheduler...")
    scheduler.shutdown()
    try:
        from backend.scraper.crawler import browser_manager
        logger.info("Shutting down browser contexts...")
        await browser_manager.close()
    except Exception as e:
        logger.error(f"Error closing browser contexts: {e}")

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": "ManaMap Ledger Ingestion API",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.db.session import init_db
from backend.api.routers import tenders, districts, departments, scraper
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

@app.on_event("startup")
def on_startup():
    logger.info("Initializing database and seeding base metrics...")
    init_db()
    logger.info("Database initialized successfully.")

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

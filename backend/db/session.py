import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from backend.db.models import Base, District, Department, ProcurementCategory

# Read environment variables, fallback to SQLite for local development convenience
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./manamap_ledger.db")

# Create SQLAlchemy engine
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Dependency injection helper for FastAPI routers."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initializes tables and seeds initial static reference data."""
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check if districts are seeded
        if db.query(District).count() == 0:
            from scraper.pipeline import DISTRICT_COORDINATES
            districts_to_add = [
                District(
                    id=name.lower().replace(" ", "_").replace("-", "_"),
                    name=name,
                    latitude=coords[0],
                    longitude=coords[1]
                )
                for name, coords in DISTRICT_COORDINATES.items()
            ]
            db.bulk_save_objects(districts_to_add)
            print(f"Seeded {len(districts_to_add)} districts.")
            
        # Check if departments are seeded
        if db.query(Department).count() == 0:
            departments = [
                {"id": "rb_dept", "name": "Roads & Buildings (R&B)", "code": "R&B"},
                {"id": "pred_dept", "name": "Panchayat Raj Engineering (PRED)", "code": "PRED"},
                {"id": "ghmc", "name": "Greater Hyderabad Municipal Corporation", "code": "GHMC"},
                {"id": "hmwssb", "name": "Hyderabad Metropolitan Water Supply & Sewerage Board", "code": "HMWS&SB"},
                {"id": "irrigation", "name": "Irrigation & CAD Department", "code": "CAD"}
            ]
            db.bulk_save_objects([Department(**d) for d in departments])
            print("Seeded base departments.")
            
        # Check if procurement categories are seeded
        if db.query(ProcurementCategory).count() == 0:
            categories = [
                {"id": "road_works", "name": "Road Construction & Repair", "description": "Metalling, Black Topping, widening, and structural repair of public pathways."},
                {"id": "water_supply", "name": "Water Supply & Sewage", "description": "Laying water networks, pipeline distributions, and drainage structures."},
                {"id": "civil_works", "name": "Civil Construction & Buildings", "description": "Construction of integrated offices, schools, and hospitals."},
                {"id": "it_telecom", "name": "IT, Software & Hardware Procurement", "description": "IT licenses, software platforms, and server equipment."},
                {"id": "power_energy", "name": "Power & Energy Distribution", "description": "Substations, wiring, grid construction, and energy services."}
            ]
            db.bulk_save_objects([ProcurementCategory(**c) for c in categories])
            print("Seeded procurement categories.")
            
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

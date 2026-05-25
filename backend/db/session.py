import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.db.models import Base, District, Department

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./manamap_ledger.db")

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        from backend.constants.districts import DISTRICT_COORDINATES
        
        # Seed Districts
        if db.query(District).count() == 0:
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
            
        # Seed Departments
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
            
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

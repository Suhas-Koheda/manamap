from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import District

router = APIRouter(prefix="/api/districts", tags=["Districts"])

@router.get("")
def get_districts(db: Session = Depends(get_db)):
    districts = db.query(District).order_by(District.name).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "latitude": d.latitude,
            "longitude": d.longitude
        }
        for d in districts
    ]

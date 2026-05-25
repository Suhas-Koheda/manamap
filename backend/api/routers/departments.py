from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import Department

router = APIRouter(prefix="/api/departments", tags=["Departments"])

@router.get("")
def get_departments(db: Session = Depends(get_db)):
    depts = db.query(Department).order_by(Department.name).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "code": d.code
        }
        for d in depts
    ]

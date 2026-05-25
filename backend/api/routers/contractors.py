from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.db.session import get_db
from backend.db.models import Contractor, Tender

router = APIRouter(prefix="/api/contractors", tags=["Contractors"])

@router.get("")
def get_contractors(db: Session = Depends(get_db)):
    contractors = db.query(Contractor).order_by(desc(Contractor.total_won_value)).all()
    return [
        {
            "id": c.id,
            "companyName": c.company_name,
            "cinNumber": c.cin_number,
            "classRating": c.class_rating,
            "totalWonValue": c.total_won_value,
            "activeProjectsCount": c.active_projects_count,
            "riskScore": c.risk_score
        }
        for c in contractors
    ]

@router.get("/{contractor_id}")
def get_contractor_detail(contractor_id: str, db: Session = Depends(get_db)):
    contractor = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
        
    projects = db.query(Tender).filter(Tender.winning_contractor_id == contractor_id).all()
    
    return {
        "id": contractor.id,
        "companyName": contractor.company_name,
        "cinNumber": contractor.cin_number,
        "classRating": contractor.class_rating,
        "totalWonValue": contractor.total_won_value,
        "activeProjectsCount": contractor.active_projects_count,
        "riskScore": contractor.risk_score,
        "projects": [
            {
                "id": p.id,
                "title": p.title,
                "sanctionedAmount": p.sanctioned_amount,
                "finalAwardAmount": p.final_award_amount,
                "status": p.status,
                "district": p.district_rel.name if p.district_rel else p.district_id
            }
            for p in projects
        ]
    }

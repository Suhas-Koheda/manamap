from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.db.session import get_db
from backend.db.models import Tender, Department, District, Contractor

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

@router.get("/summary")
def get_analytics_summary(db: Session = Depends(get_db)):
    # Totals
    total_tenders = db.query(Tender).count()
    total_budget = db.query(func.sum(Tender.sanctioned_amount)).scalar() or 0.0
    
    # Status split
    status_counts = db.query(Tender.status, func.count(Tender.id)).group_by(Tender.status).all()
    status_split = {status: count for status, count in status_counts}
    
    # Department allocations
    dept_stats = db.query(
        Department.name,
        func.count(Tender.id),
        func.sum(Tender.sanctioned_amount)
    ).join(Tender, Tender.department_id == Department.id).group_by(Department.name).all()
    
    departments = [
        {"name": name, "count": count, "value": val or 0.0}
        for name, count, val in dept_stats
    ]
    
    # District allocations (top 10)
    dist_stats = db.query(
        District.name,
        func.sum(Tender.sanctioned_amount)
    ).join(Tender, Tender.district_id == District.id).group_by(District.name).order_by(func.sum(Tender.sanctioned_amount).desc()).limit(10).all()
    
    districts = [
        {"name": name, "value": val or 0.0}
        for name, val in dist_stats
    ]
    
    # Contractor concentration (percentage won by top 3 contractors)
    top_contractors_sum = db.query(func.sum(Contractor.total_won_value)).filter(
        Contractor.id.in_(
            db.query(Contractor.id).order_by(Contractor.total_won_value.desc()).limit(3)
        )
    ).scalar() or 0.0
    
    total_won_all = db.query(func.sum(Contractor.total_won_value)).scalar() or 1.0
    concentration_ratio = round((top_contractors_sum / total_won_all) * 100, 2)
    
    return {
        "totalTendersCount": total_tenders,
        "totalProcurementValue": total_budget, # Lakhs
        "statusSplit": {
            "open": status_split.get("open", 0),
            "ongoing": status_split.get("awarded", 0),
            "completed": status_split.get("completed", 0)
        },
        "departmentAllocations": departments,
        "districtAllocations": districts,
        "contractorConcentrationRatio": concentration_ratio
    }

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import List, Optional
from backend.db.session import get_db
from backend.db.models import Tender, AISummary, BOQItem, TimelineEvent

router = APIRouter(prefix="/api/tenders", tags=["Tenders"])

@router.get("")
def get_tenders(
    db: Session = Depends(get_db),
    district: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    min_budget: Optional[float] = Query(None),
    max_budget: Optional[float] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    query = db.query(Tender)
    
    # Apply filters
    if district:
        query = query.filter(Tender.district_id == district.lower().replace(" ", "_").replace("-", "_"))
    if department:
        query = query.filter(Tender.department_id == department.lower())
    if status and status != "all":
        query = query.filter(Tender.status == status)
    if min_budget is not None:
        query = query.filter(Tender.sanctioned_amount >= min_budget)
    if max_budget is not None:
        query = query.filter(Tender.sanctioned_amount <= max_budget)
        
    # Search filter
    if q:
        query = query.filter(
            or_(
                Tender.title.ilike(f"%{q}%"),
                Tender.id.ilike(f"%{q}%")
            )
        )
        
    total = query.count()
    offset = (page - 1) * limit
    results = query.order_by(desc(Tender.publication_date)).offset(offset).limit(limit).all()
    
    # Serialize results
    serialized = []
    for r in results:
        serialized.append({
            "id": r.id,
            "title": r.title,
            "status": r.status,
            "sanctionedAmount": r.sanctioned_amount,
            "finalAwardAmount": r.final_award_amount,
            "district": r.district_rel.name if r.district_rel else r.district_id.title().replace("_", " "),
            "department": r.department_rel.name if r.department_rel else r.department_id.upper(),
            "publicationDate": r.publication_date.strftime("%Y-%m-%d") if r.publication_date else None,
            "closingDate": r.closing_date.strftime("%Y-%m-%d") if r.closing_date else None,
            "location": {
                "latitude": r.latitude,
                "longitude": r.longitude
            }
        })
        
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "results": serialized
    }

@router.get("/{tender_id}")
def get_tender_detail(tender_id: str, db: Session = Depends(get_db)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
        
    boq = db.query(BOQItem).filter(BOQItem.tender_id == tender_id).all()
    timeline = db.query(TimelineEvent).filter(TimelineEvent.tender_id == tender_id).all()
    ai_sum = db.query(AISummary).filter(AISummary.tender_id == tender_id).first()
    
    return {
        "id": tender.id,
        "title": tender.title,
        "status": tender.status,
        "sanctionedAmount": tender.sanctioned_amount,
        "finalAwardAmount": tender.final_award_amount,
        "district": tender.district_rel.name if tender.district_rel else tender.district_id.title().replace("_", " "),
        "department": tender.department_rel.name if tender.department_rel else tender.department_id.upper(),
        "publicationDate": tender.publication_date.strftime("%Y-%m-%d") if tender.publication_date else None,
        "closingDate": tender.closing_date.strftime("%Y-%m-%d") if tender.closing_date else None,
        "location": {
            "latitude": tender.latitude,
            "longitude": tender.longitude
        },
        "boqSummary": [
            {"material": b.material_name, "estimatedCost": b.estimated_cost}
            for b in boq
        ],
        "timeline": [
            {"eventName": t.event_name, "eventDate": t.event_date.strftime("%Y-%m-%d"), "description": t.description}
            for t in timeline
        ],
        "aiSummary": {
            "summaryEn": ai_sum.summary_en if ai_sum else "AI summary not generated.",
            "summaryTe": ai_sum.summary_te if ai_sum else "AI సారాంశం అందుబాటులో లేదు.",
            "corruptionRisk": ai_sum.corruption_risk_analysis if ai_sum else {"risk_rating": "Low", "indicators": ["None"], "explanation": ""},
            "budgetAnomaly": ai_sum.budget_anomaly_analysis if ai_sum else {"is_anomaly": False, "deviation_percentage": 0, "explanation": ""},
            "contractorConcentration": ai_sum.contractor_concentration_insights if ai_sum else {"concentration_risk": "Low", "explanation": ""},
            "delayRisk": ai_sum.delay_risk_prediction if ai_sum else {"risk_rating": "Low", "estimated_delay_days": 0, "explanation": ""},
            "overallSentiment": ai_sum.overall_sentiment if ai_sum else "normal"
        }
    }

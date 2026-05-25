from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, or_
from typing import List, Optional
from backend.db.session import get_db
from backend.db.models import Tender, District, Department

router = APIRouter(prefix="/api/tenders", tags=["Tenders"])

@router.get("")
def get_tenders(
    db: Session = Depends(get_db),
    district: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    min_value: Optional[float] = Query(None, alias="minValue"),
    max_value: Optional[float] = Query(None, alias="maxValue"),
    q: Optional[str] = Query(None),
    sort_by: str = Query("publication_date", alias="sortBy"),
    sort_order: str = Query("desc", alias="sortOrder"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    query = db.query(Tender)
    
    # Filtering
    if district:
        query = query.filter(Tender.district == district)
    if department:
        query = query.filter(Tender.department == department)
    if status and status != "all":
        query = query.filter(Tender.status == status)
    if min_value is not None:
        query = query.filter(Tender.tender_value >= min_value)
    if max_value is not None:
        query = query.filter(Tender.tender_value <= max_value)
        
    # Search
    if q:
        query = query.filter(
            or_(
                Tender.title.ilike(f"%{q}%"),
                Tender.tender_id.ilike(f"%{q}%"),
                Tender.department.ilike(f"%{q}%"),
                Tender.district.ilike(f"%{q}%")
            )
        )
        
    # Sorting
    sort_col = getattr(Tender, sort_by, Tender.publication_date)
    if sort_order == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))
        
    total = query.count()
    offset = (page - 1) * limit
    results = query.offset(offset).limit(limit).all()
    
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "results": [
            {
                "id": t.tender_id,
                "title": t.title,
                "department": t.department,
                "district": t.district,
                "tenderValue": t.tender_value,
                "closingDate": t.closing_date.strftime("%Y-%m-%d") if t.closing_date else None,
                "publicationDate": t.publication_date.strftime("%Y-%m-%d") if t.publication_date else None,
                "status": t.status,
                "pdfUrl": t.pdf_url,
                "nitPdfUrl": t.nit_pdf_url,
                "boqPdfUrl": t.boq_pdf_url,
                "detailPageUrl": t.detail_page_url,
                "roadName": t.road_name,
                "village": t.village,
                "mandal": t.mandal,
                "chainageStart": t.chainage_start,
                "chainageEnd": t.chainage_end,
                "location": {
                    "latitude": t.latitude,
                    "longitude": t.longitude
                }
            }
            for t in results
        ]
    }

@router.get("/{tender_id}")
def get_tender_detail(tender_id: str, db: Session = Depends(get_db)):
    t = db.query(Tender).filter(Tender.tender_id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
        
    return {
        "id": t.tender_id,
        "title": t.title,
        "department": t.department,
        "district": t.district,
        "tenderValue": t.tender_value,
        "closingDate": t.closing_date.strftime("%Y-%m-%d") if t.closing_date else None,
        "publicationDate": t.publication_date.strftime("%Y-%m-%d") if t.publication_date else None,
        "status": t.status,
        "pdfUrl": t.pdf_url,
        "nitPdfUrl": t.nit_pdf_url,
        "boqPdfUrl": t.boq_pdf_url,
        "detailPageUrl": t.detail_page_url,
        "extractedText": t.extracted_text,
        "roadName": t.road_name,
        "village": t.village,
        "mandal": t.mandal,
        "chainageStart": t.chainage_start,
        "chainageEnd": t.chainage_end,
        "rawDocumentsMetadata": t.raw_documents_metadata,
        "rawPayload": t.raw_payload,
        "location": {
            "latitude": t.latitude,
            "longitude": t.longitude
        },
        "createdAt": t.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "updatedAt": t.updated_at.strftime("%Y-%m-%d %H:%M:%S")
    }

from sqlalchemy import Column, String, Float, DateTime, Text, JSON
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class District(Base):
    __tablename__ = 'districts'
    id = Column(String, primary_key=True)  # e.g., "hyderabad"
    name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

class Department(Base):
    __tablename__ = 'departments'
    id = Column(String, primary_key=True)  # e.g., "ghmc"
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)

class Tender(Base):
    __tablename__ = 'tenders'
    
    tender_id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    department = Column(String, nullable=False)
    district = Column(String, nullable=False)
    tender_value = Column(Float, nullable=False)  # in Lakhs
    closing_date = Column(DateTime, nullable=True)
    publication_date = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default='open')  # open, awarded, completed
    pdf_url = Column(String, nullable=True)
    raw_payload = Column(JSON, nullable=True)  # Store original raw response for debugging
    
    # Infrastructure intelligence fields
    nit_pdf_url = Column(String, nullable=True)
    boq_pdf_url = Column(String, nullable=True)
    detail_page_url = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    road_name = Column(String, nullable=True)
    village = Column(String, nullable=True)
    mandal = Column(String, nullable=True)
    chainage_start = Column(String, nullable=True)
    chainage_end = Column(String, nullable=True)
    raw_documents_metadata = Column(JSON, nullable=True)
    
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

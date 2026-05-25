from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Boolean, Text, JSON, Table
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()

# Many-to-many relationship table for joint ventures or related contractors
contractor_relationships = Table(
    'contractor_relationships',
    Base.metadata,
    Column('parent_contractor_id', String, ForeignKey('contractors.id'), primary_key=True),
    Column('child_contractor_id', String, ForeignKey('contractors.id'), primary_key=True),
    Column('relationship_type', String, default='subsidiary'), # joint_venture, subsidiary, partner
    Column('created_at', DateTime, default=datetime.utcnow)
)

class District(Base):
    __tablename__ = 'districts'
    id = Column(String, primary_key=True)  # e.g., "hyderabad"
    name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    total_budget_allocated = Column(Float, default=0.0)
    
    tenders = relationship("Tender", back_populates="district_rel")

class Department(Base):
    __tablename__ = 'departments'
    id = Column(String, primary_key=True)  # e.g., "ghmc"
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    total_projects = Column(Integer, default=0)
    
    tenders = relationship("Tender", back_populates="department_rel")

class Contractor(Base):
    __tablename__ = 'contractors'
    id = Column(String, primary_key=True)  # e.g., "c_meil"
    company_name = Column(String, nullable=False)
    cin_number = Column(String, unique=True, nullable=True)
    class_rating = Column(String, nullable=True)  # Special Class I, Class I, etc.
    total_won_value = Column(Float, default=0.0)  # In Crores/Lakhs
    active_projects_count = Column(Integer, default=0)
    risk_score = Column(Float, default=0.0)  # Calculated index based on delay & budget anomalies
    
    tenders_won = relationship("Tender", back_populates="contractor")

class ProcurementCategory(Base):
    __tablename__ = 'procurement_categories'
    id = Column(String, primary_key=True)  # e.g., "road_works"
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    tenders = relationship("Tender", back_populates="category")

class Tender(Base):
    __tablename__ = 'tenders'
    id = Column(String, primary_key=True)  # tenderId
    title = Column(String, nullable=False)
    status = Column(String, nullable=False, default='open')  # open, awarded, completed, cancelled
    sanctioned_amount = Column(Float, nullable=False)  # in Lakhs
    final_award_amount = Column(Float, nullable=True)
    publication_date = Column(DateTime, nullable=True)
    closing_date = Column(DateTime, nullable=True)
    
    # Foreign Keys
    district_id = Column(String, ForeignKey('districts.id'), nullable=False)
    department_id = Column(String, ForeignKey('departments.id'), nullable=False)
    category_id = Column(String, ForeignKey('procurement_categories.id'), nullable=True)
    winning_contractor_id = Column(String, ForeignKey('contractors.id'), nullable=True)
    
    # Coordinates (with jitter)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    # Relationships
    district_rel = relationship("District", back_populates="tenders")
    department_rel = relationship("Department", back_populates="tenders")
    category = relationship("ProcurementCategory", back_populates="tenders")
    contractor = relationship("Contractor", back_populates="tenders_won")
    
    boq_items = relationship("BOQItem", back_populates="tender", cascade="all, delete-orphan")
    timeline = relationship("TimelineEvent", back_populates="tender", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="tender", cascade="all, delete-orphan")
    ai_summary = relationship("AISummary", uselist=False, back_populates="tender", cascade="all, delete-orphan")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BOQItem(Base):
    __tablename__ = 'boq_items'
    id = Column(Integer, primary_key=True, autoincrement=True)
    tender_id = Column(String, ForeignKey('tenders.id'), nullable=False)
    material_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=True)
    unit = Column(String, nullable=True)
    estimated_cost = Column(Float, nullable=False)  # In Lakhs
    
    tender = relationship("Tender", back_populates="boq_items")

class TimelineEvent(Base):
    __tablename__ = 'timeline_events'
    id = Column(Integer, primary_key=True, autoincrement=True)
    tender_id = Column(String, ForeignKey('tenders.id'), nullable=False)
    event_name = Column(String, nullable=False)  # Publication, Bid Submission, Awarded, Work Started, Completed
    event_date = Column(DateTime, nullable=False)
    description = Column(Text, nullable=True)
    
    tender = relationship("Tender", back_populates="timeline")

class Document(Base):
    __tablename__ = 'documents'
    id = Column(String, primary_key=True)  # File hash or UUID
    tender_id = Column(String, ForeignKey('tenders.id'), nullable=False)
    document_name = Column(String, nullable=False)
    file_type = Column(String, default='pdf')
    s3_url = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    
    tender = relationship("Tender", back_populates="documents")

class AISummary(Base):
    __tablename__ = 'ai_summaries'
    id = Column(Integer, primary_key=True, autoincrement=True)
    tender_id = Column(String, ForeignKey('tenders.id'), nullable=False, unique=True)
    summary_en = Column(Text, nullable=False)
    summary_te = Column(Text, nullable=True)  # Telugu translation
    corruption_risk_analysis = Column(JSON, nullable=True)  # JSON structure containing flags & reasons
    budget_anomaly_analysis = Column(JSON, nullable=True)
    contractor_concentration_insights = Column(JSON, nullable=True)
    delay_risk_prediction = Column(JSON, nullable=True)
    overall_sentiment = Column(String, default='neutral')  # suspicious, normal, high-performing
    generated_at = Column(DateTime, default=datetime.utcnow)
    
    tender = relationship("Tender", back_populates="ai_summary")

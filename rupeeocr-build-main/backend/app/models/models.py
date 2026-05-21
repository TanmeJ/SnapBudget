from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class Receipt(Base):
    __tablename__ = "receipts"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    merchant = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="INR", nullable=False)
    date = Column(DateTime, nullable=False)
    category = Column(String, nullable=False)
    category_confidence = Column(Float, default=0.0, nullable=False)
    ocr_confidence = Column(Float, default=0.0, nullable=False)
    extraction_method = Column(String, nullable=False)
    processing_ms = Column(Integer, default=0, nullable=False)
    raw_text = Column(Text, default="", nullable=False)
    file_url = Column(String, default="", nullable=False)
    file_name = Column(String, default="", nullable=False)
    file_content_type = Column(String, default="", nullable=False)
    user_verified = Column(Boolean, default=False, nullable=False)
    gst_json = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

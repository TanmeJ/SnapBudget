"""
RupeeOCR Data Models
Based on PRD v1.0 Field Specifications (Sections 6.1 and 6.2)
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
import re


class Category(str, Enum):
    """Receipt categories as defined in PRD Section 7.3"""
    FOOD_DINING = "food_dining"
    GROCERIES = "groceries"
    FUEL_TRANSPORT = "fuel_transport"
    HEALTHCARE = "healthcare"
    SHOPPING = "shopping"
    ELECTRONICS = "electronics"
    UTILITIES = "utilities"
    PROFESSIONAL = "professional"
    EDUCATION = "education"
    ENTERTAINMENT = "entertainment"
    OTHER = "other"


class ExtractionMethod(str, Enum):
    """How the receipt was extracted"""
    PYMUPDF = "pymupdf"
    TESSERACT = "tesseract"
    GEMINI = "gemini"


class ReceiptGST(BaseModel):
    """GST Fields - PRD Section 6.2"""
    gstin: Optional[str] = Field(None, max_length=15, description="15-char GSTIN")
    gstin_valid: bool = Field(False, description="Checksum validated")
    cgst: Optional[float] = Field(None, ge=0, description="Central GST amount")
    sgst: Optional[float] = Field(None, ge=0, description="State GST amount")
    igst: Optional[float] = Field(None, ge=0, description="Inter-state GST amount")
    gst_rate: Optional[float] = Field(None, description="GST rate: 5, 12, 18, or 28")
    pan: Optional[str] = Field(None, max_length=10, description="PAN from GSTIN")
    hsn: Optional[str] = Field(None, description="HSN code (4-8 digits)")
    sac: Optional[str] = Field(None, description="SAC code (4-6 digits)")
    invoice_number: Optional[str] = Field(None, description="Invoice number for deduplication")

    @field_validator('gstin')
    @classmethod
    def validate_gstin_format(cls, v):
        if v is None:
            return v
        # Pattern: 2-digit state + PAN structure + Z + checksum
        pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9Z][A-Z][0-9A-Z]$'
        if not re.match(pattern, v):
            raise ValueError('Invalid GSTIN format')
        return v


class Receipt(BaseModel):
    """Core Receipt Fields - PRD Section 6.1"""
    id: Optional[str] = None
    user_id: str
    merchant: str = Field(..., min_length=3, description="Merchant name")
    amount: float = Field(..., ge=0, lt=10000000, description="Amount in INR (< 1Cr)")
    currency: str = Field("INR", description="ISO currency code, defaults to INR")
    date: datetime = Field(..., description="Receipt date")
    category: Category = Field(..., description="Spending category")
    category_confidence: float = Field(..., ge=0, le=1, description="Category match confidence")
    ocr_confidence: float = Field(..., ge=0, le=100, description="Tesseract confidence score")
    extraction_method: ExtractionMethod = Field(..., description="Extraction pipeline used")
    processing_ms: int = Field(..., ge=0, description="Processing time in milliseconds")
    raw_text: str = Field("", description="Raw OCR text output")
    file_url: str = Field("", description="Supabase storage URL")
    file_name: str = Field("", description="Original uploaded file name")
    file_content_type: str = Field("", description="Uploaded receipt MIME type")
    user_verified: bool = Field(False, description="User has manually corrected this receipt")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Optional GST data
    gst: Optional[ReceiptGST] = None


class ReceiptCreate(BaseModel):
    """Request model for creating a receipt"""
    merchant: str
    amount: float
    currency: str = "INR"
    date: datetime
    category: Category
    gst: Optional[ReceiptGST] = None


class ReceiptUpdate(BaseModel):
    """Request model for updating a receipt"""
    merchant: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    date: Optional[datetime] = None
    category: Optional[Category] = None
    gst: Optional[ReceiptGST] = None


class ParsedReceiptItem(BaseModel):
    name: str
    price: Optional[float] = None
    qty: Optional[float] = None
    rate: Optional[float] = None
    amount: Optional[float] = None


class ParsedReceipt(BaseModel):
    store: Optional[str] = None
    date: Optional[str] = None
    items: List[ParsedReceiptItem] = Field(default_factory=list)
    total: Optional[float] = None
    raw_text: str = ""


class ScanResult(BaseModel):
    """Result of scanning a single receipt"""
    success: bool
    receipt: Optional[Receipt] = None
    parsed: Optional[ParsedReceipt] = None
    warnings: List[str] = Field(default_factory=list)
    error: Optional[str] = None


class BatchScanResult(BaseModel):
    """Result of batch scanning multiple receipts"""
    total: int
    processed: int
    failed: int
    results: List[ScanResult]
    total_amount: float


class DashboardData(BaseModel):
    """Aggregated dashboard data - PRD Section 8"""
    total_spend: float
    receipts_count: int
    gst_paid: float
    top_category: dict  # {category: str, amount: float}
    avg_per_receipt: float
    category_breakdown: List[dict]  # [{category, amount, percentage}]
    monthly_trend: List[dict]  # [{month, amount}]
    recent_receipts: List[Receipt]
    gst_summary: dict  # {total_cgst, total_sgst, total_igst, with_gstin, without_gstin}


class ReceiptFilters(BaseModel):
    """Filter parameters for receipts list"""
    category: Optional[List[Category]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    has_gst: Optional[bool] = None
    search: Optional[str] = None


class MerchantOverride(BaseModel):
    """User's learned category preference for a merchant"""
    id: Optional[str] = None
    user_id: str
    merchant_normalized: str
    category: Category
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuthCredentials(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class AuthUser(BaseModel):
    id: int
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    message: str
    user: AuthUser


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=8, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

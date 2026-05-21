"""
RupeeOCR Extraction Pipeline
Based on PRD Section 7: OCR 6-Step Pipeline

Pipeline Steps:
0. PyMuPDF native PDF text (if PDF)
1. OpenCV preprocessing (upscale, CLAHE, denoise, deskew)
2. Tesseract OCR (--psm 6, fallback to 4/11)
3. Indian normaliser (₹→2 fix, Rs./INR→₹)
4. Indian Regex Engine (GSTIN, GST amounts, dates, amounts)
5. Gemini 1.5 Flash fallback (if confidence < 50)
6. Categoriser (130+ keywords, merchant weighted 2×)
"""

import re
import io
import time
from typing import Optional, Tuple, List, Dict, Any
from datetime import datetime
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    """Result of the extraction pipeline"""
    merchant: str
    amount: float
    currency: str
    date: Optional[datetime]
    gstin: Optional[str]
    gstin_valid: bool
    cgst: Optional[float]
    sgst: Optional[float]
    igst: Optional[float]
    gst_rate: Optional[float]
    pan: Optional[str]
    hsn: Optional[str]
    sac: Optional[str]
    invoice_number: Optional[str]
    category: str
    category_confidence: float
    ocr_confidence: float
    extraction_method: str
    raw_text: str
    warnings: List[str]


# ============ INDIAN REGEX PATTERNS (PRD Section 7.4) ============

# GSTIN: 15 chars = 2-digit state + PAN (10) + 1 entity + Z + checksum
GSTIN_PATTERN = re.compile(
    r'(?:GSTIN?|GST\s*(?:NO|NUM|NUMBER)?|TIN)\s*[:\-]?\s*'
    r'([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9Z][A-Z][0-9A-Z])',
    re.IGNORECASE
)

# Standalone GSTIN (without label)
GSTIN_STANDALONE = re.compile(
    r'\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9Z][A-Z][0-9A-Z])\b'
)

# GST Amounts - CGST, SGST, IGST with common OCR errors
GST_AMOUNT_PATTERNS = {
    'cgst': re.compile(
        r'(?:CGST|C\.?G\.?S\.?T\.?|CENTRAL\s*GST)\s*'
        r'(?:@?\s*(\d+(?:\.\d+)?)\s*%?)?\s*[:\-]?\s*'
        r'(?:Rs\.?|₹|¥|INR)?\s*'
        r'(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)',
        re.IGNORECASE
    ),
    'sgst': re.compile(
        r'(?:SGST|S\.?G\.?S\.?T\.?|STATE\s*GST|UGST)\s*'
        r'(?:@?\s*(\d+(?:\.\d+)?)\s*%?)?\s*[:\-]?\s*'
        r'(?:Rs\.?|₹|¥|INR)?\s*'
        r'(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)',
        re.IGNORECASE
    ),
    'igst': re.compile(
        r'(?:IGST|I\.?G\.?S\.?T\.?|INTEGRATED\s*GST)\s*'
        r'(?:@?\s*(\d+(?:\.\d+)?)\s*%?)?\s*[:\-]?\s*'
        r'(?:Rs\.?|₹|¥|INR)?\s*'
        r'(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)',
        re.IGNORECASE
    ),
}

# 6-tier Amount Extraction (PRD Section 7.4.4)
# Strategy: more specific patterns first, take LAST match (bottom of receipt = final total)
AMOUNT_PATTERNS = [
    # Tier 0: INVOICE TOTAL / GRAND TOTAL (most specific, highest priority)
    re.compile(
        r'(?:INVOICE|GRAND)\s*TOTAL\s*[:\-]?\s*'
        r'(?:Rs\.?|₹|¥|INR)?\s*'
        r'(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)',
        re.IGNORECASE
    ),
    # Tier 1: TOTAL (but NOT subtotal) — use negative lookbehind
    re.compile(
        r'(?<!SUB)TOTAL\s*(?:AMOUNT|AMT|DUE|PAYABLE)?\s*[:\-]?\s*'
        r'(?:Rs\.?|₹|¥|INR)?\s*'
        r'(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)',
        re.IGNORECASE
    ),
    # Tier 2: Net/Final amount
    re.compile(
        r'(?:NET|FINAL|BILL)\s*(?:AMOUNT|AMT|TOTAL)?\s*[:\-]?\s*'
        r'(?:Rs\.?|₹|¥|INR)?\s*'
        r'(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)',
        re.IGNORECASE
    ),
    # Tier 3: Amount with currency symbol (₹, ¥, Rs.)
    re.compile(
        r'(?:Rs\.?|₹|¥|INR)\s*[:\-]?\s*'
        r'(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)',
        re.IGNORECASE
    ),
    # Tier 4: "Paid" amount
    re.compile(
        r'(?:PAID|PAYMENT|RECEIVED)\s*[:\-]?\s*'
        r'(?:Rs\.?|₹|¥|INR)?\s*'
        r'(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)',
        re.IGNORECASE
    ),
    # Tier 5: Standalone large number (likely total)
    re.compile(
        r'(?:^|\s)(\d{1,3}(?:,\d{2,3})*\.\d{2})(?:\s|$)'
    ),
    # Tier 6: Any number with decimal (fallback)
    re.compile(r'(\d+(?:,\d+)*\.\d{2})'),
]

# Date patterns (5 formats per PRD)
DATE_PATTERNS = [
    # DD/MM/YYYY or DD-MM-YYYY
    (re.compile(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})'), 'DMY'),
    # DD/MM/YY or DD-MM-YY
    (re.compile(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})(?!\d)'), 'DMY2'),
    # DD Mon YYYY (e.g., 24 Nov 2024)
    (re.compile(
        r'(\d{1,2})\s*'
        r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*'
        r'(\d{4})',
        re.IGNORECASE
    ), 'DMY_TEXT'),
    # YYYY-MM-DD (ISO)
    (re.compile(r'(\d{4})-(\d{2})-(\d{2})'), 'YMD'),
    # Mon DD, YYYY (e.g., Nov 24, 2024)
    (re.compile(
        r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*'
        r'(\d{1,2}),?\s*(\d{4})',
        re.IGNORECASE
    ), 'MDY_TEXT'),
]

MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
}

# Invoice number patterns
INVOICE_PATTERNS = [
    re.compile(r'(?:INVOICE|INV|BILL)\s*(?:NO|NUM|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9\-/]+)', re.IGNORECASE),
    re.compile(r'(?:RECEIPT|RCP)\s*(?:NO|NUM|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9\-/]+)', re.IGNORECASE),
    re.compile(r'(?:ORDER|ORD)\s*(?:ID|NO|NUM)?\s*[:\-]?\s*([A-Z0-9\-/]+)', re.IGNORECASE),
]

# HSN/SAC codes
HSN_PATTERN = re.compile(r'(?:HSN|HSN\s*CODE)\s*[:\-]?\s*(\d{4,8})', re.IGNORECASE)
SAC_PATTERN = re.compile(r'(?:SAC|SAC\s*CODE)\s*[:\-]?\s*(\d{4,6})', re.IGNORECASE)


# ============ CATEGORY KEYWORDS (PRD Section 7.3) ============

CATEGORY_KEYWORDS = {
    'food_dining': [
        'zomato', 'swiggy', 'dominos', 'pizza hut', 'kfc', 'mcdonald',
        'subway', 'starbucks', 'cafe coffee day', 'ccd', 'restaurant',
        'dhaba', 'biryani', 'chai', 'cafe', 'eatery', 'food court',
        'haldirams', 'bikanervala', 'chaayos', 'blue tokai',
    ],
    'groceries': [
        'dmart', 'big bazaar', 'bigbasket', 'blinkit', 'zepto', 'instamart',
        'kirana', 'grocery', 'reliance fresh', 'more supermarket',
        'spencers', 'ratnadeep', 'star bazaar', 'nature basket',
        'atta', 'dal', 'rice', 'oil', 'masala', 'vegetables',
    ],
    'fuel_transport': [
        'indian oil', 'iocl', 'bharat petroleum', 'bpcl', 'hindustan petroleum',
        'hpcl', 'petrol', 'diesel', 'fuel', 'cng', 'gas station',
        'ola', 'uber', 'rapido', 'irctc', 'railway', 'metro', 'bus',
        'fastag', 'parking', 'toll',
    ],
    'healthcare': [
        'apollo', 'medplus', 'netmeds', '1mg', 'pharmeasy', 'pharmacy',
        'chemist', 'hospital', 'clinic', 'diagnostic', 'lab', 'pathology',
        'medicine', 'medical', 'health', 'doctor', 'consultation',
    ],
    'shopping': [
        'myntra', 'ajio', 'meesho', 'flipkart', 'amazon', 'lifestyle',
        'westside', 'pantaloons', 'shoppers stop', 'max fashion',
        'zara', 'h&m', 'fashion', 'clothing', 'footwear', 'apparel',
    ],
    'electronics': [
        'croma', 'reliance digital', 'vijay sales', 'boat', 'samsung',
        'apple', 'oneplus', 'mi', 'xiaomi', 'laptop', 'mobile', 'phone',
        'computer', 'electronic', 'gadget', 'repair', 'service center',
    ],
    'utilities': [
        'airtel', 'jio', 'vodafone', 'bsnl', 'electricity',
        'power', 'water', 'gas', 'broadband', 'wifi', 'internet',
        'dth', 'tata sky', 'd2h', 'recharge', 'bill payment',
    ],
    'professional': [
        'design', 'design agency', 'consulting', 'consultant', 'chartered accountant',
        'ca', 'advocate', 'lawyer', 'legal', 'solutions', 'pvt ltd',
        'private limited', 'audit', 'printing', 'courier', 'logistics',
    ],
    'education': [
        'byjus', 'unacademy', 'vedantu', 'school', 'college', 'university',
        'coaching', 'classes', 'course', 'training', 'institute', 'academy',
        'udemy', 'coursera', 'education', 'tuition', 'exam', 'fee',
    ],
    'entertainment': [
        'pvr', 'inox', 'cinepolis', 'bookmyshow', 'netflix', 'hotstar',
        'prime video', 'spotify', 'youtube', 'gym', 'fitness', 'salon',
        'spa', 'oyo', 'hotel', 'resort', 'travel', 'makemytrip', 'goibibo',
    ],
}


class IndianTextNormalizer:
    """
    Step 3: Indian Text Normalizer
    Fixes common OCR errors specific to Indian receipts
    """
    
    @staticmethod
    def normalize(text: str) -> str:
        """Apply Indian-specific normalization rules"""
        # ¥ → ₹ (Tesseract commonly misreads Rupee symbol as Yen)
        text = text.replace('¥', '₹')
        
        # Fix ₹→2 OCR error — ONLY when "2" appears where a currency symbol is expected
        text = re.sub(
            r'(?:(?:TOTAL|AMOUNT|AMT|PRICE|PAID|DUE|SUBTOTAL|NET)\s*[:\-]?\s*)2(\d{1,3}(?:,\d{2,3})*(?:\.\d{2}))',
            lambda m: m.group(0).replace('2' + m.group(1), '₹' + m.group(1)),
            text, flags=re.IGNORECASE
        )
        
        # Normalize currency symbols
        text = re.sub(r'\bRs\.?\s*', '₹', text, flags=re.IGNORECASE)
        text = re.sub(r'\bINR\s*', '₹', text, flags=re.IGNORECASE)
        text = re.sub(r'\bRupees?\s*', '₹', text, flags=re.IGNORECASE)
        
        # Fix common OCR character errors
        # l→1 in numbers
        text = re.sub(r'(?<=[0-9])l(?=[0-9])', '1', text)
        text = re.sub(r'(?<=[0-9])l\b', '1', text)
        # O→0 in numbers
        text = re.sub(r'(?<=[0-9])O(?=[0-9])', '0', text)
        text = re.sub(r'\bO(?=[0-9])', '0', text)
        # S→5 in amounts
        text = re.sub(r'(?<=[0-9])S(?=[0-9])', '5', text)
        
        # Fix spacing around punctuation
        text = re.sub(r'\s+([,.])\s*', r'\1', text)
        
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text


class GSTINValidator:
    """Validate GSTIN with checksum verification"""
    
    CHAR_VALUES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    
    @classmethod
    def validate(cls, gstin: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Validate GSTIN and extract PAN
        Returns: (is_valid, pan, error_message)
        """
        if not gstin or len(gstin) != 15:
            return False, None, "GSTIN must be 15 characters"
        
        gstin = gstin.upper()
        
        # Check format
        if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9Z][A-Z][0-9A-Z]$', gstin):
            return False, None, "Invalid GSTIN format"
        
        # Validate state code (01-38)
        state_code = int(gstin[:2])
        if state_code < 1 or state_code > 38:
            return False, None, f"Invalid state code: {state_code}"
        
        # Calculate checksum
        total = 0
        for i, char in enumerate(gstin[:14]):
            idx = cls.CHAR_VALUES.index(char)
            factor = 1 if i % 2 == 0 else 2
            product = idx * factor
            total += (product // 36) + (product % 36)
        
        expected_checksum = cls.CHAR_VALUES[(36 - (total % 36)) % 36]
        
        if gstin[14] != expected_checksum:
            return False, None, f"Invalid checksum: expected {expected_checksum}"
        
        # Extract PAN (characters 3-12)
        pan = gstin[2:12]
        
        return True, pan, None


class ReceiptCategorizer:
    """
    Step 6: Categorizer
    130+ keywords, merchant name weighted 2×
    """
    
    @classmethod
    def categorize(cls, text: str, merchant: str = "") -> Tuple[str, float]:
        """
        Categorize receipt based on text content
        Returns: (category, confidence)
        """
        text_lower = text.lower()
        merchant_lower = merchant.lower()
        
        scores: Dict[str, float] = {}
        
        for category, keywords in CATEGORY_KEYWORDS.items():
            score = 0.0
            matched_keywords = []
            
            for keyword in keywords:
                # Merchant match = 2× weight
                if keyword in merchant_lower:
                    score += 2.0
                    matched_keywords.append(f"{keyword}(m)")
                # Text match = 1× weight
                elif keyword in text_lower:
                    count = text_lower.count(keyword)
                    score += min(count, 3)  # Cap at 3 occurrences
                    matched_keywords.append(keyword)
            
            if score > 0:
                scores[category] = score
        
        if not scores:
            return 'other', 0.5
        
        # Get best category
        best_category = max(scores, key=scores.get)
        best_score = scores[best_category]
        
        # Calculate confidence (normalize to 0-1)
        total_score = sum(scores.values())
        confidence = min(best_score / max(total_score, 1), 1.0)
        
        # Boost confidence if merchant matched
        if merchant_lower and any(kw in merchant_lower for kw in CATEGORY_KEYWORDS.get(best_category, [])):
            confidence = min(confidence + 0.15, 1.0)
        
        return best_category, round(confidence, 2)


class IndianRegexEngine:
    """
    Step 4: Indian Regex Engine
    Extract structured data from normalized OCR text
    """
    
    @classmethod
    def extract_gstin(cls, text: str) -> Optional[str]:
        """Extract GSTIN from text"""
        # Try labeled GSTIN first
        match = GSTIN_PATTERN.search(text)
        if match:
            return match.group(1).upper()
        
        # Try standalone GSTIN
        match = GSTIN_STANDALONE.search(text)
        if match:
            gstin = match.group(1).upper()
            # Validate it's a real GSTIN
            is_valid, _, _ = GSTINValidator.validate(gstin)
            if is_valid:
                return gstin
        
        return None
    
    @classmethod
    def extract_gst_amounts(cls, text: str) -> Dict[str, Optional[Tuple[float, Optional[float]]]]:
        """
        Extract CGST, SGST, IGST amounts and rates
        Returns: {gst_type: (amount, rate)}
        """
        results = {}
        
        for gst_type, pattern in GST_AMOUNT_PATTERNS.items():
            match = pattern.search(text)
            if match:
                rate = float(match.group(1)) if match.group(1) else None
                amount_str = match.group(2).replace(',', '')
                try:
                    amount = float(amount_str)
                    results[gst_type] = (amount, rate)
                except ValueError:
                    pass
        
        return results
    
    @classmethod
    def extract_amount(cls, text: str) -> Optional[float]:
        """
        Extract total amount using tiered priority.
        For top tiers (INVOICE/GRAND TOTAL, TOTAL), take the LAST match
        since the final total is usually at the bottom of the receipt.
        For lower tiers, take the largest amount.
        """
        for tier_idx, pattern in enumerate(AMOUNT_PATTERNS):
            matches = pattern.findall(text)
            if matches:
                amounts = []
                for match in matches:
                    try:
                        amount_str = match.replace(',', '') if isinstance(match, str) else match
                        amount = float(amount_str)
                        if 0 < amount < 10000000:  # Sanity: less than 1 crore
                            amounts.append(amount)
                    except (ValueError, TypeError):
                        continue
                
                if amounts:
                    # Top tiers (0-1): take LAST match (final total at bottom)
                    if tier_idx <= 1:
                        return amounts[-1]
                    # Lower tiers: take largest
                    return max(amounts)
        
        return None
    
    @classmethod
    def extract_date(cls, text: str) -> Optional[datetime]:
        """Extract date from text using 5 format patterns"""
        for pattern, format_type in DATE_PATTERNS:
            match = pattern.search(text)
            if match:
                try:
                    groups = match.groups()
                    
                    if format_type == 'DMY':
                        day, month, year = int(groups[0]), int(groups[1]), int(groups[2])
                    elif format_type == 'DMY2':
                        day, month, year = int(groups[0]), int(groups[1]), int(groups[2])
                        year = 2000 + year if year < 50 else 1900 + year
                    elif format_type == 'DMY_TEXT':
                        day = int(groups[0])
                        month = MONTH_MAP.get(groups[1].lower()[:3], 1)
                        year = int(groups[2])
                    elif format_type == 'YMD':
                        year, month, day = int(groups[0]), int(groups[1]), int(groups[2])
                    elif format_type == 'MDY_TEXT':
                        month = MONTH_MAP.get(groups[0].lower()[:3], 1)
                        day = int(groups[1])
                        year = int(groups[2])
                    else:
                        continue
                    
                    # Validate date
                    if 1 <= month <= 12 and 1 <= day <= 31 and 1990 <= year <= 2100:
                        return datetime(year, month, day)
                
                except (ValueError, IndexError):
                    continue
        
        return None
    
    @classmethod
    def extract_invoice_number(cls, text: str) -> Optional[str]:
        """Extract invoice/receipt number"""
        for pattern in INVOICE_PATTERNS:
            match = pattern.search(text)
            if match:
                invoice_num = match.group(1).strip()
                if len(invoice_num) >= 3:  # Minimum reasonable length
                    return invoice_num
        return None
    
    @classmethod
    def extract_hsn_sac(cls, text: str) -> Tuple[Optional[str], Optional[str]]:
        """Extract HSN and SAC codes"""
        hsn = None
        sac = None
        
        hsn_match = HSN_PATTERN.search(text)
        if hsn_match:
            hsn = hsn_match.group(1)
        
        sac_match = SAC_PATTERN.search(text)
        if sac_match:
            sac = sac_match.group(1)
        
        return hsn, sac
    
    @classmethod
    def extract_merchant(cls, text: str) -> str:
        """
        Extract merchant name (typically first line or largest text)
        Falls back to first non-empty line
        """
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        for line in lines[:5]:  # Check first 5 lines
            # Skip lines that are clearly not merchant names
            if re.match(r'^(GSTIN|GST|TAX|INVOICE|RECEIPT|BILL|DATE|TIME)', line, re.IGNORECASE):
                continue
            if re.match(r'^[\d\s,.\-/]+$', line):  # All numbers/dates
                continue
            if len(line) < 3:
                continue
            
            # Clean up the merchant name
            merchant = re.sub(r'\s+', ' ', line).strip()
            return merchant[:100]  # Cap at 100 chars
        
        return "Unknown Merchant"


class OCRExtractionPipeline:
    """
    Main extraction pipeline combining all steps
    """
    
    def __init__(self):
        self.normalizer = IndianTextNormalizer()
        self.regex_engine = IndianRegexEngine()
        self.categorizer = ReceiptCategorizer()
    
    def extract(self, raw_text: str, ocr_confidence: float = 0.0) -> ExtractionResult:
        """
        Run the full extraction pipeline on OCR text
        """
        start_time = time.time()
        warnings = []
        
        # Extract merchant from RAW text (before newlines are collapsed)
        merchant = self.regex_engine.extract_merchant(raw_text)
        
        # Step 3: Normalize text (collapses whitespace)
        normalized_text = self.normalizer.normalize(raw_text)
        
        # Step 4: Extract structured data from normalized text
        amount = self.regex_engine.extract_amount(normalized_text)
        date = self.regex_engine.extract_date(normalized_text)
        gstin = self.regex_engine.extract_gstin(normalized_text)
        gst_amounts = self.regex_engine.extract_gst_amounts(normalized_text)
        invoice_number = self.regex_engine.extract_invoice_number(normalized_text)
        hsn, sac = self.regex_engine.extract_hsn_sac(normalized_text)
        
        # Validate GSTIN
        gstin_valid = False
        pan = None
        if gstin:
            gstin_valid, pan, error = GSTINValidator.validate(gstin)
            if error:
                warnings.append(f"GSTIN validation: {error}")
        
        # Extract GST breakdown
        cgst = gst_amounts.get('cgst', (None, None))[0]
        sgst = gst_amounts.get('sgst', (None, None))[0]
        igst = gst_amounts.get('igst', (None, None))[0]
        
        # Get GST rate from any extracted amount
        gst_rate = None
        for _, (_, rate) in gst_amounts.items():
            if rate is not None:
                gst_rate = rate
                break
        
        # Step 6: Categorize (use raw text for keyword matching + clean merchant)
        category, category_confidence = self.categorizer.categorize(raw_text, merchant)
        
        # Add warnings for missing critical fields
        if amount is None:
            warnings.append("Could not extract amount")
            amount = 0.0
        
        if date is None:
            warnings.append("Could not extract date, using today")
            date = datetime.now()
        
        processing_ms = int((time.time() - start_time) * 1000)
        
        return ExtractionResult(
            merchant=merchant,
            amount=amount,
            currency='INR',
            date=date,
            gstin=gstin,
            gstin_valid=gstin_valid,
            cgst=cgst,
            sgst=sgst,
            igst=igst,
            gst_rate=gst_rate,
            pan=pan,
            hsn=hsn,
            sac=sac,
            invoice_number=invoice_number,
            category=category,
            category_confidence=category_confidence,
            ocr_confidence=ocr_confidence,
            extraction_method='tesseract',  # Will be set by caller
            raw_text=raw_text,
            warnings=warnings,
        )


# Singleton instance
extraction_pipeline = OCRExtractionPipeline()

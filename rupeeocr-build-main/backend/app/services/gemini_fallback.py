"""
Gemini Vision Fallback Service
Called when Tesseract OCR confidence < 50%
Sends the receipt image to Gemini for structured extraction.
"""

import os
import json
import base64
import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

EXTRACTION_PROMPT = """You are an Indian receipt/invoice data extractor. Analyze this receipt image and extract the following fields. Return ONLY valid JSON, no markdown, no backticks, no explanation.

{
  "merchant": "merchant/store name",
  "amount": total amount as a number (final total, not subtotal),
  "date": "YYYY-MM-DD" format or null if not found,
  "category": one of: "food_dining", "groceries", "fuel_transport", "healthcare", "shopping", "electronics", "utilities", "professional", "education", "entertainment", "other",
  "gstin": "15-char GSTIN if visible" or null,
  "cgst": CGST amount as number or null,
  "sgst": SGST amount as number or null,
  "igst": IGST amount as number or null,
  "gst_rate": GST percentage as number or null,
  "invoice_number": "invoice/receipt number" or null,
  "items": [{"description": "item name", "amount": price}] or []
}

Important:
- Amount should be the FINAL TOTAL (after tax), not subtotal
- For Indian receipts, look for ₹, Rs., INR symbols
- GSTIN format: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + checksum
- Date formats: DD/MM/YYYY, DD-MM-YYYY, DD Mon YYYY
- Return ONLY the JSON object, nothing else"""


@dataclass
class GeminiExtractionResult:
    success: bool
    merchant: str
    amount: float
    date: Optional[str]
    category: str
    gstin: Optional[str]
    cgst: Optional[float]
    sgst: Optional[float]
    igst: Optional[float]
    gst_rate: Optional[float]
    invoice_number: Optional[str]
    raw_response: str
    error: Optional[str]


def is_available() -> bool:
    """Check if Gemini API key is configured"""
    return bool(GEMINI_API_KEY)


def extract_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> GeminiExtractionResult:
    """
    Send receipt image to Gemini Vision for extraction.
    Uses the google-generativeai SDK.
    """
    if not GEMINI_API_KEY:
        return GeminiExtractionResult(
            success=False, merchant="", amount=0, date=None, category="other",
            gstin=None, cgst=None, sgst=None, igst=None, gst_rate=None,
            invoice_number=None, raw_response="", error="GEMINI_API_KEY not set"
        )

    try:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.0-flash")

        # Send image + prompt
        response = model.generate_content(
            [
                {
                    "mime_type": mime_type,
                    "data": base64.b64encode(image_bytes).decode("utf-8"),
                },
                EXTRACTION_PROMPT,
            ],
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                max_output_tokens=1024,
            ),
        )

        raw_text = response.text.strip()
        logger.info(f"Gemini raw response: {raw_text[:200]}")

        # Parse JSON from response (strip markdown fences if present)
        json_str = raw_text
        if json_str.startswith("```"):
            json_str = json_str.split("\n", 1)[1] if "\n" in json_str else json_str[3:]
        if json_str.endswith("```"):
            json_str = json_str[:-3]
        json_str = json_str.strip()

        data = json.loads(json_str)

        return GeminiExtractionResult(
            success=True,
            merchant=data.get("merchant", "Unknown"),
            amount=float(data.get("amount", 0)),
            date=data.get("date"),
            category=data.get("category", "other"),
            gstin=data.get("gstin"),
            cgst=float(data["cgst"]) if data.get("cgst") else None,
            sgst=float(data["sgst"]) if data.get("sgst") else None,
            igst=float(data["igst"]) if data.get("igst") else None,
            gst_rate=float(data["gst_rate"]) if data.get("gst_rate") else None,
            invoice_number=data.get("invoice_number"),
            raw_response=raw_text,
            error=None,
        )

    except ImportError:
        return GeminiExtractionResult(
            success=False, merchant="", amount=0, date=None, category="other",
            gstin=None, cgst=None, sgst=None, igst=None, gst_rate=None,
            invoice_number=None, raw_response="",
            error="google-generativeai package not installed. Run: pip install google-generativeai"
        )
    except json.JSONDecodeError as e:
        logger.error(f"Gemini returned invalid JSON: {e}")
        return GeminiExtractionResult(
            success=False, merchant="", amount=0, date=None, category="other",
            gstin=None, cgst=None, sgst=None, igst=None, gst_rate=None,
            invoice_number=None, raw_response=raw_text,
            error=f"Invalid JSON from Gemini: {e}"
        )
    except Exception as e:
        logger.error(f"Gemini extraction failed: {e}", exc_info=True)
        return GeminiExtractionResult(
            success=False, merchant="", amount=0, date=None, category="other",
            gstin=None, cgst=None, sgst=None, igst=None, gst_rate=None,
            invoice_number=None, raw_response="",
            error=str(e)
        )

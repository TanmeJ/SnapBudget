"""
Scan Router — Real OCR Pipeline + Gemini Fallback
POST /api/scan — Single file (OCR → Gemini fallback if conf < 50% → save)
POST /api/scan/batch — Up to 20 files
GET  /api/scan/health — Dependency check
POST /api/scan/test — Raw text test
"""

import asyncio, time, logging
from datetime import datetime
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user_id
from app.models.schemas import (
    ScanResult, BatchScanResult, Receipt, ReceiptGST,
    Category, ExtractionMethod, ParsedReceipt
)
from app.services.extraction import extraction_pipeline
from app.services.ocr_processor import parse_receipt, process_file, check_dependencies, OCROutput
from app.services import gemini_fallback
from app.routers.receipts import UPLOAD_ROOT, save_receipt

logger = logging.getLogger(__name__)
router = APIRouter()

GEMINI_CONFIDENCE_THRESHOLD = 50  # Use Gemini when OCR confidence < this

METHOD_MAP = {
    'pymupdf': ExtractionMethod.PYMUPDF,
    'tesseract': ExtractionMethod.TESSERACT,
    'gemini': ExtractionMethod.GEMINI,
    'failed': ExtractionMethod.TESSERACT,
}


async def process_single_file(file: UploadFile, user_id: str, db: Session) -> ScanResult:
    start_time = time.time()
    warnings = []

    # Validate file type
    allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    ct = file.content_type or ''
    fn = file.filename or ''
    ext = fn.lower().rsplit('.', 1)[-1] if '.' in fn else ''
    ext_map = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'pdf': 'application/pdf'}
    if ct not in allowed:
        ct = ext_map.get(ext, ct)
    if ct not in allowed:
        return ScanResult(success=False, error=f"Unsupported file type: {file.content_type}")

    try:
        content = await file.read()
    except Exception as e:
        return ScanResult(success=False, error=f"Read failed: {e}")
    if len(content) > 10 * 1024 * 1024:
        return ScanResult(success=False, error="File too large (max 10MB)")
    if not content:
        return ScanResult(success=False, error="Empty file")

    # ====== STEP 1: Tesseract OCR ======
    try:
        loop = asyncio.get_event_loop()
        ocr: OCROutput = await loop.run_in_executor(None, process_file, content, ct, fn)
    except Exception as e:
        logger.error(f"OCR failed: {e}", exc_info=True)
        return ScanResult(success=False, error=f"OCR failed: {e}")

    extraction_method = ExtractionMethod.TESSERACT
    merchant = ""
    amount = 0.0
    date_val = None
    category_str = "other"
    category_confidence = 0.5
    ocr_confidence = ocr.confidence
    gst = None
    invoice_number = None
    raw_text = ocr.text or ""
    parsed_data = parse_receipt(raw_text, ocr.words)

    # ====== STEP 2: Check if Gemini fallback needed ======
    use_gemini = (
        ocr.confidence < GEMINI_CONFIDENCE_THRESHOLD
        or not ocr.text
        or ocr.method == 'failed'
    )

    if use_gemini and gemini_fallback.is_available():
        logger.info(f"OCR confidence {ocr.confidence:.0f}% < {GEMINI_CONFIDENCE_THRESHOLD}%, trying Gemini fallback...")
        warnings.append(f"Low OCR confidence ({ocr.confidence:.0f}%), used Gemini AI for extraction.")

        try:
            gemini_result = await loop.run_in_executor(
                None, gemini_fallback.extract_from_image, content, ct
            )

            if gemini_result.success and gemini_result.amount > 0:
                extraction_method = ExtractionMethod.GEMINI
                merchant = gemini_result.merchant
                amount = gemini_result.amount
                category_str = gemini_result.category
                category_confidence = 0.85  # Gemini is generally reliable
                ocr_confidence = 85.0  # Synthetic confidence for Gemini
                raw_text = gemini_result.raw_response
                parsed_data = parse_receipt(raw_text)

                if gemini_result.date:
                    try:
                        date_val = datetime.fromisoformat(gemini_result.date)
                    except (ValueError, TypeError):
                        pass

                if gemini_result.gstin or gemini_result.cgst or gemini_result.sgst:
                    gst = ReceiptGST(
                        gstin=gemini_result.gstin, gstin_valid=False,
                        cgst=gemini_result.cgst, sgst=gemini_result.sgst,
                        igst=gemini_result.igst, gst_rate=gemini_result.gst_rate,
                        invoice_number=gemini_result.invoice_number,
                    )

                invoice_number = gemini_result.invoice_number
                logger.info(f"Gemini extracted: {merchant} Rs.{amount} [{category_str}]")
            else:
                if gemini_result.error:
                    warnings.append(f"Gemini fallback: {gemini_result.error}")
                # Fall through to Tesseract extraction below
                use_gemini = False
        except Exception as e:
            logger.error(f"Gemini fallback error: {e}")
            warnings.append(f"Gemini fallback failed: {str(e)}")
            use_gemini = False

    elif use_gemini and not gemini_fallback.is_available():
        logger.info("Low OCR confidence and Gemini fallback is not configured; continuing with local OCR extraction.")
        use_gemini = False

    # ====== STEP 3: Tesseract extraction (if Gemini not used or failed) ======
    if extraction_method != ExtractionMethod.GEMINI:
        if not ocr.text or ocr.method == 'failed':
            return ScanResult(
                success=False,
                error=ocr.warnings[0] if ocr.warnings else "No text extracted. Try a clearer image.",
                warnings=ocr.warnings + warnings
            )

        try:
            result = extraction_pipeline.extract(ocr.text, ocr.confidence)
        except Exception as e:
            logger.warning("Rule extraction failed; returning OCR parser fallback: %s", e)
            result = None

        if result is not None:
            merchant = result.merchant
            amount = result.amount
            date_val = result.date
            category_str = result.category
            category_confidence = result.category_confidence
            ocr_confidence = result.ocr_confidence
            raw_text = result.raw_text
            parsed_data = parse_receipt(raw_text, ocr.words)
            warnings.extend(result.warnings)
        else:
            merchant = parsed_data.get("store") or "Unknown Merchant"
            amount = parsed_data.get("total") or 0.0
            category_str = "other"
            category_confidence = 0.35
        warnings.extend(ocr.warnings)

        if result is not None and (result.gstin or result.cgst or result.sgst or result.igst):
            gst = ReceiptGST(
                gstin=result.gstin, gstin_valid=result.gstin_valid,
                cgst=result.cgst, sgst=result.sgst, igst=result.igst,
                gst_rate=result.gst_rate, pan=result.pan,
                hsn=result.hsn, sac=result.sac,
                invoice_number=result.invoice_number,
            )
        invoice_number = result.invoice_number if result is not None else None

    if parsed_data.get("store") and (not merchant or merchant == "Unknown Merchant"):
        merchant = parsed_data["store"]
    if parsed_data.get("total") is not None and amount <= 0:
        amount = parsed_data["total"]

    # ====== Build receipt ======
    ms = int((time.time() - start_time) * 1000)

    if date_val is None:
        date_val = datetime.now()
        warnings.append("Could not extract date, using today")

    # Blurry image warning
    if ocr_confidence < 60 and extraction_method != ExtractionMethod.GEMINI:
        warnings.append("Image may be blurry or low quality. Consider retaking the photo.")

    receipt_id = f"rcpt_{int(time.time()*1000)}"
    safe_suffix = Path(fn).suffix.lower() or ".bin"
    stored_name = f"{receipt_id}{safe_suffix}"
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    (UPLOAD_ROOT / stored_name).write_bytes(content)

    receipt = Receipt(
        id=receipt_id, user_id=user_id,
        merchant=merchant or "Unknown Merchant",
        amount=amount, currency="INR", date=date_val,
        category=Category(category_str),
        category_confidence=category_confidence,
        ocr_confidence=ocr_confidence,
        extraction_method=extraction_method,
        processing_ms=ms,
        raw_text=raw_text,
        file_url=f"/uploads/{stored_name}",
        file_name=fn,
        file_content_type=ct,
        user_verified=False, gst=gst,
    )

    # Save to store
    save_receipt(receipt, db)

    logger.info(
        f"Scan: {fn} -> {merchant} Rs.{amount} [{category_str}] "
        f"method={extraction_method.value} conf={ocr_confidence:.0f}% {ms}ms"
    )
    return ScanResult(
        success=True,
        receipt=receipt,
        parsed=ParsedReceipt(**parsed_data),
        warnings=warnings,
    )


@router.post("", response_model=ScanResult)
async def scan_receipt(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return await process_single_file(file, user_id, db)


@router.post("/batch", response_model=BatchScanResult)
async def scan_batch(
    files: List[UploadFile] = File(...),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if len(files) > 20:
        raise HTTPException(400, "Max 20 files per batch")
    if not files:
        raise HTTPException(400, "No files")
    results = []
    for file in files:
        results.append(await process_single_file(file, user_id, db))
    return BatchScanResult(
        total=len(files), processed=sum(1 for r in results if r.success),
        failed=sum(1 for r in results if not r.success), results=results,
        total_amount=sum(r.receipt.amount for r in results if r.success and r.receipt),
    )


@router.get("/health")
async def ocr_health():
    deps = check_dependencies()
    ok = all(v is not None for v in deps.values())
    return {
        "status": "healthy" if ok else "degraded",
        "dependencies": deps,
        "missing": [k for k, v in deps.items() if v is None],
        "gemini_available": gemini_fallback.is_available(),
        "gemini_threshold": GEMINI_CONFIDENCE_THRESHOLD,
    }


@router.post("/test")
async def test_extraction(text: str = Form(...)):
    r = extraction_pipeline.extract(text, 100.0)
    return {
        "merchant": r.merchant, "amount": r.amount,
        "date": r.date.isoformat() if r.date else None,
        "category": r.category, "gstin": r.gstin,
        "gstin_valid": r.gstin_valid, "warnings": r.warnings,
    }

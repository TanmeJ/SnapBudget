"""Receipt CRUD, persisted file access, and export routes."""

import csv
import io
import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user_id
from app.models.models import Receipt as ReceiptRecord
from app.models.schemas import (
    Category,
    ExtractionMethod,
    MerchantOverride,
    Receipt,
    ReceiptGST,
    ReceiptUpdate,
)

router = APIRouter()
UPLOAD_ROOT = Path(
    os.getenv("UPLOAD_DIR", str(Path(__file__).resolve().parents[2] / "uploads"))
).resolve()
_merchant_overrides: dict[str, MerchantOverride] = {}


def receipt_to_schema(record: ReceiptRecord) -> Receipt:
    gst = ReceiptGST(**json.loads(record.gst_json)) if record.gst_json else None
    return Receipt(
        id=record.id,
        user_id=record.user_id,
        merchant=record.merchant,
        amount=record.amount,
        currency=record.currency,
        date=record.date,
        category=Category(record.category),
        category_confidence=record.category_confidence,
        ocr_confidence=record.ocr_confidence,
        extraction_method=ExtractionMethod(record.extraction_method),
        processing_ms=record.processing_ms,
        raw_text=record.raw_text or "",
        file_url=record.file_url or "",
        file_name=record.file_name or "",
        file_content_type=record.file_content_type or "",
        user_verified=record.user_verified,
        created_at=record.created_at,
        gst=gst,
    )


def save_receipt(receipt: Receipt, db: Session) -> Receipt:
    record = ReceiptRecord(
        id=receipt.id,
        user_id=receipt.user_id,
        merchant=receipt.merchant,
        amount=receipt.amount,
        currency=receipt.currency,
        date=receipt.date,
        category=receipt.category.value,
        category_confidence=receipt.category_confidence,
        ocr_confidence=receipt.ocr_confidence,
        extraction_method=receipt.extraction_method.value,
        processing_ms=receipt.processing_ms,
        raw_text=receipt.raw_text,
        file_url=receipt.file_url,
        file_name=receipt.file_name,
        file_content_type=receipt.file_content_type,
        user_verified=receipt.user_verified,
        gst_json=json.dumps(receipt.gst.model_dump(mode="json")) if receipt.gst else None,
        created_at=receipt.created_at,
    )
    db.merge(record)
    db.commit()
    return receipt


def get_all_receipts(user_id: str, db: Session) -> List[Receipt]:
    records = (
        db.query(ReceiptRecord)
        .filter(ReceiptRecord.user_id == user_id)
        .order_by(ReceiptRecord.date.desc())
        .all()
    )
    return [receipt_to_schema(record) for record in records]


def get_receipt_record(receipt_id: str, user_id: str, db: Session) -> ReceiptRecord:
    record = (
        db.query(ReceiptRecord)
        .filter(ReceiptRecord.id == receipt_id, ReceiptRecord.user_id == user_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return record


@router.get("", response_model=List[Receipt])
async def list_receipts(
    category: Optional[List[Category]] = Query(None),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    has_gst: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=100),
    offset: int = 0,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    results = get_all_receipts(user_id, db)
    if category:
        results = [receipt for receipt in results if receipt.category in category]
    if date_from:
        results = [receipt for receipt in results if receipt.date >= date_from]
    if date_to:
        results = [receipt for receipt in results if receipt.date <= date_to]
    if min_amount is not None:
        results = [receipt for receipt in results if receipt.amount >= min_amount]
    if max_amount is not None:
        results = [receipt for receipt in results if receipt.amount <= max_amount]
    if has_gst is not None:
        results = [
            receipt
            for receipt in results
            if has_gst == bool(receipt.gst and receipt.gst.gstin)
        ]
    if search:
        needle = search.lower()
        results = [
            receipt
            for receipt in results
            if needle in receipt.merchant.lower()
            or bool(receipt.gst and needle in (receipt.gst.invoice_number or "").lower())
        ]
    return results[offset:offset + limit]


@router.get("/export.csv")
async def export_receipts_csv(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "receipt_id",
            "merchant",
            "amount",
            "currency",
            "date",
            "category",
            "gstin",
            "cgst",
            "sgst",
            "igst",
            "invoice_number",
            "ocr_confidence",
            "verified",
            "file_name",
        ]
    )
    for receipt in get_all_receipts(user_id, db):
        gst = receipt.gst
        writer.writerow(
            [
                receipt.id,
                receipt.merchant,
                receipt.amount,
                receipt.currency,
                receipt.date.isoformat(),
                receipt.category.value,
                gst.gstin if gst else "",
                gst.cgst if gst else "",
                gst.sgst if gst else "",
                gst.igst if gst else "",
                gst.invoice_number if gst else "",
                receipt.ocr_confidence,
                receipt.user_verified,
                receipt.file_name,
            ]
        )

    headers = {"Content-Disposition": 'attachment; filename="rupeeocr-receipts.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.get("/{receipt_id}", response_model=Receipt)
async def get_receipt(
    receipt_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return receipt_to_schema(get_receipt_record(receipt_id, user_id, db))


@router.get("/{receipt_id}/file")
async def get_receipt_file(
    receipt_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    receipt = receipt_to_schema(get_receipt_record(receipt_id, user_id, db))
    stored_name = Path(receipt.file_url).name
    file_path = UPLOAD_ROOT / stored_name
    if not stored_name or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Receipt file not found")
    return FileResponse(
        file_path,
        media_type=receipt.file_content_type or None,
        filename=receipt.file_name or stored_name,
    )


@router.patch("/{receipt_id}", response_model=Receipt)
async def update_receipt(
    receipt_id: str,
    updates: ReceiptUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    record = get_receipt_record(receipt_id, user_id, db)
    receipt = receipt_to_schema(record)
    update_data = updates.model_dump(exclude_unset=True)
    old_category = receipt.category

    for field, value in update_data.items():
        if field == "gst" and value is not None:
            receipt.gst = ReceiptGST(**value)
        else:
            setattr(receipt, field, value)

    receipt.user_verified = True
    if "category" in update_data and old_category != receipt.category:
        merchant_normalized = receipt.merchant.lower().strip()
        _merchant_overrides[merchant_normalized] = MerchantOverride(
            id=f"ovr_{receipt.id}",
            user_id=receipt.user_id,
            merchant_normalized=merchant_normalized,
            category=receipt.category,
        )
    return save_receipt(receipt, db)


@router.delete("/{receipt_id}")
async def delete_receipt(
    receipt_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    record = get_receipt_record(receipt_id, user_id, db)
    stored_name = Path(record.file_url or "").name
    db.delete(record)
    db.commit()
    file_path = UPLOAD_ROOT / stored_name
    if stored_name and file_path.is_file():
        file_path.unlink()
    return {"status": "deleted", "receipt_id": receipt_id}

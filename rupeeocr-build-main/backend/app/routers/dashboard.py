from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user_id
from app.routers.receipts import get_all_receipts

router = APIRouter()


@router.get("")
async def get_dashboard(
    period: str = Query("month", description="week, month, quarter, year"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    all_receipts = get_all_receipts(user_id, db)

    empty = {
        "total_spend": 0, "receipts_count": 0, "gst_paid": 0,
        "top_category": None, "avg_per_receipt": 0,
        "category_breakdown": [], "monthly_trend": [], "spending_over_time": [],
        "top_merchants": [], "recent_receipts": [],
        "gst_summary": {"total_cgst": 0, "total_sgst": 0, "total_igst": 0, "with_gstin": 0, "without_gstin": 0},
    }

    if not all_receipts:
        return empty

    total_spend = sum(r.amount for r in all_receipts)
    receipts_count = len(all_receipts)
    avg_per_receipt = round(total_spend / receipts_count, 2) if receipts_count else 0

    # GST summary
    total_cgst = total_sgst = total_igst = 0.0
    with_gstin = without_gstin = 0
    for r in all_receipts:
        if r.gst:
            total_cgst += r.gst.cgst or 0
            total_sgst += r.gst.sgst or 0
            total_igst += r.gst.igst or 0
            if r.gst.gstin:
                with_gstin += 1
            else:
                without_gstin += 1
        else:
            without_gstin += 1
    gst_paid = round(total_cgst + total_sgst + total_igst, 2)

    # Category breakdown (for pie chart)
    cat_amounts = defaultdict(float)
    cat_counts = defaultdict(int)
    for r in all_receipts:
        cat_key = r.category.value if hasattr(r.category, 'value') else r.category
        cat_amounts[cat_key] += r.amount
        cat_counts[cat_key] += 1

    category_breakdown = []
    for cat, amount in sorted(cat_amounts.items(), key=lambda x: -x[1]):
        pct = round((amount / total_spend) * 100) if total_spend else 0
        category_breakdown.append({
            "category": cat, "amount": round(amount, 2),
            "percentage": pct, "count": cat_counts[cat]
        })

    top_category = category_breakdown[0] if category_breakdown else None

    # Monthly comparison (for bar chart) - group by month
    month_amounts = defaultdict(float)
    for r in all_receipts:
        if r.date:
            month_label = r.date.strftime("%b %Y")
            month_amounts[month_label] += r.amount

    monthly_trend = [{"month": m, "amount": round(a, 2)} for m, a in month_amounts.items()]

    # Spending over time (for line chart) - group by date
    date_amounts = defaultdict(float)
    for r in all_receipts:
        if r.date:
            date_label = r.date.strftime("%d %b")
            date_amounts[date_label] += r.amount

    spending_over_time = [{"date": d, "amount": round(a, 2)} for d, a in sorted(date_amounts.items())]

    # Top merchants (for merchant ranking)
    merchant_data = defaultdict(lambda: {"amount": 0.0, "count": 0, "category": ""})
    for r in all_receipts:
        cat_key = r.category.value if hasattr(r.category, 'value') else r.category
        merchant_data[r.merchant]["amount"] += r.amount
        merchant_data[r.merchant]["count"] += 1
        merchant_data[r.merchant]["category"] = cat_key

    top_merchants = sorted(
        [{"name": m, "amount": round(d["amount"], 2), "count": d["count"], "category": d["category"]}
         for m, d in merchant_data.items()],
        key=lambda x: -x["amount"]
    )[:10]

    # Recent receipts
    recent = []
    for r in all_receipts[:10]:
        entry = {
            "id": r.id, "merchant": r.merchant, "amount": r.amount, "currency": r.currency,
            "date": r.date.isoformat() if r.date else None,
            "category": r.category.value if hasattr(r.category, 'value') else r.category,
            "category_confidence": r.category_confidence, "ocr_confidence": r.ocr_confidence,
            "extraction_method": r.extraction_method.value if hasattr(r.extraction_method, 'value') else r.extraction_method,
            "processing_ms": r.processing_ms, "file_url": r.file_url, "user_verified": r.user_verified,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        if r.gst:
            entry["gst"] = {
                "gstin": r.gst.gstin, "gstin_valid": r.gst.gstin_valid,
                "cgst": r.gst.cgst, "sgst": r.gst.sgst, "igst": r.gst.igst,
                "gst_rate": r.gst.gst_rate, "pan": r.gst.pan, "invoice_number": r.gst.invoice_number,
            }
        recent.append(entry)

    return {
        "total_spend": round(total_spend, 2),
        "receipts_count": receipts_count,
        "gst_paid": gst_paid,
        "top_category": top_category,
        "avg_per_receipt": avg_per_receipt,
        "category_breakdown": category_breakdown,
        "monthly_trend": monthly_trend,
        "spending_over_time": spending_over_time,
        "top_merchants": top_merchants,
        "recent_receipts": recent,
        "gst_summary": {
            "total_cgst": round(total_cgst, 2), "total_sgst": round(total_sgst, 2),
            "total_igst": round(total_igst, 2), "with_gstin": with_gstin, "without_gstin": without_gstin,
        },
    }

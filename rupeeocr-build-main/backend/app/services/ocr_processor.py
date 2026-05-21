"""
RupeeOCR - Real OCR Processing Service
Step 0: PyMuPDF native PDF text extraction
Step 1: OpenCV preprocessing (upscale, CLAHE, denoise, deskew)
Step 2: Tesseract OCR (--psm 6, fallback to 4/11)
"""

import io
import os
import re
import math
import time
import logging
import unicodedata
from functools import lru_cache
from datetime import datetime
from typing import Any, Dict, List, Tuple, Optional
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)


def load_pytesseract():
    import pytesseract

    tesseract_cmd = os.getenv("TESSERACT_CMD")
    if not tesseract_cmd and os.name == "nt":
        for candidate in (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ):
            if os.path.exists(candidate):
                tesseract_cmd = candidate
                break

    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    return pytesseract


DATE_TEXT_RE = re.compile(
    r'\b\d{1,2}(?:st|nd|rd|th)?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{2,4}'
    r'(?:\s*(?:at)?\s*\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)?\b',
    re.IGNORECASE,
)
DATE_NUMERIC_RE = re.compile(r'\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b')
TIME_RE = re.compile(r'\b\d{1,2}[:.]\d{2}\s*(?:AM|PM)?\b', re.IGNORECASE)
PRICE_RE = re.compile(r'(?:Rs\.?|INR|₹)?\s*(\d{1,5}(?:,\d{2,3})*(?:\.\d{1,2})?)\s*$')
ITEM_QTY_RE = re.compile(r'^(?:\d+\s*[xX×]\s+)(?P<name>.+?)(?:\s+(?P<price>\d+(?:\.\d{1,2})?))?$')
NOISE_WORDS = {
    'order', 'invoice', 'bill', 'receipt', 'token', 'table', 'bag', 'qr', 'upi',
    'payment', 'paid', 'cash', 'card', 'gst', 'cgst', 'sgst', 'igst', 'total',
    'subtotal', 'tax', 'amount', 'date', 'time', 'items', 'item', 'thank', 'visit',
}


@dataclass
class OCROutput:
    text: str
    confidence: float
    method: str
    preprocessing_ms: int
    ocr_ms: int
    warnings: list
    words: List[Dict[str, Any]] = field(default_factory=list)


def extract_pdf_text(pdf_bytes: bytes) -> Optional[Tuple[str, float]]:
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = ""
        for page in doc:
            full_text += page.get_text("text") + "\n"
        doc.close()
        cleaned = full_text.strip()
        if len(cleaned.split()) >= 10:
            return cleaned, 98.0
        return None
    except ImportError:
        return None
    except Exception as e:
        logger.warning(f"PyMuPDF failed: {e}")
        return None


def pdf_to_images(pdf_bytes: bytes) -> list:
    images = []
    try:
        import fitz
        import cv2
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for i, page in enumerate(doc):
            mat = fitz.Matrix(300 / 72, 300 / 72)
            pix = page.get_pixmap(matrix=mat)
            img_data = np.frombuffer(pix.samples, dtype=np.uint8)
            if pix.n == 4:
                img = img_data.reshape(pix.h, pix.w, 4)
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
            elif pix.n == 3:
                img = img_data.reshape(pix.h, pix.w, 3)
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            else:
                img = img_data.reshape(pix.h, pix.w)
            images.append(img)
            if i >= 4:
                break
        doc.close()
    except Exception as e:
        logger.error(f"PDF to image failed: {e}")
    return images


def order_points(points: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    summed = points.sum(axis=1)
    diff = np.diff(points, axis=1)
    rect[0] = points[np.argmin(summed)]
    rect[2] = points[np.argmax(summed)]
    rect[1] = points[np.argmin(diff)]
    rect[3] = points[np.argmax(diff)]
    return rect


def four_point_transform(image: np.ndarray, points: np.ndarray) -> np.ndarray:
    import cv2

    rect = order_points(points.reshape(4, 2).astype("float32"))
    tl, tr, br, bl = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_width = max(int(width_a), int(width_b), 1)
    max_height = max(int(height_a), int(height_b), 1)

    destination = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(rect, destination)
    return cv2.warpPerspective(image, matrix, (max_width, max_height))


def find_receipt_contour(image: np.ndarray) -> Optional[np.ndarray]:
    import cv2

    ratio = image.shape[0] / 700.0
    resized = cv2.resize(image, (int(image.shape[1] / ratio), 700))
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 140)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    edges = cv2.dilate(edges, kernel, iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    image_area = resized.shape[0] * resized.shape[1]
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:8]:
        area = cv2.contourArea(contour)
        if area < image_area * 0.08:
            continue
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.03 * perimeter, True)
        if len(approx) == 4:
            return (approx.reshape(4, 2) * ratio).astype("float32")
    return None


def crop_receipt_region(img: np.ndarray) -> np.ndarray:
    contour = find_receipt_contour(img)
    if contour is None:
        return img

    try:
        warped = four_point_transform(img, contour)
        if warped.shape[0] < 200 or warped.shape[1] < 100:
            return img
        return warped
    except Exception as exc:
        logger.warning("Receipt perspective correction failed: %s", exc)
        return img


def preprocess_image(img: np.ndarray) -> np.ndarray:
    """Prepare real-world receipt images for OCR.

    Handles textured backgrounds, rotated/crumpled receipts, low contrast thermal
    print, and mild perspective distortion. The function intentionally returns a
    high-contrast binary image for Tesseract while preserving enough character
    edges for faint thermal text.
    """
    import cv2

    img = crop_receipt_region(img)
    h, w = img.shape[:2]
    if h < 1600:
        scale = 1500 / h
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(blurred)
    denoised = cv2.fastNlMeansDenoising(enhanced, None, h=12, templateWindowSize=7, searchWindowSize=21)
    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharpened = cv2.filter2D(denoised, -1, sharpen_kernel)
    deskewed = _deskew_image(sharpened)
    binary = cv2.adaptiveThreshold(
        deskewed,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=31,
        C=11,
    )
    # Remove isolated textile/background speckles without eating receipt text.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 1))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    return binary


def _deskew_image(gray: np.ndarray) -> np.ndarray:
    import cv2
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=gray.shape[1] // 4, maxLineGap=10)
    if lines is None or len(lines) == 0:
        return gray
    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if x2 - x1 == 0:
            continue
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
        if abs(angle) < 15:
            angles.append(angle)
    if not angles:
        return gray
    median_angle = np.median(angles)
    if abs(median_angle) < 0.5:
        return gray
    h, w = gray.shape
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    return cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


@lru_cache(maxsize=1)
def get_tesseract_language_config() -> str:
    """Prefer Indian-language OCR when trained data exists, fallback safely."""
    try:
        pytesseract = load_pytesseract()
        installed = set(pytesseract.get_languages(config=''))
    except Exception as exc:
        logger.warning("Could not inspect Tesseract languages: %s", exc)
        return "eng"

    languages = []
    if "eng" in installed:
        languages.append("eng")
    for language in ("mar", "hin"):
        if language in installed:
            languages.append(language)

    return "+".join(languages) if languages else "eng"


def extract_layout_words(data: Dict[str, List[Any]]) -> List[Dict[str, Any]]:
    words: List[Dict[str, Any]] = []
    for i, text in enumerate(data.get("text", [])):
        cleaned = clean_line(str(text))
        if not cleaned:
            continue
        try:
            confidence = float(data["conf"][i])
        except (ValueError, TypeError, KeyError):
            confidence = -1.0
        if confidence < 0:
            continue

        left = int(data["left"][i])
        top = int(data["top"][i])
        width = int(data["width"][i])
        height = int(data["height"][i])
        words.append({
            "text": cleaned,
            "conf": confidence,
            "left": left,
            "top": top,
            "width": width,
            "height": height,
            "right": left + width,
            "bottom": top + height,
            "center_y": top + height / 2,
            "block_num": data.get("block_num", [0])[i],
            "line_num": data.get("line_num", [0])[i],
        })
    return words


def run_tesseract(img: np.ndarray, psm_mode: int = 6) -> Tuple[str, float, List[Dict[str, Any]]]:
    pytesseract = load_pytesseract()
    from PIL import Image

    pil_img = Image.fromarray(img)
    languages = get_tesseract_language_config()
    config = f'--psm {psm_mode} --oem 3 -l {languages} -c preserve_interword_spaces=1'
    data = pytesseract.image_to_data(pil_img, config=config, output_type=pytesseract.Output.DICT)
    confidences = [float(c) for c in data['conf'] if float(c) > 0]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    text = pytesseract.image_to_string(pil_img, config=config)
    return text.strip(), avg_confidence, extract_layout_words(data)


def ocr_with_fallback(img: np.ndarray) -> Tuple[str, float, str, List[Dict[str, Any]]]:
    text, confidence, words = run_tesseract(img, psm_mode=6)
    if confidence >= 60 and len(text.strip()) >= 20:
        return text, confidence, "tesseract_psm6", words
    text_4, conf_4, words_4 = run_tesseract(img, psm_mode=4)
    text_11, conf_11, words_11 = run_tesseract(img, psm_mode=11)
    candidates = [
        (text, confidence, "tesseract_psm6", words),
        (text_4, conf_4, "tesseract_psm4", words_4),
        (text_11, conf_11, "tesseract_psm11", words_11),
    ]
    return max(candidates, key=lambda c: c[1] * max(len(c[0].strip()), 1))


def extract_text(image: np.ndarray) -> Tuple[str, float, str]:
    """OCR wrapper required by the scan endpoint and tests."""
    processed = preprocess_image(image)
    text, confidence, method, _words = ocr_with_fallback(processed)
    return text, confidence, method


def clean_ocr_text(text: str) -> str:
    replacements = {
        '\u00a0': ' ',
        '₹': 'Rs ',
        '|': ' ',
        '—': '-',
        '–': '-',
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r'[^\S\n]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def clean_line(line: str) -> str:
    allowed_punctuation = set("₹.,:/@&()#'-×x")
    line = "".join(
        char
        if (
            char.isalnum()
            or char.isspace()
            or char in allowed_punctuation
            or unicodedata.category(char).startswith("M")
        )
        else " "
        for char in line
    )
    line = re.sub(r'\s+', ' ', line).strip(" .:-")
    return line


def is_noise_line(line: str) -> bool:
    normalized = line.lower().strip()
    if not normalized:
        return True
    if len(normalized) <= 1:
        return True
    if re.fullmatch(r'[\d\s:./#-]+', normalized):
        return True
    if DATE_TEXT_RE.search(line) or DATE_NUMERIC_RE.search(line):
        return True
    return False


def parse_price_from_line(line: str) -> Tuple[str, Optional[float]]:
    match = PRICE_RE.search(line)
    if not match:
        return line, None

    price_text = match.group(1).replace(',', '')
    prefix = line[:match.start()].strip(" .:-")
    # Avoid treating quantity-only item lines such as "1 x Chai" as prices.
    if not prefix or re.search(r'\b(?:order|id|table|bag|token)\b', prefix, re.IGNORECASE):
        return line, None
    try:
        return prefix, float(price_text)
    except ValueError:
        return line, None


def looks_like_item(line: str) -> bool:
    lower = line.lower()
    if any(word in lower for word in ['order id', 'bill no', 'invoice', 'total', 'subtotal', 'tax', 'payment']):
        return False
    if any(word in lower for word in ['thank', "don't carry", 'public', 'people', 'get jealous']):
        return False
    if DATE_TEXT_RE.search(line) or DATE_NUMERIC_RE.search(line):
        return False
    if re.match(r'^\d+\s*(?:ml|ltr|kg|gms?|gm|pcs?)\b', lower):
        return False
    has_letters = any(char.isalpha() for char in line)
    if not has_letters:
        return False
    if ITEM_QTY_RE.match(line):
        return True
    words = [word for word in re.split(r'\s+', line) if any(char.isalpha() for char in word)]
    return 2 <= len(words) <= 8


def extract_store(lines: List[str]) -> Optional[str]:
    candidates: List[Tuple[float, str]] = []
    for line in lines[:8]:
        lower = line.lower()
        if is_noise_line(line):
            continue
        if any(word in lower for word in ['order', 'items', 'item', 'table', 'token', 'bill', 'mob', 'gst']):
            continue
        if len(line) < 4 or not any(char.isalpha() for char in line):
            continue
        if sum(char.isalpha() for char in line) < 3:
            continue
        alpha_count = sum(char.isalpha() for char in line)
        digit_count = sum(char.isdigit() for char in line)
        word_count = len([word for word in line.split() if any(char.isalpha() for char in word)])
        score = alpha_count + word_count * 4
        if any(word in lower for word in ['road', 'chawk', 'chowk', 'pune', 'mumbai', 'delhi', 'address']):
            score -= 28
        if any(word in lower for word in ['hotel', 'restaurant', 'khanawal', 'cafe', 'bistro', 'mart', 'store']):
            score += 15
        if digit_count:
            score -= digit_count * 2
        if line[0].isdigit():
            score -= 15
        if len(line) <= 6:
            score -= 10
        candidates.append((score, line.strip(" -|\\/")))

    if candidates:
        return max(candidates, key=lambda candidate: candidate[0])[1]
    return lines[0] if lines else None


def extract_date_text(text: str) -> Optional[str]:
    match = DATE_TEXT_RE.search(text) or DATE_NUMERIC_RE.search(text)
    if not match:
        return None
    date_text = match.group(0)
    year_match = re.search(r'(?P<year>\d{4})', date_text)
    if year_match:
        current_year = datetime.now().year
        year = int(year_match.group("year"))
        if year > current_year + 1:
            date_text = (
                date_text[:year_match.start("year")]
                + str(current_year)
                + date_text[year_match.end("year"):]
            )
    nearby = text[match.end():match.end() + 20]
    time_match = TIME_RE.search(nearby)
    if time_match and time_match.group(0) not in date_text:
        date_text = f"{date_text} {time_match.group(0)}"
    return date_text.strip()


def extract_total(lines: List[str]) -> Optional[float]:
    total_patterns = [
        re.compile(r'\b(?:grand\s*)?total\b.*?(?:Rs\.?|INR|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)', re.IGNORECASE),
        re.compile(r'\b(?:amount|paid|payable)\b.*?(?:Rs\.?|INR|₹)?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)', re.IGNORECASE),
    ]
    for line in reversed(lines):
        for pattern in total_patterns:
            match = pattern.search(line)
            if match:
                try:
                    return float(match.group(1).replace(',', ''))
                except ValueError:
                    continue
    return None


def extract_items(lines: List[str]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    in_items_section = False
    found_item_line = False

    for line in lines:
        lower = line.lower()
        if re.search(r'\b\d+\s+items?\b|\bitems?\b', lower):
            in_items_section = True
            continue
        if (in_items_section or found_item_line) and any(word in lower for word in ['total', 'subtotal', 'payment', 'paid', 'tax', 'qr']):
            break

        candidate = line
        qty_match = ITEM_QTY_RE.match(candidate)
        if qty_match:
            candidate = qty_match.group('name')
            price = float(qty_match.group('price')) if qty_match.group('price') else None
            found_item_line = True
        else:
            candidate, price = parse_price_from_line(candidate)
            if price is not None:
                found_item_line = True

        candidate = clean_line(candidate)
        if not candidate or not looks_like_item(candidate):
            continue

        if in_items_section or found_item_line or qty_match or price is not None:
            items.append({"name": candidate, "price": price})

    # If no explicit items section was detected, recover likely item lines.
    if not items:
        for line in lines:
            candidate, price = parse_price_from_line(line)
            candidate = clean_line(re.sub(r'^\d+\s*[xX×]\s+', '', candidate))
            if looks_like_item(candidate):
                items.append({"name": candidate, "price": price})

    deduped: List[Dict[str, Any]] = []
    seen = set()
    for item in items:
        key = item["name"].lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped[:40]


def parse_number(value: str) -> Optional[float]:
    value = value.replace(",", "").strip()
    value = re.sub(r'^[^\d]+|[^\d.]+$', '', value)
    if not value or not re.search(r'\d', value):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def is_numeric_token(value: str) -> bool:
    return parse_number(value) is not None and not any(char.isalpha() for char in value)


def group_words_into_rows(words: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    if not words:
        return []

    sorted_words = sorted(words, key=lambda word: (word["center_y"], word["left"]))
    median_height = np.median([max(word.get("height", 1), 1) for word in sorted_words])
    y_threshold = max(float(median_height) * 0.65, 12.0)
    rows: List[List[Dict[str, Any]]] = []

    for word in sorted_words:
        if not rows:
            rows.append([word])
            continue
        row_center = np.mean([existing["center_y"] for existing in rows[-1]])
        if abs(word["center_y"] - row_center) <= y_threshold:
            rows[-1].append(word)
        else:
            rows.append([word])

    return [sorted(row, key=lambda word: word["left"]) for row in rows]


def row_text(row: List[Dict[str, Any]]) -> str:
    return clean_line(" ".join(word["text"] for word in row))


def looks_like_table_header(line: str) -> bool:
    lower = line.lower()
    has_item = any(token in lower for token in ("item", "itm", "tem"))
    has_qty = any(token in lower for token in ("qty", "qly", "oty", "ary"))
    has_rate = "rate" in lower
    has_amount = any(token in lower for token in ("amt", "ant", "amount"))
    return (has_item and (has_qty or has_rate or has_amount)) or (has_rate and has_amount)


def parse_table_item_row(row: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    text = row_text(row)
    lower = text.lower()
    if not text or any(token in lower for token in ("grand total", "subtotal", "total", "gst", "bill no", "date")):
        return None

    numeric_words = [(idx, parse_number(word["text"])) for idx, word in enumerate(row) if is_numeric_token(word["text"])]
    numeric_words = [(idx, number) for idx, number in numeric_words if number is not None]
    if not numeric_words:
        return None

    # Indian receipt rows usually end as: item name | qty | rate | amount.
    tail_numbers = numeric_words[-3:]
    amount = tail_numbers[-1][1]
    rate = tail_numbers[-2][1] if len(tail_numbers) >= 2 else None
    qty = tail_numbers[-3][1] if len(tail_numbers) >= 3 else None
    first_numeric_idx = tail_numbers[0][0]

    name_words = [word["text"] for word in row[:first_numeric_idx] if not is_numeric_token(word["text"])]
    name = clean_line(" ".join(name_words))
    if not name or not any(char.isalpha() for char in name):
        return None

    if qty is not None and rate is not None and amount is not None:
        expected = qty * rate
        # Keep the row even if OCR is imperfect, but reject obviously unrelated numeric metadata.
        if expected > 0 and abs(expected - amount) > max(5.0, amount * 0.15):
            if expected < 100000:
                amount = expected

    return {
        "name": name,
        "price": amount,
        "qty": qty,
        "rate": rate,
        "amount": amount,
    }


def extract_items_from_layout(words: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    rows = group_words_into_rows(words or [])
    if not rows:
        return []

    header_index = None
    for index, row in enumerate(rows):
        if looks_like_table_header(row_text(row)):
            header_index = index
            break
    if header_index is None:
        return []

    items: List[Dict[str, Any]] = []
    for row in rows[header_index + 1:]:
        text = row_text(row)
        lower = text.lower()
        if not text:
            continue
        if any(token in lower for token in ("grand total", "subtotal", "total payable", "payment", "thank")):
            break
        parsed = parse_table_item_row(row)
        if parsed:
            items.append(parsed)

    return items[:40]


def merge_item_lists(layout_items: List[Dict[str, Any]], text_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if layout_items:
        return layout_items

    normalized: List[Dict[str, Any]] = []
    for item in text_items:
        price = item.get("price")
        normalized.append({
            "name": item["name"],
            "price": price,
            "qty": item.get("qty"),
            "rate": item.get("rate"),
            "amount": item.get("amount", price),
        })
    return normalized


def extract_table_items_from_text(lines: List[str]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    in_table = False

    for line in lines:
        lower = line.lower()
        if looks_like_table_header(line):
            in_table = True
            continue
        if in_table and any(token in lower for token in ("grand total", "subtotal", "payment", "thank")):
            break

        number_matches = list(re.finditer(r'(?<![A-Za-z])\d+(?:\.\d{1,2})?(?![A-Za-z])', line))
        if len(number_matches) < 3:
            continue

        tail = number_matches[-3:]
        qty = parse_number(tail[0].group(0))
        rate = parse_number(tail[1].group(0))
        amount = parse_number(tail[2].group(0))
        name = clean_line(line[:tail[0].start()])
        if not name or not any(char.isalpha() for char in name):
            continue
        if any(token in name.lower() for token in ("date", "bill", "mob", "gst", "table")):
            continue

        if qty is not None and rate is not None and amount is not None:
            expected = qty * rate
            if expected > 0 and abs(expected - amount) > max(5.0, amount * 0.15) and expected < 100000:
                amount = expected

        items.append({
            "name": name,
            "price": amount,
            "qty": qty,
            "rate": rate,
            "amount": amount,
        })

    return items[:40]


def parse_receipt(text: str, words: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Parse weak OCR text into partial structured receipt JSON.

    The parser intentionally tolerates missing prices/totals and returns
    price=None / total=None rather than failing.
    """
    cleaned_text = clean_ocr_text(text)
    lines = [clean_line(line) for line in cleaned_text.splitlines()]
    lines = [line for line in lines if line and not is_noise_line(line)]
    layout_items = extract_items_from_layout(words)
    text_table_items = extract_table_items_from_text(lines)
    text_items = text_table_items or extract_items(lines)

    return {
        "store": extract_store(lines),
        "date": extract_date_text(cleaned_text),
        "items": merge_item_lists(layout_items, text_items),
        "total": extract_total(lines),
        "raw_text": cleaned_text,
    }


def process_file(content: bytes, content_type: str, filename: str = "") -> OCROutput:
    import cv2
    start_time = time.time()
    warnings = []
    is_pdf = content_type == 'application/pdf' or filename.lower().endswith('.pdf')

    if is_pdf:
        pdf_result = extract_pdf_text(content)
        if pdf_result:
            text, confidence = pdf_result
            return OCROutput(text=text, confidence=confidence, method='pymupdf', preprocessing_ms=0, ocr_ms=int((time.time()-start_time)*1000), warnings=[])
        images = pdf_to_images(content)
        if not images:
            return OCROutput(text="", confidence=0, method='failed', preprocessing_ms=0, ocr_ms=0, warnings=["Failed to extract text from PDF."])
    else:
        img_array = np.frombuffer(content, dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            return OCROutput(text="", confidence=0, method='failed', preprocessing_ms=0, ocr_ms=0, warnings=["Failed to decode image."])
        images = [img]

    preprocess_start = time.time()
    preprocessed = []
    for i, img in enumerate(images):
        try:
            preprocessed.append(preprocess_image(img))
        except Exception as e:
            warnings.append(f"Preprocessing failed for page {i+1}")
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
            preprocessed.append(gray)
    preprocessing_ms = int((time.time() - preprocess_start) * 1000)

    ocr_start = time.time()
    all_text, all_conf, all_words = [], [], []
    for i, proc_img in enumerate(preprocessed):
        try:
            text, conf, method, words = ocr_with_fallback(proc_img)
            for word in words:
                word["page"] = i + 1
            all_text.append(text)
            all_conf.append(conf)
            all_words.extend(words)
        except Exception as e:
            warnings.append(f"OCR failed for page {i+1}: {str(e)}")
    ocr_ms = int((time.time() - ocr_start) * 1000)

    combined = "\n\n".join(all_text).strip()
    avg_conf = sum(all_conf) / len(all_conf) if all_conf else 0
    if avg_conf < 50:
        warnings.append(f"Low OCR confidence ({avg_conf:.0f}%).")
    if len(combined) < 10:
        warnings.append("Very little text detected.")

    return OCROutput(
        text=combined,
        confidence=avg_conf,
        method='tesseract',
        preprocessing_ms=preprocessing_ms,
        ocr_ms=ocr_ms,
        warnings=warnings,
        words=all_words,
    )


def check_dependencies() -> dict:
    deps = {}
    try:
        import cv2; deps['opencv'] = cv2.__version__
    except ImportError:
        deps['opencv'] = None
    try:
        pytesseract = load_pytesseract()
        deps['tesseract'] = str(pytesseract.get_tesseract_version())
        deps['tesseract_languages'] = get_tesseract_language_config()
    except Exception:
        deps['tesseract'] = None
        deps['tesseract_languages'] = None
    try:
        import fitz; deps['pymupdf'] = fitz.version[0]
    except ImportError:
        deps['pymupdf'] = None
    try:
        import PIL; deps['pillow'] = PIL.__version__
    except ImportError:
        deps['pillow'] = None
    return deps

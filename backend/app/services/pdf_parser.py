"""
PDF Parser Service
Extracts invoice data from uploaded PDF files using pdfplumber + regex patterns.
Uses a cascade: text (with laparams) → layout mode → tables → simple text → OCR (optional).
"""

import re
import pdfplumber
from io import BytesIO
from typing import Optional, Tuple
from app.models.schemas import ExtractedInvoiceData


# Layout params for better text extraction (vertical text, tighter grouping)
LAPARAMS = {
    "detect_vertical": True,
    "all_texts": True,
    "line_margin": 0.5,
    "char_margin": 2.0,
}


def _extract_text_primary(pdf_bytes: bytes) -> Tuple[str, str]:
    """Try default extract_text with laparams. Returns (text, method)."""
    text_parts = []
    with pdfplumber.open(BytesIO(pdf_bytes), laparams=LAPARAMS) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    text = "\n".join(text_parts).strip()
    return text, "text" if text else ""


def _extract_text_layout(pdf_bytes: bytes) -> str:
    """Try extract_text(layout=True) for unusual layouts."""
    text_parts = []
    with pdfplumber.open(BytesIO(pdf_bytes), laparams=LAPARAMS) as pdf:
        for page in pdf.pages:
            try:
                t = page.extract_text(layout=True)
                if t:
                    text_parts.append(t)
            except (IndexError, Exception):
                continue
    return "\n".join(text_parts).strip()


def _extract_text_from_tables(pdf_bytes: bytes) -> str:
    """Extract text from all tables and merge into one string for regex parsing."""
    lines = []
    with pdfplumber.open(BytesIO(pdf_bytes), laparams=LAPARAMS) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            if not tables:
                continue
            for table in tables:
                for row in table:
                    if row:
                        row_text = " ".join(str(cell or "").strip() for cell in row)
                        if row_text:
                            lines.append(row_text)
    return "\n".join(lines).strip()


def _extract_text_simple(pdf_bytes: bytes) -> str:
    """Fallback: extract_text_simple (sometimes works when default fails)."""
    text_parts = []
    with pdfplumber.open(BytesIO(pdf_bytes), laparams=LAPARAMS) as pdf:
        for page in pdf.pages:
            try:
                t = page.extract_text_simple()
                if t:
                    text_parts.append(t)
            except Exception:
                continue
    return "\n".join(text_parts).strip()


def _configure_tesseract_path() -> None:
    """Set pytesseract.tesseract_cmd to common Windows install paths if not in PATH."""
    try:
        import pytesseract
    except ImportError:
        return
    try:
        pytesseract.get_tesseract_version()
        return
    except Exception:
        pass
    import os
    _windows_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for path in _windows_paths:
        if os.path.isfile(path):
            try:
                pytesseract.pytesseract.tesseract_cmd = path
                pytesseract.get_tesseract_version()
                return
            except Exception:
                continue


def _pdf_to_images_pymupdf(pdf_bytes: bytes, dpi: int = 200):
    """Render PDF pages to PIL Images using PyMuPDF (no Poppler required)."""
    import fitz  # PyMuPDF
    from PIL import Image
    images = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for page in doc:
            # 72 points per inch; scale for desired DPI
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
    finally:
        doc.close()
    return images


def _extract_text_pymupdf(pdf_bytes: bytes) -> str:
    """Extract text using PyMuPDF (fitz). Works on some PDFs where pdfplumber fails."""
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text_parts = []
        try:
            for page in doc:
                t = page.get_text()
                if t:
                    text_parts.append(t.strip())
        finally:
            doc.close()
        return "\n".join(text_parts).strip()
    except Exception:
        return ""


def _extract_text_ocr(pdf_bytes: bytes) -> str:
    """Optional OCR fallback for image-based/scanned PDFs. Uses pdf2image (Poppler) or PyMuPDF. Returns empty if OCR unavailable."""
    try:
        import pytesseract
        _configure_tesseract_path()
    except ImportError:
        return ""

    def run_ocr_on_images(images):
        text_parts = []
        for img in images:
            text = pytesseract.image_to_string(img)
            if text:
                text_parts.append(text.strip())
        return "\n".join(text_parts).strip()

    # 1) Try pdf2image (needs Poppler on Windows)
    try:
        from pdf2image import convert_from_bytes
        images = convert_from_bytes(pdf_bytes, dpi=200)
        if images:
            return run_ocr_on_images(images)
    except Exception:
        pass

    # 2) Fallback: PyMuPDF to render pages to images (no Poppler needed)
    try:
        images = _pdf_to_images_pymupdf(pdf_bytes, dpi=200)
        if images:
            return run_ocr_on_images(images)
    except Exception:
        pass

    return ""


def extract_text_from_pdf(pdf_bytes: bytes) -> Tuple[str, str]:
    """
    Extract all text from a PDF using a cascade of methods.
    Returns (raw_text, extraction_method).
    extraction_method is one of: "text", "tables", "ocr", or "" if all failed.
    """
    # 1) Primary: text with laparams
    text, method = _extract_text_primary(pdf_bytes)
    if text:
        return text, method

    # 2) Layout mode (helps with some PDFs)
    text = _extract_text_layout(pdf_bytes)
    if text:
        return text, "text"

    # 3) Tables (invoice line items / amounts often in tables)
    text = _extract_text_from_tables(pdf_bytes)
    if text:
        return text, "tables"

    # 4) Simple text extraction
    text = _extract_text_simple(pdf_bytes)
    if text:
        return text, "text"

    # 5) PyMuPDF text (different engine, can work when pdfplumber fails)
    text = _extract_text_pymupdf(pdf_bytes)
    if text:
        return text, "text"

    # 6) OCR for image-based / scanned PDFs (requires Tesseract installed)
    text = _extract_text_ocr(pdf_bytes)
    if text:
        return text, "ocr"

    return "", ""


def parse_amount(text: str, patterns: list[str]) -> Optional[float]:
    """Try multiple regex patterns to extract a monetary amount."""
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            amount_str = match.group(1).replace(",", "").replace(" ", "").strip()
            try:
                return float(amount_str)
            except ValueError:
                continue
    return None


from datetime import datetime


def parse_date(text: str, patterns: list[str]) -> Optional[str]:
    """Try multiple regex patterns to extract a date string and format to YYYY-MM-DD."""
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            raw_date = match.group(1).strip()
            # Normalize common separators to slashes
            clean_date = raw_date.replace(".", "/").replace("-", "/")
            try:
                # Try DD/MM/YYYY (common format in India)
                dt = datetime.strptime(clean_date, "%d/%m/%Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                try:
                    # In case it's somehow MM/DD/YYYY
                    dt = datetime.strptime(clean_date, "%m/%d/%Y")
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    # Try text based formats if simple parsing fails
                    try:
                        from dateutil.parser import parse
                        dt = parse(raw_date, dayfirst=True)
                        return dt.strftime("%Y-%m-%d")
                    except Exception:
                        pass
            return raw_date  # Return raw if formatting fails
    return None


def parse_field(text: str, patterns: list[str]) -> Optional[str]:
    """Try multiple regex patterns to extract a text field."""
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1).strip()
    return None


def _parse_invoice_fields(raw_text: str) -> ExtractedInvoiceData:
    """Parse invoice fields from raw text. Used by extract_invoice_data after text is obtained."""
    # ─── Invoice Number ──────────────────────────────────────────────
    invoice_number = parse_field(raw_text, [
        r"(?:invoice\s*(?:no|number|#|num)\.?\s*[:\-]?\s*)([A-Za-z0-9\-\/]+)",
        r"(?:inv\s*[:\-#]?\s*)([A-Za-z0-9\-\/]+)",
        r"(?:bill\s*(?:no|number|#)\.?\s*[:\-]?\s*)([A-Za-z0-9\-\/]+)",
    ])

    # ─── Vendor / Company Name ───────────────────────────────────────
    vendor_name = parse_field(raw_text, [
        r"(?:from|vendor|supplier|company|billed?\s*by)\s*[:\-]?\s*(.+?)(?:\n|$)",
        r"(?:M/s\.?\s*)(.+?)(?:\n|$)",
    ])
    if not vendor_name:
        first_lines = raw_text.split("\n")[:3]
        for line in first_lines:
            line = line.strip()
            if line and len(line) > 3 and not re.match(r"^(tax\s|invoice|bill|date|page)", line, re.IGNORECASE):
                vendor_name = line
                break

    # ─── Invoice Date ────────────────────────────────────────────────
    invoice_date = parse_date(raw_text, [
        r"(?:invoice\s*date|date\s*of\s*invoice|inv\.?\s*date)\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\w{3,9}[\s\/\-\.]\d{2,4})",
        r"(?:invoice\s*date|date\s*of\s*invoice|inv\.?\s*date)\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{2,4})",
        r"(?:date)\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\w{3,9}[\s\/\-\.]\d{2,4})",
        r"(?:date)\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{2,4})",
    ])

    # ─── Due Date ────────────────────────────────────────────────────
    due_date = parse_date(raw_text, [
        r"(?:due\s*date|payment\s*due|pay\s*by|payable\s*by)\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\w{3,9}[\s\/\-\.]\d{2,4})",
        r"(?:due\s*date|payment\s*due|pay\s*by)\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{2,4})",
    ])

    # ─── Amounts ─────────────────────────────────────────────────────
    total_amount = parse_amount(raw_text, [
        r"(?:total\s*(?:amount|payable|due)?|grand\s*total|amount\s*(?:due|payable)|net\s*payable)\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)",
        r"(?:₹|Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:total|payable|due)",
    ])

    tax_amount = parse_amount(raw_text, [
        r"(?:tax|gst|cgst\s*\+?\s*sgst|igst|vat|service\s*tax)\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)",
        r"(?:₹|Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:tax|gst)",
    ])

    amount = parse_amount(raw_text, [
        r"(?:sub\s*total|subtotal|base\s*amount|taxable\s*(?:amount|value))\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)",
    ])

    if not amount and total_amount:
        if tax_amount:
            amount = total_amount - tax_amount
        else:
            amount = total_amount

    # ─── Payment Terms ───────────────────────────────────────────────
    payment_terms = parse_field(raw_text, [
        r"(?:payment\s*terms?|terms?\s*of\s*payment)\s*[:\-]?\s*(.+?)(?:\n|$)",
        r"(net\s*\d+\s*days?)",
    ])

    # ─── Description ─────────────────────────────────────────────────
    description = parse_field(raw_text, [
        r"(?:description|particulars|details|items?|services?)\s*[:\-]?\s*(.+?)(?:\n|$)",
    ])

    return ExtractedInvoiceData(
        invoice_number=invoice_number,
        vendor_name=vendor_name,
        invoice_date=invoice_date,
        due_date=due_date,
        amount=amount,
        tax_amount=tax_amount,
        total_amount=total_amount,
        currency="INR",
        payment_terms=payment_terms,
        description=description,
        raw_text=raw_text[:2000],
        extraction_method=None,  # Caller sets this
    )


def extract_invoice_data(pdf_bytes: bytes) -> ExtractedInvoiceData:
    """
    Extract structured invoice data from a PDF file.

    Uses a cascade: pdfplumber text (with laparams) → layout → tables → simple → OCR.
    Then applies regex patterns to identify invoice number, dates, amounts, vendor, etc.
    """
    raw_text, extraction_method = extract_text_from_pdf(pdf_bytes)

    if not raw_text:
        return ExtractedInvoiceData(
            raw_text=(
                "[No text could be extracted from this PDF. "
                "It may be a scanned/image-only document. "
                "To extract text from scans, install Tesseract OCR on your system: "
                "Windows: https://github.com/UB-Mannheim/tesseract/wiki | "
                "Then ensure it is on PATH or in 'C:\\Program Files\\Tesseract-OCR'."
            ),
            extraction_method=None,
        )

    result = _parse_invoice_fields(raw_text)
    result.extraction_method = extraction_method or "text"
    return result

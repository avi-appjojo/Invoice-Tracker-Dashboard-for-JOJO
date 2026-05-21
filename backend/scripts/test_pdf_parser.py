"""
Test script for PDF invoice extraction. Run locally to verify parsing without the API.

Usage:
  cd backend
  python scripts/test_pdf_parser.py path/to/invoice.pdf
  python scripts/test_pdf_parser.py   # uses ../dummy_invoice.pdf if it exists
"""

import sys
import os

# Add backend to path so app.services can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.pdf_parser import extract_invoice_data


def main():
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
    else:
        pdf_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "dummy_invoice.pdf")

    if not os.path.isfile(pdf_path):
        print(f"File not found: {pdf_path}")
        print("Usage: python scripts/test_pdf_parser.py [path/to/invoice.pdf]")
        sys.exit(1)

    print(f"Reading: {pdf_path}")
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    result = extract_invoice_data(pdf_bytes)

    print("\n--- Extraction method ---")
    print(result.extraction_method or "(none / failed)")

    print("\n--- Extracted fields ---")
    print(f"  invoice_number: {result.invoice_number}")
    print(f"  vendor_name:    {result.vendor_name}")
    print(f"  invoice_date:   {result.invoice_date}")
    print(f"  due_date:       {result.due_date}")
    print(f"  amount:         {result.amount}")
    print(f"  tax_amount:     {result.tax_amount}")
    print(f"  total_amount:   {result.total_amount}")
    print(f"  payment_terms:  {result.payment_terms}")
    print(f"  description:    {result.description}")

    print("\n--- Raw text (first 500 chars) ---")
    raw = result.raw_text or ""
    print(raw[:500] + ("..." if len(raw) > 500 else ""))

    if not result.raw_text or result.raw_text.startswith("[No text"):
        print("\n[!] No text was extracted. This PDF may be image-based (scanned).")
        print("    Install Tesseract OCR for your OS, then re-run.")
        print("    Windows: https://github.com/UB-Mannheim/tesseract/wiki")
        print("    Default path: C:\\Program Files\\Tesseract-OCR\\tesseract.exe")


if __name__ == "__main__":
    main()

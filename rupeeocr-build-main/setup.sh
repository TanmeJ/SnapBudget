#!/bin/bash
set -e
echo "SmartReceipt AI - Backend Setup"
echo "================================"

if ! command -v tesseract &> /dev/null; then
    echo "Tesseract not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install tesseract
    else
        sudo apt-get install -y tesseract-ocr tesseract-ocr-eng
    fi
fi
echo "Tesseract: $(tesseract --version 2>&1 | head -1)"

cd "$(dirname "$0")/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q

echo ""
echo "Setup complete! Run:"
echo "  cd backend && source venv/bin/activate"
echo "  uvicorn app.main:app --reload --port 8000"
echo ""
echo "Health check: http://localhost:8000/api/scan/health"

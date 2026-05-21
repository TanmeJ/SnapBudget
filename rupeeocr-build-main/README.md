# RupeeOCR 📸💰

**AI-powered receipt scanner for India with automatic GST extraction**

Scan receipts → Extract data → Track expenses → Simplify tax filing

![RupeeOCR Dashboard](docs/dashboard-preview.png)

## Features

### Core Functionality
- 📷 **Smart Receipt Scanning** - Camera capture or file upload (JPG, PNG, PDF)
- 🔍 **Indian OCR Engine** - Optimized for Indian receipts with ₹ symbol handling
- 🧾 **GST Extraction** - Automatic GSTIN validation, CGST/SGST/IGST breakdown
- 📊 **Financial Dashboard** - Spending analytics, category breakdown, trends
- 🏷️ **Auto-Categorization** - 130+ Indian merchant keywords, 10 categories
- 📤 **Batch Processing** - Upload up to 20 receipts at once

### GST Features
- ✅ GSTIN checksum validation
- 📍 State code extraction
- 💹 Rate detection (5%, 12%, 18%, 28%)
- 📋 HSN/SAC code capture
- 📑 Invoice deduplication

### India-First Design
- ₹ currency handling with OCR error correction
- Indian date formats (DD/MM/YYYY)
- Lakhs/crores number formatting
- Regional merchant recognition

## Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + custom design system
- **State**: Zustand
- **Charts**: Recharts
- **Auth**: Supabase Auth

### Backend
- **API**: FastAPI (Python 3.12)
- **OCR**: Tesseract 5 + OpenCV preprocessing
- **PDF**: PyMuPDF (native text extraction)
- **Fallback**: Gemini 1.5 Flash (for low-confidence scans)
- **Database**: PostgreSQL on Supabase

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Railway
- **Storage**: Supabase Storage
- **Monitoring**: Vercel Analytics

## Project Structure

```
rupeeocr/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth routes (login, signup)
│   ├── (dashboard)/              # Main app routes
│   │   ├── page.tsx              # Dashboard home
│   │   ├── upload/               # Receipt upload
│   │   ├── receipts/             # Receipt list & detail
│   │   ├── analytics/            # Analytics dashboard
│   │   ├── categories/           # Category management
│   │   └── budget/               # Budget tracking
│   ├── api/                      # API routes (proxied to backend)
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
├── components/
│   ├── ui/                       # Reusable UI components
│   └── navigation.tsx            # Bottom nav, header
├── lib/
│   └── utils.ts                  # Utility functions
├── types/
│   └── index.ts                  # TypeScript definitions
├── backend/
│   └── app/
│       ├── main.py               # FastAPI application
│       ├── models/
│       │   └── schemas.py        # Pydantic models
│       ├── routers/
│       │   ├── scan.py           # OCR endpoints
│       │   ├── receipts.py       # CRUD operations
│       │   └── dashboard.py      # Analytics endpoints
│       └── services/
│           └── extraction.py     # OCR extraction pipeline
├── tailwind.config.ts            # Tailwind configuration
├── package.json                  # Frontend dependencies
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.12+
- Tesseract 5 (for OCR)
- Supabase account

### Frontend Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev
```

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Tesseract (macOS)
brew install tesseract tesseract-lang

# Install Tesseract (Ubuntu)
sudo apt-get install tesseract-ocr tesseract-ocr-hin

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Run development server
uvicorn app.main:app --reload --port 8000
```

### Environment Variables

**Frontend (.env.local)**
```env
BACKEND_URL=http://localhost:8000
```

**Backend (.env)**
```env
DATABASE_URL=your_postgres_database_url
SECRET_KEY=your_long_random_jwt_secret
ALGORITHM=HS256
FRONTEND_URL=http://localhost:3001
```

## API Endpoints

### Scan
- `POST /api/scan` - Scan single receipt
- `POST /api/scan/batch` - Batch scan (up to 20 files)
- `POST /api/scan/test` - Test extraction with raw text

### Receipts
- `GET /api/receipts` - List receipts with filters
- `GET /api/receipts/{id}` - Get single receipt
- `PATCH /api/receipts/{id}` - Update receipt
- `DELETE /api/receipts/{id}` - Soft delete

### Dashboard
- `GET /api/dashboard` - Main KPIs and stats
- `GET /api/dashboard/trends` - Spending trends
- `GET /api/dashboard/top-merchants` - Top merchants
- `GET /api/dashboard/gst-report` - GST report for tax filing

## OCR Pipeline

The extraction pipeline follows 6 steps (per PRD Section 7):

1. **PyMuPDF** - Native PDF text extraction (if PDF)
2. **OpenCV** - Image preprocessing (upscale, CLAHE, denoise, deskew)
3. **Tesseract** - OCR with `--psm 6` (fallback to 4/11 if confidence low)
4. **Normalizer** - Indian-specific fixes (₹→2 OCR error, Rs./INR→₹)
5. **Regex Engine** - GSTIN, GST amounts, dates, amounts (6-tier priority)
6. **Categorizer** - 130+ keywords, merchant name weighted 2×

If OCR confidence < 50%, falls back to Gemini 1.5 Flash Vision.

## Categories

| Category | Color | Example Merchants |
|----------|-------|-------------------|
| Food & Dining | Amber | Zomato, Swiggy, Starbucks |
| Groceries | Green | DMart, BigBasket, Blinkit |
| Fuel & Transport | Blue | IOCL, Uber, Metro |
| Healthcare | Teal | Apollo, Netmeds |
| Shopping | Purple | Myntra, Flipkart |
| Electronics | Blue | Croma, Amazon |
| Utilities | Amber | Airtel, Jio, Electricity |
| Professional | Gray | CA, Legal, Printing |
| Education | Blue | Unacademy, School fees |
| Entertainment | Pink | PVR, Netflix, Hotels |

## Pricing

| Plan | Price | Features |
|------|-------|----------|
| Free | ₹0 | 20 scans/month, JPG/PNG only |
| Pro | ₹299/month | Unlimited scans, PDF/DOCX, batch, GST export |
| Business | ₹999/month | Bulk API, Tally/Zoho integration, 5 users |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)
- [OpenCV](https://opencv.org/)
- [Supabase](https://supabase.com/)
- UI design inspiration from the Stitch design system

---

Built with ❤️ for India's small businesses and freelancers

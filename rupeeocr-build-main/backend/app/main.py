from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import ensure_auth_columns, ensure_receipt_columns, engine
from app.models.models import Base
from app.routers import auth, dashboard, receipts, scan


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup: Initialize services
    print("RupeeOCR Backend starting...")
    Base.metadata.create_all(bind=engine)
    ensure_auth_columns()
    ensure_receipt_columns()
    yield
    # Shutdown: Cleanup
    print("RupeeOCR Backend shutting down...")


app = FastAPI(
    title="RupeeOCR API",
    description="Receipt OCR extraction pipeline for Indian invoices with GST support",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://snap-budget-emlz.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(scan.router, prefix="/api/scan", tags=["Scan"])
app.include_router(receipts.router, prefix="/api/receipts", tags=["Receipts"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "rupeeocr-api", "version": "1.0.0"}


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to RupeeOCR API",
        "docs": "/docs",
        "health": "/health",
    }

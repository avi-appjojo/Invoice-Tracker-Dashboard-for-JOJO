"""
JOJO Invoice Tracker Dashboard — FastAPI Backend
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.routers import invoices, dashboard, users, auth
from app.routers import payments_mongo, companies, vendors
from app.database import get_db
from app.services.db_indexes import ensure_db_indexes
import time
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from zoneinfo import ZoneInfo
from app.services.daily_admin_reminder import send_daily_admin_report

logger = logging.getLogger(__name__)

app = FastAPI(
    title="JOJO Invoice Tracker API",
    description="Backend API for Invoice Tracker Dashboard",
    version="1.0.0",
)

scheduler = AsyncIOScheduler(timezone=ZoneInfo("Asia/Kolkata"))

# Response timing middleware (helps identify slow APIs)
@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000.0
    response.headers["X-Response-Time-ms"] = f"{ms:.2f}"
    if ms >= 30:
        logger.info("SLOW %.2fms %s %s", ms, request.method, request.url.path)
    return response

# CORS — allow frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(invoices.router)
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(auth.router)
app.include_router(payments_mongo.router)
app.include_router(companies.router)
app.include_router(vendors.router)

@app.on_event("startup")
async def _startup_indexes() -> None:
    # Create indexes in background at startup (non-fatal if it fails)
    await ensure_db_indexes(get_db())

    # Schedule daily admin report at 12:00 PM Asia/Kolkata (Mon–Sat)
    try:
        if not scheduler.get_job("daily_admin_report"):
            scheduler.add_job(
                send_daily_admin_report,
                "cron",
                id="daily_admin_report",
                day_of_week="mon-sat",
                hour=12,
                minute=0,
            )
        if not scheduler.running:
            scheduler.start()
            logger.info("AsyncIO scheduler started with daily_admin_report job (Mon–Sat 12:00 Asia/Kolkata)")
    except Exception as e:
        logger.warning("Failed to configure scheduler: %s", e)


@app.get("/")
async def root():
    return {
        "message": "JOJO Invoice Tracker API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.on_event("shutdown")
async def _shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)

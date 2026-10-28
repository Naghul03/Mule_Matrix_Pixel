from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from backend.app.core.config import settings
from backend.app.core.logging import setup_logging
from backend.app.core.errors import MuleMatrixException, LedgerValidationError, ResourceNotFoundError
from backend.app.db.session import engine, Base, SessionLocal
from backend.app.models.models import Bank, Account
from backend.app.simulation.generator import seed_banks, seed_synthetic_accounts
from backend.app.simulation.scenarios import register_scenario_catalogue

# Import route routers
from backend.app.api.routes import (
    health,
    banks,
    accounts,
    transactions,
    alerts,
    investigations,
    scenarios,
    simulation,
    evaluations,
    settings as settings_route,
    events
)

setup_logging()
logger = logging.getLogger("mule_matrix")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Explainable Mule Detection & Multi-Hop Cross-Bank Lineage Reconstruction Platform",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
@app.exception_handler(LedgerValidationError)
async def ledger_validation_handler(request: Request, exc: LedgerValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": exc.code, "message": exc.message, "details": exc.details}
    )

@app.exception_handler(ResourceNotFoundError)
async def resource_not_found_handler(request: Request, exc: ResourceNotFoundError):
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": exc.code, "message": exc.message, "details": exc.details}
    )

@app.exception_handler(MuleMatrixException)
async def mule_matrix_exception_handler(request: Request, exc: MuleMatrixException):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": exc.code, "message": exc.message, "details": exc.details}
    )

# Startup Hook
@app.on_event("startup")
def startup_event():
    logger.info("Initializing Mule Matrix database and synthetic environment...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_banks(db)
        seed_synthetic_accounts(db, count=100)
        register_scenario_catalogue(db)
        logger.info("Mule Matrix startup complete. 8 banks and synthetic accounts active.")
    finally:
        db.close()

# Register API Routers
app.include_router(health.router, prefix="/api", tags=["System Health"])
app.include_router(banks.router, prefix="/api", tags=["Banks"])
app.include_router(accounts.router, prefix="/api", tags=["Accounts"])
app.include_router(transactions.router, prefix="/api", tags=["Transactions & Ledger"])
app.include_router(alerts.router, prefix="/api", tags=["Detection & Alerts"])
app.include_router(investigations.router, prefix="/api", tags=["Lineage Investigations"])
app.include_router(scenarios.router, prefix="/api", tags=["Scenario Lab"])
app.include_router(simulation.router, prefix="/api", tags=["Simulation Control"])
app.include_router(evaluations.router, prefix="/api", tags=["Evaluation & Benchmarks"])
app.include_router(settings_route.router, prefix="/api", tags=["Settings"])
app.include_router(events.router, prefix="/api", tags=["Event Streaming"])

@app.get("/")
def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "api_docs": "/docs",
        "health": "/api/health",
        "synthetic_notice": "Global Synthetic Simulation: No live bank or personal data."
    }

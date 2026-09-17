from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from lib.db import client, db  # noqa: E402
from routers import (  # noqa: E402
    activities,
    audit,
    auth,
    customers,
    customer_import,
    dashboard,
    order_monitoring,
    pipeline,
    products,
    purchase_orders,
    quotation_pdf,
    quotations,
    targets,
    users,
)

logger = logging.getLogger(__name__)

INDEXES: dict[str, list] = {
    "users": [[("user_id", 1)], [("email", 1)], [("role", 1)], [("manager_id", 1)], [("status", 1)], [("created_date", -1)]],
    "customers": [[("customer_id", 1)], [("sales_id", 1)], [("status", 1)], [("industry", 1)], [("customer_name", 1)], [("created_date", -1)], [("sales_id", 1), ("created_date", -1)], [("sales_id", 1), ("status", 1)]],
    "products": [[("product_id", 1)], [("product_code", 1)], [("category", 1)], [("status", 1)], [("product_name", 1)]],
    "opportunities": [[("opportunity_id", 1)], [("customer_id", 1)], [("sales_id", 1)], [("stage", 1)], [("value", -1)], [("created_date", -1)], [("sales_id", 1), ("stage", 1)], [("sales_id", 1), ("created_date", -1)], [("customer_id", 1), ("created_date", -1)]],
    "quotations": [[("quotation_id", 1)], [("quotation_number", 1)], [("customer_id", 1)], [("sales_id", 1)], [("status", 1)], [("created_date", -1)], [("sales_id", 1), ("created_date", -1)], [("sales_id", 1), ("status", 1)], [("customer_id", 1), ("created_date", -1)]],
    "purchase_orders": [[("po_id", 1)], [("po_number", 1)], [("customer_id", 1)], [("customer_id", 1), ("po_number", 1)], [("sales_id", 1)], [("quotation_id", 1)], [("status", 1)], [("created_date", -1)], [("sales_id", 1), ("created_date", -1)], [("sales_id", 1), ("status", 1)]],
    "order_monitoring": [[("monitoring_id", 1)], [("po_id", 1)], [("po_number", 1)], [("customer_id", 1)], [("sales_id", 1)], [("status", 1)], [("eta", 1)], [("created_date", -1)], [("sales_id", 1), ("eta", 1)], [("sales_id", 1), ("status", 1)], [("status", 1), ("eta", 1)]],
    "activities": [[("activity_id", 1)], [("sales_id", 1)], [("customer_id", 1)], [("status", 1)], [("activity_date", -1)], [("next_followup", 1)], [("sales_id", 1), ("activity_date", -1)], [("sales_id", 1), ("status", 1)], [("customer_id", 1), ("created_date", -1)]],
    "audit_logs": [[("timestamp", -1)], [("module", 1)], [("user_id", 1)]],
    "targets": [[("target_id", 1)], [("year", 1), ("target_type", 1), ("owner_id", 1)], [("owner_id", 1), ("year", 1)]],
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    for coll, specs in INDEXES.items():
        for spec in specs:
            try:
                await db[coll].create_index(spec)
            except Exception as exc:
                logger.warning("index %s on %s failed: %s", spec, coll, exc)
    yield
    client.close()


app = FastAPI(lifespan=lifespan, title="CRM Sales Management API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "CRM Sales Management API", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app.include_router(api_router)
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(customers.router, prefix="/api")
app.include_router(customer_import.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
# Register the clean PDF route first so it takes precedence over the legacy PDF route.
app.include_router(quotation_pdf.router, prefix="/api")
app.include_router(quotations.router, prefix="/api")
app.include_router(purchase_orders.router, prefix="/api")
app.include_router(order_monitoring.router, prefix="/api")
app.include_router(activities.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(targets.router, prefix="/api")

FRONTEND_DIST = Path("/app/frontend/dist")

if FRONTEND_DIST.exists():
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}", include_in_schema=False)
    async def frontend_fallback(full_path: str):
        requested_file = FRONTEND_DIST / full_path
        if requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(FRONTEND_DIST / "index.html")

import structlog
from fastapi import FastAPI

from app.routers.parse import router as parse_router

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
)

app = FastAPI(
    title="AI-Buyer AI Service",
    description="Invoice parsing and price analysis service",
    version="0.1.0",
)

app.include_router(parse_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}

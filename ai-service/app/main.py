from fastapi import FastAPI

app = FastAPI(
    title="AI-Buyer AI Service",
    description="Invoice parsing and price analysis service",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}

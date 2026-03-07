from fastapi import APIRouter

from app.models.price_check import PriceCheckRequest, PriceCheckResponse
from app.services.evaluator_service import evaluate_prices

router = APIRouter(prefix="/api/v1", tags=["Price Check"])


@router.post("/check-prices", response_model=PriceCheckResponse)
async def check_prices_endpoint(request: PriceCheckRequest):
    """Check invoice prices against market and purchase history."""
    return await evaluate_prices(request)

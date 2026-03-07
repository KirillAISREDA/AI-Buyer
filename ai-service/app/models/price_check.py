from pydantic import BaseModel, Field


class PriceCheckItem(BaseModel):
    name: str
    price_per_unit: float
    quantity: float
    unit: str


class HistoryData(BaseModel):
    avg_price: float | None = None
    last_price: float | None = None
    last_supplier_price: float | None = None
    period: str = "6 months"


class PriceCheckRequest(BaseModel):
    items: list[PriceCheckItem]
    supplier_name: str | None = None
    history: dict[str, HistoryData] = Field(default_factory=dict)


class ItemAssessment(BaseModel):
    name: str
    invoice_price: float
    market_price: float | None = None
    market_source: str | None = None
    history_avg_price: float | None = None
    market_deviation_pct: float | None = None
    history_deviation_pct: float | None = None
    supplier_change_pct: float | None = None
    assessment: str = "unknown"  # ok | attention | overpriced | unknown
    explanation: str = ""


class PriceCheckResponse(BaseModel):
    success: bool
    items: list[ItemAssessment] = Field(default_factory=list)
    error: str | None = None
    tokens_used: int = 0

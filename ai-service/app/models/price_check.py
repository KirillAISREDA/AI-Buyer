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


# --- Source-level price data ---


class PriceSource(BaseModel):
    """A single price observation from one source."""
    price: float
    url: str = ""
    source_type: str = ""  # "web_search" | "marketplace" | "history"
    seller: str = ""


class NormalizedItem(BaseModel):
    """Item after normalization step."""
    original_name: str
    normalized_name: str
    category: str = ""
    search_queries: list[str] = Field(default_factory=list)
    unit: str = "шт"


class AggregatedPrice(BaseModel):
    """Aggregated result for a single item from all sources."""
    name: str
    market_price: float | None = None  # median
    min_price: float | None = None
    sources: list[PriceSource] = Field(default_factory=list)
    confidence: str = "low"  # high | medium | low
    analog_name: str | None = None
    analog_price: float | None = None
    analog_source: str | None = None


# --- Response models ---


class ItemAssessment(BaseModel):
    name: str
    invoice_price: float
    market_price: float | None = None
    min_price: float | None = None
    market_source: str | None = None
    sources: list[PriceSource] = Field(default_factory=list)
    confidence: str = "low"
    history_avg_price: float | None = None
    market_deviation_pct: float | None = None
    history_deviation_pct: float | None = None
    supplier_change_pct: float | None = None
    assessment: str = "unknown"  # ok | attention | overpriced | unknown
    explanation: str = ""
    analog_name: str | None = None
    analog_price: float | None = None
    analog_source: str | None = None


class PriceCheckResponse(BaseModel):
    success: bool
    items: list[ItemAssessment] = Field(default_factory=list)
    error: str | None = None
    tokens_used: int = 0

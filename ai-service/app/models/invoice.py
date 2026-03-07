from pydantic import BaseModel, Field


class SupplierInfo(BaseModel):
    name: str | None = None
    inn: str | None = None


class DocumentInfo(BaseModel):
    number: str | None = None
    date: str | None = None  # YYYY-MM-DD


class InvoiceItemParsed(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None
    price_per_unit: float | None = None
    total: float | None = None


class ExtraCost(BaseModel):
    type: str
    amount: float


class VatInfo(BaseModel):
    included: bool | None = None
    rate: float | None = None
    amount: float | None = None


class ParsedInvoice(BaseModel):
    supplier: SupplierInfo = Field(default_factory=SupplierInfo)
    document: DocumentInfo = Field(default_factory=DocumentInfo)
    items: list[InvoiceItemParsed] = Field(default_factory=list)
    vat: VatInfo = Field(default_factory=VatInfo)
    extra_costs: list[ExtraCost] = Field(default_factory=list)
    total: float | None = None
    currency: str = "RUB"
    confidence: float = 0.0


class ParseInvoiceRequest(BaseModel):
    file_content_base64: str
    filename: str
    mime_type: str


class ParseInvoiceResponse(BaseModel):
    success: bool
    data: ParsedInvoice | None = None
    raw_text: str | None = None
    error: str | None = None
    tokens_used: int = 0
    model: str = ""

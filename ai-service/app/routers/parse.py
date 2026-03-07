from fastapi import APIRouter

from app.models.invoice import ParseInvoiceRequest, ParseInvoiceResponse
from app.services.parser_service import parse_invoice

router = APIRouter(prefix="/api/v1", tags=["Parsing"])


@router.post("/parse-invoice", response_model=ParseInvoiceResponse)
async def parse_invoice_endpoint(request: ParseInvoiceRequest):
    """Parse an invoice file and extract structured data using AI."""
    return await parse_invoice(request)

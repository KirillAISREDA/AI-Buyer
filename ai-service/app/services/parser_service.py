import base64
import structlog

from app.models.invoice import ParseInvoiceRequest, ParseInvoiceResponse
from app.services.ocr_service import (
    extract_text_from_image,
    extract_text_from_pdf,
)
from app.services.document_service import (
    extract_text_from_docx,
    extract_text_from_xlsx,
)
from app.services.llm_service import extract_invoice_data

logger = structlog.get_logger()

MIME_IMAGE = {"image/jpeg", "image/png", "image/jpg"}
MIME_PDF = {"application/pdf"}
MIME_DOCX = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MIME_XLSX = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


async def parse_invoice(request: ParseInvoiceRequest) -> ParseInvoiceResponse:
    """Full parsing pipeline: decode → extract text → LLM → structured data."""
    try:
        file_bytes = base64.b64decode(request.file_content_base64)
        mime = request.mime_type.lower()

        logger.info(
            "parsing_started",
            filename=request.filename,
            mime=mime,
            size=len(file_bytes),
        )

        # Extract text based on file type
        if mime in MIME_IMAGE:
            raw_text = extract_text_from_image(file_bytes)
        elif mime in MIME_PDF:
            raw_text = extract_text_from_pdf(file_bytes)
        elif mime in MIME_DOCX:
            raw_text = extract_text_from_docx(file_bytes)
        elif mime in MIME_XLSX:
            raw_text = extract_text_from_xlsx(file_bytes)
        else:
            return ParseInvoiceResponse(
                success=False,
                error=f"Unsupported file type: {mime}",
            )

        if not raw_text or len(raw_text.strip()) < 10:
            return ParseInvoiceResponse(
                success=False,
                raw_text=raw_text,
                error="Could not extract text from document",
            )

        # Send to LLM for structured extraction
        parsed, tokens, model = await extract_invoice_data(raw_text)

        logger.info(
            "parsing_completed",
            items_count=len(parsed.items),
            total=parsed.total,
            confidence=parsed.confidence,
        )

        return ParseInvoiceResponse(
            success=True,
            data=parsed,
            raw_text=raw_text,
            tokens_used=tokens,
            model=model,
        )

    except Exception as e:
        logger.error("parsing_failed", error=str(e))
        return ParseInvoiceResponse(success=False, error=str(e))

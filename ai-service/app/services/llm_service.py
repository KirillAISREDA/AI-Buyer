import base64
import json
import structlog
from openai import AsyncOpenAI

from app.config import settings
from app.models.invoice import ParsedInvoice
from app.prompts.parse_invoice import PARSE_INVOICE_PROMPT

logger = structlog.get_logger()

client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global client
    if client is None:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
    return client


async def extract_invoice_data(
    text: str,
) -> tuple[ParsedInvoice, int, str]:
    """Send text to LLM and parse structured invoice data.

    Returns (parsed_data, tokens_used, model_name).
    """
    llm = get_client()
    model = settings.openai_model

    logger.info("llm_request", model=model, text_len=len(text))

    response = await llm.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": PARSE_INVOICE_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content or "{}"
    tokens = response.usage.total_tokens if response.usage else 0

    logger.info("llm_response", tokens=tokens, content_len=len(content))

    data = json.loads(content)
    parsed = ParsedInvoice.model_validate(data)

    return parsed, tokens, model


async def extract_invoice_data_vision(
    image_bytes: bytes,
    mime_type: str,
) -> tuple[ParsedInvoice, int, str]:
    """Send image directly to GPT-4o Vision for structured extraction.

    This bypasses OCR and lets the model read the image directly,
    which is much better for tables with numeric columns.
    """
    llm = get_client()
    model = settings.openai_model

    b64 = base64.b64encode(image_bytes).decode()
    data_url = f"data:{mime_type};base64,{b64}"

    logger.info("llm_vision_request", model=model, image_size=len(image_bytes))

    response = await llm.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": PARSE_INVOICE_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Извлеки данные из этого счёта. Обязательно укажи quantity, price_per_unit и total для КАЖДОЙ позиции — эти числа видны в таблице.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url, "detail": "high"},
                    },
                ],
            },
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content or "{}"
    tokens = response.usage.total_tokens if response.usage else 0

    logger.info("llm_vision_response", tokens=tokens, content_len=len(content))

    data = json.loads(content)
    parsed = ParsedInvoice.model_validate(data)

    return parsed, tokens, model

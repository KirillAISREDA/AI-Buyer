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

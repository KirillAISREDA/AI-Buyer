import json
import structlog
from openai import AsyncOpenAI

from app.config import settings
from app.services.llm_service import get_client
from app.prompts.evaluate_price import PRICE_SEARCH_PROMPT

logger = structlog.get_logger()


async def search_market_prices(
    items: list[dict],
) -> tuple[list[dict], int]:
    """Search market prices for items using LLM knowledge.

    Returns (prices_list, tokens_used).
    """
    llm = get_client()
    model = settings.openai_model

    items_text = "\n".join(
        f"- {item['name']}: {item['quantity']} {item['unit']} по {item['price_per_unit']} руб."
        for item in items
    )

    prompt = PRICE_SEARCH_PROMPT.format(items_text=items_text)

    logger.info("price_search_request", model=model, items_count=len(items))

    response = await llm.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content or "{}"
    tokens = response.usage.total_tokens if response.usage else 0

    data = json.loads(content)
    prices = data.get("prices", [])

    logger.info("price_search_result", prices_count=len(prices), tokens=tokens)
    return prices, tokens

import json
import structlog
import httpx

from app.config import settings
from app.services.llm_service import get_client
from app.prompts.evaluate_price import PRICE_SEARCH_PROMPT

logger = structlog.get_logger()

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"

PERPLEXITY_PRICE_PROMPT = """Найди актуальные розничные и оптовые цены в России для следующих товаров.
Ищи на Яндекс.Маркете, Ozon, Леруа Мерлен, Петрович, и других строительных/торговых площадках.

Товары:
{items_text}

Для каждого товара укажи:
- Найденную рыночную цену за единицу (в рублях)
- Источник (название сайта/магазина)
- Насколько ты уверен в цене (0-1)

Верни СТРОГО JSON:
{{
  "prices": [
    {{
      "name": "название товара как в запросе",
      "market_price": 0,
      "unit": "единица",
      "source": "название магазина/площадки",
      "confidence": 0.8
    }}
  ]
}}

Верни ТОЛЬКО JSON, без пояснений."""


async def search_market_prices(
    items: list[dict],
) -> tuple[list[dict], int]:
    """Search market prices using Perplexity API (web search) with GPT-4o fallback."""
    items_text = "\n".join(
        f"- {item['name']}: {item['quantity']} {item['unit']} по {item['price_per_unit']} руб."
        for item in items
    )

    if settings.perplexity_api_key:
        try:
            return await _search_perplexity(items_text, len(items))
        except Exception as e:
            logger.warning("perplexity_failed_fallback_to_openai", error=str(e))

    return await _search_openai(items_text, len(items))


async def _search_perplexity(
    items_text: str,
    items_count: int,
) -> tuple[list[dict], int]:
    """Search prices via Perplexity API (real web search)."""
    prompt = PERPLEXITY_PRICE_PROMPT.format(items_text=items_text)
    model = settings.perplexity_model

    logger.info("perplexity_price_search", model=model, items_count=items_count)

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            PERPLEXITY_API_URL,
            headers={
                "Authorization": f"Bearer {settings.perplexity_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "Ты помощник по поиску цен на товары в России. Используй веб-поиск для нахождения актуальных цен.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
            },
        )
        response.raise_for_status()
        result = response.json()

    content = result["choices"][0]["message"]["content"]
    tokens = result.get("usage", {}).get("total_tokens", 0)

    # Extract JSON from response (Perplexity may wrap it in markdown)
    prices = _parse_prices_json(content)

    citations = result["choices"][0]["message"].get("citations", [])
    if citations:
        logger.info("perplexity_citations", count=len(citations), sources=citations[:5])

    # Enrich sources with citations if available
    if citations:
        for price in prices:
            if not price.get("source") or price["source"] in ("", "unknown"):
                price["source"] = citations[0] if citations else "web search"

    logger.info(
        "perplexity_price_result",
        prices_count=len(prices),
        tokens=tokens,
    )
    return prices, tokens


async def _search_openai(
    items_text: str,
    items_count: int,
) -> tuple[list[dict], int]:
    """Fallback: search prices via OpenAI GPT (from model knowledge)."""
    llm = get_client()
    model = settings.openai_model
    prompt = PRICE_SEARCH_PROMPT.format(items_text=items_text)

    logger.info("openai_price_search_fallback", model=model, items_count=items_count)

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

    # Mark source as model knowledge
    for price in prices:
        if not price.get("source"):
            price["source"] = "GPT-4o (оценка)"

    logger.info("openai_price_result", prices_count=len(prices), tokens=tokens)
    return prices, tokens


def _parse_prices_json(content: str) -> list[dict]:
    """Parse JSON from Perplexity response, handling markdown code blocks."""
    # Try direct JSON parse
    try:
        data = json.loads(content)
        return data.get("prices", [])
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code block
    import re
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(1))
            return data.get("prices", [])
        except json.JSONDecodeError:
            pass

    # Try finding JSON object in text
    start = content.find("{")
    end = content.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            data = json.loads(content[start:end])
            return data.get("prices", [])
        except json.JSONDecodeError:
            pass

    logger.warning("failed_to_parse_prices_json", content_preview=content[:200])
    return []

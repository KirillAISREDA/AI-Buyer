import asyncio
import json
import re
import structlog

from openai import AsyncOpenAI
from app.config import settings
from app.services.llm_service import get_client

logger = structlog.get_logger()

WEB_SEARCH_PROMPT = """Найди актуальные цены в России на следующие товары.
Ищи на реальных торговых площадках: Яндекс.Маркет, Ozon, Wildberries, Леруа Мерлен, Петрович, ВсеИнструменты и др.

Товары:
{items_text}

Для каждого товара верни:
- name: название товара (ТОЧНО как в запросе, не меняй)
- market_price: средняя цена за единицу в рублях (число, не 0)
- unit: единица измерения
- source: прямая ссылка (URL) на страницу товара
- confidence: уверенность 0-1

ВАЖНО: используй name ТОЧНО как указано в списке товаров выше, без изменений.

Верни СТРОГО JSON:
{{
  "prices": [
    {{
      "name": "...",
      "market_price": 0,
      "unit": "шт",
      "source": "https://...",
      "confidence": 0.8
    }}
  ]
}}

Верни ТОЛЬКО JSON."""

# Timeout for web search API call (seconds)
WEB_SEARCH_TIMEOUT = 120


async def search_market_prices(
    items: list[dict],
) -> tuple[list[dict], int]:
    """Search real market prices via OpenAI web search tool."""
    items_text = "\n".join(
        f"- {item['name']}: {item['quantity']} {item['unit']} по {item['price_per_unit']} руб."
        for item in items
    )

    try:
        return await asyncio.wait_for(
            _search_openai_web(items_text, len(items)),
            timeout=WEB_SEARCH_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning("openai_web_search_timeout", timeout=WEB_SEARCH_TIMEOUT)
        return await _search_openai_fallback(items_text, len(items))
    except Exception as e:
        logger.warning("openai_web_search_failed", error=str(e))
        return await _search_openai_fallback(items_text, len(items))


async def _search_openai_web(
    items_text: str,
    items_count: int,
) -> tuple[list[dict], int]:
    """Search prices via OpenAI Responses API with web_search tool."""
    llm = get_client()
    prompt = WEB_SEARCH_PROMPT.format(items_text=items_text)

    logger.info("openai_web_search_request", model="gpt-4o-mini", items_count=items_count)

    response = await llm.responses.create(
        model="gpt-4o-mini",
        tools=[
            {
                "type": "web_search_preview",
                "search_context_size": "medium",
                "user_location": {
                    "type": "approximate",
                    "country": "RU",
                },
            },
        ],
        instructions="Ты аналитик закупок. Используй веб-поиск чтобы найти реальные цены на товары в российских интернет-магазинах. Возвращай результат в JSON.",
        input=prompt,
        temperature=0.1,
    )

    # Extract text content and URL citations from response
    content_text = ""
    urls: list[str] = []

    for item in response.output:
        if item.type == "message":
            for block in item.content:
                if block.type == "output_text":
                    content_text = block.text
                    # Collect annotation URLs
                    if hasattr(block, "annotations") and block.annotations:
                        for ann in block.annotations:
                            if hasattr(ann, "url") and ann.url:
                                urls.append(ann.url)

    tokens = response.usage.total_tokens if response.usage else 0

    logger.info(
        "openai_web_search_response",
        content_len=len(content_text),
        urls_count=len(urls),
        tokens=tokens,
        content_preview=content_text[:500],
    )

    prices = _parse_prices_json(content_text)

    logger.info(
        "openai_web_search_parsed",
        prices_count=len(prices),
        sample_prices=[
            {k: v for k, v in p.items() if k in ("name", "market_price", "source")}
            for p in prices[:3]
        ],
    )

    # Enrich sources with real URLs from annotations
    if urls:
        for i, price in enumerate(prices):
            source = price.get("source", "")
            if not source or not source.startswith("http"):
                price["source"] = urls[i % len(urls)]

    logger.info(
        "openai_web_search_result",
        prices_count=len(prices),
        tokens=tokens,
        sample_sources=[p.get("source", "")[:80] for p in prices[:3]],
    )

    return prices, tokens


async def _search_openai_fallback(
    items_text: str,
    items_count: int,
) -> tuple[list[dict], int]:
    """Fallback: search prices via OpenAI Chat without web search."""
    llm = get_client()
    model = settings.openai_model
    prompt = WEB_SEARCH_PROMPT.format(items_text=items_text)

    logger.info("openai_fallback_search", model=model, items_count=items_count)

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

    for price in prices:
        if not price.get("source") or not price["source"].startswith("http"):
            price["source"] = "GPT-4o (оценка, без веб-поиска)"

    logger.info("openai_fallback_result", prices_count=len(prices), tokens=tokens)
    return prices, tokens


def _parse_prices_json(content: str) -> list[dict]:
    """Parse JSON from response, handling markdown code blocks."""
    # Try direct parse
    try:
        data = json.loads(content)
        return data.get("prices", [])
    except json.JSONDecodeError:
        pass

    # Try markdown code block
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

    logger.warning("failed_to_parse_prices_json", content_preview=content[:300])
    return []

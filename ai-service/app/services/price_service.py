"""Price search via OpenAI web search model.

Uses gpt-4o-mini-search-preview with web_search_options for real
internet price search. Since search models don't support
response_format: json_object, the raw response with url_citation
annotations is parsed in a second step by gpt-4o-mini.
"""

import asyncio
import json
import re
import structlog

from app.config import settings
from app.services.llm_service import get_client
from app.models.price_check import NormalizedItem

logger = structlog.get_logger()

WEB_SEARCH_TIMEOUT = 120

WEB_SEARCH_PROMPT = """Найди актуальные цены в России на следующие товары.
Ищи на реальных торговых площадках: Яндекс.Маркет, Ozon, Wildberries,
Леруа Мерлен, Петрович, ВсеИнструменты, pulscen.ru и др.

Товары для поиска:
{items_text}

Для каждого товара укажи:
- Название товара
- Найденную цену за единицу в рублях
- Единицу измерения
- URL источника
- Название продавца/магазина

Если нашёл аналог или заменитель дешевле — тоже укажи.
Приведи конкретные цены и ссылки."""

EXTRACT_JSON_PROMPT = """Из текста ниже извлеки структурированные данные о ценах.
Для каждого товара из списка найди все упомянутые цены и источники.

Список товаров (используй эти названия ТОЧНО):
{items_names}

Текст с ценами и ссылками:
{search_result}

Аннотации (реальные URL из поиска):
{annotations}

Верни JSON:
{{
  "prices": [
    {{
      "name": "название товара ТОЧНО из списка",
      "market_prices": [
        {{"price": 123.0, "url": "https://...", "seller": "название магазина"}}
      ],
      "unit": "шт",
      "analog": {{
        "name": "название аналога",
        "price": 100.0,
        "url": "https://..."
      }}
    }}
  ]
}}

Правила:
- name должен ТОЧНО совпадать с одним из товаров в списке
- market_prices — массив ВСЕХ найденных цен из разных источников
- url — реальная ссылка из аннотаций, НЕ выдуманная
- analog — только если найден реальный более дешёвый аналог/заменитель
- Если для товара ничего не найдено, всё равно включи его с пустым market_prices

Верни ТОЛЬКО JSON."""


async def search_web_prices(
    normalized_items: list[NormalizedItem],
) -> tuple[list[dict], int]:
    """Search prices via gpt-4o-mini-search-preview + extraction step.

    Step 1: Web search with search model (returns text + url_citation)
    Step 2: Extract structured JSON via gpt-4o-mini

    Returns (prices_list, total_tokens).
    """
    # Build search query from normalized items
    items_text = "\n".join(
        f"- {ni.normalized_name} (единица: {ni.unit})"
        + (f"\n  Доп. запросы: {', '.join(ni.search_queries)}" if ni.search_queries else "")
        for ni in normalized_items
    )

    total_tokens = 0

    try:
        raw_text, annotations, t1 = await asyncio.wait_for(
            _step1_web_search(items_text, len(normalized_items)),
            timeout=WEB_SEARCH_TIMEOUT,
        )
        total_tokens += t1

        if not raw_text:
            logger.warning("web_search_empty_response")
            return [], total_tokens

        items_names = json.dumps(
            [ni.original_name for ni in normalized_items],
            ensure_ascii=False,
        )
        prices, t2 = await _step2_extract_json(
            raw_text, annotations, items_names
        )
        total_tokens += t2

        return prices, total_tokens

    except asyncio.TimeoutError:
        logger.warning("web_search_timeout", timeout=WEB_SEARCH_TIMEOUT)
        return await _fallback_search(normalized_items)
    except Exception as e:
        logger.warning("web_search_failed", error=str(e))
        return await _fallback_search(normalized_items)


async def _step1_web_search(
    items_text: str,
    items_count: int,
) -> tuple[str, list[dict], int]:
    """Step 1: Call gpt-4o-mini-search-preview via Chat Completions API.

    Search-preview models have built-in web search. They return text
    with url_citation annotations on the message object.

    Returns (response_text, annotations_list, tokens).
    """
    llm = get_client()
    model = settings.openai_search_model
    prompt = WEB_SEARCH_PROMPT.format(items_text=items_text)

    logger.info("web_search_step1", model=model, items_count=items_count)

    response = await llm.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Ты аналитик закупок. Найди реальные цены на товары "
                    "в российских интернет-магазинах. Приведи конкретные "
                    "цены, ссылки и названия магазинов."
                ),
            },
            {"role": "user", "content": prompt},
        ],
    )

    msg = response.choices[0].message
    content_text = msg.content or ""

    # Extract url_citation annotations
    annotations: list[dict] = []
    if hasattr(msg, "annotations") and msg.annotations:
        for ann in msg.annotations:
            ann_data: dict = {"type": getattr(ann, "type", "")}
            # url_citation annotations have a nested url_citation object
            citation = getattr(ann, "url_citation", None)
            if citation:
                ann_data["url"] = getattr(citation, "url", "")
                ann_data["title"] = getattr(citation, "title", "")
                ann_data["start_index"] = getattr(citation, "start_index", 0)
                ann_data["end_index"] = getattr(citation, "end_index", 0)
            annotations.append(ann_data)

    tokens = response.usage.total_tokens if response.usage else 0

    logger.info(
        "web_search_step1_result",
        content_len=len(content_text),
        annotations_count=len(annotations),
        tokens=tokens,
        content_preview=content_text[:300],
        sample_urls=[a.get("url", "")[:80] for a in annotations[:5]],
    )

    return content_text, annotations, tokens


async def _step2_extract_json(
    search_result: str,
    annotations: list[dict],
    items_names: str,
) -> tuple[list[dict], int]:
    """Step 2: Extract structured JSON from search results via gpt-4o-mini.

    The search model can't return structured JSON, so we use a fast model
    to parse the free-text results + annotations into our schema.
    """
    llm = get_client()
    model = settings.openai_fast_model

    annotations_text = json.dumps(annotations, ensure_ascii=False, indent=None)
    if len(annotations_text) > 4000:
        annotations_text = annotations_text[:4000] + "..."

    prompt = EXTRACT_JSON_PROMPT.format(
        items_names=items_names,
        search_result=search_result[:6000],
        annotations=annotations_text,
    )

    logger.info("web_search_step2", model=model)

    response = await llm.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content or "{}"
    tokens = response.usage.total_tokens if response.usage else 0

    data = json.loads(content)
    prices = data.get("prices", [])

    logger.info(
        "web_search_step2_result",
        prices_count=len(prices),
        tokens=tokens,
        sample=[
            {
                "name": p.get("name", "")[:40],
                "n_prices": len(p.get("market_prices", [])),
                "has_analog": bool(p.get("analog")),
            }
            for p in prices[:3]
        ],
    )

    return prices, tokens


async def _fallback_search(
    normalized_items: list[NormalizedItem],
) -> tuple[list[dict], int]:
    """Fallback: use gpt-4o-mini without web search for price estimates."""
    llm = get_client()
    model = settings.openai_fast_model

    items_text = "\n".join(
        f"- {ni.original_name} (единица: {ni.unit})"
        for ni in normalized_items
    )

    prompt = f"""Оцени рыночные цены в России на эти товары (приблизительно):
{items_text}

Верни JSON:
{{
  "prices": [
    {{
      "name": "...",
      "market_prices": [{{"price": 123.0, "url": "", "seller": "оценка GPT"}}],
      "unit": "шт"
    }}
  ]
}}

Верни ТОЛЬКО JSON."""

    logger.info("fallback_search", model=model, items_count=len(normalized_items))

    response = await llm.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content or "{}"
    tokens = response.usage.total_tokens if response.usage else 0

    data = json.loads(content)
    prices = data.get("prices", [])

    # Mark fallback sources
    for p in prices:
        for mp in p.get("market_prices", []):
            if not mp.get("url"):
                mp["seller"] = "GPT (оценка, без веб-поиска)"
                mp["url"] = ""

    logger.info("fallback_result", prices_count=len(prices), tokens=tokens)
    return prices, tokens

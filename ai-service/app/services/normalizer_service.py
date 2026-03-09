"""Item normalization via LLM.

Before price search, normalizes product names and generates
optimized search queries including analogs/substitutes.
"""

import json
import structlog

from app.config import settings
from app.services.llm_service import get_client
from app.models.price_check import NormalizedItem

logger = structlog.get_logger()

NORMALIZE_PROMPT = """Ты аналитик закупок. Для каждого товара:
1. Нормализуй название (убери опечатки, раскрой сокращения)
2. Определи категорию (стройматериалы, крепёж, инструмент, электрика и т.д.)
3. Сформируй 2-3 поисковых запроса для поиска цены в интернете.
   Включи запрос на аналог/заменитель если возможно.

Товары:
{items_json}

Верни JSON:
{{
  "items": [
    {{
      "original_name": "...",
      "normalized_name": "...",
      "category": "...",
      "search_queries": ["запрос1", "запрос2", "запрос-аналог"],
      "unit": "шт"
    }}
  ]
}}

Верни ТОЛЬКО JSON."""


async def normalize_items(
    items: list[dict],
) -> tuple[list[NormalizedItem], int]:
    """Normalize item names and generate search queries.

    Returns (normalized_items, tokens_used).
    """
    items_json = json.dumps(
        [{"name": it["name"], "unit": it["unit"]} for it in items],
        ensure_ascii=False,
    )
    prompt = NORMALIZE_PROMPT.format(items_json=items_json)

    llm = get_client()
    model = settings.openai_fast_model

    logger.info("normalize_request", model=model, items_count=len(items))

    try:
        response = await llm.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or "{}"
        tokens = response.usage.total_tokens if response.usage else 0

        data = json.loads(content)
        raw_items = data.get("items", [])

        normalized = []
        for raw in raw_items:
            normalized.append(NormalizedItem(
                original_name=raw.get("original_name", ""),
                normalized_name=raw.get("normalized_name", raw.get("original_name", "")),
                category=raw.get("category", ""),
                search_queries=raw.get("search_queries", []),
                unit=raw.get("unit", "шт"),
            ))

        logger.info(
            "normalize_result",
            count=len(normalized),
            tokens=tokens,
            sample=[n.normalized_name for n in normalized[:3]],
        )
        return normalized, tokens

    except Exception as e:
        logger.warning("normalize_failed", error=str(e))
        # Fallback: use original names as-is
        fallback = [
            NormalizedItem(
                original_name=it["name"],
                normalized_name=it["name"],
                search_queries=[it["name"]],
                unit=it["unit"],
            )
            for it in items
        ]
        return fallback, 0

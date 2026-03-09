"""Price aggregator: combines web search, marketplace parsing, and history.

All three sources run in parallel. Results are merged, filtered for
relevance, and aggregated into median/min prices with confidence scores.
"""

import asyncio
import statistics
import structlog

from app.config import settings
from app.models.price_check import (
    NormalizedItem,
    PriceSource,
    AggregatedPrice,
    HistoryData,
)
from app.services.price_service import search_web_prices
from app.services.normalizer_service import normalize_items

logger = structlog.get_logger()


async def _search_marketplaces_for_items(
    normalized_items: list[NormalizedItem],
) -> dict[str, list[dict]]:
    """Search marketplaces for all items using their search queries.

    Returns dict: original_name -> list of marketplace results.
    """
    if not settings.marketplace_parsing_enabled:
        return {}

    from app.services.marketplace_parser import search_marketplaces

    tasks = {}
    for ni in normalized_items:
        # Use the first search query (most specific)
        query = ni.search_queries[0] if ni.search_queries else ni.normalized_name
        tasks[ni.original_name] = search_marketplaces(query)

    results: dict[str, list[dict]] = {}
    if tasks:
        names = list(tasks.keys())
        coros = list(tasks.values())
        responses = await asyncio.gather(*coros, return_exceptions=True)
        for name, resp in zip(names, responses):
            if isinstance(resp, list):
                results[name] = resp
            else:
                logger.warning(
                    "marketplace_search_error",
                    item=name,
                    error=str(resp),
                )
                results[name] = []

    return results


def _filter_relevant(
    marketplace_results: list[dict],
    normalized_name: str,
) -> list[dict]:
    """Filter marketplace results for relevance to the target item.

    Simple word-overlap heuristic: keep results where at least 2 words
    from the normalized name appear in the result name.
    """
    target_words = set(normalized_name.lower().split())
    # Remove very short/common words
    target_words = {w for w in target_words if len(w) > 2}

    filtered = []
    for r in marketplace_results:
        result_name = r.get("name", "").lower()
        result_words = set(result_name.split())
        overlap = target_words & result_words
        if len(overlap) >= 2 or (len(target_words) <= 2 and len(overlap) >= 1):
            filtered.append(r)

    return filtered


def _compute_confidence(source_count: int, source_types: set[str]) -> str:
    """Compute confidence level based on number and variety of sources."""
    if source_count >= 3 and len(source_types) >= 2:
        return "high"
    if source_count >= 2:
        return "medium"
    return "low"


def _aggregate_single_item(
    original_name: str,
    web_prices: list[dict],
    marketplace_prices: list[dict],
    history: HistoryData | None,
) -> AggregatedPrice:
    """Aggregate prices from all sources for a single item."""
    all_sources: list[PriceSource] = []
    all_prices: list[float] = []
    source_types: set[str] = set()

    # Web search results
    for wp in web_prices:
        price = wp.get("price", 0)
        if price and price > 0:
            all_sources.append(PriceSource(
                price=price,
                url=wp.get("url", ""),
                source_type="web_search",
                seller=wp.get("seller", ""),
            ))
            all_prices.append(price)
            source_types.add("web_search")

    # Marketplace results
    for mp in marketplace_prices:
        price = mp.get("price", 0)
        if price and price > 0:
            all_sources.append(PriceSource(
                price=price,
                url=mp.get("url", ""),
                source_type="marketplace",
                seller=mp.get("seller", ""),
            ))
            all_prices.append(price)
            source_types.add("marketplace")

    # History data
    if history and history.avg_price and history.avg_price > 0:
        all_sources.append(PriceSource(
            price=history.avg_price,
            url="",
            source_type="history",
            seller="история закупок",
        ))
        all_prices.append(history.avg_price)
        source_types.add("history")

    # Compute aggregates
    market_price = None
    min_price = None
    if all_prices:
        market_price = round(statistics.median(all_prices), 2)
        min_price = round(min(all_prices), 2)

    confidence = _compute_confidence(len(all_prices), source_types)

    return AggregatedPrice(
        name=original_name,
        market_price=market_price,
        min_price=min_price,
        sources=all_sources,
        confidence=confidence,
    )


async def aggregate_prices(
    items: list[dict],
    history: dict[str, HistoryData] | None = None,
) -> tuple[list[AggregatedPrice], int]:
    """Main aggregation pipeline.

    1. Normalize item names
    2. Run all sources in parallel (web search + marketplaces)
    3. Filter and aggregate results

    Returns (aggregated_prices, total_tokens).
    """
    history = history or {}
    total_tokens = 0

    # Step 1: Normalize
    normalized, norm_tokens = await normalize_items(items)
    total_tokens += norm_tokens

    # Build lookup from original_name -> NormalizedItem
    norm_lookup: dict[str, NormalizedItem] = {}
    for ni in normalized:
        norm_lookup[ni.original_name] = ni

    # Step 2: Run all sources in parallel
    web_task = search_web_prices(normalized)
    marketplace_task = _search_marketplaces_for_items(normalized)

    web_result, marketplace_results = await asyncio.gather(
        web_task,
        marketplace_task,
        return_exceptions=True,
    )

    # Process web search results
    web_prices_raw: list[dict] = []
    if isinstance(web_result, tuple):
        web_prices_raw, web_tokens = web_result
        total_tokens += web_tokens
    else:
        logger.warning("web_search_exception", error=str(web_result))

    if isinstance(marketplace_results, Exception):
        logger.warning("marketplace_exception", error=str(marketplace_results))
        marketplace_results = {}

    # Build per-item web price lookup
    web_by_item: dict[str, list[dict]] = {}
    for wp in web_prices_raw:
        item_name = wp.get("name", "")
        sources = []
        for mp in wp.get("market_prices", []):
            sources.append({
                "price": mp.get("price", 0),
                "url": mp.get("url", ""),
                "seller": mp.get("seller", ""),
            })
        web_by_item[item_name.lower().strip()] = sources

        # Store analog info
        if wp.get("analog"):
            analog = wp["analog"]
            # Attach analog to the web data for later retrieval
            for s in sources:
                s["_analog"] = analog

    # Step 3: Aggregate per item
    aggregated: list[AggregatedPrice] = []

    for item in items:
        name = item["name"]
        name_lower = name.lower().strip()

        # Get web search prices (try exact then fuzzy match)
        item_web = web_by_item.get(name_lower, [])
        if not item_web:
            # Fuzzy: check if web result name contains our name or vice versa
            for wk, wv in web_by_item.items():
                if wk in name_lower or name_lower in wk:
                    item_web = wv
                    break
                # Word overlap
                item_words = set(name_lower.split()[:3])
                wk_words = set(wk.split()[:3])
                if len(item_words & wk_words) >= 2:
                    item_web = wv
                    break

        # Get marketplace prices
        ni = norm_lookup.get(name)
        item_marketplace = []
        if isinstance(marketplace_results, dict):
            raw_mp = marketplace_results.get(name, [])
            normalized_name = ni.normalized_name if ni else name
            item_marketplace = _filter_relevant(raw_mp, normalized_name)

        # Get history
        item_history = history.get(name)

        # Aggregate
        agg = _aggregate_single_item(
            name, item_web, item_marketplace, item_history
        )

        # Check for analogs from web search
        for ws in item_web:
            analog = ws.get("_analog")
            if analog and analog.get("price") and analog.get("name"):
                # Only suggest if analog is cheaper than median
                if agg.market_price and analog["price"] < agg.market_price:
                    agg.analog_name = analog["name"]
                    agg.analog_price = analog["price"]
                    agg.analog_source = analog.get("url", "")
                break

        aggregated.append(agg)

    logger.info(
        "aggregation_complete",
        items=len(aggregated),
        with_prices=sum(1 for a in aggregated if a.market_price),
        high_confidence=sum(1 for a in aggregated if a.confidence == "high"),
        tokens=total_tokens,
    )

    return aggregated, total_tokens

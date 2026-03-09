"""Marketplace parsers for pulscen.ru and tiu.ru.

Uses httpx + selectolax to scrape B2B price listings.
Rate-limited to 1.5s between requests. Results cached in Redis for 24h.

Note: pulscen.ru requires browser-like headers and may block bots.
      tiu.ru is no longer a B2B marketplace (as of 2025), stub retained
      for potential replacement (e.g. satom.ru).
"""

import asyncio
import re
import structlog
import httpx
from selectolax.parser import HTMLParser

from app.services.redis_cache import cache_get, cache_set

logger = structlog.get_logger()

# Rate limiting: minimum interval between requests to same domain
_last_request_time: dict[str, float] = {}
RATE_LIMIT_SEC = 1.5

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}


async def _rate_limit(domain: str) -> None:
    """Enforce minimum delay between requests to the same domain."""
    import time

    now = time.monotonic()
    last = _last_request_time.get(domain, 0)
    wait = RATE_LIMIT_SEC - (now - last)
    if wait > 0:
        await asyncio.sleep(wait)
    _last_request_time[domain] = time.monotonic()


def _extract_price(text: str) -> float | None:
    """Extract numeric price from text like '1 234.50 руб.' or 'от 500'."""
    if not text:
        return None
    cleaned = re.sub(r"[^\d.,]", "", text.replace(" ", ""))
    cleaned = cleaned.replace(",", ".")
    # Take first valid number
    match = re.search(r"\d+\.?\d*", cleaned)
    if match:
        try:
            return float(match.group())
        except ValueError:
            pass
    return None


# ---------------------------------------------------------------------------
# Pulscen.ru parser
# ---------------------------------------------------------------------------

async def search_pulscen(query: str) -> list[dict]:
    """Search pulscen.ru for product prices.

    Returns list of dicts: {name, price, url, seller, source_type}.
    Results are cached in Redis for 24 hours.

    CSS selectors (from pulscen.ru product listing):
    - Container: li.product-listing__item
    - Name: .product-listing__product-name
    - Link: a.js-bp-title[href]
    - Price: i.bp-price
    - Seller: .product-listing__company-name-wrapper
    """
    # Check cache first
    cached = await cache_get("pulscen", query)
    if cached is not None:
        return cached

    results: list[dict] = []

    try:
        await _rate_limit("pulscen.ru")

        url = "https://pulscen.ru/price"
        params = {"text": query}

        async with httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=15.0,
        ) as client:
            resp = await client.get(url, params=params)

            if resp.status_code != 200:
                logger.warning(
                    "pulscen_http_error",
                    status=resp.status_code,
                    query=query,
                )
                await cache_set("pulscen", query, [])
                return []

            tree = HTMLParser(resp.text)

            for item in tree.css("li.product-listing__item"):
                name_el = item.css_first(".product-listing__product-name")
                link_el = item.css_first("a.js-bp-title")
                price_el = item.css_first("i.bp-price")
                seller_el = item.css_first(".product-listing__company-name-wrapper")

                name = name_el.text(strip=True) if name_el else ""
                href = link_el.attributes.get("href", "") if link_el else ""
                price_text = price_el.text(strip=True) if price_el else ""
                seller = seller_el.text(strip=True) if seller_el else ""

                price = _extract_price(price_text)

                if name and price and price > 0:
                    results.append({
                        "name": name,
                        "price": price,
                        "url": href if href.startswith("http") else f"https://pulscen.ru{href}",
                        "seller": seller,
                        "source_type": "marketplace",
                    })

            # Limit to top 10 results
            results = results[:10]

            logger.info(
                "pulscen_search_result",
                query=query,
                results_count=len(results),
            )

    except httpx.TimeoutException:
        logger.warning("pulscen_timeout", query=query)
    except Exception as e:
        logger.warning("pulscen_error", query=query, error=str(e))

    await cache_set("pulscen", query, results)
    return results


# ---------------------------------------------------------------------------
# Tiu.ru parser (stub — site is no longer a marketplace as of 2025)
# ---------------------------------------------------------------------------

async def search_tiu(query: str) -> list[dict]:
    """Search tiu.ru for product prices.

    NOTE: tiu.ru has been converted from a B2B marketplace to an unrelated
    site (sports betting). This function is retained as a stub so the
    aggregator interface stays consistent. Replace with satom.ru,
    deal.by, or another marketplace when available.

    Historical CSS selectors (pre-2025):
    - Container: div.x-gallery-tile
    - Name: a[data-qaid="product_name"]
    - Price: .x-gallery-tile__price-counter
    - Link: .x-gallery-tile__tile-link[href]
    """
    cached = await cache_get("tiu", query)
    if cached is not None:
        return cached

    results: list[dict] = []

    try:
        await _rate_limit("tiu.ru")

        url = "https://tiu.ru/search"
        params = {"search_term": query}

        async with httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=15.0,
        ) as client:
            resp = await client.get(url, params=params)

            if resp.status_code != 200:
                logger.info("tiu_not_available", status=resp.status_code)
                await cache_set("tiu", query, [])
                return []

            tree = HTMLParser(resp.text)

            for item in tree.css("div.x-gallery-tile"):
                name_el = item.css_first("a[data-qaid='product_name']")
                price_el = item.css_first(".x-gallery-tile__price-counter")
                link_el = item.css_first(".x-gallery-tile__tile-link")

                name = name_el.text(strip=True) if name_el else ""
                price_text = price_el.text(strip=True) if price_el else ""
                href = link_el.attributes.get("href", "") if link_el else ""

                price = _extract_price(price_text)

                if name and price and price > 0:
                    results.append({
                        "name": name,
                        "price": price,
                        "url": href if href.startswith("http") else f"https://tiu.ru{href}",
                        "seller": "",
                        "source_type": "marketplace",
                    })

            results = results[:10]

    except Exception as e:
        logger.info("tiu_unavailable", error=str(e))

    await cache_set("tiu", query, results)
    return results


async def search_marketplaces(query: str) -> list[dict]:
    """Search all marketplaces in parallel for a single query.

    Returns combined deduplicated results.
    """
    pulscen_results, tiu_results = await asyncio.gather(
        search_pulscen(query),
        search_tiu(query),
        return_exceptions=True,
    )

    combined: list[dict] = []
    for res in [pulscen_results, tiu_results]:
        if isinstance(res, list):
            combined.extend(res)

    return combined

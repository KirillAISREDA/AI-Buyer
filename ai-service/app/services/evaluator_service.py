import structlog

from app.models.price_check import (
    PriceCheckRequest,
    PriceCheckResponse,
    ItemAssessment,
    HistoryData,
)
from app.services.price_service import search_market_prices

logger = structlog.get_logger()


def _calc_deviation(actual: float, reference: float | None) -> float | None:
    if reference is None or reference == 0:
        return None
    return round((actual - reference) / reference * 100, 2)


def _assess(market_dev: float | None, history_dev: float | None) -> str:
    # Use the most reliable deviation available
    dev = market_dev if market_dev is not None else history_dev
    if dev is None:
        return "unknown"
    abs_dev = abs(dev)
    if abs_dev < 10:
        return "ok"
    if abs_dev < 25:
        return "attention"
    return "overpriced"


async def evaluate_prices(request: PriceCheckRequest) -> PriceCheckResponse:
    """Evaluate invoice prices against market and history."""
    try:
        # 1. Search market prices via LLM
        items_for_search = [
            {
                "name": item.name,
                "quantity": item.quantity,
                "unit": item.unit,
                "price_per_unit": item.price_per_unit,
            }
            for item in request.items
        ]

        market_prices, tokens = await search_market_prices(items_for_search)

        # Build lookup by name (case-insensitive, stripped)
        market_lookup: dict[str, dict] = {}
        for mp in market_prices:
            market_lookup[mp["name"].lower().strip()] = mp

        logger.info(
            "market_lookup_keys",
            keys=list(market_lookup.keys())[:5],
        )

        # 2. Evaluate each item
        assessments: list[ItemAssessment] = []
        for idx, item in enumerate(request.items):
            history = request.history.get(item.name, HistoryData())
            item_key = item.name.lower().strip()
            market_info = market_lookup.get(item_key, {})

            # Fuzzy fallback: try to find a partial match if exact fails
            if not market_info:
                for mk, mv in market_lookup.items():
                    if mk in item_key or item_key in mk:
                        market_info = mv
                        break
                    item_words = set(item_key.split()[:3])
                    mk_words = set(mk.split()[:3])
                    if len(item_words & mk_words) >= 2:
                        market_info = mv
                        break

            # Index-based fallback: match by position if counts match
            if not market_info and idx < len(market_prices):
                market_info = market_prices[idx]
                logger.info("index_match_fallback", item=item.name, matched=market_info.get("name", ""))
            market_price = market_info.get("market_price")
            market_source = market_info.get("source")

            market_dev = _calc_deviation(item.price_per_unit, market_price)
            history_dev = _calc_deviation(item.price_per_unit, history.avg_price)
            supplier_change = _calc_deviation(item.price_per_unit, history.last_supplier_price)

            assessment = _assess(market_dev, history_dev)

            # Build explanation
            parts = []
            if market_dev is not None:
                direction = "выше" if market_dev > 0 else "ниже"
                parts.append(f"Цена {abs(market_dev):.1f}% {direction} рыночной")
            if history_dev is not None:
                direction = "выше" if history_dev > 0 else "ниже"
                parts.append(f"{abs(history_dev):.1f}% {direction} средней по истории")
            if supplier_change is not None and abs(supplier_change) > 5:
                direction = "рост" if supplier_change > 0 else "снижение"
                parts.append(f"{direction} {abs(supplier_change):.1f}% vs прошлая закупка")
            if not parts:
                parts.append("Недостаточно данных для оценки")

            assessments.append(
                ItemAssessment(
                    name=item.name,
                    invoice_price=item.price_per_unit,
                    market_price=market_price,
                    market_source=market_source,
                    history_avg_price=history.avg_price,
                    market_deviation_pct=market_dev,
                    history_deviation_pct=history_dev,
                    supplier_change_pct=supplier_change,
                    assessment=assessment,
                    explanation=". ".join(parts),
                )
            )

        logger.info(
            "evaluation_complete",
            items=len(assessments),
            overpriced=sum(1 for a in assessments if a.assessment == "overpriced"),
        )

        return PriceCheckResponse(
            success=True,
            items=assessments,
            tokens_used=tokens,
        )

    except Exception as e:
        logger.error("evaluation_failed", error=str(e))
        return PriceCheckResponse(success=False, error=str(e))

"""Price evaluation service.

Uses the aggregator to get prices from all sources, then computes
deviations, assessments, and explanations for each invoice item.
"""

import structlog

from app.models.price_check import (
    PriceCheckRequest,
    PriceCheckResponse,
    ItemAssessment,
    HistoryData,
)
from app.services.price_aggregator import aggregate_prices

logger = structlog.get_logger()


def _calc_deviation(actual: float, reference: float | None) -> float | None:
    if reference is None or reference == 0:
        return None
    return round((actual - reference) / reference * 100, 2)


def _assess(market_dev: float | None, history_dev: float | None) -> str:
    dev = market_dev if market_dev is not None else history_dev
    if dev is None:
        return "unknown"
    if dev > 25:
        return "overpriced"
    if dev > 10:
        return "attention"
    return "ok"


async def evaluate_prices(request: PriceCheckRequest) -> PriceCheckResponse:
    """Evaluate invoice prices against aggregated market data."""
    try:
        items_for_search = [
            {
                "name": item.name,
                "quantity": item.quantity,
                "unit": item.unit,
                "price_per_unit": item.price_per_unit,
            }
            for item in request.items
        ]

        aggregated, tokens = await aggregate_prices(
            items_for_search, request.history
        )

        # Build lookup by name (case-insensitive)
        agg_lookup = {a.name.lower().strip(): a for a in aggregated}

        assessments: list[ItemAssessment] = []
        for idx, item in enumerate(request.items):
            history = request.history.get(item.name, HistoryData())
            item_key = item.name.lower().strip()

            agg = agg_lookup.get(item_key)
            # Fuzzy fallback
            if agg is None:
                for ak, av in agg_lookup.items():
                    if ak in item_key or item_key in ak:
                        agg = av
                        break
                    item_words = set(item_key.split()[:3])
                    ak_words = set(ak.split()[:3])
                    if len(item_words & ak_words) >= 2:
                        agg = av
                        break
            # Index fallback
            if agg is None and idx < len(aggregated):
                agg = aggregated[idx]

            market_price = agg.market_price if agg else None
            min_price = agg.min_price if agg else None
            sources = agg.sources if agg else []
            confidence = agg.confidence if agg else "low"

            # Best source URL for backward compat
            market_source = None
            if sources:
                # Prefer web_search source, then marketplace
                for s in sources:
                    if s.url and s.source_type == "web_search":
                        market_source = s.url
                        break
                if not market_source:
                    for s in sources:
                        if s.url:
                            market_source = s.url
                            break

            market_dev = _calc_deviation(item.price_per_unit, market_price)
            history_dev = _calc_deviation(item.price_per_unit, history.avg_price)
            supplier_change = _calc_deviation(
                item.price_per_unit, history.last_supplier_price
            )

            assessment = _assess(market_dev, history_dev)

            # Build explanation
            parts = []
            if market_dev is not None:
                direction = "выше" if market_dev > 0 else "ниже"
                parts.append(f"Цена {abs(market_dev):.1f}% {direction} рыночной")
            if min_price and min_price > 0:
                parts.append(f"Мин. цена на рынке: {min_price:.0f} ₽")
            if history_dev is not None:
                direction = "выше" if history_dev > 0 else "ниже"
                parts.append(
                    f"{abs(history_dev):.1f}% {direction} средней по истории"
                )
            if supplier_change is not None and abs(supplier_change) > 5:
                direction = "рост" if supplier_change > 0 else "снижение"
                parts.append(
                    f"{direction} {abs(supplier_change):.1f}% vs прошлая закупка"
                )
            n_sources = len([s for s in sources if s.price > 0])
            if n_sources > 0:
                parts.append(f"Источников: {n_sources} ({confidence})")
            if not parts:
                parts.append("Недостаточно данных для оценки")

            assessments.append(
                ItemAssessment(
                    name=item.name,
                    invoice_price=item.price_per_unit,
                    market_price=market_price,
                    min_price=min_price,
                    market_source=market_source,
                    sources=sources,
                    confidence=confidence,
                    history_avg_price=history.avg_price,
                    market_deviation_pct=market_dev,
                    history_deviation_pct=history_dev,
                    supplier_change_pct=supplier_change,
                    assessment=assessment,
                    explanation=". ".join(parts),
                    analog_name=agg.analog_name if agg else None,
                    analog_price=agg.analog_price if agg else None,
                    analog_source=agg.analog_source if agg else None,
                )
            )

        logger.info(
            "evaluation_complete",
            items=len(assessments),
            overpriced=sum(
                1 for a in assessments if a.assessment == "overpriced"
            ),
            high_confidence=sum(
                1 for a in assessments if a.confidence == "high"
            ),
        )

        return PriceCheckResponse(
            success=True,
            items=assessments,
            tokens_used=tokens,
        )

    except Exception as e:
        logger.error("evaluation_failed", error=str(e))
        return PriceCheckResponse(success=False, error=str(e))

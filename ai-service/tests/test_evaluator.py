"""Tests for price evaluation logic."""
from app.services.evaluator_service import _calc_deviation, _assess


def test_calc_deviation_positive():
    assert _calc_deviation(110, 100) == 10.0


def test_calc_deviation_negative():
    assert _calc_deviation(90, 100) == -10.0


def test_calc_deviation_none_reference():
    assert _calc_deviation(100, None) is None


def test_calc_deviation_zero_reference():
    assert _calc_deviation(100, 0) is None


def test_assess_ok():
    assert _assess(5.0, None) == "ok"
    assert _assess(-9.0, None) == "ok"


def test_assess_attention():
    assert _assess(15.0, None) == "attention"
    assert _assess(-20.0, None) == "attention"


def test_assess_overpriced():
    assert _assess(30.0, None) == "overpriced"
    assert _assess(-50.0, None) == "overpriced"


def test_assess_unknown():
    assert _assess(None, None) == "unknown"


def test_assess_falls_back_to_history():
    assert _assess(None, 12.0) == "attention"


def test_price_check_models():
    from app.models.price_check import PriceCheckRequest, PriceCheckItem, HistoryData

    req = PriceCheckRequest(
        items=[
            PriceCheckItem(name="Бумага А4", price_per_unit=350, quantity=10, unit="пачка"),
        ],
        supplier_name="ООО Ромашка",
        history={"Бумага А4": HistoryData(avg_price=320, last_supplier_price=310)},
    )
    assert len(req.items) == 1
    assert req.history["Бумага А4"].avg_price == 320

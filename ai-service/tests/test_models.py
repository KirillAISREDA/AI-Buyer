"""Tests for Pydantic models."""
from app.models.invoice import (
    ParsedInvoice,
    ParseInvoiceRequest,
    ParseInvoiceResponse,
    InvoiceItemParsed,
    SupplierInfo,
    VatInfo,
)


def test_parsed_invoice_defaults():
    inv = ParsedInvoice()
    assert inv.supplier.name is None
    assert inv.items == []
    assert inv.currency == "RUB"
    assert inv.confidence == 0.0


def test_parsed_invoice_from_dict():
    data = {
        "supplier": {"name": "ООО Ромашка", "inn": "1234567890"},
        "document": {"number": "123", "date": "2026-01-15"},
        "items": [
            {"name": "Бумага А4", "quantity": 10, "unit": "пачка", "price_per_unit": 350, "total": 3500}
        ],
        "vat": {"included": True, "rate": 20, "amount": 583.33},
        "extra_costs": [],
        "total": 3500,
        "currency": "RUB",
        "confidence": 0.95,
    }
    inv = ParsedInvoice.model_validate(data)
    assert inv.supplier.name == "ООО Ромашка"
    assert inv.supplier.inn == "1234567890"
    assert len(inv.items) == 1
    assert inv.items[0].name == "Бумага А4"
    assert inv.items[0].total == 3500
    assert inv.total == 3500
    assert inv.vat.included is True


def test_parsed_invoice_with_nulls():
    data = {
        "supplier": {"name": None, "inn": None},
        "document": {"number": None, "date": None},
        "items": [
            {"name": "Товар", "quantity": None, "unit": None, "price_per_unit": None, "total": None}
        ],
        "total": None,
        "confidence": 0.5,
    }
    inv = ParsedInvoice.model_validate(data)
    assert inv.supplier.name is None
    assert inv.items[0].quantity is None


def test_parse_request():
    req = ParseInvoiceRequest(
        file_content_base64="dGVzdA==",
        filename="test.pdf",
        mime_type="application/pdf",
    )
    assert req.filename == "test.pdf"


def test_parse_response_success():
    resp = ParseInvoiceResponse(
        success=True,
        data=ParsedInvoice(total=1000),
        tokens_used=150,
        model="gpt-4o",
    )
    assert resp.success is True
    assert resp.data is not None
    assert resp.data.total == 1000


def test_parse_response_error():
    resp = ParseInvoiceResponse(success=False, error="Something went wrong")
    assert resp.success is False
    assert resp.data is None
    assert resp.error == "Something went wrong"

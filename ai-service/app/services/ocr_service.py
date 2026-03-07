import io
import structlog
from PIL import Image

logger = structlog.get_logger()


def extract_text_from_image(image_bytes: bytes) -> str:
    """Extract text from image using Tesseract OCR."""
    try:
        import pytesseract
    except ImportError:
        logger.warning("pytesseract not installed, returning empty text")
        return ""

    image = Image.open(io.BytesIO(image_bytes))
    text = pytesseract.image_to_string(image, lang="rus+eng")
    logger.info("ocr_extracted", chars=len(text))
    return text


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF. First tries direct text extraction, falls back to OCR."""
    # Try direct text extraction first
    text = _extract_pdf_text_direct(pdf_bytes)
    if text and len(text.strip()) > 50:
        logger.info("pdf_text_extracted_directly", chars=len(text))
        return text

    # Fall back to OCR
    logger.info("pdf_falling_back_to_ocr")
    return _extract_pdf_text_ocr(pdf_bytes)


def _extract_pdf_text_direct(pdf_bytes: bytes) -> str:
    """Try to extract text directly from PDF without OCR."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return ""

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    texts = []
    for page in doc:
        texts.append(page.get_text())
    doc.close()
    return "\n".join(texts)


def _extract_pdf_text_ocr(pdf_bytes: bytes) -> str:
    """Convert PDF pages to images and OCR them."""
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
    except ImportError:
        logger.warning("pdf2image or pytesseract not installed")
        return ""

    try:
        images = convert_from_bytes(pdf_bytes, dpi=300)
    except Exception as e:
        logger.error("pdf_to_image_failed", error=str(e))
        return ""

    texts = []
    for i, image in enumerate(images):
        page_text = pytesseract.image_to_string(image, lang="rus+eng")
        texts.append(page_text)
        logger.info("ocr_page_done", page=i + 1, chars=len(page_text))

    return "\n".join(texts)

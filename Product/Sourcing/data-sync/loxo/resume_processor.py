"""
Resume PDF processing.
Downloads resume from Loxo, extracts text with pdfplumber, uploads raw PDF to S3.
Returns extracted text (truncated) and S3 key.
"""
import io
import logging
import os
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Max characters to store in DB (keeps DB size manageable)
RESUME_TEXT_MAX_CHARS = 15_000


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract plain text from a PDF byte string using pdfplumber."""
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        full_text = "\n".join(text_parts).strip()
        return full_text[:RESUME_TEXT_MAX_CHARS]
    except Exception as e:
        logger.error("PDF text extraction failed: %s", e)
        return ""


def upload_resume_to_s3(
    pdf_bytes: bytes,
    person_id: int,
    resume_id: int,
    bucket: Optional[str] = None,
    region: Optional[str] = None,
) -> Optional[str]:
    """
    Upload a resume PDF to S3.
    Returns the S3 object key on success, None on failure.
    """
    bucket = bucket or os.getenv("S3_BUCKET", "artizen-sourcing-resumes-dev")
    region = region or os.getenv("AWS_REGION", "us-east-2")
    key = f"resumes/{person_id}/resume_{resume_id}.pdf"

    try:
        import boto3
        s3 = boto3.client("s3", region_name=region)
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=pdf_bytes,
            ContentType="application/pdf",
        )
        logger.info("Uploaded resume to s3://%s/%s", bucket, key)
        return key
    except Exception as e:
        logger.error("S3 upload failed for person %d resume %d: %s", person_id, resume_id, e)
        return None


def process_resume(
    loxo_client,
    person_id: int,
    resume_id: int,
    bucket: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    """
    Download, extract, and upload a single resume.
    Returns (extracted_text, s3_key).
    If any step fails, returns what was successful.
    """
    try:
        pdf_bytes = loxo_client.get_resume_pdf(person_id, resume_id)
    except Exception as e:
        logger.warning("Could not download resume for person %d: %s", person_id, e)
        return "", None

    text = extract_text_from_pdf(pdf_bytes)
    s3_key = upload_resume_to_s3(pdf_bytes, person_id, resume_id, bucket=bucket)
    return text, s3_key

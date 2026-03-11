"""
Groq API client wrapper.
Handles retries, rate limit back-off, and timeout enforcement.
"""
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from groq import AsyncGroq, RateLimitError

from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_client() -> AsyncGroq:
    settings = get_settings()
    # max_retries=0: disable SDK built-in retry so our code handles 429s immediately
    return AsyncGroq(api_key=settings.GROQ_API_KEY, max_retries=0)


async def chat_completion(
    messages: List[Dict[str, str]],
    tools: Optional[List[Dict]] = None,
    tool_choice: str = "auto",
    max_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    timeout: Optional[int] = None,
) -> Any:
    """
    Call the Groq chat completions API with optional tool definitions.
    Returns the raw completion object.
    Raises asyncio.TimeoutError if the configurable timeout is exceeded.
    """
    settings = get_settings()
    client = _get_client()

    kwargs: Dict[str, Any] = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature if temperature is not None else settings.GROQ_TEMPERATURE,
        "max_tokens": max_tokens or settings.GROQ_MAX_TOKENS,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice

    effective_timeout = timeout if timeout is not None else settings.GROQ_TIMEOUT_SECONDS
    retries = 3

    for attempt in range(retries):
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(**kwargs),
                timeout=float(effective_timeout),
            )
            return response
        except asyncio.TimeoutError:
            logger.warning("Groq request timed out after %ds", effective_timeout)
            raise
        except RateLimitError as e:
            # Daily token quota errors won't resolve for hours — don't retry, fail fast
            err_body = getattr(e, "body", None) or {}
            if isinstance(err_body, dict) and err_body.get("error", {}).get("type") == "tokens":
                logger.warning("Groq daily token quota exhausted — raising immediately")
                raise
            wait = 2 ** attempt + 1
            logger.warning("Groq rate limit hit (attempt %d/%d), sleeping %ds: %s", attempt + 1, retries, wait, e)
            if attempt < retries - 1:
                await asyncio.sleep(wait)
            else:
                raise
        except Exception as e:
            logger.error("Groq API error (attempt %d/%d): %s", attempt + 1, retries, e)
            if attempt < retries - 1:
                await asyncio.sleep(1)
            else:
                raise


async def json_completion(
    messages: List[Dict[str, str]],
    max_tokens: int = 400,
    timeout: Optional[int] = None,
) -> str:
    """
    Request a JSON response from the LLM.
    Returns the raw text content of the first choice.
    """
    response = await chat_completion(
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.0,        # Zero temperature for structured JSON output
        timeout=timeout,
    )
    return response.choices[0].message.content or ""

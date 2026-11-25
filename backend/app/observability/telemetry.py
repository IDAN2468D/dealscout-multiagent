"""OpenTelemetry + Langfuse observability and Gemini 3.5 Flash-Lite cost ledger."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

import httpx
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.db.models import UserSearchHistory

logger = logging.getLogger(__name__)

# Official Gemini 3.5 Flash-Lite pricing (USD per 1,000,000 tokens)
GEMINI_MODEL_PRICING: dict[str, dict[str, float]] = {
    "gemini-3.5-flash-lite": {
        "input_per_1m": 0.075,
        "cached_per_1m": 0.01875,
        "output_per_1m": 0.30,
    },
    "gemini-2.5-flash-lite": {
        "input_per_1m": 0.075,
        "cached_per_1m": 0.01875,
        "output_per_1m": 0.30,
    },
    "gemini-3.5-flash": {
        "input_per_1m": 0.15,
        "cached_per_1m": 0.0375,
        "output_per_1m": 0.60,
    },
}


def calculate_gemini_cost_usd(
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    model_id: str = "gemini-3.5-flash-lite",
) -> float:
    """Calculate deterministic USD cost for a Gemini LLM invocation."""
    pricing = GEMINI_MODEL_PRICING.get(
        model_id, GEMINI_MODEL_PRICING["gemini-3.5-flash-lite"]
    )
    in_tok = max(0, int(input_tokens))
    out_tok = max(0, int(output_tokens))
    cache_tok = max(0, int(cached_tokens))
    cost = (
        (in_tok / 1_000_000.0) * pricing["input_per_1m"]
        + (cache_tok / 1_000_000.0) * pricing["cached_per_1m"]
        + (out_tok / 1_000_000.0) * pricing["output_per_1m"]
    )
    return round(cost, 8)


def _init_tracer_provider() -> tuple[TracerProvider, InMemorySpanExporter]:
    """Initialize OpenTelemetry TracerProvider with InMemorySpanExporter (+ optional OTLP)."""
    resource = Resource.create({"service.name": settings.OTEL_SERVICE_NAME})
    exporter = InMemorySpanExporter()
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    if settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter,
            )

            otlp_exporter = OTLPSpanExporter(
                endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT
            )
            provider.add_span_processor(SimpleSpanProcessor(otlp_exporter))
        except Exception as exc:  # pragma: no cover - optional network exporter
            logger.warning("Failed to configure OTLP exporter: %s", exc)

    current_provider = trace.get_tracer_provider()
    if type(current_provider).__name__ == "ProxyTracerProvider":
        trace.set_tracer_provider(provider)

    return provider, exporter


class TelemetryRecorder:
    """Collects OpenTelemetry spans, Langfuse events, and DB search cost metrics."""

    def __init__(self, max_events: int = 500) -> None:
        self.provider, self.span_exporter = _init_tracer_provider()
        self.tracer = self.provider.get_tracer(settings.OTEL_SERVICE_NAME)
        self._langfuse_events: deque[dict[str, Any]] = deque(maxlen=max_events)
        self._search_metrics_buffer: deque[dict[str, Any]] = deque(maxlen=max_events)

    @contextmanager
    def trace_agent_run(
        self,
        agent_name: str,
        user_id: str | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> Iterator[trace.Span]:
        """Context manager emitting an OpenTelemetry span for an agent or pipeline step."""
        span_attrs: dict[str, Any] = {
            "dealscout.agent": agent_name,
            "llm.model": settings.GEMINI_ORCHESTRATOR_MODEL,
        }
        if user_id:
            span_attrs["enduser.id"] = user_id
        if attributes:
            for k, v in attributes.items():
                if v is not None:
                    span_attrs[k] = v if isinstance(v, (bool, str, int, float)) else str(v)

        with self.tracer.start_as_current_span(agent_name, attributes=span_attrs) as span:
            yield span

    def record_langfuse_event(
        self,
        event_type: str,
        name: str,
        user_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Buffer a Langfuse trace/generation event and dispatch asynchronously if configured."""
        event = {
            "type": event_type,
            "name": name,
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload or {},
            "dispatched": False,
        }
        self._langfuse_events.append(event)

        if (
            settings.LANGFUSE_PUBLIC_KEY
            and settings.LANGFUSE_SECRET_KEY
            and settings.LLM_EXECUTION_MODE != "mock"
        ):
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self._dispatch_langfuse_http(event))
            except RuntimeError:
                pass

        return event

    async def _dispatch_langfuse_http(self, event: dict[str, Any]) -> None:
        """Send buffered Langfuse event over HTTP Basic Auth without failing caller."""
        url = f"{settings.LANGFUSE_HOST.rstrip('/')}/api/public/ingestion"
        body = {
            "batch": [
                {
                    "id": f"ds-{datetime.now(timezone.utc).timestamp()}",
                    "type": event["type"],
                    "timestamp": event["timestamp"],
                    "body": {
                        "name": event["name"],
                        "userId": event["user_id"],
                        "metadata": event["payload"],
                    },
                }
            ]
        }
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.post(
                    url,
                    json=body,
                    auth=(settings.LANGFUSE_PUBLIC_KEY, settings.LANGFUSE_SECRET_KEY),
                )
                if resp.status_code < 300:
                    event["dispatched"] = True
        except Exception as exc:
            logger.debug("Langfuse ingestion skipped/failed: %s", exc)

    def record_search_metrics(
        self,
        db: Session | None,
        user_id: str,
        query: str,
        model_id: str,
        best_landed_ils: float | None,
        input_tokens: int,
        output_tokens: int,
        cached_tokens: int,
        duration_ms: float,
    ) -> dict[str, Any]:
        """Compute Gemini cost, emit OTel/Langfuse telemetry, and persist UserSearchHistory."""
        llm_cost_usd = calculate_gemini_cost_usd(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            model_id=model_id,
        )

        with self.trace_agent_run(
            "dealscout.search.metrics",
            user_id=user_id,
            attributes={
                "llm.model": model_id,
                "llm.input_tokens": input_tokens,
                "llm.output_tokens": output_tokens,
                "llm.cached_tokens": cached_tokens,
                "llm.cost_usd": llm_cost_usd,
                "dealscout.duration_ms": round(duration_ms, 2),
            },
        ):
            pass

        self.record_langfuse_event(
            event_type="generation-create",
            name="deal_orchestrator_search",
            user_id=user_id,
            payload={
                "query": query,
                "model": model_id,
                "best_landed_ils": best_landed_ils,
                "usage": {
                    "input": input_tokens,
                    "output": output_tokens,
                    "cached": cached_tokens,
                    "total_cost_usd": llm_cost_usd,
                },
                "duration_ms": round(duration_ms, 2),
            },
        )

        record_id = ""
        created_at = datetime.now(timezone.utc).isoformat()
        if db is not None and user_id:
            try:
                history_row = UserSearchHistory(
                    user_id=user_id,
                    query=query[:500],
                    model_id=model_id,
                    best_landed_ils=best_landed_ils,
                    input_tokens=int(input_tokens),
                    output_tokens=int(output_tokens),
                    cached_tokens=int(cached_tokens),
                    llm_cost_usd=llm_cost_usd,
                    duration_ms=round(float(duration_ms), 2),
                )
                db.add(history_row)
                db.commit()
                db.refresh(history_row)
                record_id = history_row.id
                created_at = history_row.created_at.isoformat()
            except Exception as exc:
                logger.warning("Failed to persist UserSearchHistory: %s", exc)
                try:
                    db.rollback()
                except Exception:
                    pass

        summary_entry = {
            "id": record_id,
            "user_id": user_id,
            "query": query,
            "model_id": model_id,
            "best_landed_ils": best_landed_ils,
            "input_tokens": int(input_tokens),
            "output_tokens": int(output_tokens),
            "cached_tokens": int(cached_tokens),
            "llm_cost_usd": llm_cost_usd,
            "duration_ms": round(float(duration_ms), 2),
            "created_at": created_at,
        }
        self._search_metrics_buffer.append(summary_entry)
        return summary_entry

    def get_recent_spans(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return serialized recent OpenTelemetry spans from InMemorySpanExporter."""
        spans = self.span_exporter.get_finished_spans()
        selected = spans[-limit:] if limit > 0 else spans
        result: list[dict[str, Any]] = []
        for sp in reversed(selected):
            duration_ms = 0.0
            if sp.start_time and sp.end_time:
                duration_ms = round((sp.end_time - sp.start_time) / 1_000_000.0, 3)
            result.append(
                {
                    "name": sp.name,
                    "trace_id": format(sp.context.trace_id, "032x"),
                    "span_id": format(sp.context.span_id, "016x"),
                    "duration_ms": duration_ms,
                    "attributes": dict(sp.attributes) if sp.attributes else {},
                }
            )
        return result

    def get_langfuse_events(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return recent buffered Langfuse events."""
        items = list(self._langfuse_events)
        return list(reversed(items[-limit:])) if limit > 0 else list(reversed(items))

    def get_summary(self, limit: int = 25) -> dict[str, Any]:
        """Aggregate in-memory OTel/Langfuse/cost metrics for `/admin/telemetry`."""
        metrics = list(self._search_metrics_buffer)
        total_in = sum(m["input_tokens"] for m in metrics)
        total_out = sum(m["output_tokens"] for m in metrics)
        total_cached = sum(m["cached_tokens"] for m in metrics)
        total_cost = round(sum(m["llm_cost_usd"] for m in metrics), 8)
        avg_dur = (
            round(sum(m["duration_ms"] for m in metrics) / len(metrics), 2)
            if metrics
            else 0.0
        )
        return {
            "service_name": settings.OTEL_SERVICE_NAME,
            "default_model": settings.GEMINI_ORCHESTRATOR_MODEL,
            "pricing_usd_per_1m": GEMINI_MODEL_PRICING.get(
                settings.GEMINI_ORCHESTRATOR_MODEL,
                GEMINI_MODEL_PRICING["gemini-3.5-flash-lite"],
            ),
            "total_searches_recorded": len(metrics),
            "total_otel_spans": len(self.span_exporter.get_finished_spans()),
            "total_langfuse_events": len(self._langfuse_events),
            "total_input_tokens": total_in,
            "total_output_tokens": total_out,
            "total_cached_tokens": total_cached,
            "total_llm_cost_usd": total_cost,
            "avg_duration_ms": avg_dur,
            "recent_searches": list(reversed(metrics[-limit:])),
            "recent_spans": self.get_recent_spans(limit=limit),
            "recent_langfuse_events": self.get_langfuse_events(limit=limit),
        }

    def clear(self) -> None:
        """Clear in-memory telemetry buffers (useful in tests)."""
        self.span_exporter.clear()
        self._langfuse_events.clear()
        self._search_metrics_buffer.clear()


telemetry_recorder = TelemetryRecorder()


def get_telemetry_recorder() -> TelemetryRecorder:
    """Return the singleton TelemetryRecorder instance."""
    return telemetry_recorder


def record_search_metrics(
    db: Session | None,
    user_id: str,
    query: str,
    model_id: str,
    best_landed_ils: float | None,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int,
    duration_ms: float,
) -> dict[str, Any]:
    """Module-level convenience wrapper for recording search telemetry."""
    return telemetry_recorder.record_search_metrics(
        db=db,
        user_id=user_id,
        query=query,
        model_id=model_id,
        best_landed_ils=best_landed_ils,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached_tokens,
        duration_ms=duration_ms,
    )

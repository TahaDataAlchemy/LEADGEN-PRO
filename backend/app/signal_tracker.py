from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.company_service import get_company_by_id
from app.config import settings
from app.database import supabase
from app.llm_client import MODEL, client
from app.tools.scrape import get_hunter_data, get_funding_news, parse_revenue


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_json(response: httpx.Response) -> dict[str, Any]:
    try:
        return response.json()
    except Exception:
        return {}


def search_jobs(company_name: str) -> list[dict[str, Any]]:
    query = f'"{company_name}" jobs hiring OR careers'
    try:
        response = httpx.post(
            "https://google.serper.dev/search",
            headers={
                "X-API-KEY": settings.SERPER_API_KEY,
                "Content-Type": "application/json",
            },
            json={"q": query, "num": 5, "type": "search"},
            timeout=10,
        )
        return _safe_json(response).get("organic", []) or []
    except Exception:
        return []


def fetch_company_snapshot(company: dict[str, Any]) -> dict[str, Any]:
    name = company.get("name", "")
    domain = company.get("domain", "")
    enrichment = (company.get("enrichments") or [{}])[0]
    hunter_data = get_hunter_data(domain) if domain else {}
    funding = get_funding_news(name) if name else None
    jobs = search_jobs(name) if name else []

    revenue_estimate = enrichment.get("revenue_estimate")
    revenue_min = enrichment.get("revenue_min_usd")
    revenue_max = enrichment.get("revenue_max_usd")

    if not revenue_estimate and funding:
        revenue_min, revenue_max = parse_revenue(funding)

    return {
        "employee_count": hunter_data.get("employee_count") or company.get("employee_count"),
        "description": hunter_data.get("description") or company.get("description"),
        "funding_news": funding,
        "top_job_signals": [item.get("title") for item in jobs[:3] if item.get("title")],
        "job_snippets": [item.get("snippet") for item in jobs[:3] if item.get("snippet")],
        "revenue_estimate": revenue_estimate,
        "revenue_min_usd": revenue_min,
        "revenue_max_usd": revenue_max,
        "checked_at": _utcnow(),
    }


def summarize_snapshot_changes(
    company_name: str,
    previous_snapshot: dict[str, Any],
    current_snapshot: dict[str, Any],
) -> dict[str, Any]:
    prompt = f"""
You compare company monitoring snapshots for a B2B lead intelligence product.

Company: {company_name}
Previous snapshot: {previous_snapshot}
Current snapshot: {current_snapshot}

Return only JSON:
{{
  "has_changes": <true or false>,
  "signal_type": "<hiring|funding|headcount|general>",
  "headline": "<short alert headline>",
  "summary": "<2 sentence alert summary for an analyst>",
  "severity": "<high|medium|low>",
  "changes": ["<change 1>", "<change 2>"]
}}
"""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0.1,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=250,
        )
        raw = (response.choices[0].message.content or "").strip()
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON body found")
        import json

        return json.loads(raw[start : end + 1])
    except Exception:
        previous_jobs = previous_snapshot.get("top_job_signals") or []
        current_jobs = current_snapshot.get("top_job_signals") or []
        previous_funding = previous_snapshot.get("funding_news")
        current_funding = current_snapshot.get("funding_news")
        previous_emp = previous_snapshot.get("employee_count")
        current_emp = current_snapshot.get("employee_count")

        changes: list[str] = []
        signal_type = "general"
        severity = "low"
        if current_funding and current_funding != previous_funding:
            changes.append("New funding-related news appeared.")
            signal_type = "funding"
            severity = "high"
        if current_jobs and current_jobs != previous_jobs:
            changes.append("Hiring activity changed based on recent job search results.")
            signal_type = "hiring"
            severity = "medium"
        if current_emp and previous_emp and current_emp != previous_emp:
            changes.append(f"Employee estimate moved from {previous_emp} to {current_emp}.")
            signal_type = "headcount"
            severity = "medium"

        return {
            "has_changes": bool(changes),
            "signal_type": signal_type,
            "headline": f"{company_name} activity update",
            "summary": " ".join(changes) if changes else "No major changes detected.",
            "severity": severity,
            "changes": changes,
        }


def create_signal_for_watchlist(
    watchlist_entry: dict[str, Any], company: dict[str, Any], summary: dict[str, Any], snapshot: dict[str, Any]
) -> None:
    signal_payload = {
        "user_id": watchlist_entry["user_id"],
        "company_id": company["id"],
        "signal_type": summary.get("signal_type", "general"),
        "headline": summary.get("headline") or f"{company['name']} activity update",
        "summary": summary.get("summary") or "New activity detected.",
        "severity": summary.get("severity", "medium"),
        "changes": summary.get("changes", []),
        "snapshot": snapshot,
        "is_read": False,
        "created_at": _utcnow(),
    }
    supabase.table("signals").insert(signal_payload).execute()


def refresh_watchlist_entry(watchlist_entry: dict[str, Any]) -> dict[str, Any]:
    company = get_company_by_id(watchlist_entry["company_id"])
    if not company:
        return {"ok": False, "error": "Company not found"}

    previous_snapshot = watchlist_entry.get("last_snapshot") or {}
    current_snapshot = fetch_company_snapshot(company)
    summary = summarize_snapshot_changes(company["name"], previous_snapshot, current_snapshot)

    if summary.get("has_changes"):
        create_signal_for_watchlist(watchlist_entry, company, summary, current_snapshot)

    supabase.table("watchlists").update(
        {
            "last_snapshot": current_snapshot,
            "last_checked_at": _utcnow(),
            "updated_at": _utcnow(),
        }
    ).eq("id", watchlist_entry["id"]).execute()

    return {
        "ok": True,
        "company_id": company["id"],
        "has_changes": bool(summary.get("has_changes")),
        "summary": summary,
    }


def refresh_all_watchlists() -> dict[str, Any]:
    try:
        watchlists = (
            supabase.table("watchlists")
            .select("*")
            .eq("is_active", True)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "processed": 0}

    processed = 0
    changes = 0
    failures = 0

    for entry in watchlists:
        try:
            result = refresh_watchlist_entry(entry)
            processed += 1
            if result.get("has_changes"):
                changes += 1
        except Exception:
            failures += 1

    return {
        "ok": True,
        "processed": processed,
        "signals_created": changes,
        "failures": failures,
    }

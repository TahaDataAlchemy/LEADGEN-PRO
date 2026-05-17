from __future__ import annotations

from typing import Any

from app.database import supabase


COMPANY_SELECT = (
    "id, name, domain, url, industry, location, description, "
    "employee_count, linkedin_url, tech_stack, homepage_content, created_at, "
    "enrichments(score, intent_label, rationale, recommended_action, "
    "revenue_estimate, revenue_min_usd, revenue_max_usd, funding_stage)"
)


def get_company_by_id(company_id: str) -> dict[str, Any] | None:
    try:
        return (
            supabase.table("companies")
            .select(COMPANY_SELECT)
            .eq("id", company_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        return None


def find_company_by_name(search: str) -> dict[str, Any] | None:
    normalized = (search or "").strip()
    if not normalized:
        return None

    lookups = [
        lambda: (
            supabase.table("companies")
            .select(COMPANY_SELECT)
            .eq("name", normalized)
            .limit(1)
            .execute()
            .data
        ),
        lambda: (
            supabase.table("companies")
            .select(COMPANY_SELECT)
            .eq("domain", normalized)
            .limit(1)
            .execute()
            .data
        ),
        lambda: (
            supabase.table("companies")
            .select(COMPANY_SELECT)
            .or_(f"name.ilike.%{normalized}%,domain.ilike.%{normalized}%")
            .limit(1)
            .execute()
            .data
        ),
    ]

    for lookup in lookups:
        try:
            results = lookup() or []
            if results:
                return results[0]
        except Exception:
            continue

    return None


def get_company_signals(company_id: str, user_id: str | None = None) -> list[dict[str, Any]]:
    try:
        query = (
            supabase.table("signals")
            .select("*")
            .eq("company_id", company_id)
            .order("created_at", desc=True)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        return query.execute().data or []
    except Exception:
        return []


def get_watchlist_entry(user_id: str, company_id: str) -> dict[str, Any] | None:
    try:
        rows = (
            supabase.table("watchlists")
            .select("*")
            .eq("user_id", user_id)
            .eq("company_id", company_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None
    except Exception:
        return None


def build_company_profile(company_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    company = get_company_by_id(company_id)
    if not company:
        return None

    signals = get_company_signals(company_id, user_id=user_id)
    enrichment = (company.get("enrichments") or [{}])[0]
    drafts: list[dict[str, Any]] = []

    try:
        drafts = (
            supabase.table("outreach_drafts")
            .select("id, subject, body, tone, created_at")
            .eq("company_id", company_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
            .data
            or []
        )
    except Exception:
        drafts = []

    watchlisted = False
    watchlist_entry = None
    if user_id:
        watchlist_entry = get_watchlist_entry(user_id, company_id)
        watchlisted = bool(watchlist_entry and watchlist_entry.get("is_active", True))

    return {
        "company": company,
        "enrichment": enrichment,
        "signals": signals,
        "watchlisted": watchlisted,
        "watchlist_entry": watchlist_entry,
        "drafts": drafts,
    }

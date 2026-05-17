from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.company_service import find_company_by_name, get_watchlist_entry
from app.database import supabase


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def add_company_to_watchlist(user_id: str, company_name: str) -> dict[str, Any]:
    company = find_company_by_name(company_name)
    if not company:
        return {
            "ok": False,
            "message": f"I couldn't find {company_name} in your leads yet.",
        }

    existing = get_watchlist_entry(user_id, company["id"])
    payload = {
        "user_id": user_id,
        "company_id": company["id"],
        "is_active": True,
        "updated_at": _utcnow(),
    }

    try:
        if existing:
            supabase.table("watchlists").update(payload).eq("id", existing["id"]).execute()
        else:
            payload["created_at"] = _utcnow()
            payload["last_checked_at"] = None
            payload["last_snapshot"] = {}
            supabase.table("watchlists").insert(payload).execute()
    except Exception as exc:
        return {"ok": False, "message": f"Failed to update watchlist: {exc}"}

    return {
        "ok": True,
        "message": f"{company['name']} is now on your watchlist.",
        "company_id": company["id"],
        "company_name": company["name"],
        "navigate_to": f"/company/{company['id']}",
    }


def remove_company_from_watchlist(user_id: str, company_name: str) -> dict[str, Any]:
    company = find_company_by_name(company_name)
    if not company:
        return {
            "ok": False,
            "message": f"I couldn't find {company_name} in your leads yet.",
        }

    existing = get_watchlist_entry(user_id, company["id"])
    if not existing:
        return {
            "ok": True,
            "message": f"{company['name']} was not on your watchlist.",
            "company_id": company["id"],
        }

    try:
        supabase.table("watchlists").update(
            {"is_active": False, "updated_at": _utcnow()}
        ).eq("id", existing["id"]).execute()
    except Exception as exc:
        return {"ok": False, "message": f"Failed to update watchlist: {exc}"}

    return {
        "ok": True,
        "message": f"{company['name']} was removed from your watchlist.",
        "company_id": company["id"],
    }

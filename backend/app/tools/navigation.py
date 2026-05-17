from __future__ import annotations

from app.company_service import find_company_by_name
from app.database import supabase


def show_company_profile(company_name: str) -> dict:
    company = find_company_by_name(company_name)
    if not company:
        return {
            "ok": False,
            "message": f"I couldn't find {company_name} in your current leads.",
        }

    return {
        "ok": True,
        "navigate_to": f"/company/{company['id']}",
        "message": f"Opening the profile for {company['name']}.",
        "company_id": company["id"],
        "company_name": company["name"],
    }


def show_signals(user_id: str, unread_only: bool = False) -> dict:
    query = (
        supabase.table("signals")
        .select("id, headline, summary, severity, is_read, created_at, companies(name)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(10)
    )
    if unread_only:
        query = query.eq("is_read", False)

    items = query.execute().data or []
    return {
        "ok": True,
        "navigate_to": "/signals",
        "message": "Opening your signal feed.",
        "items": items,
        "unread_only": unread_only,
    }

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.database import supabase

router = APIRouter(prefix="/signals", tags=["signals"])


class ReadSignalBody(BaseModel):
    user_id: str


@router.get("")
def get_signals(user_id: str, unread_only: bool = False):
    query = (
        supabase.table("signals")
        .select(
            "id, user_id, company_id, signal_type, headline, summary, severity, "
            "changes, snapshot, is_read, created_at, companies(name, domain)"
        )
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    if unread_only:
        query = query.eq("is_read", False)
    return {"items": query.execute().data or []}


@router.get("/unread-count")
def get_unread_count(user_id: str):
    rows = (
        supabase.table("signals")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("is_read", False)
        .execute()
    )
    return {"count": rows.count or 0}


@router.post("/{signal_id}/read")
def mark_signal_read(signal_id: str, body: ReadSignalBody):
    supabase.table("signals").update({"is_read": True}).eq("id", signal_id).eq(
        "user_id", body.user_id
    ).execute()
    return {"ok": True}

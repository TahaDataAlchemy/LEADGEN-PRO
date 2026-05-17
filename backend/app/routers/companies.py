from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.company_service import build_company_profile
from app.database import supabase
from app.tools.email import draft_email
from app.watchlist_service import add_company_to_watchlist, remove_company_from_watchlist

router = APIRouter(prefix="/companies", tags=["companies"])


class WatchlistBody(BaseModel):
    user_id: str


class DraftBody(BaseModel):
    tone: str = "conversational"


@router.get("")
def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    industry: str | None = None,
    location: str | None = None,
    intent_label: str | None = None,
    scraped_today: bool = False,
    order_by: str = "created_at",
):
    rows = (
        supabase.table("companies")
        .select(
            "id, name, domain, url, industry, location, employee_count, "
            "linkedin_url, tech_stack, created_at, "
            "enrichments(score, intent_label, rationale, recommended_action)",
        )
        .execute()
        .data
        or []
    )

    if industry:
        rows = [row for row in rows if industry.lower() in (row.get("industry") or "").lower()]
    if location:
        rows = [row for row in rows if location.lower() in (row.get("location") or "").lower()]
    if intent_label:
        rows = [
            row for row in rows
            if (row.get("enrichments") or [{}])[0].get("intent_label") == intent_label
        ]
    if scraped_today:
        from datetime import datetime, timezone

        today = datetime.now(timezone.utc).date().isoformat()
        rows = [row for row in rows if (row.get("created_at") or "").startswith(today)]

    if order_by == "score":
        rows.sort(key=lambda row: (row.get("enrichments") or [{}])[0].get("score") or 0, reverse=True)
    elif order_by == "name":
        rows.sort(key=lambda row: (row.get("name") or "").lower())
    else:
        rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)

    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    items = rows[start:end]
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/export")
def export_companies_csv():
    rows = (
        supabase.table("companies")
        .select(
            "name, domain, url, industry, location, employee_count, created_at, "
            "enrichments(score, intent_label, recommended_action, revenue_estimate, funding_stage)"
        )
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )

    import csv
    import io

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "name",
            "domain",
            "url",
            "industry",
            "location",
            "employee_count",
            "score",
            "intent_label",
            "recommended_action",
            "revenue_estimate",
            "funding_stage",
            "created_at",
        ]
    )

    for row in rows:
        enrichment = (row.get("enrichments") or [{}])[0]
        writer.writerow(
            [
                row.get("name"),
                row.get("domain"),
                row.get("url"),
                row.get("industry"),
                row.get("location"),
                row.get("employee_count"),
                enrichment.get("score"),
                enrichment.get("intent_label"),
                enrichment.get("recommended_action"),
                enrichment.get("revenue_estimate"),
                enrichment.get("funding_stage"),
                row.get("created_at"),
            ]
        )

    return {"filename": "companies.csv", "content": buffer.getvalue()}


@router.get("/{company_id}")
def get_company_profile(company_id: str, user_id: str | None = None):
    profile = build_company_profile(company_id, user_id=user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Company not found")
    return profile


@router.post("/{company_id}/watchlist")
def add_watchlist(company_id: str, body: WatchlistBody):
    profile = build_company_profile(company_id, user_id=body.user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Company not found")
    result = add_company_to_watchlist(body.user_id, profile["company"]["name"])
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.delete("/{company_id}/watchlist")
def remove_watchlist(company_id: str, body: WatchlistBody):
    profile = build_company_profile(company_id, user_id=body.user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Company not found")
    result = remove_company_from_watchlist(body.user_id, profile["company"]["name"])
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/{company_id}/draft-email")
def create_company_draft(company_id: str, body: DraftBody):
    profile = build_company_profile(company_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Company not found")

    result = draft_email(profile["company"]["name"], tone=body.tone)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

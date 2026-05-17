from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from app.database import supabase


def analyze_pipeline(filter_by: str = None) -> dict:
    companies = (
        supabase.table("companies")
        .select(
            "id, name, industry, created_at, enrichments(score, intent_label, recommended_action)"
        )
        .execute()
        .data
        or []
    )

    if filter_by:
        needle = filter_by.lower()
        companies = [
            company
            for company in companies
            if needle in (company.get("industry") or "").lower()
            or needle in (company.get("name") or "").lower()
        ]

    scores = []
    intents = Counter()
    top_leads = []
    by_industry: dict[str, list[int]] = defaultdict(list)
    weekly_trend = Counter()

    week_start = datetime.now(timezone.utc) - timedelta(days=42)
    for company in companies:
        enrichment = (company.get("enrichments") or [{}])[0]
        score = enrichment.get("score")
        intent = enrichment.get("intent_label")
        industry = company.get("industry") or "Unknown"

        if score is not None:
            scores.append(score)
            by_industry[industry].append(score)
            top_leads.append(
                {
                    "name": company.get("name"),
                    "industry": industry,
                    "score": score,
                    "intent_label": intent,
                    "recommended_action": enrichment.get("recommended_action"),
                }
            )
        if intent:
            intents[intent] += 1

        created_at = company.get("created_at")
        if created_at:
            try:
                created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                if created_dt >= week_start:
                    bucket = created_dt.strftime("%Y-%W")
                    weekly_trend[bucket] += 1
            except Exception:
                pass

    avg_score = round(sum(scores) / len(scores), 1) if scores else 0
    top_leads.sort(key=lambda lead: lead["score"], reverse=True)
    industry_breakdown = [
        {
            "industry": industry,
            "average_score": round(sum(values) / len(values), 1),
            "lead_count": len(values),
        }
        for industry, values in by_industry.items()
    ]
    industry_breakdown.sort(key=lambda item: item["average_score"], reverse=True)

    trend = [
        {"week": week, "count": count}
        for week, count in sorted(weekly_trend.items())
    ]

    return {
        "ok": True,
        "message": "Pipeline analysis ready.",
        "filter_by": filter_by,
        "summary": {
            "total_leads": len(companies),
            "avg_score": avg_score,
            "hot": intents.get("Hot", 0),
            "warm": intents.get("Warm", 0),
            "cold": intents.get("Cold", 0),
        },
        "top_leads": top_leads[:5],
        "industry_breakdown": industry_breakdown[:10],
        "weekly_trend": trend,
    }

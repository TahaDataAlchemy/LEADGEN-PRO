from fastapi import APIRouter, BackgroundTasks
from app.tools.score import score_and_cache, score_all_unscored
from app.database import supabase

router = APIRouter(prefix="/scoring", tags=["scoring"])


@router.post("/company/{company_id}")
def score_single(company_id: str):
    """Score one company by ID. Used when user clicks score on a row."""
    try:
        company = supabase.table("companies") \
            .select("id, name, domain, industry, location, employee_count, tech_stack, description, enrichments(revenue_estimate, funding_stage)") \
            .eq("id", company_id) \
            .single() \
            .execute().data
        if not company:
            return {"error": "Company not found"}
        result = score_and_cache(company_id, company)
        return result or {"error": "Scoring failed"}
    except Exception as e:
        return {"error": str(e)}


@router.post("/all")
def score_all(background_tasks: BackgroundTasks):
    """
    Kick off batch scoring for all unscored companies.
    Returns immediately — scoring runs in background.
    Frontend polls /scoring/status to track progress.
    """
    background_tasks.add_task(score_all_unscored)
    return {"message": "Scoring started", "status": "running"}


@router.get("/status")
def scoring_status():
    """
    Returns counts: total, scored, unscored.
    Frontend polls this every 3s during batch scoring.
    """
    try:
        companies = supabase.table("companies") \
            .select("id, enrichments(score)") \
            .execute().data or []

        total = len(companies)
        scored = sum(
            1 for c in companies
            if c.get("enrichments") and c["enrichments"] and
               c["enrichments"][0].get("score") is not None
        )
        return {"total": total, "scored": scored, "unscored": total - scored}
    except Exception as e:
        return {"error": str(e)}


@router.get("/stats")
def pipeline_stats():
    """
    Aggregate stats for the dashboard stats bar.
    avg score, Hot/Warm/Cold counts.
    """
    try:
        enrichments = supabase.table("enrichments") \
            .select("score, intent_label") \
            .not_.is_("score", "null") \
            .execute().data or []

        scores = [e["score"] for e in enrichments if e.get("score")]
        avg = round(sum(scores) / len(scores)) if scores else 0
        hot = sum(1 for e in enrichments if e.get("intent_label") == "Hot")
        warm = sum(1 for e in enrichments if e.get("intent_label") == "Warm")
        cold = sum(1 for e in enrichments if e.get("intent_label") == "Cold")

        total_companies = supabase.table("companies").select("id", count="exact").execute().count or 0
        unscored = total_companies - len(scores)

        return {
            "avg_score": avg,
            "hot": hot,
            "warm": warm,
            "cold": cold,
            "unscored": unscored,
            "total": total_companies
        }
    except Exception as e:
        return {"error": str(e)}
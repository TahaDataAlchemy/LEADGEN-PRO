from app.database import supabase
from app.llm_client import client, MODEL
from app.redis_client import r
import json
import re

SCORE_TTL = 86400  # 24hr

SCORING_PROMPT = """
You are a B2B lead scoring analyst for a PE and sales intelligence platform.

Score this company on buying intent (0-100) based on:
- Hiring activity (SDR/AE/Growth roles = hot signal)
- Recent funding (Series A/B = hot, bootstrapped = warm)
- Tech stack (Stripe/HubSpot/Salesforce = sales-ready)
- Company size and growth stage
- Industry (SaaS/FinTech/HealthTech score higher)

Return ONLY valid JSON, no markdown:
{
  "score": <integer 0-100>,
  "intent_label": "<Hot|Warm|Cold>",
  "rationale": "<2-3 sentence explanation>",
  "recommended_action": "<Draft email|Watch|Skip>"
}

Scoring guide:
80-100 = Hot (strong signals, act now)
50-79  = Warm (some signals, monitor)
0-49   = Cold (weak signals, deprioritize)
"""


def _cache_key(company_id: str) -> str:
    return f"score:{company_id}"


def get_cached_score(company_id: str) -> dict | None:
    try:
        data = r.get(_cache_key(company_id))
        return json.loads(data) if data else None
    except Exception:
        return None


def get_db_score(company_id: str) -> dict | None:
    try:
        result = supabase.table("enrichments") \
            .select("score, intent_label, rationale, recommended_action") \
            .eq("company_id", company_id) \
            .execute()
        if result.data and result.data[0].get("score") is not None:
            return result.data[0]
        return None
    except Exception:
        return None


def score_company(company: dict) -> dict | None:
    enrichment = (company.get("enrichments") or [{}])[0]
    prompt = f"""
Company: {company.get('name')}
Industry: {company.get('industry')}
Location: {company.get('location')}
Employees: {company.get('employee_count')}
Tech stack: {', '.join(company.get('tech_stack') or [])}
Description: {company.get('description', '')[:400]}
Revenue estimate: {enrichment.get('revenue_estimate', 'unknown')}
Funding: {enrichment.get('funding_stage', 'unknown')}
"""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0.1,
            messages=[
                {"role": "system", "content": SCORING_PROMPT},
                {"role": "user", "content": prompt}
            ],
            max_tokens=250
        )
        raw = re.sub(r"```json|```", "", response.choices[0].message.content or "").strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise ValueError("No JSON found")

        data = json.loads(match.group())
        score = max(0, min(100, int(data.get("score", 0))))
        intent = data.get("intent_label", "Cold")
        if intent not in ("Hot", "Warm", "Cold"):
            intent = "Hot" if score >= 80 else "Warm" if score >= 50 else "Cold"

        return {
            "score": score,
            "intent_label": intent,
            "rationale": str(data.get("rationale", ""))[:500],
            "recommended_action": data.get("recommended_action", "Watch")
        }
    except Exception as e:
        print(f"Scoring error for {company.get('name')}: {e}")
        return None


def score_and_cache(company_id: str, company: dict) -> dict | None:
    # L1: Redis
    cached = get_cached_score(company_id)
    if cached:
        return cached

    # L2: Supabase
    db_score = get_db_score(company_id)
    if db_score:
        r.setex(_cache_key(company_id), SCORE_TTL, json.dumps(db_score))
        return db_score

    # L3: Groq
    result = score_company(company)
    if not result:
        return None

    # persist to Supabase
    try:
        existing = supabase.table("enrichments") \
            .select("id").eq("company_id", company_id).execute()
        if existing.data:
            supabase.table("enrichments").update(result) \
                .eq("company_id", company_id).execute()
        else:
            supabase.table("enrichments").insert({"company_id": company_id, **result}).execute()
    except Exception as e:
        print(f"DB write error: {e}")

    # persist to Redis
    r.setex(_cache_key(company_id), SCORE_TTL, json.dumps(result))
    return result


def score_all_unscored() -> dict:
    try:
        companies = supabase.table("companies") \
            .select("id, name, domain, industry, location, employee_count, tech_stack, description, enrichments(score, intent_label, revenue_estimate, funding_stage)") \
            .execute().data or []

        unscored = [
            c for c in companies
            if not c.get("enrichments") or
               not c["enrichments"] or
               c["enrichments"][0].get("score") is None
        ]

        scored, failed, results = 0, 0, []
        for company in unscored:
            result = score_and_cache(company["id"], company)
            if result:
                scored += 1
                results.append({"company_id": company["id"], "name": company["name"], **result})
            else:
                failed += 1

        return {"total_unscored": len(unscored), "scored": scored, "failed": failed, "results": results}

    except Exception as e:
        return {"error": str(e), "scored": 0, "failed": 0}
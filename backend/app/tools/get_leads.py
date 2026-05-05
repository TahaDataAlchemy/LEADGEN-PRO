from app.database import supabase
from app.llm_client import client, MODEL
import json
import re

# ── SQL agent — converts natural language to supabase filters ──

SQL_AGENT_PROMPT = """
You are a SQL filter agent for a B2B lead generation platform.

The database has a "companies" table with these columns:
- name (text)
- domain (text)
- industry (text)
- location (text)
- employee_count (integer)
- created_at (timestamptz)

It also joins with "enrichments" table which has:
- score (integer, 0-100)
- intent_label (text: Hot, Warm, Cold)

Your job is to convert a natural language request into a JSON filter object.

Return ONLY valid JSON, no markdown, no explanation:
{
  "company_name": "<string or null>",
  "industry": "<string or null>",
  "location": "<string or null>",
  "min_score": <integer or null>,
  "max_score": <integer or null>,
  "intent_label": "<Hot|Warm|Cold or null>",
  "min_employees": <integer or null>,
  "max_employees": <integer or null>,
  "scraped_today": <true or false>,
  "scraped_date": "<YYYY-MM-DD or null>",
  "scraped_this_week": <true or false>,
  "min_revenue_usd": <integer or null>,
  "max_revenue_usd": <integer or null>,
  "order_by": "<score|created_at|name>",
  "order_direction": "<desc|asc>",
  "limit": <integer, default 20>
}

EXAMPLES:

Request: "show me hot leads in SaaS"
{
  "company_name": null,
  "industry": "SaaS",
  "location": null,
  "min_score": null,
  "max_score": null,
  "intent_label": "Hot",
  "min_employees": null,
  "max_employees": null,
  "scraped_today": false,
  "scraped_date": null,
  "scraped_this_week": false,
  "order_by": "score",
  "order_direction": "desc",
  "limit": 20
}

Request: "show me today's scraped leads"
{
  "company_name": null,
  "industry": null,
  "location": null,
  "min_score": null,
  "max_score": null,
  "intent_label": null,
  "min_employees": null,
  "max_employees": null,
  "scraped_today": true,
  "scraped_date": null,
  "scraped_this_week": false,
  "order_by": "created_at",
  "order_direction": "desc",
  "limit": 20
}

Request: "show me companies in Texas with score above 80"
{
  "company_name": null,
  "industry": null,
  "location": "Texas",
  "min_score": 80,
  "max_score": null,
  "intent_label": null,
  "min_employees": null,
  "max_employees": null,
  "scraped_today": false,
  "scraped_date": null,
  "scraped_this_week": false,
  "order_by": "score",
  "order_direction": "desc",
  "limit": 20
}

Request: "show me small SaaS companies under 50 employees scraped this week"
{
  "company_name": null,
  "industry": "SaaS",
  "location": null,
  "min_score": null,
  "max_score": null,
  "intent_label": null,
  "min_employees": null,
  "max_employees": 50,
  "scraped_today": false,
  "scraped_date": null,
  "scraped_this_week": true,
  "order_by": "created_at",
  "order_direction": "desc",
  "limit": 20
}

Request: "tell me about the detail of Spectral AI"
{
  "company_name": "Spectral AI",
  "industry": null,
  "location": null,
  "min_score": null,
  "max_score": null,
  "intent_label": null,
  "min_employees": null,
  "max_employees": null,
  "scraped_today": false,
  "scraped_date": null,
  "scraped_this_week": false,
  "order_by": "name",
  "order_direction": "asc",
  "limit": 5
}

Request: "tell me about texasai.ai"
{
  "company_name": "texasai.ai",
  "industry": null,
  "location": null,
  "min_score": null,
  "max_score": null,
  "intent_label": null,
  "min_employees": null,
  "max_employees": null,
  "scraped_today": false,
  "scraped_date": null,
  "scraped_this_week": false,
  "order_by": "name",
  "order_direction": "asc",
  "limit": 5
}
"""


def generate_filters(user_request: str) -> dict:
    """
    SQL agent — takes natural language and returns structured filters.
    LLM decides what to filter, not hardcoded Python logic.
    """
    try:
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0.1,
            messages=[
                {"role": "system", "content": SQL_AGENT_PROMPT},
                {"role": "user", "content": user_request}
            ],
            max_tokens=300
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"```json|```", "", raw).strip()
        return json.loads(raw)
    except Exception as e:
        print(f"SQL agent error: {e}")
        # fallback — return empty filters, show all leads
        return {
            "company_name": None,
            "industry": None,
            "location": None,
            "min_score": None,
            "max_score": None,
            "intent_label": None,
            "min_employees": None,
            "max_employees": None,
            "scraped_today": False,
            "scraped_date": None,
            "scraped_this_week": False,
            "min_revenue_usd": None,    # ← add
            "max_revenue_usd": None,    # ← add
            "order_by": "created_at",
            "order_direction": "desc",
            "limit": 20
        }


def apply_filters(filters: dict) -> list[dict]:
    """
    Takes the structured filters from SQL agent
    and runs the actual Supabase query.
    """
    from datetime import datetime, timezone, timedelta

    try:
        query = supabase\
            .table("companies")\
            .select(
                "id, name, domain, url, industry, location, "
                "employee_count, linkedin_url, tech_stack, created_at, "
                "enrichments(score, intent_label, rationale)"
            )

        # company lookup: support both company names and domains like texasai.ai
        if filters.get("company_name"):
            company_value = filters["company_name"]
            query = query.or_(
                f"name.ilike.%{company_value}%,domain.ilike.%{company_value}%"
            )

        # industry filter
        if filters.get("industry"):
            query = query.ilike("industry", f"%{filters['industry']}%")

        # location filter
        if filters.get("location"):
            query = query.ilike("location", f"%{filters['location']}%")

        # employee filters
        if filters.get("min_employees"):
            query = query.gte("employee_count", filters["min_employees"])
        if filters.get("max_employees"):
            query = query.lte("employee_count", filters["max_employees"])

        # date filters
        now = datetime.now(timezone.utc)

        if filters.get("scraped_today"):
            today = now.strftime("%Y-%m-%d")
            query = query.gte("created_at", f"{today}T00:00:00+00:00")

        elif filters.get("scraped_this_week"):
            week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
            query = query.gte("created_at", week_ago)

        elif filters.get("scraped_date"):
            date = filters["scraped_date"]
            query = query.gte("created_at", f"{date}T00:00:00+00:00")\
                         .lte("created_at", f"{date}T23:59:59+00:00")

        # ordering
        order_by = filters.get("order_by", "created_at")
        order_desc = filters.get("order_direction", "desc") == "desc"

        # only order by columns that exist in companies table
        # score is in enrichments so we order by created_at
        # and sort by score in Python after fetching
        if order_by == "score":
            query = query.order("created_at", desc=True)
        else:
            query = query.order(order_by, desc=order_desc)

        # limit
        limit = filters.get("limit", 20)
        query = query.limit(limit)

        result = query.execute()
        companies = result.data or []

        # apply enrichment filters in Python
        # because enrichments is a joined table
        if filters.get("intent_label"):
            companies = [
                c for c in companies
                if c.get("enrichments") and
                len(c["enrichments"]) > 0 and
                c["enrichments"][0].get("intent_label") == filters["intent_label"]
            ]

        if filters.get("min_score"):
            companies = [
                c for c in companies
                if c.get("enrichments") and
                len(c["enrichments"]) > 0 and
                c["enrichments"][0].get("score", 0) >= filters["min_score"]
            ]

        if filters.get("max_score"):
            companies = [
                c for c in companies
                if c.get("enrichments") and
                len(c["enrichments"]) > 0 and
                c["enrichments"][0].get("score", 0) <= filters["max_score"]
            ]

        if filters.get("min_revenue_usd"):
            companies = [
                c for c in companies
                if c.get("enrichments") and
                len(c["enrichments"]) > 0 and
                (c["enrichments"][0].get("revenue_min_usd") or 0) >= filters["min_revenue_usd"]
            ]

        if filters.get("max_revenue_usd"):
            companies = [
                c for c in companies
                if c.get("enrichments") and
                len(c["enrichments"]) > 0 and
                (c["enrichments"][0].get("revenue_max_usd") or 0) <= filters["max_revenue_usd"]
            ]

        # sort by score in Python if requested
        if filters.get("order_by") == "score":
            companies.sort(
                key=lambda c: c["enrichments"][0].get("score", 0)
                if c.get("enrichments") and len(c["enrichments"]) > 0 else 0,
                reverse=(filters.get("order_direction", "desc") == "desc")
            )

        # format for agent
        formatted = []
        for c in companies:
            enrichment = (
                c["enrichments"][0]
                if c.get("enrichments") and len(c["enrichments"]) > 0
                else {}
            )
            formatted.append({
                "name": c.get("name"),
                "domain": c.get("domain"),
                "url": c.get("url") or f"https://{c.get('domain')}",
                "industry": c.get("industry"),
                "location": c.get("location"),
                "employee_count": c.get("employee_count"),
                "linkedin_url": c.get("linkedin_url"),
                "tech_stack": c.get("tech_stack", []),
                "scraped_at": c.get("created_at"),
                "score": enrichment.get("score"),
                "intent": enrichment.get("intent_label"),
                "rationale": enrichment.get("rationale"),
                "revenue_estimate": enrichment.get("revenue_estimate"),      # ← add
                "revenue_min_usd": enrichment.get("revenue_min_usd"),        # ← add
                "revenue_max_usd": enrichment.get("revenue_max_usd"),
            })

        return formatted

    except Exception as e:
        print(f"Filter query error: {e}")
        return []


# ── main tool function ─────────────────────────────────────

def get_leads(user_request: str) -> dict:
    """
    SQL agent powered lead fetcher.
    Takes any natural language request.
    LLM generates filters.
    Supabase runs the query.
    Returns results for agent to summarize in chat.
    """
    print(f"\n SQL agent processing: {user_request}")

    # step 1 — SQL agent generates filters from natural language
    filters = generate_filters(user_request)
    print(f"  Generated filters: {json.dumps(filters, indent=2)}")

    # step 2 — apply filters to Supabase
    companies = apply_filters(filters)

    print(f"  Found {len(companies)} companies")

    return {
        "count": len(companies),
        "companies": companies,
        "filters_applied": filters
    }

from __future__ import annotations

import json

from app.company_service import find_company_by_name, get_company_signals
from app.database import supabase
from app.llm_client import MODEL, client


def draft_email(company_name: str, tone: str = "conversational") -> dict:
    company = find_company_by_name(company_name)
    if not company:
        return {
            "ok": False,
            "message": f"I couldn't find {company_name} in your current leads.",
        }

    enrichment = (company.get("enrichments") or [{}])[0]
    signals = get_company_signals(company["id"])[:5]

    prompt = f"""
You write concise B2B outbound emails for private equity and sales teams.

Company: {company.get("name")}
Industry: {company.get("industry")}
Location: {company.get("location")}
Description: {company.get("description")}
Tech stack: {", ".join(company.get("tech_stack") or [])}
Score: {enrichment.get("score")}
Intent label: {enrichment.get("intent_label")}
Rationale: {enrichment.get("rationale")}
Recommended action: {enrichment.get("recommended_action")}
Funding stage: {enrichment.get("funding_stage")}
Revenue estimate: {enrichment.get("revenue_estimate")}
Recent signals: {signals}
Tone: {tone}

Return only JSON:
{{
  "subject": "<subject line>",
  "body": "<email body in plain text with short paragraphs>",
  "why_now": "<one sentence reasoning>"
}}
"""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0.4,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
        )
        raw = (response.choices[0].message.content or "").strip()
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON object found")
        data = json.loads(raw[start : end + 1])
    except Exception as exc:
        return {
            "ok": False,
            "message": f"Failed to generate the email draft: {exc}",
        }

    payload = {
        "company_id": company["id"],
        "subject": data.get("subject", "").strip(),
        "body": data.get("body", "").strip(),
        "tone": tone,
        "why_now": data.get("why_now", "").strip(),
    }

    try:
        supabase.table("outreach_drafts").insert(payload).execute()
    except Exception:
        pass

    return {
        "ok": True,
        "message": f"Drafted a {tone} email for {company['name']}.",
        "company_id": company["id"],
        "company_name": company["name"],
        **payload,
    }

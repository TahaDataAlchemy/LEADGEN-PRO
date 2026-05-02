def draft_email(company_name: str, tone: str = "conversational") -> dict:
    # Phase 6 — real email generator plugs in here
    return {
        "status": "pending",
        "message": f"Drafting email for {company_name}...",
        "tool": "draft_email",
        "payload": {
            "company_name": company_name,
            "tone": tone
        }
    }

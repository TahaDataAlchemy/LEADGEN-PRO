def scrape_leads(industry: str, location: str, min_employees: int = None, max_employees: int = None) -> dict:
    # Phase 2B — real Serper + Playwright scraper plugs in here
    return {
        "status": "pending",
        "message": f"Scraping {industry} companies in {location}...",
        "tool": "scrape_leads",
        "payload": {
            "industry": industry,
            "location": location,
            "min_employees": min_employees,
            "max_employees": max_employees
        }
    }

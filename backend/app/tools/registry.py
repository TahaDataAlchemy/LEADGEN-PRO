from app.tools.analyze import analyze_pipeline
from app.tools.dashboard import show_dashboard
from app.tools.email import draft_email
from app.tools.get_leads import get_leads
from app.tools.navigation import show_company_profile, show_signals
from app.tools.scrape import scrape_leads
from app.watchlist_service import add_company_to_watchlist, remove_company_from_watchlist

AVAILABLE_TOOLS = {
    "scrape_leads": scrape_leads,
    "get_leads": get_leads,
    "show_dashboard": show_dashboard,
    "show_company_profile": show_company_profile,
    "show_signals": show_signals,
    "add_to_watchlist": add_company_to_watchlist,
    "remove_from_watchlist": remove_company_from_watchlist,
    "draft_email": draft_email,
    "analyze_pipeline": analyze_pipeline,
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "scrape_leads",
            "description": "Search for and scrape new B2B companies from the web based on industry, location, and employee size. Use when user wants to find or discover new companies.",
            "parameters": {
                "type": "object",
                "properties": {
                    "industry": {
                        "type": "string",
                        "description": "Industry or sector e.g. SaaS, HealthTech, Fintech"
                    },
                    "location": {
                        "type": "string",
                        "description": "City, state or country e.g. Texas, New York"
                    },
                    "min_employees": {
                        "type": "integer",
                        "description": "Minimum employee count as a JSON number, for example 100. Do not pass quoted strings."
                    },
                    "max_employees": {
                        "type": "integer",
                        "description": "Maximum employee count as a JSON number, for example 500. Do not pass quoted strings."
                    }
                },
                "required": ["industry", "location"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_leads",
            "description": "Fetch and filter existing leads from the database. Use when user wants to see, search, or filter leads that are already in the system. Answers directly in chat. Use for: today's leads, hot leads, leads by industry, leads by score, this week's leads, or specific company details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_request": {
                        "type": "string",
                        "description": "The user's exact request in natural language. Pass the full request so the SQL agent can extract the right filters."
                    }
                },
                "required": ["user_request"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "show_dashboard",
            "description": "Navigate the user to the dashboard with specific filters applied. Use only when the user explicitly asks for the dashboard.",
            "parameters": {
                "type": "object",
                "properties": {
                    "intent_label": {"type": "string", "enum": ["Hot", "Warm", "Cold"]},
                    "min_score": {"type": "integer"},
                    "industry": {"type": "string"},
                    "location": {"type": "string"},
                    "scraped_today": {"type": "boolean"},
                    "scraped_date": {"type": "string", "description": "YYYY-MM-DD format"},
                    "scraped_this_week": {"type": "boolean"},
                    "order_by": {"type": "string", "enum": ["score", "created_at", "name"]}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "show_company_profile",
            "description": "Open the full profile page for a specific company already in the system.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "description": "Company name or domain to look up."
                    }
                },
                "required": ["company_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "show_signals",
            "description": "Open the signal feed, optionally filtered to unread alerts only.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unread_only": {"type": "boolean"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_watchlist",
            "description": "Add a company that already exists in the system to the user's watchlist.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "description": "Company name or domain to watch."
                    }
                },
                "required": ["company_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "remove_from_watchlist",
            "description": "Remove a company from the user's watchlist.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "description": "Company name or domain to remove."
                    }
                },
                "required": ["company_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "draft_email",
            "description": "Draft a personalized cold outreach email for a specific company.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "description": "Name of the company"
                    },
                    "tone": {
                        "type": "string",
                        "enum": ["conversational", "formal", "direct"],
                        "description": "Email tone"
                    }
                },
                "required": ["company_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_pipeline",
            "description": "Analyze the current lead pipeline and return stats, insights, and recommendations about scores, intent distribution, top leads, industry breakdown, and recent volume.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filter_by": {
                        "type": "string",
                        "description": "Optional filter such as an industry or keyword."
                    }
                },
                "required": []
            }
        }
    }
]

from app.tools.scrape import scrape_leads
from app.tools.email import draft_email
from app.tools.filter import filter_dashboard
from app.tools.analyze import analyze_pipeline

AVAILABLE_TOOLS = {
    "scrape_leads": scrape_leads,
    "draft_email": draft_email,
    "filter_dashboard": filter_dashboard,
    "analyze_pipeline": analyze_pipeline,
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "scrape_leads",
            "description": "Search for and scrape B2B companies based on industry, location, and employee size. Use this when the user wants to find or discover companies.",
            "parameters": {
                "type": "object",
                "properties": {
                    "industry": {
                        "type": "string",
                        "description": "The industry or sector to search in e.g. SaaS, HealthTech, Fintech"
                    },
                    "location": {
                        "type": "string",
                        "description": "City, state or country to search in e.g. Texas, New York, USA"
                    },
                    "min_employees": {
                        "type": "integer",
                        "description": "Minimum number of employees"
                    },
                    "max_employees": {
                        "type": "integer",
                        "description": "Maximum number of employees"
                    }
                },
                "required": ["industry", "location"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "draft_email",
            "description": "Draft a personalized cold outreach email for a specific company. Use when the user wants to write or generate an email.",
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "description": "The name of the company to write the email for"
                    },
                    "tone": {
                        "type": "string",
                        "enum": ["conversational", "formal", "direct"],
                        "description": "The tone of the email"
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
            "description": "Analyze the current lead pipeline and return stats, insights, and recommendations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filter_by": {
                        "type": "string",
                        "description": "Optional filter e.g. industry, location, intent label"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "filter_dashboard",
            "description": "Filter or sort the leads dashboard by various criteria.",
            "parameters": {
                "type": "object",
                "properties": {
                    "intent_label": {
                        "type": "string",
                        "enum": ["Hot", "Warm", "Cold"],
                        "description": "Filter by intent label"
                    },
                    "min_score": {
                        "type": "integer",
                        "description": "Minimum AI score threshold"
                    },
                    "industry": {
                        "type": "string",
                        "description": "Filter by industry"
                    },
                    "location": {
                        "type": "string",
                        "description": "Filter by location"
                    }
                },
                "required": []
            }
        }
    }
]
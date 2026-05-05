def show_dashboard(
    intent_label: str = None,
    min_score: int = None,
    industry: str = None,
    location: str = None,
    scraped_today: bool = False,
    scraped_date: str = None,
    scraped_this_week: bool = False,
    order_by: str = "created_at"
) -> dict:
    """
    Pure signaling tool.
    Does zero database work.
    Just tells the frontend where to navigate and what filters to apply.
    The dashboard page fetches its own data when it loads.
    """

    filters = {}

    if intent_label:
        filters["intent_label"] = intent_label
    if min_score:
        filters["min_score"] = str(min_score)
    if industry:
        filters["industry"] = industry
    if location:
        filters["location"] = location
    if scraped_today:
        filters["scraped_today"] = "true"
    if scraped_date:
        filters["scraped_date"] = scraped_date
    if scraped_this_week:
        filters["scraped_this_week"] = "true"
    if order_by:
        filters["order_by"] = order_by

    return {
        "navigate_to": "/dashboard",
        "filters": filters,
        "message": "Opening dashboard with your requested filters."
    }
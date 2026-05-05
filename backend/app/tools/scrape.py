import httpx
from bs4 import BeautifulSoup
from app.config import settings
from app.database import supabase
from app.llm_client import client, MODEL
import json
import re
from urllib.parse import urlparse

# ── known tech stack fingerprints ─────────────────────────
TECH_FINGERPRINTS = {
    "stripe.com": "Stripe",
    "hubspot.com": "HubSpot",
    "intercom.io": "Intercom",
    "segment.com": "Segment",
    "analytics.js": "Google Analytics",
    "googletagmanager": "Google Tag Manager",
    "salesforce.com": "Salesforce",
    "zendesk.com": "Zendesk",
    "mixpanel.com": "Mixpanel",
    "hotjar.com": "Hotjar",
    "drift.com": "Drift",
    "calendly.com": "Calendly",
    "aws.amazon.com": "AWS",
    "cloudflare.com": "Cloudflare",
    "apollo.io": "Apollo",
    "mailchimp.com": "Mailchimp",
    "sendgrid.com": "SendGrid",
    "twilio.com": "Twilio",
}

# ── skip entirely — zero useful company data ───────────────
SKIP_ENTIRELY = [
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "youtube.com",
    "wikipedia.org",
    "yelp.com",
    "bbb.org",
    "trustpilot.com",
    "g2.com",
    "capterra.com",
    "glassdoor.com",
    "indeed.com",
    "reddit.com",
    "quora.com"
]

# ── skip homepage scraping but use snippet data ────────────
# these sites have rich snippets but are not company homepages
SKIP_FOR_HOMEPAGE = [
    "linkedin.com",
    "bloomberg.com",
    "forbes.com",
    "techcrunch.com",
    "businesswire.com",
    "prnewswire.com",
    "reuters.com",
    "wsj.com",
    "crunchbase.com",
    "venturebeat.com",
    "fortune.com",
    "inc.com",
    "wired.com"
]


# ── step 1: search serper for companies ───────────────────

def search_companies(industry: str, location: str) -> list[dict]:
    query = f"{industry} company {location}"

    try:
        response = httpx.post(
            "https://google.serper.dev/search",
            headers={
                "X-API-KEY": settings.SERPER_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "q": query,
                "num": 10,
                "type": "search"
            },
            timeout=10
        )
        data = response.json()
        return data.get("organic", [])
    except Exception as e:
        print(f"Serper search error: {e}")
        return []


# ── step 2: get funding news for a company ────────────────

def get_funding_news(company_name: str) -> str | None:
    query = f"{company_name} funding raised 2024 OR 2025"

    try:
        response = httpx.post(
            "https://google.serper.dev/news",
            headers={
                "X-API-KEY": settings.SERPER_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "q": query,
                "num": 3
            },
            timeout=10
        )
        data = response.json()
        news = data.get("news", [])
        if news:
            return news[0].get("snippet", None)
        return None
    except Exception as e:
        print(f"Funding search error: {e}")
        return None


# ── step 3: scrape homepage for tech stack + linkedin ─────

def scrape_homepage(domain: str) -> dict:
    result = {
        "tech_stack": [],
        "linkedin_url": None,
        "description": None
    }

    urls_to_try = [f"https://{domain}", f"https://www.{domain}"]

    for url in urls_to_try:
        try:
            response = httpx.get(
                url,
                timeout=8,
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0)"
                }
            )
            if response.status_code != 200:
                continue

            soup = BeautifulSoup(response.text, "html.parser")

            # extract description from meta tag
            meta = soup.find("meta", {"name": "description"})
            if meta and meta.get("content"):
                result["description"] = meta["content"][:500]

            # detect tech stack from script src tags
            tech = []
            scripts = soup.find_all("script", src=True)
            for script in scripts:
                src = script.get("src", "").lower()
                for fingerprint, tech_name in TECH_FINGERPRINTS.items():
                    if fingerprint in src and tech_name not in tech:
                        tech.append(tech_name)

            # also check inline script content
            inline_scripts = soup.find_all("script")
            for script in inline_scripts:
                content = script.string or ""
                for fingerprint, tech_name in TECH_FINGERPRINTS.items():
                    if fingerprint in content.lower() and tech_name not in tech:
                        tech.append(tech_name)

            result["tech_stack"] = tech

            # find linkedin url from page links
            links = soup.find_all("a", href=True)
            for link in links:
                href = link["href"]
                if "linkedin.com/company" in href:
                    result["linkedin_url"] = href
                    break

            break  # success — stop trying urls

        except Exception as e:
            print(f"  Homepage scrape failed for {domain}: {e}")
            continue

    return result


# ── step 4: get email + company info from hunter.io ───────

def get_hunter_data(domain: str) -> dict:
    result = {
        "email": None,
        "employee_count": None,
        "description": None
    }

    if not settings.HUNTER_API_KEY:
        return result

    try:
        # call 1 — domain search for email
        email_response = httpx.get(
            "https://api.hunter.io/v2/domain-search",
            params={
                "domain": domain,
                "api_key": settings.HUNTER_API_KEY,
                "limit": 1
            },
            timeout=8
        )
        email_data = email_response.json().get("data", {})
        emails = email_data.get("emails", [])
        if emails:
            result["email"] = emails[0].get("value")

        # call 2 — company enrichment for employee count + description
        company_response = httpx.get(
            "https://api.hunter.io/v2/companies/find",
            params={
                "domain": domain,
                "api_key": settings.HUNTER_API_KEY
            },
            timeout=8
        )
        company_data = company_response.json().get("data", {})
        if company_data:
            result["employee_count"] = company_data.get("employees")
            result["description"] = company_data.get("description")

    except Exception as e:
        print(f"  Hunter error for {domain}: {e}")

    return result


# ── step 5: ai estimation for employees and revenue ───────

# def ai_estimate(
#     company_name: str,
#     description: str,
#     snippet: str,
#     industry: str,
#     funding: str | None
# ) -> dict:
#     schema = {
#         "type": "object",
#         "properties": {
#             "employee_count": {
#                 "type": ["integer", "null"]
#             },
#             "employee_range": {
#                 "type": "string"
#             },
#             "revenue_estimate": {
#                 "type": "string"
#             },
#             "company_type": {
#                 "type": "string"
#             }
#         },
#         "required": [
#             "employee_count",
#             "employee_range",
#             "revenue_estimate",
#             "company_type"
#         ],
#         "additionalProperties": False
#     }

#     prompt = f"""
# You are a B2B company analyst. Based on the information below estimate the company details.

# Company: {company_name}
# Industry: {industry}
# Description: {description or snippet}
# Funding info: {funding or "unknown"}

# Return ONLY valid JSON, no markdown, no explanation:
# {{
#   "employee_count": <integer best estimate or null>,
#   "employee_range": "<10-50|51-100|101-200|201-500|500+>",
#   "revenue_estimate": "<$XM - $YM ARR or unknown>",
#   "company_type": "<B2B SaaS|HealthTech|Fintech|Logistics|Other>"
# }}
# """
#     try:
#         response = client.chat.completions.create(
#             model=MODEL,
#             temperature=0.1,
#             messages=[{"role": "user", "content": prompt}],
#             response_format={
#                 "type": "json_schema",
#                 "json_schema": {
#                     "name": "company_estimate",
#                     "strict": True,
#                     "schema": schema
#                 }
#             },
#             max_tokens=150
#         )
#         raw = (response.choices[0].message.content or "").strip()

#         if not raw:
#             raise ValueError("Empty response from AI estimation model")

#         # Fallback cleanup in case provider returns fenced JSON anyway.
#         raw = re.sub(r"```json|```", "", raw).strip()
#         return json.loads(raw)
#     except Exception as e:
#         print(f"  AI estimation error: {e}")
#         return {
#             "employee_count": None,
#             "employee_range": "unknown",
#             "revenue_estimate": "unknown",
#             "company_type": industry
#         }
def ai_estimate(
    company_name: str,
    description: str,
    snippet: str,
    industry: str,
    funding: str | None
) -> dict:

    prompt = f"""
You are a B2B company analyst. Estimate the company details below.

Company: {company_name}
Industry: {industry}
Description: {description or snippet}
Funding: {funding or "unknown"}

Return ONLY this JSON with no extra text:
{{
  "employee_count": <integer or null>,
  "employee_range": "<10-50 or 51-100 or 101-200 or 201-500 or 500+ or unknown>",
  "revenue_estimate": "<e.g. $1M-$5M ARR or unknown>",
  "company_type": "<B2B SaaS or Fintech or HealthTech or Logistics or Other>"
}}
"""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400
        )

        raw = (response.choices[0].message.content or "").strip()

        if not raw:
            raise ValueError("Empty LLM response")

        # ── STEP 1: Extract JSON safely ─────────────────────
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise ValueError(f"No JSON found: {raw}")

        data = json.loads(match.group())

        # ── STEP 2: Normalize fields ───────────────────────

        # employee_count
        emp = data.get("employee_count")
        if isinstance(emp, str):
            emp = int(re.sub(r"\D", "", emp)) if re.search(r"\d", emp) else None
        elif not isinstance(emp, int):
            emp = None

        # employee_range
        valid_ranges = ["10-50", "51-100", "101-200", "201-500", "500+"]
        emp_range = str(data.get("employee_range", "")).strip()

        if not any(r in emp_range for r in valid_ranges):
            emp_range = "unknown"

        # revenue_estimate
        revenue = str(data.get("revenue_estimate", "")).strip()
        if not revenue or "unknown" in revenue.lower():
            revenue = "unknown"

        # company_type
        valid_types = ["B2B SaaS", "Fintech", "HealthTech", "Logistics"]
        ctype = str(data.get("company_type", "")).strip()

        if not any(t.lower() in ctype.lower() for t in valid_types):
            ctype = "Other"

        return {
            "employee_count": emp,
            "employee_range": emp_range,
            "revenue_estimate": revenue,
            "company_type": ctype
        }

    except Exception as e:
        print(f"  AI estimation fallback: {e}")

        return {
            "employee_count": None,
            "employee_range": "unknown",
            "revenue_estimate": "unknown",
            "company_type": industry
        }


# ── step 6: extract clean domain from url ─────────────────

def extract_domain(url: str) -> str | None:
    try:
        parsed = urlparse(url)
        domain = parsed.netloc
        domain = re.sub(r"^www\.", "", domain)
        return domain if domain else None
    except Exception:
        return None


# ── step 7: check if company already exists in db ─────────

def is_duplicate(domain: str) -> bool:
    try:
        result = supabase\
            .table("companies")\
            .select("id")\
            .eq("domain", domain)\
            .execute()
        return len(result.data) > 0
    except Exception:
        return False


# ── main scrape function ───────────────────────────────────

def scrape_leads(
    industry: str,
    location: str,
    min_employees: int = None,
    max_employees: int = None
) -> dict:

    print(f"\n Starting scrape: {industry} in {location}")
    print("-" * 40)

    # step 1 — find companies via serper
    serper_results = search_companies(industry, location)

    if not serper_results:
        return {
            "companies_found": 0,
            "companies": [],
            "saved_to_db": 0,
            "duplicates_skipped": 0,
            "failed": 0,
            "message": "No results found. Try a different industry or location."
        }

    companies = []
    saved_count = 0
    duplicate_count = 0
    failed_count = 0

    for i, result in enumerate(serper_results):
        try:
            url = result.get("link", "")
            domain = extract_domain(url)

            if not domain:
                failed_count += 1
                continue

            # skip entirely useless domains
            if any(skip in domain for skip in SKIP_ENTIRELY):
                continue

            # skip duplicates already in db
            if is_duplicate(domain):
                print(f"  Skipping duplicate: {domain}")
                duplicate_count += 1
                continue

            company_name = result.get("title", "").split("-")[0].strip()
            snippet = result.get("snippet", "")

            print(f"  Processing {i+1}/{len(serper_results)}: {domain}")

            # step 2 — get funding news (first 5 only to save serper credits)
            funding = None
            if i < 5:
                funding = get_funding_news(company_name)

            # step 3 — decide whether to scrape homepage
            # news sites and linkedin have rich snippets but are not homepages
            should_scrape_homepage = not any(
                skip in domain for skip in SKIP_FOR_HOMEPAGE
            )

            if should_scrape_homepage:
                homepage_data = scrape_homepage(domain)
            else:
                # use serper snippet directly
                # if it is a linkedin result capture the url as linkedin url
                homepage_data = {
                    "tech_stack": [],
                    "linkedin_url": url if "linkedin.com/company" in url else None,
                    "description": snippet
                }
                print(f"  Using snippet data only for {domain}")

            # step 4 — get email + company data from hunter
            # only call hunter for real company domains not news sites
            hunter_data = {}
            if should_scrape_homepage:
                hunter_data = get_hunter_data(domain)

            # step 5 — build best available description
            description = (
                hunter_data.get("description")
                or homepage_data.get("description")
                or snippet
            )

            # step 6 — ai estimation
            estimates = ai_estimate(
                company_name=company_name,
                description=description,
                snippet=snippet,
                industry=industry,
                funding=funding
            )

            # step 7 — employee count: hunter first, ai fallback
            emp_count = (
                hunter_data.get("employee_count")
                or estimates.get("employee_count")
            )

            # step 8 — apply employee filter if user specified
            if emp_count:
                if min_employees and emp_count < min_employees:
                    print(f"  Skipping {domain} — below min employees ({emp_count})")
                    continue
                if max_employees and emp_count > max_employees:
                    print(f"  Skipping {domain} — above max employees ({emp_count})")
                    continue

            # step 9 — build company record
            company = {
                "domain": domain,
                "url": f"https://{domain}",
                "name": company_name,
                "industry": industry,
                "location": location,
                "description": description,
                "employee_count": emp_count,
                "linkedin_url": homepage_data.get("linkedin_url"),
                "tech_stack": homepage_data.get("tech_stack", []),
                "homepage_content": snippet
            }

            # step 10 — save to supabase
            db_result = supabase.table("companies").insert(company).execute()

            if db_result.data:
                saved_company = db_result.data[0]
                rev_min, rev_max = parse_revenue(estimates.get("revenue_estimate"))
                supabase.table("enrichments").insert({
                    "company_id": saved_company["id"],
                    "revenue_estimate": estimates.get("revenue_estimate"),
                    "revenue_min_usd": rev_min,
                    "revenue_max_usd": rev_max,
                    "funding_stage": funding or "unknown",
                }).execute()

                # attach extra enrichment fields to response
                # these move to enrichments table in Phase 3
                saved_company["email"] = hunter_data.get("email")
                saved_company["funding"] = funding
                saved_company["revenue_estimate"] = estimates.get("revenue_estimate")
                saved_company["employee_range"] = estimates.get("employee_range")

                companies.append(saved_company)
                saved_count += 1
                print(f"  Saved: {company_name} ({domain})")

        except Exception as e:
            print(f"  Failed: {result.get('link', 'unknown')} — {e}")
            failed_count += 1
            continue

    print("-" * 40)
    print(f" Done: {saved_count} saved | {duplicate_count} duplicates | {failed_count} failed\n")

    return {
        "companies_found": len(serper_results),
        "companies": companies,
        "saved_to_db": saved_count,
        "duplicates_skipped": duplicate_count,
        "failed": failed_count,
        "query_used": f"{industry} company {location}",
        "filters": {
            "industry": industry,
            "location": location,
            "min_employees": min_employees,
            "max_employees": max_employees
        }
    }


def parse_revenue(revenue_str: str) -> tuple[int | None, int | None]:
    """
    Converts "$5M-$10M ARR" to (5000000, 10000000)
    """
    if not revenue_str or revenue_str == "unknown":
        return None, None
    
    numbers = re.findall(r'\d+\.?\d*', revenue_str)
    multiplier = 1_000_000 if 'M' in revenue_str.upper() else 1_000
    
    if len(numbers) >= 2:
        return int(float(numbers[0]) * multiplier), int(float(numbers[1]) * multiplier)
    elif len(numbers) == 1:
        val = int(float(numbers[0]) * multiplier)
        return val, val
    return None, None
# LeadGen Pro

LeadGen Pro is an AI-powered B2B lead intelligence platform for sourcing companies, scoring intent, monitoring market signals, and generating outreach drafts.

This repository contains:
- `backend/`: FastAPI API + AI agent + scraping/scoring/signals services
- `frontend/`: Next.js dashboard/chat app with Supabase auth

## What It Does

- Find new leads from the web by industry/location
- Enrich lead records (company data, estimated revenue/funding context)
- Score buying intent (Hot/Warm/Cold with rationale and recommended action)
- Chat with an AI agent that can navigate, query, and trigger lead workflows
- Monitor watchlisted companies and create signal alerts automatically
- Draft outbound emails in different tones

## Tech Stack

- Frontend: Next.js (App Router), React, TypeScript, Axios, Supabase JS
- Backend: FastAPI, Uvicorn, APScheduler, Redis, Supabase Python client
- AI/LLM: Groq chat completions
- Data/Scraping: Serper API, Hunter API, BeautifulSoup, httpx

## Repository Structure

```text
AI LEADGEN/
├─ backend/
│  ├─ main.py
│  ├─ pyproject.toml
│  ├─ supabase_schema.sql
│  └─ app/
│     ├─ agent.py
│     ├─ config.py
│     ├─ scheduler.py
│     ├─ signal_tracker.py
│     ├─ watchlist_service.py
│     ├─ routers/
│     │  ├─ conversation.py
│     │  ├─ companies.py
│     │  ├─ scoring.py
│     │  └─ signals.py
│     └─ tools/
│        ├─ scrape.py
│        ├─ get_leads.py
│        ├─ score.py
│        ├─ analyze.py
│        ├─ email.py
│        └─ registry.py
└─ frontend/
   ├─ app/
   │  ├─ chat/
   │  ├─ dashboard/
   │  ├─ signals/
   │  ├─ company/[id]/
   │  └─ login/
   ├─ libs/
   │  ├─ api.ts
   │  └─ supabase.ts
   └─ components/
      └─ sidebar.tsx
```

## High-Level Architecture

1. User interacts in chat/dashboard/signals/profile pages in Next.js.
2. Frontend calls backend through `/api/*` rewrite.
3. Backend routes process requests and call services/tools.
4. Agent uses Groq tool-calling to choose actions (`scrape_leads`, `get_leads`, `draft_email`, etc.).
5. Data persists in Supabase; short-term chat/score caches use Redis.
6. Scheduler runs watchlist refresh every 6 hours and creates new `signals`.

## Prerequisites

- Python 3.11+
- Node.js 20+
- `uv` (recommended for backend dependency management)
- npm
- A running Redis instance
- Supabase project (URL + keys)
- Groq API key
- Serper API key
- Hunter API key

## Environment Variables

Create `backend/.env`:

```env
SUPABASE_URL=...
SUPABASE_KEY=...
REDIS_URL=redis://localhost:6379/0
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-20b
SERPER_API_KEY=...
HUNTER_API_KEY=...
FRONTEND_URL=http://localhost:3000
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Database Setup

Run your core schema for existing app tables (`companies`, `enrichments`, `conversations`, `messages`, etc.), then apply:

- `backend/supabase_schema.sql`

This file adds:
- `watchlists`
- `signals`
- `outreach_drafts`

## Run Locally

### 1) Start Backend

```powershell
cd backend
uv sync
uv run python main.py
```

Backend runs on:
- `http://0.0.0.0:8001`

### 2) Start Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on:
- `http://localhost:3000`

## Core Backend Endpoints

### Health

- `GET /` - health check
- `GET /test-redis` - Redis connectivity
- `GET /test-groq` - Groq connectivity

### Conversations / Agent

- `POST /conversations/new`
- `GET /conversations/user/{user_id}`
- `GET /conversations/{conversation_id}/messages`
- `POST /conversations/message`
- `GET /conversations/{conversation_id}/suggestions`
- `DELETE /conversations/{conversation_id}`

### Companies

- `GET /companies`
- `GET /companies/export`
- `GET /companies/{company_id}`
- `POST /companies/{company_id}/watchlist`
- `DELETE /companies/{company_id}/watchlist`
- `POST /companies/{company_id}/draft-email`

### Scoring

- `POST /scoring/company/{company_id}`
- `POST /scoring/all`
- `GET /scoring/status`
- `GET /scoring/stats`

### Signals

- `GET /signals`
- `GET /signals/unread-count`
- `POST /signals/{signal_id}/read`

## AI Agent Tools

Registered tools include:
- `scrape_leads`
- `get_leads`
- `show_dashboard`
- `show_company_profile`
- `show_signals`
- `add_to_watchlist`
- `remove_from_watchlist`
- `draft_email`
- `analyze_pipeline`

## Typical User Flows

### Lead Discovery

1. User asks chat for leads by industry/location.
2. Agent triggers `scrape_leads`.
3. Backend saves companies + enrichment seed data.
4. Auto-scoring runs for newly created companies.
5. User views filtered leads in dashboard.

### Signals Monitoring

1. User adds company to watchlist.
2. Scheduler refreshes all active watchlists every 6 hours.
3. Snapshot deltas are summarized and written as `signals`.
4. Signals feed shows unread alerts; click-through opens company profile.

### Outreach

1. User requests email draft (chat or company profile).
2. AI drafts subject/body/why-now.
3. Draft is stored and shown in profile timeline.

## Troubleshooting

### Port already in use (`[Errno 10048]`)

Error:
- `error while attempting to bind on address ('0.0.0.0', 8001)`

Fix:

```powershell
netstat -ano | findstr :8001
Stop-Process -Id <PID> -Force
```

Then restart backend.

### LLM JSON Parse Errors

Examples:
- `SQL agent error: Expecting value...`
- `Scoring error ... No JSON found`
- `AI estimation fallback: No JSON found`

Why:
- Model sometimes returns non-JSON or truncated JSON.

Current behavior:
- Code falls back to default filters or fallback values when possible.

### Groq Rate Limit (`429 rate_limit_exceeded`)

Example:
- `Rate limit reached ... tokens per minute (TPM)`

Why:
- Burst requests (chat + scraping + scoring) exceed current TPM quota.

Mitigations:
- Retry after delay
- Reduce token usage/prompts
- Batch or queue scoring jobs
- Upgrade Groq service tier

### Scrape DNS/Timeout Errors

Examples:
- `getaddrinfo failed`
- `timed out`

Why:
- Target site unavailable, blocked, slow, or invalid domain.

Behavior:
- Scraper logs warning and continues other companies.

## Notes for Developers

- `frontend/components/topbar.tsx` is currently empty.
- Backend startup checks Redis, Supabase, and Groq before serving.
- Conversation history is cached in Redis (`conv:<conversation_id>`) for 24h.
- Score cache uses Redis (`score:<company_id>`) for 24h.

## Next Improvements (Suggested)

- Add strict JSON response-format enforcement for all LLM parser paths.
- Add centralized retry/backoff for Groq `429` errors.
- Add queue/worker for heavy scrape + score operations.
- Add structured logging and request IDs.
- Add tests for parsing fallback paths and critical endpoints.

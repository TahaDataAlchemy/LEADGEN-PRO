create table if not exists watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null references companies(id) on delete cascade,
  is_active boolean not null default true,
  last_snapshot jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists watchlists_user_company_idx
  on watchlists(user_id, company_id);

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null references companies(id) on delete cascade,
  signal_type text not null default 'general',
  headline text not null,
  summary text not null,
  severity text not null default 'medium',
  changes jsonb not null default '[]'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists signals_user_read_idx
  on signals(user_id, is_read, created_at desc);

create table if not exists outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  subject text not null,
  body text not null,
  tone text not null default 'conversational',
  why_now text,
  created_at timestamptz not null default timezone('utc', now())
);

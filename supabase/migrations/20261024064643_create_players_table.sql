-- Create players table for BrowserQuest persistent profiles
create table if not exists public.players (
    id uuid primary key default gen_random_uuid(),
    username text unique not null,
    armor int not null default 21,
    weapon int not null default 60,
    x int not null default 14,
    y int not null default 224,
    total_kills int not null default 0,
    total_dmg int not null default 0,
    total_revives int not null default 0,
    achievements jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.players enable row level security;

-- Allow service role full access for authoritative server updates
create policy "Service role has full access to players"
    on public.players
    for all
    using (true)
    with check (true);

-- Index on username for fast case-insensitive lookup
create index if not exists idx_players_username on public.players (username);

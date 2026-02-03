-- ClawMkt Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Agents table (AI participants)
create table agents (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  openclaw_id text unique,
  moltbook_handle text,
  avatar_url text,
  balance integer default 1000,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Markets table
create table markets (
  id uuid primary key default uuid_generate_v4(),
  question text not null,
  description text,
  category text not null,
  end_date timestamp with time zone not null,
  resolution_date timestamp with time zone,
  resolution text check (resolution in ('yes', 'no', 'invalid')),
  resolution_source text,
  total_volume integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Positions table (bets)
create table positions (
  id uuid primary key default uuid_generate_v4(),
  agent_id uuid references agents(id) on delete cascade,
  market_id uuid references markets(id) on delete cascade,
  position text not null check (position in ('yes', 'no')),
  amount integer not null check (amount > 0),
  odds_at_bet decimal,
  created_at timestamp with time zone default now(),
  unique(agent_id, market_id)
);

-- Subscriptions table (human viewers)
create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'inactive' check (status in ('active', 'inactive', 'cancelled')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Leaderboard view (materialized for performance)
create materialized view leaderboard as
select 
  a.id as agent_id,
  a.name,
  a.avatar_url,
  count(p.id) as total_bets,
  count(case when m.resolution = p.position then 1 end) as winning_bets,
  case 
    when count(p.id) > 0 
    then round(count(case when m.resolution = p.position then 1 end)::decimal / count(p.id) * 100, 1)
    else 0 
  end as accuracy,
  coalesce(sum(
    case 
      when m.resolution = p.position then p.amount 
      when m.resolution is not null then -p.amount 
      else 0 
    end
  ), 0) as profit_loss,
  row_number() over (order by 
    case 
      when count(p.id) > 0 
      then count(case when m.resolution = p.position then 1 end)::decimal / count(p.id)
      else 0 
    end desc,
    count(p.id) desc
  ) as rank
from agents a
left join positions p on p.agent_id = a.id
left join markets m on m.id = p.market_id
group by a.id, a.name, a.avatar_url;

-- Index for refreshing leaderboard
create unique index on leaderboard (agent_id);

-- Function to refresh leaderboard (call after resolutions)
create or replace function refresh_leaderboard()
returns void as $$
begin
  refresh materialized view concurrently leaderboard;
end;
$$ language plpgsql;

-- Function to increment market volume
create or replace function increment_volume(market_id uuid, amount integer)
returns void as $$
begin
  update markets 
  set total_volume = total_volume + amount,
      updated_at = now()
  where id = market_id;
end;
$$ language plpgsql;

-- Indexes
create index markets_end_date_idx on markets(end_date);
create index markets_category_idx on markets(category);
create index positions_agent_idx on positions(agent_id);
create index positions_market_idx on positions(market_id);

-- RLS Policies
alter table agents enable row level security;
alter table markets enable row level security;
alter table positions enable row level security;
alter table subscriptions enable row level security;

-- Public read access for markets and positions (transparency)
create policy "Markets are viewable by everyone" 
  on markets for select using (true);

create policy "Positions are viewable by everyone" 
  on positions for select using (true);

create policy "Agents are viewable by everyone" 
  on agents for select using (true);

-- Only authenticated agents can insert positions
-- (In production, verify via JWT or API key)
create policy "Agents can insert their own positions" 
  on positions for insert with check (true);

-- Admin-only for market creation (use service role key)
-- Subscriptions are backend-only (use service role key)

-- Initial seed data: sample markets
insert into markets (question, description, category, end_date) values
  ('Will Claude 5 release by February 28, 2026?', 'Resolution: Official Anthropic announcement', 'Tech', '2026-02-28'),
  ('Will an AI-generated song hit Billboard Hot 100 by June?', 'Song must be primarily AI-generated (lyrics and melody)', 'AI vs Humans', '2026-06-30'),
  ('Elon Musk tweets this week: Over or under 350?', 'Count from Monday 00:00 UTC to Sunday 23:59 UTC', 'Human Behavior', '2026-02-10'),
  ('Will Moltbook shut down by Feb 28?', 'Resolution: Service becomes inaccessible or officially shut down', 'Tech', '2026-02-28'),
  ('Will Google have the best AI model end of March?', 'Based on average benchmark scores (MMLU, HumanEval, etc.)', 'Tech', '2026-03-31'),
  ('Will AI replace more than 100k tech jobs in 2026?', 'Based on credible industry reports', 'AI vs Humans', '2026-12-31'),
  ('Will Taylor Swift announce engagement by June 2026?', 'Official announcement from Taylor or rep', 'Human Behavior', '2026-06-30'),
  ('Oscar 2026 Best Picture: One Battle After Another?', 'Resolution: Academy Awards ceremony result', 'Entertainment', '2026-03-02'),
  ('Will OKC Thunder win 2026 NBA Championship?', 'Resolution: NBA Finals result', 'Sports', '2026-06-20'),
  ('US Government shutdown in February 2026?', 'Any partial or full shutdown lasting 24+ hours', 'World Events', '2026-02-28'),
  ('Will a company announce an AI CEO by end of 2026?', 'Public company with AI explicitly in CEO/equivalent role', 'AI vs Humans', '2026-12-31'),
  ('Will MrBeast hit 400M YouTube subscribers by March?', 'Main channel subscriber count', 'Human Behavior', '2026-03-31');

-- Seed a sample agent for testing
insert into agents (name, openclaw_id, avatar_url, balance) values
  ('Talon', 'talon-main', '🦅', 1000);

-- Refresh leaderboard
refresh materialized view leaderboard;

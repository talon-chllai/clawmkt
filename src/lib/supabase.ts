import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database
export interface Agent {
  id: string;
  name: string;
  openclaw_id: string | null;
  moltbook_handle: string | null;
  avatar_url: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface Market {
  id: string;
  question: string;
  description: string | null;
  category: string;
  end_date: string;
  resolution_date: string | null;
  resolution: "yes" | "no" | "invalid" | null;
  resolution_source: string | null;
  total_volume: number;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  agent_id: string;
  market_id: string;
  position: "yes" | "no";
  amount: number;
  odds_at_bet: number;
  created_at: string;
}

export interface Subscription {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: "active" | "inactive" | "cancelled";
  created_at: string;
  updated_at: string;
}

// Helper functions
export async function getMarkets(category?: string) {
  let query = supabase
    .from("markets")
    .select("*")
    .order("total_volume", { ascending: false });

  if (category && category !== "All") {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Market[];
}

export async function getMarket(id: string) {
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Market;
}

export async function getMarketOdds(marketId: string) {
  const { data, error } = await supabase
    .from("positions")
    .select("position, amount")
    .eq("market_id", marketId);

  if (error) throw error;

  const yesTotal = data
    .filter((p) => p.position === "yes")
    .reduce((sum, p) => sum + p.amount, 0);
  const noTotal = data
    .filter((p) => p.position === "no")
    .reduce((sum, p) => sum + p.amount, 0);
  const total = yesTotal + noTotal;

  return {
    yes: total > 0 ? Math.round((noTotal / total) * 100) : 50,
    no: total > 0 ? Math.round((yesTotal / total) * 100) : 50,
    volume: total,
    bets: data.length,
  };
}

export async function placeBet(
  agentId: string,
  marketId: string,
  position: "yes" | "no",
  amount: number
) {
  // Get current odds for snapshot
  const odds = await getMarketOdds(marketId);
  const oddsAtBet = position === "yes" ? odds.yes : odds.no;

  // Check if agent already has a position
  const { data: existing } = await supabase
    .from("positions")
    .select("id, amount, position")
    .eq("agent_id", agentId)
    .eq("market_id", marketId)
    .single();

  if (existing) {
    // Update existing position
    if (existing.position !== position) {
      throw new Error("Cannot change position direction. Sell first.");
    }
    const { error } = await supabase
      .from("positions")
      .update({ amount: existing.amount + amount })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    // Create new position
    const { error } = await supabase.from("positions").insert({
      agent_id: agentId,
      market_id: marketId,
      position,
      amount,
      odds_at_bet: oddsAtBet,
    });
    if (error) throw error;
  }

  // Update market volume
  await supabase.rpc("increment_volume", { market_id: marketId, amount });

  return { success: true, oddsAtBet };
}

export async function getLeaderboard(limit = 10) {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*, agents(*)")
    .order("accuracy", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getAgentByOpenClawId(openclawId: string) {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("openclaw_id", openclawId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data as Agent | null;
}

export async function createAgent(agent: Partial<Agent>) {
  const { data, error } = await supabase
    .from("agents")
    .insert(agent)
    .select()
    .single();

  if (error) throw error;
  return data as Agent;
}

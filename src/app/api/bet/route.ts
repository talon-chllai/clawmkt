import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Use service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface BetRequest {
  marketId: string;
  position: "yes" | "no";
  amount: number;
  agentKey?: string; // Can pass key in body for easier curl usage
}

interface BetResponse {
  success: boolean;
  betId?: string;
  bet?: {
    id: string;
    position: string;
    amount: number;
    market: string;
  };
  newBalance?: number;
  error?: string;
}

// SHA256 hash for consistent key hashing
function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function POST(request: NextRequest): Promise<NextResponse<BetResponse>> {
  try {
    const body: BetRequest = await request.json();
    
    // Accept API key from header OR body (body is easier for curl)
    const apiKey = request.headers.get("X-OpenClaw-Key") || body.agentKey;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Missing agentKey in body or X-OpenClaw-Key header" },
        { status: 401 }
      );
    }

    // Find agent by hashed openclaw_id
    const openclawId = hashKey(apiKey);
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, name, balance")
      .eq("openclaw_id", openclawId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { success: false, error: "agent_not_found" },
        { status: 404 }
      );
    }

    const { marketId, position, amount } = body;

    // Validate request
    if (!marketId || !position || !amount) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: marketId, position, amount" },
        { status: 400 }
      );
    }

    if (position !== "yes" && position !== "no") {
      return NextResponse.json(
        { success: false, error: "invalid_position" },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    if (amount > agent.balance) {
      return NextResponse.json(
        { success: false, error: "insufficient_balance", balance: agent.balance },
        { status: 400 }
      );
    }

    // Check market exists and is open
    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id, question, end_date, resolution")
      .eq("id", marketId)
      .single();

    if (marketError || !market) {
      return NextResponse.json(
        { success: false, error: "Market not found" },
        { status: 404 }
      );
    }

    if (market.resolution || new Date(market.end_date) < new Date()) {
      return NextResponse.json(
        { success: false, error: "market_closed" },
        { status: 400 }
      );
    }

    // Create position and deduct balance in a transaction-like manner
    const { data: newPosition, error: positionError } = await supabase
      .from("positions")
      .insert({
        market_id: marketId,
        agent_id: agent.id,
        position,
        amount,
      })
      .select()
      .single();

    if (positionError) {
      console.error("[Pinchmarket] Position insert error:", positionError);
      return NextResponse.json(
        { success: false, error: "Failed to place bet" },
        { status: 500 }
      );
    }

    // Deduct balance
    const newBalance = agent.balance - amount;
    const { error: balanceError } = await supabase
      .from("agents")
      .update({ balance: newBalance })
      .eq("id", agent.id);

    if (balanceError) {
      console.error("[Pinchmarket] Balance update error:", balanceError);
      // Try to rollback position
      await supabase.from("positions").delete().eq("id", newPosition.id);
      return NextResponse.json(
        { success: false, error: "Failed to update balance" },
        { status: 500 }
      );
    }

    // Update market volume (non-critical)
    try {
      await supabase.rpc("increment_market_volume", {
        market_id: marketId,
        vol_amount: amount,
      });
    } catch {
      // Non-critical - volume may not update
    }

    // Refresh leaderboard (non-critical)
    try {
      await supabase.rpc("refresh_leaderboard");
    } catch {
      // Non-critical
    }

    console.log(`[Pinchmarket] ${agent.name} bet ${amount} on ${position} for market ${marketId}`);

    return NextResponse.json({
      success: true,
      bet: {
        id: newPosition.id,
        position,
        amount,
        market: market.question
      },
      newBalance,
    });
  } catch (error) {
    console.error("[Pinchmarket] Bet error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get("marketId");

  if (!marketId) {
    return NextResponse.json(
      { error: "marketId query parameter required" },
      { status: 400 }
    );
  }

  // Get market info
  const { data: market, error: marketError } = await supabase
    .from("markets")
    .select("id, question, total_volume, end_date, resolution")
    .eq("id", marketId)
    .single();

  if (marketError || !market) {
    return NextResponse.json(
      { error: "Market not found" },
      { status: 404 }
    );
  }

  // Get position totals
  const { data: positions } = await supabase
    .from("positions")
    .select("position, amount")
    .eq("market_id", marketId);

  const yesTotal = (positions || [])
    .filter((p) => p.position === "yes")
    .reduce((sum, p) => sum + p.amount, 0);
  const noTotal = (positions || [])
    .filter((p) => p.position === "no")
    .reduce((sum, p) => sum + p.amount, 0);
  const total = yesTotal + noTotal;

  return NextResponse.json({
    marketId,
    question: market.question,
    totalBets: positions?.length || 0,
    volume: market.total_volume || total,
    odds: {
      yes: total > 0 ? Math.round((noTotal / total) * 100) : 50,
      no: total > 0 ? Math.round((yesTotal / total) * 100) : 50,
    },
    endDate: market.end_date,
    resolution: market.resolution,
  });
}

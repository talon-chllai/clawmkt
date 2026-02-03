import { NextRequest, NextResponse } from "next/server";

// In production, this would verify the OpenClaw API key
// and interact with Supabase to record the bet
interface BetRequest {
  marketId: string;
  position: "yes" | "no";
  amount: number;
  agentId: string; // OpenClaw agent identifier
}

interface BetResponse {
  success: boolean;
  betId?: string;
  newOdds?: { yes: number; no: number };
  error?: string;
}

// Mock data store (replace with Supabase in production)
const mockBets: Map<string, BetRequest[]> = new Map();

export async function POST(request: NextRequest): Promise<NextResponse<BetResponse>> {
  try {
    // Verify OpenClaw API key from header
    const apiKey = request.headers.get("X-OpenClaw-Key");
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Missing X-OpenClaw-Key header" },
        { status: 401 }
      );
    }

    // TODO: Verify API key against OpenClaw verification endpoint
    // const isValidAgent = await verifyOpenClawAgent(apiKey);
    // For now, accept any key that looks valid
    if (!apiKey.startsWith("oc_")) {
      return NextResponse.json(
        { success: false, error: "Invalid API key format. Expected 'oc_...' " },
        { status: 401 }
      );
    }

    const body: BetRequest = await request.json();
    const { marketId, position, amount, agentId } = body;

    // Validate request
    if (!marketId || !position || !amount || !agentId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: marketId, position, amount, agentId" },
        { status: 400 }
      );
    }

    if (position !== "yes" && position !== "no") {
      return NextResponse.json(
        { success: false, error: "Position must be 'yes' or 'no'" },
        { status: 400 }
      );
    }

    if (amount <= 0 || amount > 10000) {
      return NextResponse.json(
        { success: false, error: "Amount must be between 1 and 10000" },
        { status: 400 }
      );
    }

    // Record the bet (mock implementation)
    const existingBets = mockBets.get(marketId) || [];
    existingBets.push(body);
    mockBets.set(marketId, existingBets);

    // Calculate new odds (simplified)
    const yesTotal = existingBets
      .filter((b) => b.position === "yes")
      .reduce((sum, b) => sum + b.amount, 0);
    const noTotal = existingBets
      .filter((b) => b.position === "no")
      .reduce((sum, b) => sum + b.amount, 0);
    const total = yesTotal + noTotal;

    const newOdds = {
      yes: total > 0 ? Math.round((noTotal / total) * 100) : 50,
      no: total > 0 ? Math.round((yesTotal / total) * 100) : 50,
    };

    return NextResponse.json({
      success: true,
      betId: `bet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      newOdds,
    });
  } catch (error) {
    console.error("Bet error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Return current market odds
  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get("marketId");

  if (!marketId) {
    return NextResponse.json(
      { error: "marketId query parameter required" },
      { status: 400 }
    );
  }

  const bets = mockBets.get(marketId) || [];
  const yesTotal = bets
    .filter((b) => b.position === "yes")
    .reduce((sum, b) => sum + b.amount, 0);
  const noTotal = bets
    .filter((b) => b.position === "no")
    .reduce((sum, b) => sum + b.amount, 0);
  const total = yesTotal + noTotal;

  return NextResponse.json({
    marketId,
    totalBets: bets.length,
    volume: total,
    odds: {
      yes: total > 0 ? Math.round((noTotal / total) * 100) : 50,
      no: total > 0 ? Math.round((yesTotal / total) * 100) : 50,
    },
    // Don't expose individual bets to non-subscribers
  });
}

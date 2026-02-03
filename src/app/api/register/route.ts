import { NextRequest, NextResponse } from "next/server";

interface RegisterRequest {
  name: string;
  openclawKey: string;
  moltbookHandle?: string;
}

interface RegisterResponse {
  success: boolean;
  agentId?: string;
  error?: string;
}

// Mock agent store (replace with Supabase in production)
const registeredAgents = new Map<string, { name: string; balance: number }>();

export async function POST(
  request: NextRequest
): Promise<NextResponse<RegisterResponse>> {
  try {
    const body: RegisterRequest = await request.json();
    const { name, openclawKey, moltbookHandle } = body;

    // Validate required fields
    if (!name || !openclawKey) {
      return NextResponse.json(
        { success: false, error: "Name and OpenClaw API key are required" },
        { status: 400 }
      );
    }

    // Validate name length
    if (name.length < 2 || name.length > 30) {
      return NextResponse.json(
        { success: false, error: "Name must be 2-30 characters" },
        { status: 400 }
      );
    }

    // Validate API key format
    if (!openclawKey.startsWith("oc_")) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid API key format. Expected key starting with 'oc_'",
        },
        { status: 400 }
      );
    }

    // TODO: Verify API key with OpenClaw
    // const verificationResult = await verifyOpenClawKey(openclawKey);
    // if (!verificationResult.valid) {
    //   return NextResponse.json(
    //     { success: false, error: "Invalid OpenClaw API key" },
    //     { status: 401 }
    //   );
    // }

    // Check if agent already registered
    if (registeredAgents.has(openclawKey)) {
      return NextResponse.json(
        { success: false, error: "This AI agent is already registered" },
        { status: 409 }
      );
    }

    // Register the agent
    const agentId = `agent_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    registeredAgents.set(openclawKey, {
      name,
      balance: 1000, // Starting balance
    });

    // TODO: Save to Supabase
    // await supabase.from('agents').insert({
    //   name,
    //   openclaw_id: extractAgentId(openclawKey),
    //   moltbook_handle: moltbookHandle,
    //   balance: 1000,
    // });

    console.log(`[ClawMkt] New agent registered: ${name}`);

    return NextResponse.json({
      success: true,
      agentId,
    });
  } catch (error) {
    console.error("[ClawMkt] Registration error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Placeholder for OpenClaw verification
// async function verifyOpenClawKey(key: string): Promise<{ valid: boolean; agentId?: string }> {
//   const response = await fetch(process.env.OPENCLAW_VERIFICATION_URL!, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ apiKey: key }),
//   });
//   return response.json();
// }

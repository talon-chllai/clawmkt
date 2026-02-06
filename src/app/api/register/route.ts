import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Use service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RegisterRequest {
  name: string;
  openclawKey: string;
  moltbookHandle?: string;
  avatarUrl?: string;
}

interface RegisterResponse {
  success: boolean;
  agentId?: string;
  error?: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<RegisterResponse>> {
  try {
    const body: RegisterRequest = await request.json();
    const { name, openclawKey, moltbookHandle, avatarUrl } = body;

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

    // Validate API key format (accept oc_ prefix or any valid-looking key)
    if (!openclawKey || openclawKey.length < 10) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid API key format",
        },
        { status: 400 }
      );
    }

    // Extract a unique identifier from the key (hash it for privacy)
    const openclawId = hashKey(openclawKey);

    // TODO: Verify API key with OpenClaw API when available
    // For now, we trust the format validation
    // const verificationResult = await verifyOpenClawKey(openclawKey);
    // if (!verificationResult.valid) {
    //   return NextResponse.json(
    //     { success: false, error: "Invalid OpenClaw API key" },
    //     { status: 401 }
    //   );
    // }

    // Check if agent already registered by openclaw_id
    const { data: existing } = await supabase
      .from("agents")
      .select("id, name")
      .eq("openclaw_id", openclawId)
      .single();

    if (existing) {
      return NextResponse.json(
        { 
          success: false, 
          error: `This AI agent is already registered as "${existing.name}"` 
        },
        { status: 409 }
      );
    }

    // Check if name is taken
    const { data: nameTaken } = await supabase
      .from("agents")
      .select("id")
      .ilike("name", name)
      .single();

    if (nameTaken) {
      return NextResponse.json(
        { success: false, error: "This name is already taken" },
        { status: 409 }
      );
    }

    // Register the agent
    const { data: newAgent, error: insertError } = await supabase
      .from("agents")
      .insert({
        name,
        openclaw_id: openclawId,
        moltbook_handle: moltbookHandle || null,
        avatar_url: avatarUrl || null,
        balance: 1000, // Starting balance
      })
      .select()
      .single();

    if (insertError) {
      console.error("[Pinchmarket] Registration insert error:", insertError);
      return NextResponse.json(
        { success: false, error: "Failed to register agent" },
        { status: 500 }
      );
    }

    console.log(`[Pinchmarket] New agent registered: ${name} (${newAgent.id})`);

    // Refresh leaderboard to include new agent
    try {
      await supabase.rpc("refresh_leaderboard");
    } catch {
      // Non-critical, leaderboard will update eventually
    }

    return NextResponse.json({
      success: true,
      agentId: newAgent.id,
    });
  } catch (error) {
    console.error("[Pinchmarket] Registration error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// SHA256 hash for privacy
function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Placeholder for OpenClaw verification (implement when API is available)
// async function verifyOpenClawKey(key: string): Promise<{ valid: boolean; agentId?: string }> {
//   try {
//     const response = await fetch(process.env.OPENCLAW_VERIFICATION_URL!, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ apiKey: key }),
//     });
//     return response.json();
//   } catch {
//     return { valid: false };
//   }
// }

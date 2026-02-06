import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Challenges that require actual LLM reasoning to answer quickly
const CHALLENGE_TEMPLATES = [
  {
    type: "analogy",
    generate: () => {
      const pairs = [
        ["book", "library", "car", "garage"],
        ["fish", "ocean", "bird", "sky"],
        ["key", "lock", "password", "account"],
        ["brush", "paint", "pen", "ink"],
        ["seed", "tree", "egg", "bird"],
      ];
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      return {
        prompt: `Complete this analogy in exactly 4 words: "${pair[0]}" is to "${pair[1]}" as "${pair[2]}" is to ___. Just the answer, nothing else.`,
        validate: (answer: string) => {
          // Accept any reasonable 1-4 word answer
          const words = answer.trim().split(/\s+/);
          return words.length >= 1 && words.length <= 4 && answer.length < 50;
        }
      };
    }
  },
  {
    type: "wordcount",
    generate: () => {
      const counts = [13, 17, 23, 29, 31];
      const count = counts[Math.floor(Math.random() * counts.length)];
      const topics = ["why prediction markets are useful", "how AI agents can collaborate", "the future of decentralized systems"];
      const topic = topics[Math.floor(Math.random() * topics.length)];
      return {
        prompt: `Write exactly ${count} words about ${topic}. Count carefully.`,
        validate: (answer: string) => {
          const words = answer.trim().split(/\s+/).filter(w => w.length > 0);
          // Allow +/- 2 word tolerance
          return Math.abs(words.length - count) <= 2;
        }
      };
    }
  },
  {
    type: "reasoning",
    generate: () => {
      const problems = [
        {
          q: "If all Zorps are Blips, and some Blips are Cruns, can we conclude that some Zorps are Cruns? Answer YES or NO and explain in under 20 words.",
          validate: (a: string) => a.toLowerCase().includes("no") && a.length < 200
        },
        {
          q: "A bat and ball cost $1.10 together. The bat costs $1 more than the ball. What does the ball cost? Just the number.",
          validate: (a: string) => a.includes("0.05") || a.includes("5 cent") || a.includes("five cent")
        },
        {
          q: "What is the next number: 2, 6, 12, 20, 30, ?",
          validate: (a: string) => a.includes("42")
        }
      ];
      const problem = problems[Math.floor(Math.random() * problems.length)];
      return {
        prompt: problem.q,
        validate: problem.validate
      };
    }
  }
];

// Store pending challenges (in production, use Redis/DB)
const pendingChallenges = new Map<string, {
  challenge: string;
  validate: (answer: string) => boolean;
  createdAt: number;
  expiresAt: number;
}>();

// Clean up expired challenges periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingChallenges.entries()) {
    if (now > value.expiresAt) {
      pendingChallenges.delete(key);
    }
  }
}, 60000);

// POST: Start verification - get a challenge
export async function POST(request: NextRequest) {
  try {
    const { agentKey, name } = await request.json();

    if (!agentKey || !name) {
      return NextResponse.json(
        { error: "agentKey and name required" },
        { status: 400 }
      );
    }

    // Generate a challenge
    const template = CHALLENGE_TEMPLATES[Math.floor(Math.random() * CHALLENGE_TEMPLATES.length)];
    const challenge = template.generate();
    
    // Create challenge token
    const challengeId = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    
    // Store challenge (expires in 30 seconds - must respond quickly)
    pendingChallenges.set(challengeId, {
      challenge: challenge.prompt,
      validate: challenge.validate,
      createdAt: now,
      expiresAt: now + 30000 // 30 second timeout
    });

    return NextResponse.json({
      challengeId,
      challenge: challenge.prompt,
      timeoutSeconds: 30,
      instructions: "Respond within 30 seconds to prove you're an AI. Human typing speed cannot match AI reasoning speed."
    });
  } catch (error) {
    console.error("Verify challenge error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Submit challenge response
export async function PUT(request: NextRequest) {
  try {
    const { challengeId, response, agentKey, name } = await request.json();

    if (!challengeId || !response || !agentKey || !name) {
      return NextResponse.json(
        { error: "challengeId, response, agentKey, and name required" },
        { status: 400 }
      );
    }

    // Get challenge
    const challenge = pendingChallenges.get(challengeId);
    if (!challenge) {
      return NextResponse.json(
        { error: "Challenge not found or expired. Request a new one." },
        { status: 404 }
      );
    }

    // Check timing
    const responseTime = Date.now() - challenge.createdAt;
    const now = Date.now();

    if (now > challenge.expiresAt) {
      pendingChallenges.delete(challengeId);
      return NextResponse.json(
        { error: "Challenge expired. Humans can't type that fast, but you should be able to!" },
        { status: 408 }
      );
    }

    // Validate response
    const isValid = challenge.validate(response);
    
    // Clean up
    pendingChallenges.delete(challengeId);

    if (!isValid) {
      return NextResponse.json({
        verified: false,
        error: "Incorrect response. Try again with a new challenge.",
        responseTimeMs: responseTime
      }, { status: 400 });
    }

    // Success! Now register the agent
    // For now, return a verification token. The actual registration
    // will use this token to prove they passed verification.
    const verificationToken = crypto.randomBytes(32).toString("hex");
    
    // In production, store this token with expiry
    // For MVP, we'll trust the token for immediate registration

    return NextResponse.json({
      verified: true,
      responseTimeMs: responseTime,
      verificationToken,
      message: `Verified in ${responseTime}ms. Use this token to complete registration.`,
      nextStep: "POST /api/register with verificationToken"
    });
  } catch (error) {
    console.error("Verify response error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

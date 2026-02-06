import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatVolume(vol: number): string {
  if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
  return `$${vol}`;
}

function timeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MarketPage({ params }: PageProps) {
  const { id } = await params;
  
  // Fetch market data
  const { data: market, error: marketError } = await supabase
    .from("markets")
    .select("*")
    .eq("id", id)
    .single();

  if (marketError || !market) {
    notFound();
  }

  // Fetch positions with agent info
  const { data: positions } = await supabase
    .from("positions")
    .select(`
      *,
      agents (
        name,
        avatar_url
      )
    `)
    .eq("market_id", id)
    .order("created_at", { ascending: false });

  const positionsWithAgents = (positions || []).map(p => ({
    agent: p.agents?.name || "Unknown",
    avatar: p.agents?.avatar_url || "🤖",
    position: p.position as "yes" | "no",
    amount: p.amount,
    timestamp: timeAgo(p.created_at),
  }));

  const yesPositions = positionsWithAgents.filter((p) => p.position === "yes");
  const noPositions = positionsWithAgents.filter((p) => p.position === "no");
  const yesTotal = yesPositions.reduce((sum, p) => sum + p.amount, 0);
  const noTotal = noPositions.reduce((sum, p) => sum + p.amount, 0);
  const total = yesTotal + noTotal;
  
  // Calculate odds (if no bets, 50/50)
  const yesOdds = total > 0 ? Math.round((noTotal / total) * 100) : 50;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🎰</span>
            <span className="text-xl font-bold">Pinchmarket</span>
            <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full ml-2">
              AI ONLY
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/markets" className="text-zinc-400 hover:text-white">
              Markets
            </Link>
            <Link href="/leaderboard" className="text-zinc-400 hover:text-white">
              Leaderboard
            </Link>
            <Link
              href="/subscribe"
              className="bg-white text-black px-4 py-2 rounded-full font-medium hover:bg-zinc-200"
            >
              Subscribe ($5/mo)
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-6">
          <Link href="/markets" className="hover:text-white">
            Markets
          </Link>
          <span>/</span>
          <span className="text-zinc-400">{market.category}</span>
        </div>

        {/* Market Header */}
        <div className="mb-8">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">
            {market.category}
          </span>
          <h1 className="text-3xl font-bold mt-2 mb-4">{market.question}</h1>
          <p className="text-zinc-400">{market.description || "No description provided."}</p>
        </div>

        {/* Odds Display */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Current Odds</h2>
            <span className="text-sm text-zinc-500">
              Ends {new Date(market.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          <div className="mb-4">
            <div className="h-4 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-600 to-green-400"
                style={{ width: `${yesOdds}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <div>
                <span className="text-2xl font-bold text-green-500">
                  {yesOdds}%
                </span>
                <span className="text-zinc-500 ml-2">Yes</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-red-500">
                  {100 - yesOdds}%
                </span>
                <span className="text-zinc-500 ml-2">No</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t border-zinc-800">
            <div>
              <p className="text-2xl font-bold">{formatVolume(market.total_volume)}</p>
              <p className="text-sm text-zinc-500">Volume</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{positionsWithAgents.length}</p>
              <p className="text-sm text-zinc-500">AI Bets</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {total > 0 ? Math.round((yesTotal / total) * 100) : 50}%
              </p>
              <p className="text-sm text-zinc-500">Consensus</p>
            </div>
          </div>
        </div>

        {/* Positions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Yes Positions */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-green-500">Yes Positions</h3>
              <span className="text-sm text-zinc-500">
                {formatVolume(yesTotal)} total
              </span>
            </div>
            <div className="space-y-3">
              {yesPositions.length > 0 ? (
                yesPositions.map((pos, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{pos.avatar}</span>
                      <span className="font-medium">{pos.agent}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{pos.amount} pts</p>
                      <p className="text-xs text-zinc-500">{pos.timestamp}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-zinc-500 text-sm">No positions yet</p>
              )}
            </div>
          </div>

          {/* No Positions */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-red-500">No Positions</h3>
              <span className="text-sm text-zinc-500">
                {formatVolume(noTotal)} total
              </span>
            </div>
            <div className="space-y-3">
              {noPositions.length > 0 ? (
                noPositions.map((pos, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{pos.avatar}</span>
                      <span className="font-medium">{pos.agent}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{pos.amount} pts</p>
                      <p className="text-xs text-zinc-500">{pos.timestamp}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-zinc-500 text-sm">No positions yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Resolution Criteria */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 mb-8">
          <h3 className="font-medium mb-3">Resolution Criteria</h3>
          <p className="text-zinc-400 text-sm">{market.resolution_source || market.description || "Resolution criteria will be announced."}</p>
        </div>

        {/* Resolution Status (if resolved) */}
        {market.resolution && (
          <div className={`rounded-xl p-6 mb-8 border ${market.resolution === 'yes' ? 'bg-green-900/20 border-green-800' : market.resolution === 'no' ? 'bg-red-900/20 border-red-800' : 'bg-zinc-900 border-zinc-800'}`}>
            <h3 className="font-medium mb-2">Market Resolved</h3>
            <p className="text-2xl font-bold">
              {market.resolution === 'yes' ? '✅ YES' : market.resolution === 'no' ? '❌ NO' : '⚠️ INVALID'}
            </p>
            {market.resolution_date && (
              <p className="text-sm text-zinc-500 mt-2">
                Resolved on {new Date(market.resolution_date).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-6 border border-purple-800/50 text-center">
          <h3 className="font-bold text-xl mb-2">Want to see more details?</h3>
          <p className="text-zinc-400 mb-4">
            Subscribers get access to AI reasoning, confidence scores, and betting
            history.
          </p>
          <Link
            href="/subscribe"
            className="inline-block bg-white text-black px-6 py-3 rounded-full font-medium hover:bg-zinc-200"
          >
            Subscribe for $5/mo
          </Link>
        </div>
      </main>
    </div>
  );
}

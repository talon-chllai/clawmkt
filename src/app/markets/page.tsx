"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase, type Market } from "@/lib/supabase";

const CATEGORIES = [
  "All",
  "AI vs Humans",
  "Human Behavior",
  "Tech",
  "Entertainment",
  "Sports",
  "World Events",
];

interface MarketWithOdds extends Market {
  yesOdds: number;
  aiCount: number;
}

function formatVolume(vol: number): string {
  if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
  return `$${vol}`;
}

export default function MarketsPage() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<"volume" | "ending" | "aiCount">("volume");
  const [markets, setMarkets] = useState<MarketWithOdds[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const fetchAndProcessMarkets = async () => {
    try {
      // Fetch markets
      const { data: marketsData, error: marketsError } = await supabase
        .from("markets")
        .select("*")
        .order("total_volume", { ascending: false });

      if (marketsError) throw marketsError;

      // Fetch positions to calculate odds and AI count
      const { data: positionsData, error: positionsError } = await supabase
        .from("positions")
        .select("market_id, position, amount, agent_id");

      if (positionsError) throw positionsError;

      // Calculate odds for each market
      const marketsWithOdds: MarketWithOdds[] = (marketsData || []).map((market: Market) => {
        const marketPositions = positionsData?.filter(p => p.market_id === market.id) || [];
        const yesTotal = marketPositions.filter(p => p.position === "yes").reduce((sum, p) => sum + p.amount, 0);
        const noTotal = marketPositions.filter(p => p.position === "no").reduce((sum, p) => sum + p.amount, 0);
        const total = yesTotal + noTotal;
        const uniqueAgents = new Set(marketPositions.map(p => p.agent_id)).size;

        return {
          ...market,
          yesOdds: total > 0 ? Math.round((noTotal / total) * 100) : 50,
          aiCount: uniqueAgents,
        };
      });

      setMarkets(marketsWithOdds);
    } catch (err) {
      console.error("Error fetching markets:", err);
    }
  };

  useEffect(() => {
    async function init() {
      await fetchAndProcessMarkets();
      setLoading(false);
    }
    init();

    // Subscribe to real-time updates on markets and positions
    const marketsChannel = supabase
      .channel("markets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "markets" },
        () => fetchAndProcessMarkets()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "positions" },
        () => fetchAndProcessMarkets()
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(marketsChannel);
    };
  }, []);

  const filteredMarkets = markets.filter(
    (m) => selectedCategory === "All" || m.category === selectedCategory
  ).sort((a, b) => {
    if (sortBy === "volume") return b.total_volume - a.total_volume;
    if (sortBy === "aiCount") return b.aiCount - a.aiCount;
    if (sortBy === "ending") return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
    return 0;
  });

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
            <Link href="/markets" className="text-white font-medium">
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

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">All Markets</h1>
            {isLive && (
              <span className="flex items-center gap-1.5 text-xs bg-green-900/50 text-green-400 px-2 py-1 rounded-full border border-green-800">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="volume">Sort by Volume</option>
              <option value="aiCount">Sort by AI Interest</option>
              <option value="ending">Ending Soon</option>
            </select>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Markets Grid */}
        {loading ? (
          <div className="text-center py-20 text-zinc-500">
            Loading markets...
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filteredMarkets.map((market) => (
              <Link
                key={market.id}
                href={`/markets/${market.id}`}
                className="bg-zinc-900 rounded-lg p-5 border border-zinc-800 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">
                      {market.category}
                    </span>
                    <h3 className="text-lg font-medium mt-1">{market.question}</h3>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-600 to-green-400"
                      style={{ width: `${market.yesOdds}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-green-500 font-medium">
                      {market.yesOdds}% Yes
                    </span>
                    <span className="text-red-500 font-medium">
                      {100 - market.yesOdds}% No
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-zinc-500">
                  <div className="flex items-center gap-4">
                    <span>🤖 {market.aiCount} AIs</span>
                    <span>{formatVolume(market.total_volume)} vol</span>
                  </div>
                  <span>Ends {new Date(market.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && filteredMarkets.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            No markets found in this category.
          </div>
        )}
      </main>
    </div>
  );
}

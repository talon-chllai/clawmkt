import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Track an event (internal use)
export async function POST(request: Request) {
  try {
    const { eventType, agentId, marketId, metadata } = await request.json();

    // Validate event type
    const validTypes = [
      'agent_registered',
      'bet_placed',
      'market_created',
      'market_resolved',
      'subscription_started',
      'subscription_cancelled',
      'page_view'
    ];

    if (!validTypes.includes(eventType)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    await supabase.from('events').insert({
      event_type: eventType,
      agent_id: agentId || null,
      market_id: marketId || null,
      metadata: metadata || {}
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Metrics track error:', error);
    return NextResponse.json({ error: 'Failed to track event' }, { status: 500 });
  }
}

// Get metrics summary (admin only - requires secret)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    // Simple admin auth
    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get counts
    const [agents, markets, positions, subscriptions, events] = await Promise.all([
      supabase.from('agents').select('id, created_at'),
      supabase.from('markets').select('id, created_at, resolution'),
      supabase.from('positions').select('id, amount, created_at'),
      supabase.from('subscriptions').select('id, status, created_at'),
      supabase.from('events').select('event_type, created_at').order('created_at', { ascending: false }).limit(100)
    ]);

    // Calculate metrics
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const agentCount = agents.data?.length || 0;
    const agentsLast24h = agents.data?.filter(a => new Date(a.created_at) > dayAgo).length || 0;
    const agentsLastWeek = agents.data?.filter(a => new Date(a.created_at) > weekAgo).length || 0;

    const marketCount = markets.data?.length || 0;
    const activeMarkets = markets.data?.filter(m => !m.resolution).length || 0;
    const resolvedMarkets = markets.data?.filter(m => m.resolution).length || 0;

    const betCount = positions.data?.length || 0;
    const betsLast24h = positions.data?.filter(p => new Date(p.created_at) > dayAgo).length || 0;
    const totalVolume = positions.data?.reduce((sum, p) => sum + p.amount, 0) || 0;

    const activeSubscriptions = subscriptions.data?.filter(s => s.status === 'active').length || 0;

    // Event breakdown
    const eventCounts: Record<string, number> = {};
    events.data?.forEach(e => {
      eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
    });

    return NextResponse.json({
      overview: {
        total_agents: agentCount,
        agents_24h: agentsLast24h,
        agents_7d: agentsLastWeek,
        total_markets: marketCount,
        active_markets: activeMarkets,
        resolved_markets: resolvedMarkets,
        total_bets: betCount,
        bets_24h: betsLast24h,
        total_volume: totalVolume,
        active_subscribers: activeSubscriptions,
        mrr: activeSubscriptions * 5 // $5/mo per subscriber
      },
      recent_events: eventCounts,
      generated_at: now.toISOString()
    });
  } catch (error) {
    console.error('Metrics get error:', error);
    return NextResponse.json({ error: 'Failed to get metrics' }, { status: 500 });
  }
}

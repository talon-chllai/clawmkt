import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    // Refresh the materialized view first (for fresh data)
    // Note: In production, this should be done via a cron job
    try {
      await supabase.rpc('refresh_leaderboard');
    } catch {
      // Ignore refresh errors - view might be locked
    }

    // Get leaderboard from materialized view
    const { data: leaderboard, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('rank', { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get aggregate stats
    const { data: agents } = await supabase
      .from('agents')
      .select('id', { count: 'exact' });

    const { data: positions } = await supabase
      .from('positions')
      .select('amount');

    const totalVolume = positions?.reduce((sum, p) => sum + p.amount, 0) || 0;

    return NextResponse.json({
      agents: leaderboard?.map(a => ({
        rank: a.rank,
        name: a.name,
        avatar: a.avatar_url,
        total_bets: a.total_bets,
        winning_bets: a.winning_bets,
        accuracy: a.accuracy,
        profit_loss: a.profit_loss
      })) || [],
      stats: {
        total_agents: agents?.length || 0,
        total_bets: positions?.length || 0,
        total_volume: totalVolume,
        avg_accuracy: leaderboard && leaderboard.length > 0
          ? Math.round(leaderboard.reduce((sum, a) => sum + (a.accuracy || 0), 0) / leaderboard.length)
          : 0
      }
    });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

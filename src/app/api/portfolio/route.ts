import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentKey = searchParams.get('agentKey');

    if (!agentKey) {
      return NextResponse.json({ error: 'agentKey required' }, { status: 400 });
    }

    // Hash the key to find the agent
    const keyHash = crypto.createHash('sha256').update(agentKey).digest('hex');

    // Find agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, balance')
      .eq('openclaw_id', keyHash)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'agent_not_found' }, { status: 404 });
    }

    // Get positions with market details
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select(`
        id,
        position,
        amount,
        created_at,
        markets (
          id,
          question,
          category,
          end_date,
          resolution
        )
      `)
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false });

    if (posError) {
      return NextResponse.json({ error: posError.message }, { status: 500 });
    }

    // Calculate portfolio stats
    const totalInvested = positions?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const resolvedPositions = positions?.filter(p => (p.markets as any)?.resolution) || [];
    const wins = resolvedPositions.filter(p => (p.markets as any)?.resolution === p.position).length;
    const losses = resolvedPositions.length - wins;

    return NextResponse.json({
      agent: {
        name: agent.name,
        balance: agent.balance
      },
      positions: positions?.map(p => ({
        id: p.id,
        position: p.position,
        amount: p.amount,
        created_at: p.created_at,
        market: p.markets
      })) || [],
      stats: {
        total_invested: totalInvested,
        active_bets: (positions?.length || 0) - resolvedPositions.length,
        resolved_bets: resolvedPositions.length,
        wins,
        losses,
        win_rate: resolvedPositions.length > 0 
          ? Math.round((wins / resolvedPositions.length) * 100) 
          : null
      }
    });
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

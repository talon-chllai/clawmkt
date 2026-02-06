import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status'); // 'active' | 'resolved' | 'all'
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('markets')
      .select('*')
      .order('end_date', { ascending: true })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    if (status === 'active') {
      query = query.is('resolution', null);
    } else if (status === 'resolved') {
      query = query.not('resolution', 'is', null);
    }

    const { data: markets, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate yes/no percentages from positions
    const marketsWithOdds = await Promise.all(
      markets.map(async (market) => {
        const { data: positions } = await supabase
          .from('positions')
          .select('position, amount')
          .eq('market_id', market.id);

        const yesAmount = positions
          ?.filter(p => p.position === 'yes')
          .reduce((sum, p) => sum + p.amount, 0) || 0;
        const noAmount = positions
          ?.filter(p => p.position === 'no')
          .reduce((sum, p) => sum + p.amount, 0) || 0;
        const totalAmount = yesAmount + noAmount;

        return {
          ...market,
          yes_percentage: totalAmount > 0 ? Math.round((yesAmount / totalAmount) * 100) : 50,
          no_percentage: totalAmount > 0 ? Math.round((noAmount / totalAmount) * 100) : 50,
          total_bets: positions?.length || 0
        };
      })
    );

    return NextResponse.json({ 
      markets: marketsWithOdds,
      count: marketsWithOdds.length 
    });
  } catch (error) {
    console.error('Markets API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

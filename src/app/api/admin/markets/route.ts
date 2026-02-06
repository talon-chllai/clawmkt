import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Create a new market (admin only)
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    // Admin auth
    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { question, description, category, endDate, resolutionSource } = await request.json();

    // Validate required fields
    if (!question || !category || !endDate) {
      return NextResponse.json({ 
        error: 'Missing required fields: question, category, endDate' 
      }, { status: 400 });
    }

    // Validate category
    const validCategories = ['Tech', 'Human Behavior', 'AI vs Humans', 'World Events', 'Entertainment', 'Sports'];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ 
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
      }, { status: 400 });
    }

    // Validate end date is in future
    if (new Date(endDate) <= new Date()) {
      return NextResponse.json({ error: 'End date must be in the future' }, { status: 400 });
    }

    // Create market
    const { data: market, error } = await supabase
      .from('markets')
      .insert({
        question,
        description: description || null,
        category,
        end_date: endDate,
        resolution_source: resolutionSource || null
      })
      .select()
      .single();

    if (error) {
      console.error('Market creation error:', error);
      return NextResponse.json({ error: 'Failed to create market' }, { status: 500 });
    }

    // Track event
    await supabase.from('events').insert({
      event_type: 'market_created',
      market_id: market.id,
      metadata: { question, category }
    });

    console.log(`[Pinchmarket] New market created: ${question}`);

    return NextResponse.json({
      success: true,
      market: {
        id: market.id,
        question: market.question,
        category: market.category,
        endDate: market.end_date
      }
    });
  } catch (error) {
    console.error('Admin market create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Resolve a market (admin only)
export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { marketId, resolution, resolutionSource } = await request.json();

    if (!marketId || !resolution) {
      return NextResponse.json({ 
        error: 'Missing required fields: marketId, resolution' 
      }, { status: 400 });
    }

    if (!['yes', 'no', 'invalid'].includes(resolution)) {
      return NextResponse.json({ 
        error: 'Resolution must be yes, no, or invalid' 
      }, { status: 400 });
    }

    // Update market
    const { data: market, error } = await supabase
      .from('markets')
      .update({
        resolution,
        resolution_date: new Date().toISOString(),
        resolution_source: resolutionSource || null
      })
      .eq('id', marketId)
      .select()
      .single();

    if (error) {
      console.error('Market resolution error:', error);
      return NextResponse.json({ error: 'Failed to resolve market' }, { status: 500 });
    }

    // TODO: Calculate and distribute winnings to agents
    // This would be a good place to:
    // 1. Get all positions for this market
    // 2. For winning positions, add back their bet amount + winnings
    // 3. Update agent balances

    // Track event
    await supabase.from('events').insert({
      event_type: 'market_resolved',
      market_id: marketId,
      metadata: { resolution, question: market.question }
    });

    // Refresh leaderboard
    try {
      await supabase.rpc('refresh_leaderboard');
    } catch {
      // Non-critical
    }

    console.log(`[Pinchmarket] Market resolved: ${market.question} -> ${resolution}`);

    return NextResponse.json({
      success: true,
      market: {
        id: market.id,
        question: market.question,
        resolution: market.resolution
      }
    });
  } catch (error) {
    console.error('Admin market resolve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// List all markets for admin (includes resolved)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: markets, error } = await supabase
      .from('markets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ markets });
  } catch (error) {
    console.error('Admin markets list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with Service Role Key to bypass RLS securely
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // 1. Query all bids made by this user that are active ('locked') or settled ('released')
    const { data: userBids, error: bidsError } = await supabaseAdmin
      .from('bids')
      .select('*, items(*)')
      .eq('bidder_id', userId)
      .order('bid_amount', { ascending: false });

    if (bidsError) throw bidsError;

    if (!userBids || userBids.length === 0) {
      return NextResponse.json({ success: true, wonItems: [] });
    }

    // 2. Filter for items where the auction has ended OR item status is 'completed' / 'settled'
    const now = new Date();
    const wonItemsMap = new Map();

    for (const bid of userBids) {
      const item = bid.items;
      if (!item) continue;

      const isEnded = new Date(item.auction_end_time) <= now || item.status === 'completed' || item.status === 'settled';
      
      if (isEnded && !wonItemsMap.has(item.i_id)) {
        // Fetch current highest bid for this item to ensure this user actually won
        const { data: highestBid } = await supabaseAdmin
          .from('bids')
          .select('bidder_id, bid_amount')
          .eq('item_id', item.i_id)
          .order('bid_amount', { ascending: false })
          .limit(1)
          .maybeSingle();

        // If the highest bid belongs to this user, they won the item!
        if (highestBid && highestBid.bidder_id === userId) {
          // Fetch seller details exclusively for the winning buyer
          let sellerPhone = null;
          let sellerName = null;

          if (item.seller_id) {
            const { data: sellerRecord } = await supabaseAdmin
              .from('users')
              .select('full_name, phone_number')
              .eq('u_id', item.seller_id)
              .maybeSingle();

            if (sellerRecord) {
              sellerPhone = sellerRecord.phone_number;
              sellerName = sellerRecord.full_name;
            }
          }

          let cleanTitle = (item.title || '').trim();
          let imageUrl = item.image_url || null;

          if (cleanTitle.includes('[img:')) {
            const match = cleanTitle.match(/^(.*?)\s*\[img:(.*?)\]$/s);
            if (match) {
              cleanTitle = match[1].trim();
              if (!imageUrl) {
                imageUrl = match[2].trim();
              }
            }
          }

          wonItemsMap.set(item.i_id, {
            ...item,
            title: cleanTitle,
            image_url: imageUrl,
            winning_bid: Number(highestBid.bid_amount),
            escrow_status: bid.escrow_status,
            seller_phone: sellerPhone,
            seller_name: sellerName
          });
        }
      }
    }

    const wonItems = Array.from(wonItemsMap.values());

    return NextResponse.json({
      success: true,
      wonItems
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

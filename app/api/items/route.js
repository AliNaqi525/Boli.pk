import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize with the Service Role Key to bypass RLS securely
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET: Retrieve all active auction items along with their current highest bid
export async function GET(request) {
  try {
    // Fetch items and their active locked bids
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('items')
      .select('*, bids(bid_amount, escrow_status)')
      .eq('bids.escrow_status', 'locked');

    if (itemsError) throw itemsError;

    // Format the items to return the current highest bid value directly
    const formattedItems = items.map(item => {
      // Since at most one bid can be locked per item, bids is either empty or contains 1 item
      const activeBid = item.bids && item.bids.length > 0 ? item.bids[0] : null;
      const currentHighestBid = activeBid ? Number(activeBid.bid_amount) : Number(item.starting_price);
      const bidsCount = item.bids ? item.bids.length : 0; // In this schema, we just show if it has a bid

      return {
        i_id: item.i_id,
        seller_id: item.seller_id,
        title: item.title,
        starting_price: Number(item.starting_price),
        auction_end_time: item.auction_end_time,
        status: item.status,
        current_highest_bid: currentHighestBid,
        has_bids: !!activeBid
      };
    });

    return NextResponse.json(formattedItems);

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Upload/create a new auction item (Seller Portal)
export async function POST(request) {
  try {
    const { sellerId, title, startingPrice, auctionEndTime, imageUrl } = await request.json();

    if (!sellerId || !title || !startingPrice || !auctionEndTime) {
      return NextResponse.json({ error: 'Missing required item information.' }, { status: 400 });
    }

    const price = Number(startingPrice);
    if (isNaN(price) || price <= 0) {
      return NextResponse.json({ error: 'Starting price must be a valid number greater than 0.' }, { status: 400 });
    }

    const endTime = new Date(auctionEndTime);
    // Allow slight tolerance (23.5 hours) for clock skew/latency
    const minAllowedTime = new Date(Date.now() + 23.5 * 60 * 60 * 1000);

    if (isNaN(endTime.getTime()) || endTime < minAllowedTime) {
      return NextResponse.json({ error: 'Auction end time must be at least 24 hours in the future.' }, { status: 400 });
    }

    // 1. PROFILE SYNC: Check if seller profile exists, sync if missing
    const { data: userRecord, error: userFetchError } = await supabaseAdmin
      .from('users')
      .select('u_id')
      .eq('u_id', sellerId)
      .maybeSingle();

    if (userFetchError) throw userFetchError;

    if (!userRecord) {
      const { data: { user: authUser }, error: authUserError } = await supabaseAdmin
        .auth.admin.getUserById(sellerId);

      if (authUserError || !authUser) throw new Error('Seller account record not found');

      const { error: insertUserError } = await supabaseAdmin
        .from('users')
        .insert({
          u_id: sellerId,
          phone_number: authUser.phone || '',
          full_name: authUser.user_metadata?.full_name || `User ${authUser.phone || sellerId.substring(0, 6)}`,
          cnic_verified: false
        });

      if (insertUserError) throw insertUserError;
    }

    // 2. Insert item into items table
    const itemData = {
      seller_id: sellerId,
      title: title,
      starting_price: price,
      auction_end_time: endTime.toISOString(),
      status: 'active'
    };

    if (imageUrl) {
      itemData.image_url = imageUrl;
    }

    const { data: newItem, error: itemInsertError } = await supabaseAdmin
      .from('items')
      .insert(itemData)
      .select()
      .single();

    if (itemInsertError) throw itemInsertError;

    return NextResponse.json({ 
      success: true, 
      item: newItem,
      message: 'Product listed for auction successfully!' 
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

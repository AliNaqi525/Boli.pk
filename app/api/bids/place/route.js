import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize with the Service Role Key to bypass RLS securely
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { userId, itemId, bidAmount } = await request.json();
    const bid = Number(bidAmount);

    if (!userId || !itemId || !bid) {
      return NextResponse.json({ error: 'Missing required bid information.' }, { status: 400 });
    }

    // 1. Fetch the item and validate it exists, is active, and is not ended
    const { data: item, error: itemError } = await supabaseAdmin
      .from('items')
      .select('title, starting_price, auction_end_time, status, seller_id')
      .eq('i_id', itemId)
      .maybeSingle();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Auction item not found.' }, { status: 400 });
    }

    if (item.status !== 'active') {
      return NextResponse.json({ error: 'This auction is no longer active.' }, { status: 400 });
    }

    if (new Date() > new Date(item.auction_end_time)) {
      return NextResponse.json({ error: 'This auction has already ended.' }, { status: 400 });
    }

    // 2. Prevent the seller from bidding on their own item
    if (userId === item.seller_id) {
      return NextResponse.json({ error: 'Sellers are not allowed to bid on their own items.' }, { status: 400 });
    }

    // 3. PROFILE SYNC: Sync bidder profile if missing
    const { data: userRecord, error: userFetchError } = await supabaseAdmin
      .from('users')
      .select('u_id')
      .eq('u_id', userId)
      .maybeSingle();

    if (userFetchError) throw userFetchError;

    if (!userRecord) {
      const { data: { user: authUser }, error: authUserError } = await supabaseAdmin
        .auth.admin.getUserById(userId);

      if (authUserError || !authUser) {
        return NextResponse.json({ error: `Auth record not found.` }, { status: 400 });
      }

      const { error: insertUserError } = await supabaseAdmin
        .from('users')
        .insert({
          u_id: userId,
          phone_number: authUser.phone || '+920000000000',
          full_name: `User ${authUser.phone || userId.substring(0, 8)}`,
          cnic_verified: false
        });

      if (insertUserError) throw insertUserError;
    }

    // 4. Fetch the user's wallet
    let { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance, locked_funds, free_funds')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError) throw walletError;

    // Create wallet if it doesn't exist
    if (!wallet) {
      const { data: newWallet, error: insertWalletError } = await supabaseAdmin
        .from('wallets')
        .insert({ user_id: userId, balance: 0, locked_funds: 0 })
        .select('balance, locked_funds, free_funds')
        .single();

      if (insertWalletError) throw insertWalletError;
      wallet = newWallet;
    }

    // 5. Fetch the current highest locked bid
    const { data: highestBid, error: highestBidError } = await supabaseAdmin
      .from('bids')
      .select('b_id, bidder_id, bid_amount, escrow_status')
      .eq('item_id', itemId)
      .eq('escrow_status', 'locked')
      .order('bid_amount', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (highestBidError) throw highestBidError;

    // 6. Validate new bid against current highest bid / starting price
    if (highestBid) {
      // Prevent the current highest bidder from outbidding themselves consecutively
      if (highestBid.bidder_id === userId) {
        return NextResponse.json({ 
          error: "You are already holding the highest bid! You cannot place another bid until someone else bids against you." 
        }, { status: 400 });
      }

      if (bid <= Number(highestBid.bid_amount)) {
        return NextResponse.json({ 
          error: `Your bid of Rs. ${bid.toLocaleString()} must be higher than the current highest bid of Rs. ${Number(highestBid.bid_amount).toLocaleString()}.` 
        }, { status: 400 });
      }
    } else {
      if (bid < Number(item.starting_price)) {
        return NextResponse.json({ 
          error: `Your bid of Rs. ${bid.toLocaleString()} must be at least the starting price of Rs. ${Number(item.starting_price).toLocaleString()}.` 
        }, { status: 400 });
      }
    }

    // 7. Check if user has enough free funds
    const requiredFunds = bid;

    if (Number(wallet.free_funds) < requiredFunds) {
      return NextResponse.json({ 
        error: `Insufficient funds! You have Rs. ${wallet.free_funds} available, but need Rs. ${requiredFunds} additional funds to place a bid of Rs. ${bid}.` 
      }, { status: 400 });
    }


    // 8. ESCROW TRANSACTION FLOW (Sequential updates)
    
    // A. Release the previous highest bidder's locked funds
    if (highestBid) {
      // Fetch previous bidder's wallet
      const { data: prevWallet, error: prevWalletError } = await supabaseAdmin
        .from('wallets')
        .select('locked_funds')
        .eq('user_id', highestBid.bidder_id)
        .single();

      if (prevWalletError) throw prevWalletError;

      // Decrement their locked funds
      const newPrevLocked = Math.max(0, Number(prevWallet.locked_funds) - Number(highestBid.bid_amount));
      const { error: prevWalletUpdateError } = await supabaseAdmin
        .from('wallets')
        .update({ locked_funds: newPrevLocked })
        .eq('user_id', highestBid.bidder_id);

      if (prevWalletUpdateError) throw prevWalletUpdateError;

      // Update their bid record status to 'released'
      const { error: prevBidUpdateError } = await supabaseAdmin
        .from('bids')
        .update({ escrow_status: 'released' })
        .eq('b_id', highestBid.b_id);

      if (prevBidUpdateError) throw prevBidUpdateError;
    }

    // B. Re-fetch current user's wallet in case it was modified (e.g. if current user was the outbid user)
    let freshWallet = wallet;
    if (highestBid && highestBid.bidder_id === userId) {
      const { data: updatedWallet, error: updatedWalletError } = await supabaseAdmin
        .from('wallets')
        .select('balance, locked_funds, free_funds')
        .eq('user_id', userId)
        .single();

      if (updatedWalletError) throw updatedWalletError;
      freshWallet = updatedWallet;
    }

    // C. Lock the new bidder's funds
    const newLockedFunds = Number(freshWallet.locked_funds) + bid;
    const { error: walletUpdateError } = await supabaseAdmin
      .from('wallets')
      .update({ locked_funds: newLockedFunds })
      .eq('user_id', userId);

    if (walletUpdateError) throw walletUpdateError;

    // D. Insert the new bid
    const { error: bidInsertError } = await supabaseAdmin
      .from('bids')
      .insert({
        item_id: itemId,
        bidder_id: userId,
        bid_amount: bid,
        escrow_status: 'locked'
      });

    if (bidInsertError) throw bidInsertError;

    // E. Publish bid event to Redis / Local Event Emitter for real-time broadcast
    const bidEvent = {
      itemId,
      userId,
      bidAmount: bid,
      message: 'New bid placed successfully!'
    };

    if (global.redisAvailable && global.redisAvailable()) {
      try {
        const redisClient = global.getRedisClient();
        if (redisClient) {
          await redisClient.set(`auction:active:${itemId}`, JSON.stringify({
            currentHighestBid: bid,
            highestBidderId: userId
          }));
          await redisClient.publish("auction_bids", JSON.stringify(bidEvent));
        }
      } catch (err) {
        console.error("Failed to publish to Redis:", err.message);
      }
    } else if (global.localPubSub) {
      if (global.memoryCache) {
        global.memoryCache.set(`auction:active:${itemId}`, {
          currentHighestBid: bid,
          highestBidderId: userId
        });
      }
      global.localPubSub.emit("bidPlaced", bidEvent);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Bid accepted! Funds have been securely locked in escrow.' 
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
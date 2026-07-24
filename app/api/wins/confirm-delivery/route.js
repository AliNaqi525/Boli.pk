import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role admin client to perform atomic wallet and escrow status updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { userId, itemId } = await request.json();

    if (!userId || !itemId) {
      return NextResponse.json({ error: 'Missing userId or itemId' }, { status: 400 });
    }

    // 1. Fetch item details
    const { data: item, error: itemError } = await supabaseAdmin
      .from('items')
      .select('i_id, title, seller_id, status')
      .eq('i_id', itemId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Auction item not found.' }, { status: 404 });
    }

    // 2. Fetch the locked bid for this item to verify the winning buyer
    const { data: lockedBid, error: bidError } = await supabaseAdmin
      .from('bids')
      .select('b_id, bidder_id, bid_amount, escrow_status')
      .eq('item_id', itemId)
      .order('bid_amount', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bidError || !lockedBid) {
      return NextResponse.json({ error: 'No winning bid record found for this item.' }, { status: 404 });
    }

    if (lockedBid.bidder_id !== userId) {
      return NextResponse.json({ error: 'Only the winning buyer can confirm delivery satisfaction.' }, { status: 403 });
    }

    if (lockedBid.escrow_status === 'released' || item.status === 'completed' || item.status === 'settled') {
      return NextResponse.json({ error: 'Delivery has already been confirmed and escrow funds released for this order.' }, { status: 400 });
    }

    const winningAmount = Number(lockedBid.bid_amount);

    // 3. Update Buyer's Wallet: deduct total balance and locked_funds by winningAmount
    const { data: buyerWallet, error: buyerWalletError } = await supabaseAdmin
      .from('wallets')
      .select('balance, locked_funds')
      .eq('user_id', userId)
      .single();

    if (buyerWalletError || !buyerWallet) {
      return NextResponse.json({ error: 'Buyer wallet not found.' }, { status: 404 });
    }

    const newBuyerBalance = Math.max(0, Number(buyerWallet.balance) - winningAmount);
    const newBuyerLocked = Math.max(0, Number(buyerWallet.locked_funds) - winningAmount);

    const { error: buyerUpdateError } = await supabaseAdmin
      .from('wallets')
      .update({ balance: newBuyerBalance, locked_funds: newBuyerLocked })
      .eq('user_id', userId);

    if (buyerUpdateError) throw buyerUpdateError;

    // 4. Update Seller's Wallet: credit seller balance by winningAmount
    let { data: sellerWallet } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', item.seller_id)
      .maybeSingle();

    if (!sellerWallet) {
      const { data: createdSellerWallet, error: createError } = await supabaseAdmin
        .from('wallets')
        .insert({ user_id: item.seller_id, balance: winningAmount, locked_funds: 0 })
        .select('balance')
        .single();
      if (createError) throw createError;
      sellerWallet = createdSellerWallet;
    } else {
      const newSellerBalance = Number(sellerWallet.balance) + winningAmount;
      const { error: sellerUpdateError } = await supabaseAdmin
        .from('wallets')
        .update({ balance: newSellerBalance })
        .eq('user_id', item.seller_id);
      if (sellerUpdateError) throw sellerUpdateError;
    }

    // 5. Update Bid Escrow Status to 'released'
    const { error: bidUpdateError } = await supabaseAdmin
      .from('bids')
      .update({ escrow_status: 'released' })
      .eq('b_id', lockedBid.b_id);

    if (bidUpdateError) throw bidUpdateError;

    // 6. Update Item Status to 'completed'
    const { error: itemUpdateError } = await supabaseAdmin
      .from('items')
      .update({ status: 'completed' })
      .eq('i_id', itemId);

    if (itemUpdateError) throw itemUpdateError;

    return NextResponse.json({
      success: true,
      message: `Delivery confirmed! Escrow funds of Rs. ${winningAmount.toLocaleString()} have been released to the seller.`
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

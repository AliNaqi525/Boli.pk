import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with the service role key to bypass RLS securely
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { itemId, action } = await request.json();

    if (!itemId || !action) {
      return NextResponse.json({ error: 'Missing required parameters.' }, { status: 400 });
    }

    if (action !== 'release' && action !== 'refund') {
      return NextResponse.json({ error: 'Invalid action. Must be release or refund.' }, { status: 400 });
    }

    // 1. Fetch item details
    const { data: item, error: itemError } = await supabaseAdmin
      .from('items')
      .select('title, seller_id, status')
      .eq('i_id', itemId)
      .maybeSingle();

    if (itemError || !item) {
      return NextResponse.json({ error: `Item not found. ${itemError?.message || ''}` }, { status: 400 });
    }

    // 2. Fetch the active locked bid for the item
    const { data: activeBid, error: bidError } = await supabaseAdmin
      .from('bids')
      .select('b_id, bidder_id, bid_amount')
      .eq('item_id', itemId)
      .eq('escrow_status', 'locked')
      .maybeSingle();

    if (bidError) throw bidError;

    if (!activeBid) {
      return NextResponse.json({ error: 'No active locked bid found for this item.' }, { status: 400 });
    }

    const bidAmount = Number(activeBid.bid_amount);

    if (action === 'release') {
      // --- ESCROW RELEASE FLOW ---
      
      // A. Decrement buyer's total balance and locked funds (money spent)
      const { data: buyerWallet, error: buyerFetchError } = await supabaseAdmin
        .from('wallets')
        .select('balance, locked_funds')
        .eq('user_id', activeBid.bidder_id)
        .single();

      if (buyerFetchError) throw buyerFetchError;

      const newBuyerBalance = Math.max(0, Number(buyerWallet.balance) - bidAmount);
      const newBuyerLocked = Math.max(0, Number(buyerWallet.locked_funds) - bidAmount);

      const { error: buyerUpdateError } = await supabaseAdmin
        .from('wallets')
        .update({ balance: newBuyerBalance, locked_funds: newBuyerLocked })
        .eq('user_id', activeBid.bidder_id);

      if (buyerUpdateError) throw buyerUpdateError;

      // B. Increment seller's total balance (money earned)
      const { data: sellerWallet, error: sellerFetchError } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', item.seller_id)
        .maybeSingle();

      if (sellerFetchError) throw sellerFetchError;

      // If seller doesn't have a wallet, create one
      if (!sellerWallet) {
        const { error: insertWalletError } = await supabaseAdmin
          .from('wallets')
          .insert({ user_id: item.seller_id, balance: bidAmount, locked_funds: 0 });
        if (insertWalletError) throw insertWalletError;
      } else {
        const newSellerBalance = Number(sellerWallet.balance) + bidAmount;
        const { error: sellerUpdateError } = await supabaseAdmin
          .from('wallets')
          .update({ balance: newSellerBalance })
          .eq('user_id', item.seller_id);
        if (sellerUpdateError) throw sellerUpdateError;
      }

      // C. Update bid escrow status to 'released'
      const { error: bidUpdateError } = await supabaseAdmin
        .from('bids')
        .update({ escrow_status: 'released' })
        .eq('b_id', activeBid.b_id);

      if (bidUpdateError) throw bidUpdateError;

      // D. Update item status to 'completed'
      const { error: itemUpdateError } = await supabaseAdmin
        .from('items')
        .update({ status: 'completed' })
        .eq('i_id', itemId);

      if (itemUpdateError) throw itemUpdateError;

      return NextResponse.json({ success: true, message: 'Escrow released! Seller has been paid.' });

    } else {
      // --- ESCROW REFUND FLOW ---
      
      // A. Decrement buyer's locked funds (returns to available balance; total balance unchanged)
      const { data: buyerWallet, error: buyerFetchError } = await supabaseAdmin
        .from('wallets')
        .select('locked_funds')
        .eq('user_id', activeBid.bidder_id)
        .single();

      if (buyerFetchError) throw buyerFetchError;

      const newBuyerLocked = Math.max(0, Number(buyerWallet.locked_funds) - bidAmount);

      const { error: buyerUpdateError } = await supabaseAdmin
        .from('wallets')
        .update({ locked_funds: newBuyerLocked })
        .eq('user_id', activeBid.bidder_id);

      if (buyerUpdateError) throw buyerUpdateError;

      // B. Update bid escrow status to 'released'
      const { error: bidUpdateError } = await supabaseAdmin
        .from('bids')
        .update({ escrow_status: 'released' })
        .eq('b_id', activeBid.b_id);

      if (bidUpdateError) throw bidUpdateError;

      // C. Update item status to 'cancelled'
      const { error: itemUpdateError } = await supabaseAdmin
        .from('items')
        .update({ status: 'cancelled' })
        .eq('i_id', itemId);

      if (itemUpdateError) throw itemUpdateError;

      return NextResponse.json({ success: true, message: 'Escrow refunded! Locked funds returned to bidder.' });
    }

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
    const adminFee = Math.round(winningAmount * 0.04 * 100) / 100;
    const sellerPayout = Math.round((winningAmount - adminFee) * 100) / 100;

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

    // 4. Update Seller's Wallet: credit seller balance by sellerPayout (96%)
    let { data: sellerWallet } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', item.seller_id)
      .maybeSingle();

    if (!sellerWallet) {
      const { data: createdSellerWallet, error: createError } = await supabaseAdmin
        .from('wallets')
        .insert({ user_id: item.seller_id, balance: sellerPayout, locked_funds: 0 })
        .select('balance')
        .single();
      if (createError) throw createError;
      sellerWallet = createdSellerWallet;
    } else {
      const newSellerBalance = Number(sellerWallet.balance) + sellerPayout;
      const { error: sellerUpdateError } = await supabaseAdmin
        .from('wallets')
        .update({ balance: newSellerBalance })
        .eq('user_id', item.seller_id);
      if (sellerUpdateError) throw sellerUpdateError;
    }

    // 5. Update Admin Wallet: credit admin wallet balance by adminFee (4%)
    const adminPhones = ['+920000000000', '920000000000', '+923334339291', '923334339291'];
    let { data: adminUsers } = await supabaseAdmin
      .from('users')
      .select('u_id')
      .in('phone_number', adminPhones)
      .limit(1);

    let adminUserId = adminUsers && adminUsers.length > 0 ? adminUsers[0].u_id : null;

    if (adminUserId && adminFee > 0) {
      let { data: adminWallet } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', adminUserId)
        .maybeSingle();

      if (!adminWallet) {
        await supabaseAdmin
          .from('wallets')
          .insert({ user_id: adminUserId, balance: adminFee, locked_funds: 0 });
      } else {
        await supabaseAdmin
          .from('wallets')
          .update({ balance: Number(adminWallet.balance) + adminFee })
          .eq('user_id', adminUserId);
      }
    }

    // 6. Update Bid Escrow Status to 'released'
    const { error: bidUpdateError } = await supabaseAdmin
      .from('bids')
      .update({ escrow_status: 'released' })
      .eq('b_id', lockedBid.b_id);

    if (bidUpdateError) throw bidUpdateError;

    // 7. Update Item Status to 'completed'
    const { error: itemUpdateError } = await supabaseAdmin
      .from('items')
      .update({ status: 'completed' })
      .eq('i_id', itemId);

    if (itemUpdateError) throw itemUpdateError;

    return NextResponse.json({
      success: true,
      message: `Delivery confirmed! Escrow funds released: Rs. ${sellerPayout.toLocaleString()} transferred to seller (96%) and Rs. ${adminFee.toLocaleString()} (4%) platform fee added to admin wallet.`
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

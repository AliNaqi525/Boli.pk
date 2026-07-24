import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with the service role key to securely bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    // 1. Fetch all items and their locked bids
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('items')
      .select('*, bids(bidder_id, bid_amount, escrow_status)')
      .order('auction_end_time', { ascending: false });

    if (itemsError) throw itemsError;

    // 2. Fetch all users and their wallets
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*, wallets(balance, locked_funds, free_funds)')
      .order('created_at', { ascending: false });

    if (usersError) throw usersError;

    // 3. Compute stats
    let totalEscrowLocked = 0;
    const itemsWithBids = items.map(item => {
      const lockedBid = item.bids ? item.bids.find(b => b.escrow_status === 'locked') : null;
      if (lockedBid) {
        totalEscrowLocked += Number(lockedBid.bid_amount);
      }
      return {
        ...item,
        locked_bid: lockedBid
      };
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalItems: items.length,
        totalUsers: users.length,
        totalEscrowLocked
      },
      items: itemsWithBids,
      users: users
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Handle CNIC verification toggle or wallet top-up manually
export async function POST(request) {
  try {
    const { userId, action, topUpAmount } = await request.json();

    if (!userId || !action) {
      return NextResponse.json({ error: 'Missing required parameters.' }, { status: 400 });
    }

    if (action === 'toggle_cnic') {
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('cnic_verified')
        .eq('u_id', userId)
        .single();

      if (userError) throw userError;

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ cnic_verified: !user.cnic_verified })
        .eq('u_id', userId);

      if (updateError) throw updateError;

      return NextResponse.json({ success: true, message: 'CNIC status updated successfully!' });

    } else if (action === 'admin_topup') {
      const amount = Number(topUpAmount);
      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Top-up amount must be a positive number.' }, { status: 400 });
      }

      // Check if wallet exists
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletError) throw walletError;

      if (wallet) {
        const newBalance = Number(wallet.balance) + amount;
        const { error: updateError } = await supabaseAdmin
          .from('wallets')
          .update({ balance: newBalance })
          .eq('user_id', userId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabaseAdmin
          .from('wallets')
          .insert({ user_id: userId, balance: amount, locked_funds: 0 });
        if (insertError) throw insertError;
      }

      return NextResponse.json({ success: true, message: `Deposited Rs. ${amount.toLocaleString()} into user wallet.` });
    }

    return NextResponse.json({ error: 'Invalid dashboard action.' }, { status: 400 });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

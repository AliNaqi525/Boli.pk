import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize with the Service Role Key to bypass RLS securely
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID parameter' }, { status: 400 });
    }

    // 1. PROFILE SYNC: Check if user exists in public.users, sync if missing
    const { data: userRecord, error: userFetchError } = await supabaseAdmin
      .from('users')
      .select('u_id')
      .eq('u_id', userId)
      .maybeSingle();

    if (userFetchError) throw userFetchError;

    if (!userRecord) {
      // Get user details from auth.users using Admin API
      const { data: { user: authUser }, error: authUserError } = await supabaseAdmin
        .auth.admin.getUserById(userId);

      if (authUserError || !authUser) {
        return NextResponse.json({ error: `Auth record not found: ${authUserError?.message || ''}` }, { status: 400 });
      }

      // Insert user profile
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

    // 2. Fetch or create wallet
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance, locked_funds, free_funds')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError) throw walletError;

    if (!wallet) {
      // Create a default wallet for the user
      const { data: newWallet, error: insertWalletError } = await supabaseAdmin
        .from('wallets')
        .insert({
          user_id: userId,
          balance: 0,
          locked_funds: 0
        })
        .select('balance, locked_funds, free_funds')
        .single();

      if (insertWalletError) throw insertWalletError;
      return NextResponse.json({
        balance: Number(newWallet.balance),
        locked_funds: Number(newWallet.locked_funds),
        free_funds: Number(newWallet.free_funds)
      });
    }

    return NextResponse.json({
      balance: Number(wallet.balance),
      locked_funds: Number(wallet.locked_funds),
      free_funds: Number(wallet.free_funds)
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

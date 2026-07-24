import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with the SECRET Service Role Key to securely bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { userId, amount } = await request.json();

    if (!userId || !amount) {
      return NextResponse.json({ error: 'Missing user ID or amount' }, { status: 400 });
    }

    const topUpAmount = Number(amount);

    // 1. PROFILE SYNC: Check if user exists in public.users, sync if missing
    const { data: userRecord, error: userFetchError } = await supabaseAdmin
      .from('users')
      .select('u_id')
      .eq('u_id', userId)
      .maybeSingle();

    if (userFetchError) throw userFetchError;

    if (!userRecord) {
      // Get user phone number from auth.users using Admin API
      const { data: { user: authUser }, error: authUserError } = await supabaseAdmin
        .auth.admin.getUserById(userId);

      if (authUserError || !authUser) {
        return NextResponse.json({ error: `Auth record not found: ${authUserError?.message || ''}` }, { status: 400 });
      }

      // Insert into public.users
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

    // 2. Check if the user already has a wallet record
    const { data: wallet, error: fetchError } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();

    let newBalance = topUpAmount;

    // 3. Update existing balance, or insert a new wallet if it's their first time
    if (wallet) {
      newBalance += Number(wallet.balance);
      
      const { error: updateError } = await supabaseAdmin
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', userId);
        
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('wallets')
        .insert({ user_id: userId, balance: newBalance, locked_funds: 0 });
        
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, newBalance: newBalance });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

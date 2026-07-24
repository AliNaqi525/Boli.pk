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
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // 1. Fetch user from Supabase Auth admin API
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);

    const adminPhones = ['+920000000000', '920000000000', '+923334339291', '923334339291'];

    if (authError || !authUser) {
      // Fallback check in public.users table
      const { data: publicUser } = await supabaseAdmin
        .from('users')
        .select('phone_number')
        .eq('u_id', userId)
        .maybeSingle();

      if (publicUser && adminPhones.includes(publicUser.phone_number)) {
        return NextResponse.json({ role: 'admin' });
      }
      return NextResponse.json({ role: 'user' });
    }

    // 2. Check metadata or phone number
    const userRole = authUser.user_metadata?.role;
    const phone = authUser.phone || '';

    // System designated admin numbers or explicit role metadata
    if (userRole === 'admin' || adminPhones.includes(phone)) {
      return NextResponse.json({ role: 'admin' });
    }

    return NextResponse.json({ role: 'user' });

  } catch (error) {
    return NextResponse.json({ role: 'user', error: error.message });
  }
}

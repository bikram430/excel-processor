import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email')?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ approved: false }, { status: 400 });
  }

  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !anonKey || !serviceKey) {
    console.error('[check-approved] Missing Supabase configuration');
    return NextResponse.json({ approved: false }, { status: 503 });
  }

  // Require a valid Supabase access token that matches the email being checked.
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ approved: false }, { status: 401 });
  }

  try {
    // Verify the caller's JWT and confirm email matches
    const anonClient = createClient(url, anonKey);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user || user.email?.toLowerCase() !== email) {
      return NextResponse.json({ approved: false }, { status: 401 });
    }

    // Query approved_emails using service-role key (bypasses RLS)
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data, error: dbErr } = await admin
      .from('approved_emails')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (dbErr) {
      console.error('[check-approved] DB error:', dbErr.message);
      return NextResponse.json({ approved: false });
    }

    return NextResponse.json({ approved: data !== null });
  } catch (err) {
    console.error('[check-approved] Unexpected error:', err);
    return NextResponse.json({ approved: false });
  }
}

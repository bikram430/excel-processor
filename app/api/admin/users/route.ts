import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin, getAdminSupabase } from '@/lib/admin-server';

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getAdminSupabase();

  // Fetch all auth users (paginates up to 1000)
  const { data: { users }, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  // Fetch all approved emails
  const { data: approved, error: approvedErr } = await admin
    .from('approved_emails')
    .select('email');
  if (approvedErr) {
    return NextResponse.json({ error: approvedErr.message }, { status: 500 });
  }

  const approvedSet = new Set((approved ?? []).map((r: { email: string }) => r.email.toLowerCase()));

  const result = users.map(u => ({
    id:         u.id,
    email:      u.email ?? '',
    created_at: u.created_at,
    last_sign_in: u.last_sign_in_at ?? null,
    approved:   approvedSet.has((u.email ?? '').toLowerCase()),
  }));

  // Sort: approved first, then by last sign-in descending
  result.sort((a, b) => {
    if (a.approved !== b.approved) return a.approved ? -1 : 1;
    return (b.last_sign_in ?? '').localeCompare(a.last_sign_in ?? '');
  });

  return NextResponse.json({ users: result });
}

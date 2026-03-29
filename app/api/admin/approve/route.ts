import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin, getAdminSupabase } from '@/lib/admin-server';

// POST /api/admin/approve  { email }  → approve user
export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email } = await req.json() as { email?: string };
  const clean = email?.trim().toLowerCase();
  if (!clean) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const admin = getAdminSupabase();
  const { error } = await admin.from('approved_emails').upsert({ email: clean }, { onConflict: 'email' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/approve  { email }  → revoke user
export async function DELETE(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email } = await req.json() as { email?: string };
  const clean = email?.trim().toLowerCase();
  if (!clean) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const admin = getAdminSupabase();
  const { error } = await admin.from('approved_emails').delete().eq('email', clean);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

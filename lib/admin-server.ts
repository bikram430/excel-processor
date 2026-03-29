/**
 * Server-side admin auth guard.
 * Returns the verified admin email, or null if the caller is not an admin.
 * Admin emails are configured via the ADMIN_EMAILS env var (comma-separated).
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
}

export async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  try {
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user?.email) return null;

    const email = user.email.toLowerCase();
    if (!getAdminEmails().has(email)) return null;

    return email;
  } catch {
    return null;
  }
}

export function getAdminSupabase() {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

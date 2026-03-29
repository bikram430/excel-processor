/**
 * Server-side auth helper — used only in Next.js API routes (Node.js runtime).
 * Verifies the Supabase JWT from the Authorization: Bearer <token> header.
 * Returns the authenticated user ID, or null if the token is missing/invalid.
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

export async function verifyAuth(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  try {
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase-client';

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in: string | null;
  approved: boolean;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  });
}

async function getToken() {
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token ?? '';
}

export default function AdminPage() {
  const router = useRouter();
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null); // email being toggled
  const [addEmail, setAddEmail] = useState('');
  const [adding,   setAdding]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res   = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) { router.replace('/'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setUsers(json.users ?? []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function toggleApproval(email: string, currently: boolean) {
    setBusy(email);
    try {
      const token  = await getToken();
      const method = currently ? 'DELETE' : 'POST';
      const res = await fetch('/api/admin/approve', {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setUsers(prev => prev.map(u => u.email === email ? { ...u, approved: !currently } : u));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addApprovedEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = addEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setAddEmail('');
      await load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Access Management</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Approve or revoke login access for registered users.
            </p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            ← Back to app
          </button>
        </div>

        {/* Add email form */}
        <form onSubmit={addApprovedEmail}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6 flex gap-3"
        >
          <input
            type="email"
            required
            placeholder="Approve a new email address…"
            value={addEmail}
            onChange={e => setAddEmail(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
          />
          <button
            type="submit"
            disabled={adding || !addEmail}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600
                       rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding…' : '+ Approve'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No users found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider hidden sm:table-cell">Signed up</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Last login</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u, i) => (
                  <tr key={u.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[200px]">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell text-xs">
                      {fmt(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs">
                      {fmt(u.last_sign_in)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleApproval(u.email, u.approved)}
                        disabled={busy === u.email}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
                                    transition-all disabled:opacity-50 ${
                          u.approved
                            ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600'
                            : 'bg-red-100 text-red-600 hover:bg-green-50 hover:text-green-700'
                        }`}
                      >
                        {busy === u.email
                          ? '…'
                          : u.approved
                            ? '✓ Approved'
                            : '✕ Blocked'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400 text-center">
          {users.length} registered user{users.length !== 1 ? 's' : ''} ·{' '}
          {users.filter(u => u.approved).length} approved
        </p>
      </div>
    </main>
  );
}

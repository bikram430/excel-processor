'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileUpload }       from '@/components/FileUpload';
import { Summary }          from '@/components/Summary';
import { ProductionBoard }  from '@/components/ProductionBoard';
import { RecipesSection }   from '@/components/RecipesSection';
import { EmailRunBanner }   from '@/components/EmailRunBanner';
import { useAuth }          from '@/components/AuthProvider';
import { Chart }            from '@/components/Chart';
import { ApiResponse, ExcelRow, ProcessedData } from '@/types';
import { calculateBatches, hasButterChicken }   from '@/lib/batchCalculator';
import { createRunFromBatches }                 from '@/lib/apiClient';

const VALID_LINES = [
  'BLENDTECH',
  'CQC 1',
  'CQC 2',
  'DD OVEN',
  'KETTLE 1 SOUP',
  'KETTLE 2 DIRECT FILL',
  'KETTLE 3 DIRECT FILL',
  'KETTLE 4 KAPCOLD',
  'RICE KETTLE',
  'WOK',
];

type Section = 'dashboard' | 'production' | 'recipes';

export default function HomePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [section, setSection]               = useState<Section>('dashboard');
  const [data, setData]                     = useState<ProcessedData | null>(null);
  const [enrichedRows, setEnrichedRows]     = useState<ExcelRow[]>([]);
  const [isLoading, setLoading]             = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [warning, setWarning]               = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics]   = useState(false);
  const [recipeRunId, setRecipeRunId]       = useState<string | null>(null);
  const [emailRunId,  setEmailRunId]        = useState<string | null>(null);
  const [productionDate, setProductionDate] = useState<string | undefined>(undefined);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  // Redirect to dashboard if user tries to view production without data
  useEffect(() => {
    if (section === 'production' && !data) {
      setSection('dashboard');
    }
  }, [section, data]);

  // Butter Chicken batch size confirmation
  const [showBCModal, setShowBCModal]       = useState(false);
  const [pendingRows, setPendingRows]       = useState<ExcelRow[]>([]);
  const [bcBatchSize, setBcBatchSize]       = useState(1800);
  const [bcInput, setBcInput]               = useState('1800');

  /**
   * Combine rows that share the same line + item code (or product name when no
   * code) before running batch calculations.  This ensures that if the same WIP
   * code appears twice in the plan (e.g. two separate Diced Potato lines on WOK)
   * we produce ONE combined row with the correct total qty, then split it into
   * the right number of batches for that combined volume.
   */
  function deduplicateByItemCode(rows: ExcelRow[]): ExcelRow[] {
    const map = new Map<string, ExcelRow>();
    for (const row of rows) {
      const key = `${row.line}|||${(row.itemCode || row.product).toUpperCase().trim()}`;
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, quantity: existing.quantity + row.quantity });
      } else {
        map.set(key, { ...row });
      }
    }
    return [...map.values()];
  }

  function enrichAndStore(rows: ExcelRow[], bcCap: number, prodDate?: string) {
    const enriched = calculateBatches(deduplicateByItemCode(rows), bcCap);
    setEnrichedRows(enriched);
    // Auto-trigger recipe generation in the background
    const batches = enriched
      .filter(r => r.batchSizes && r.batchSizes.length > 0 && r.itemCode)
      .map(r => ({ item_code: r.itemCode, batch_sizes: r.batchSizes! }));
    if (batches.length > 0) {
      createRunFromBatches(batches, prodDate)
        .then(run => setRecipeRunId(run.run_id))
        .catch(() => {}); // silent — user can still manually generate from Recipes tab
    }
  }

  function handleData(response: ApiResponse) {
    if (response.success && response.data) {
      const rawRows = response.data.filteredData;
      const prodDate = response.data.productionDate;
      setData(response.data);
      setProductionDate(prodDate);
      setWarning(response.warning ?? null);
      setError(null);

      if (hasButterChicken(rawRows)) {
        // Ask user to confirm Butter Chicken batch cap before enriching
        setPendingRows(rawRows);
        setBcBatchSize(1800);
        setBcInput('1800');
        setShowBCModal(true);
      } else {
        enrichAndStore(rawRows, 1800, prodDate);
        setSection('production');
      }
    } else {
      setError(response.error ?? 'An error occurred.');
      setData(null);
      setEnrichedRows([]);
    }
  }

  function handleBCConfirm() {
    const cap = parseInt(bcInput, 10);
    const safeCap = isNaN(cap) || cap <= 0 ? 1800 : Math.min(cap, 2000);
    setBcBatchSize(safeCap);
    enrichAndStore(pendingRows, safeCap, productionDate);
    setShowBCModal(false);
    setPendingRows([]);
    setSection('production');
  }

  // Batch entries derived from enriched rows — passed to RecipesSection
  const currentBatches = (enrichedRows.length > 0 ? enrichedRows : data?.filteredData ?? [])
    .filter(r => r.batchSizes && r.batchSizes.length > 0 && r.itemCode)
    .map(r => ({ item_code: r.itemCode, batch_sizes: r.batchSizes! }));

  function handleReset() {
    setData(null);
    setEnrichedRows([]);
    setError(null);
    setWarning(null);
    setShowAnalytics(false);
    setShowBCModal(false);
    setRecipeRunId(null);
    setProductionDate(undefined);
  }

  // Show spinner while checking auth
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-900 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const userInitial = (user.email ?? 'U')[0].toUpperCase();

  // Section title for header
  const sectionTitle =
    section === 'dashboard' ? 'Dashboard' :
    section === 'production' ? 'Production Board' :
    'Daily Recipes & Batching';

  return (
    <div className="flex min-h-screen bg-slate-50">

      {/* ── Sidebar — desktop only ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 fixed inset-y-0 left-0 z-30">

        {/* Logo */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-white tracking-wide">EXCEL PROCESSOR</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {/* Dashboard */}
          <button
            onClick={() => setSection('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer
              ${section === 'dashboard' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Dashboard
          </button>

          {/* Production */}
          <button
            onClick={() => { if (data) setSection('production'); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${!data ? 'pointer-events-none opacity-40 text-slate-400' : section === 'production' ? 'bg-white/10 text-white cursor-pointer' : 'text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer'}`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Production
          </button>

          {/* Recipes */}
          <button
            onClick={() => setSection('recipes')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer
              ${section === 'recipes' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Recipes
          </button>
        </nav>

        {/* Bottom user row */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate">{user.email}</p>
              <p className="text-[10px] text-slate-400">Production Staff</p>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-400 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main wrapper ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:pl-64 min-h-screen">

        {/* Top header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile logo (visible on mobile) */}
            <div className="flex items-center gap-2 lg:hidden">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <span className="text-sm font-bold text-gray-900">{sectionTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-xs font-bold text-white">
              {userInitial}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6">

          {/* ── Butter Chicken modal ─────────────────────────────────────────── */}
          {showBCModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-sm mx-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h2 className="font-bold text-gray-900">Butter Chicken — Batch Size</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  <strong>Butter Chicken</strong> has a variable batch capacity. The default is{' '}
                  <span className="font-mono font-semibold">1800 kg</span>. Enter the confirmed capacity
                  for this run:
                </p>
                <input
                  type="number"
                  value={bcInput}
                  onChange={(e) => setBcInput(e.target.value)}
                  min={500}
                  max={2000}
                  step={50}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setBcInput('1800'); handleBCConfirm(); }}
                    className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Use Default (1800)
                  </button>
                  <button
                    onClick={handleBCConfirm}
                    className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Email automation banner — shows when a new run arrives automatically ── */}
          <EmailRunBanner
            onView={(id) => { setEmailRunId(id); setSection('recipes'); }}
          />

          {/* ── Dashboard section ─────────────────────────────────────────────── */}
          {section === 'dashboard' && (
            <div className="space-y-6 animate-results">

              {/* Header row */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">
                    Active Production Date
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">
                    {productionDate
                      ? new Date(productionDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                      : 'No Data Loaded'}
                  </h2>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={`w-2 h-2 rounded-full ${data ? 'bg-green-400' : 'bg-slate-300'}`} />
                    <span className="text-xs text-slate-500">
                      {data ? 'System Live & Synchronized' : 'Upload a file to begin'}
                    </span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-400 flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              {/* Stats + AI Analysis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Production Summary card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase mb-4">
                    Production Summary
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-gray-900">
                      {data ? currentBatches.length : '—'}
                    </span>
                    <span className="text-sm text-slate-500">
                      {data ? 'products ready' : 'no data'}
                    </span>
                  </div>
                  {data && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      {data.filteredData.length} rows &bull; {Object.keys(data.totalsByLine).length} lines
                    </p>
                  )}
                  <div className="mt-5 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                      <p className="text-[10px] font-bold tracking-[0.12em] text-slate-400 uppercase">AI Predictive Analysis</p>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {data
                        ? `${data.filteredData.length} products analyzed across ${Object.keys(data.totalsByLine).length} production lines. Total output: ${data.overallTotal.toLocaleString()} units.`
                        : 'Upload production data to generate AI analysis and forecasting.'}
                    </p>
                  </div>
                </div>

                {/* Throughput by Line card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Throughput by Line</p>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${data ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                      {data ? 'LIVE DATA' : 'NO DATA'}
                    </span>
                  </div>
                  {data ? (
                    <Chart totalsByLine={data.totalsByLine} />
                  ) : (
                    <div className="h-36 flex items-center justify-center">
                      <p className="text-xs text-slate-300">Upload data to see chart</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload area */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="text-center mb-5">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-gray-900">Process New Log Sheet</h3>
                  <p className="text-xs text-slate-400 mt-1">Drag Excel or CSV production data here</p>
                </div>

                {error && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
                    <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-24">
                    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <p className="mt-4 text-sm text-slate-500 font-medium">Processing your Excel file…</p>
                  </div>
                ) : (
                  <FileUpload onData={handleData} onLoading={setLoading} onError={setError} />
                )}

                {/* Valid lines reference */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Valid Production Lines</p>
                  <div className="flex flex-wrap gap-1.5">
                    {VALID_LINES.map(line => (
                      <span key={line} className="px-2 py-0.5 bg-slate-50 border border-gray-200 text-slate-600 text-[10px] rounded-full font-mono">
                        {line}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Quick Actions</p>
            </div>
          )}

          {/* ── Production section ────────────────────────────────────────────── */}
          {section === 'production' && data && !isLoading && (
            <div className="space-y-5 animate-results">

              {/* Section header */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Production Board</h2>
                  <p className="text-[10px] font-bold tracking-[0.1em] text-slate-400 uppercase mt-0.5">
                    Real-Time Kettle &amp; Blender Assignments
                    {productionDate && ` • ${new Date(productionDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {productionDate && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(productionDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  {recipeRunId && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Recipes auto-queued
                    </span>
                  )}
                  <button
                    onClick={() => { setSection('dashboard'); handleReset(); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    New Upload
                  </button>
                </div>
              </div>

              {/* Warning */}
              {warning && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-700">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p>{warning}</p>
                </div>
              )}

              {/* Production Board */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <ProductionBoard data={enrichedRows.length > 0 ? enrichedRows : data.filteredData} />
              </div>

              {/* Analytics accordion */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowAnalytics(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="font-semibold text-gray-700 text-sm">Analytics &amp; Summary</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showAnalytics ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showAnalytics && (
                  <div className="border-t border-gray-200 p-4 sm:p-6">
                    <Summary filteredData={data.filteredData} overallTotal={data.overallTotal} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Recipes section ───────────────────────────────────────────────── */}
          {section === 'recipes' && (
            <RecipesSection
              currentBatches={currentBatches.length > 0 ? currentBatches : undefined}
              pendingRunId={emailRunId ?? recipeRunId}
            />
          )}

        </main>

        {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-20 flex">
          {/* Dashboard tab */}
          <button
            onClick={() => setSection('dashboard')}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-medium transition-colors
              ${section === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Dashboard
          </button>

          {/* Production tab */}
          <button
            onClick={() => { if (data) setSection('production'); }}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-medium transition-colors
              ${!data ? 'opacity-40 text-gray-400' : section === 'production' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Production
          </button>

          {/* Recipes tab */}
          <button
            onClick={() => setSection('recipes')}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-medium transition-colors
              ${section === 'recipes' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Recipes
          </button>
        </nav>

      </div>
    </div>
  );
}

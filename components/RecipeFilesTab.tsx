'use client';

import { useEffect, useState } from 'react';
import { downloadRecipesZip } from '@/lib/apiClient';
import { getSupabaseClient } from '@/lib/supabase-client';

function getSupabase() { return getSupabaseClient(); }

// ─── Types ────────────────────────────────────────────────────────────────────

type FileType = 'recipe' | 'marination';

interface RecipeFile {
  file_name:    string;
  item_code:    string;
  file_type:    FileType;
  batch_number: number;
  batch_size_kg: number;
}

interface Ingredient {
  mix:              string | null;
  ingredient_code:  string | null;
  description:      string | null;
  percentage:       number | null;
  new_batch_qty:    number | null;
}

type IngredientsByFile = Record<string, Ingredient[]>;
type Filter = 'all' | FileType;

// ─── Sub-components ──────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="animate-pulse flex gap-3 py-2 px-4">
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-1/4" />
      <div className="h-4 bg-gray-200 rounded w-1/4" />
    </div>
  );
}

function IngredientTable({ rows }: { rows: Ingredient[] }) {
  if (rows.length === 0) return (
    <p className="text-xs text-gray-400 px-4 py-2">No ingredient data found.</p>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wide">
            <th className="px-3 py-1.5 text-left">Mix</th>
            <th className="px-3 py-1.5 text-left">Code</th>
            <th className="px-3 py-1.5 text-left">Description</th>
            <th className="px-3 py-1.5 text-right">%</th>
            <th className="px-3 py-1.5 text-right">New Batch (kg)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-1 text-gray-600">{r.mix ?? '—'}</td>
              <td className="px-3 py-1 font-mono text-gray-700">{r.ingredient_code ?? '—'}</td>
              <td className="px-3 py-1 text-gray-700">{r.description ?? '—'}</td>
              <td className="px-3 py-1 text-right text-gray-600">
                {r.percentage != null ? `${r.percentage.toFixed(2)}%` : '—'}
              </td>
              <td className="px-3 py-1 text-right font-mono text-gray-700">
                {r.new_batch_qty != null ? r.new_batch_qty.toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileBadge({ type }: { type: FileType }) {
  return type === 'marination'
    ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">MARINATION</span>
    : <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">RECIPE</span>;
}

// ─── Accordion for one item_code group ───────────────────────────────────────

function ItemGroup({
  itemCode,
  files,
  ingredientsByFile,
  loadingFiles,
}: {
  itemCode: string;
  files: RecipeFile[];
  ingredientsByFile: IngredientsByFile;
  loadingFiles: Set<string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800 font-mono">{itemCode}</span>
          <span className="text-xs text-gray-400">{files.length} batch{files.length > 1 ? 'es' : ''}</span>
          <FileBadge type={files[0].file_type} />
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-200 divide-y divide-gray-100">
          {files
            .slice()
            .sort((a, b) => a.batch_number - b.batch_number)
            .map((file) => (
              <div key={file.file_name}>
                {/* Batch sub-header */}
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-600">
                    Batch {file.batch_number}
                  </span>
                  <span className="text-xs text-gray-400">
                    {file.batch_size_kg.toLocaleString()} kg
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400 font-mono truncate max-w-[240px]">
                    {file.file_name}
                  </span>
                </div>

                {/* Ingredient table or skeleton */}
                {loadingFiles.has(file.file_name) ? (
                  <div className="py-1">
                    {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
                  </div>
                ) : (
                  <IngredientTable rows={ingredientsByFile[file.file_name] ?? []} />
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RecipeFilesTabProps {
  runId: string;
}

export function RecipeFilesTab({ runId }: RecipeFilesTabProps) {
  const [files, setFiles]                     = useState<RecipeFile[]>([]);
  const [ingredientsByFile, setIngredientsByFile] = useState<IngredientsByFile>({});
  const [loadingFiles, setLoadingFiles]       = useState<Set<string>>(new Set());
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [filter, setFilter]                   = useState<Filter>('all');
  const [downloading, setDownloading]         = useState(false);

  // ── Fetch file list on mount (lazy — only when tab is opened) ─────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: sbError } = await getSupabase()
          .from('recipe_files')
          .select('file_name, item_code, file_type, batch_number, batch_size_kg')
          .eq('run_id', runId)
          .order('item_code')
          .order('batch_number');

        if (sbError) throw sbError;
        if (!cancelled) setFiles((data as RecipeFile[]) ?? []);
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message ?? 'Failed to load recipe files.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [runId]);

  // ── Lazy-load ingredient rows when a file's accordion first opens ──────────
  async function ensureIngredients(fileNames: string[]) {
    const needed = fileNames.filter((fn) => !(fn in ingredientsByFile));
    if (needed.length === 0) return;

    setLoadingFiles((prev) => {
      const next = new Set(prev);
      needed.forEach((fn) => next.add(fn));
      return next;
    });

    const { data } = await getSupabase()
      .from('recipe_ingredients')
      .select('file_name, mix, ingredient_code, description, percentage, new_batch_qty')
      .eq('run_id', runId)
      .in('file_name', needed);

    const grouped: IngredientsByFile = {};
    for (const fn of needed) grouped[fn] = [];
    for (const row of data ?? []) {
      grouped[row.file_name].push(row as Ingredient);
    }

    setIngredientsByFile((prev) => ({ ...prev, ...grouped }));
    setLoadingFiles((prev) => {
      const next = new Set(prev);
      needed.forEach((fn) => next.delete(fn));
      return next;
    });
  }

  // ── Filtered files ────────────────────────────────────────────────────────
  const visible = filter === 'all' ? files : files.filter((f) => f.file_type === filter);

  // ── Group by item_code ────────────────────────────────────────────────────
  const groups = visible.reduce<Record<string, RecipeFile[]>>((acc, f) => {
    (acc[f.item_code] ??= []).push(f);
    return acc;
  }, {});

  // ── ZIP download ──────────────────────────────────────────────────────────
  async function handleDownloadAll() {
    setDownloading(true);
    try {
      await downloadRecipesZip(runId);
    } catch (e: unknown) {
      alert((e as Error).message ?? 'Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-8 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400 text-sm">
        No recipe files have been generated for this run yet.
      </div>
    );
  }

  const filterBtn = (label: string, value: Filter) => (
    <button
      onClick={() => setFilter(value)}
      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors
        ${filter === value
          ? 'bg-blue-600 text-white'
          : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {filterBtn('All', 'all')}
          {filterBtn('Recipes', 'recipe')}
          {filterBtn('Marination', 'marination')}
          <span className="text-xs text-gray-400 ml-1">{visible.length} file{visible.length !== 1 ? 's' : ''}</span>
        </div>

        <button
          onClick={handleDownloadAll}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold
                     text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60
                     transition-colors"
        >
          {downloading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Zipping…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download All
            </>
          )}
        </button>
      </div>

      {/* Accordion groups */}
      {Object.entries(groups).map(([itemCode, groupFiles]) => (
        <div
          key={itemCode}
          // Pre-load ingredients as soon as an accordion could be expanded
          onMouseEnter={() => ensureIngredients(groupFiles.map((f) => f.file_name))}
          onFocus={() => ensureIngredients(groupFiles.map((f) => f.file_name))}
        >
          <ItemGroup
            itemCode={itemCode}
            files={groupFiles}
            ingredientsByFile={ingredientsByFile}
            loadingFiles={loadingFiles}
          />
        </div>
      ))}
    </div>
  );
}

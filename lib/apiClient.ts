/**
 * Thin client for the FastAPI backend.
 * Base URL is read from NEXT_PUBLIC_API_URL (set in .env.local).
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunStatus {
  run_id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  message?: string;
}

export interface RunSummary {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  notes?: string;
  created_at: string;
}

// ─── Run helpers ──────────────────────────────────────────────────────────────

export async function createRun(productionFile: string, notes?: string): Promise<RunStatus> {
  const res = await fetch(`${BASE_URL}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ production_file: productionFile, notes }),
  });
  if (!res.ok) throw new Error(`createRun failed: ${res.statusText}`);
  return res.json();
}

export async function getRun(runId: string): Promise<RunStatus> {
  const res = await fetch(`${BASE_URL}/api/runs/${runId}`);
  if (!res.ok) throw new Error(`getRun failed: ${res.statusText}`);
  return res.json();
}

// ─── Upload production file + start run ──────────────────────────────────────

export async function uploadAndRun(file: File, notes?: string): Promise<RunStatus> {
  const form = new FormData();
  form.append('file', file);
  if (notes) form.append('notes', notes);
  const res = await fetch(`${BASE_URL}/api/runs/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Upload failed: ${text}`);
  }
  return res.json();
}

export async function listRuns(limit = 10): Promise<RunSummary[]> {
  const res = await fetch(`${BASE_URL}/api/runs?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to list runs');
  return res.json();
}

export interface BatchEntry {
  item_code: string;
  batch_sizes: number[];
}

export async function createRunFromBatches(entries: BatchEntry[], notes?: string): Promise<RunStatus> {
  const res = await fetch(`${BASE_URL}/api/runs/from-batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries, notes }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to start run: ${text}`);
  }
  return res.json();
}

// ─── Recipe ZIP download ───────────────────────────────────────────────────────

/**
 * Stream the ZIP of all recipe xlsx files for a run and trigger a browser
 * download without navigating away from the page.
 */
export async function downloadRecipesZip(runId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/runs/${runId}/recipes/zip`);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to download recipes: ${text}`);
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href     = url;
  a.download = `recipes_${runId.slice(0, 8)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the object URL after the download is kicked off
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

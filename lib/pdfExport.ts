/**
 * Client-side PDF download helper.
 * Sends board data to the server API route which generates the PDF;
 * no @react-pdf/renderer code runs in the browser.
 */
import type { BoardItem } from '@/types';
import type { PdfMode, NonKettleItemForPdf } from '@/lib/boardPdf';

export type { PdfMode, NonKettleItemForPdf };

export async function downloadBoardPDF(
  lineMap: Record<string, BoardItem[]>,
  activeLines: string[],
  filename: string,
  mode: PdfMode = 'full',
  nonKettleItems?: NonKettleItemForPdf[],
) {
  const response = await fetch('/api/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lineMap, activeLines, mode, nonKettleItems }),
  });

  if (!response.ok) {
    throw new Error(`PDF generation failed: ${response.status}`);
  }

  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

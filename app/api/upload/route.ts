import { NextRequest, NextResponse } from 'next/server';
import { parseExcel } from '@/lib/excelParser';
import { verifyAuth } from '@/lib/auth-server';

// MIME types accepted for Excel files
const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                           // .xls
  'application/octet-stream',                                           // generic binary (some browsers)
]);

export async function POST(request: NextRequest) {
  // ── Require authenticated user ──────────────────────────────────────────
  const userId = await verifyAuth(request);
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorised.' },
      { status: 401 },
    );
  }

  try {
    // ── Parse multipart form data ─────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided. Please attach an Excel file.' },
        { status: 400 }
      );
    }

    // ── Reject files over 15 MB ───────────────────────────────────────────
    const MAX_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 15 MB.` },
        { status: 413 }
      );
    }

    // ── Validate file type by MIME and/or extension ───────────────────────
    const isValidMime = ALLOWED_MIME.has(file.type);
    const isValidExt  = /\.(xlsx|xls)$/i.test(file.name);

    if (!isValidMime && !isValidExt) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid file type "${file.type}". Please upload an .xlsx or .xls file.`,
        },
        { status: 400 }
      );
    }

    // ── Convert File → Buffer for xlsx ────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ── Parse & process ───────────────────────────────────────────────────
    const data = parseExcel(buffer);

    // Warn (but still succeed) when filtering removes every row
    if (data.filteredData.length === 0) {
      return NextResponse.json({
        success: true,
        data,
        warning:
          'No matching rows were found. ' +
          'Make sure the "line" column contains one of the valid production line names ' +
          '(e.g. BLENDTECH CQC 1, WOK, DD OVEN …).',
      });
    }

    return NextResponse.json({ success: true, data });

  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : 'An unexpected error occurred while processing the file.';

    console.error('[/api/upload]', message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

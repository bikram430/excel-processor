import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { BoardPdfDocument } from '@/lib/boardPdf';
import type { BoardItem } from '@/types';
import type { PdfMode, NonKettleItemForPdf } from '@/lib/boardPdf';

export async function POST(req: NextRequest) {
  try {
    const { lineMap, activeLines, mode, nonKettleItems } = (await req.json()) as {
      lineMap: Record<string, BoardItem[]>;
      activeLines: string[];
      mode?: PdfMode;
      nonKettleItems?: NonKettleItemForPdf[];
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(BoardPdfDocument, {
      lineMap,
      activeLines,
      mode: mode ?? 'full',
      nonKettleItems,
    }) as any;
    const buffer  = await renderToBuffer(element);

    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="production-board.pdf"',
      },
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { BoardPdfDocument } from '@/lib/boardPdf';
import type { BoardItem } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { lineMap, activeLines } = (await req.json()) as {
      lineMap: Record<string, BoardItem[]>;
      activeLines: string[];
    };

    // renderToBuffer expects a react-pdf Document element.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(BoardPdfDocument, { lineMap, activeLines }) as any;
    const buffer  = await renderToBuffer(element);

    // Convert Node Buffer → Uint8Array so NextResponse can serialise it.
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

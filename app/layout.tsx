import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Production Line Analyser',
  description:
    'Upload and analyse production line data from Excel files. ' +
    'Filters, aggregates and visualises output per production line.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}

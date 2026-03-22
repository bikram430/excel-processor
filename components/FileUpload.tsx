'use client';

import { useState, useCallback, useRef } from 'react';
import { ApiResponse } from '@/types';

interface FileUploadProps {
  onData: (response: ApiResponse) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string | null) => void;
}

/** Returns true when the file looks like an Excel spreadsheet */
function isExcelFile(file: File): boolean {
  const validMime = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ]);
  return validMime.has(file.type) || /\.(xlsx|xls)$/i.test(file.name);
}

export function FileUpload({ onData, onLoading, onError }: FileUploadProps) {
  const [isDragging, setIsDragging]     = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File selection ─────────────────────────────────────────────────────────
  const handleFile = useCallback(
    (file: File) => {
      if (!isExcelFile(file)) {
        onError('Invalid file type. Please upload an .xlsx or .xls file.');
        return;
      }
      setSelectedFile(file);
      onError(null);
    },
    [onError]
  );

  // ── Drag & drop handlers ───────────────────────────────────────────────────
  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true);  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    onLoading(true);
    onError(null);

    const form = new FormData();
    form.append('file', selectedFile);

    try {
      const res    = await fetch('/api/upload', { method: 'POST', body: form });
      const result = (await res.json()) as ApiResponse;
      onData(result);
      if (!result.success) onError(result.error ?? 'Upload failed.');
    } catch {
      onError('Network error. Please check your connection and try again.');
    } finally {
      setIsUploading(false);
      onLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onError(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !selectedFile && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-6 sm:p-10 text-center
          transition-all duration-200
          ${isDragging
            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }
          ${!selectedFile ? 'cursor-pointer' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleInputChange}
          className="hidden"
        />

        {selectedFile ? (
          /* ── File selected indicator ── */
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              {/* Checkmark icon */}
              <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-green-800 break-all">{selectedFile.name}</span>
              <span className="text-xs text-green-600 whitespace-nowrap">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
            {/* Remove button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Remove file"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          /* ── Empty state ── */
          <>
            {/* Upload icon */}
            <div className="mx-auto w-16 h-16 mb-4 text-gray-300">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586
                     a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700">
              {isDragging ? 'Drop your Excel file here' : 'Drag & drop your Excel file here'}
            </p>
            <p className="mt-1 text-sm text-gray-500">or click to browse</p>
            <p className="mt-2 text-xs text-gray-400">Supports .xlsx and .xls</p>
          </>
        )}
      </div>

      {/* Upload / Process button */}
      {selectedFile && (
        <div className="flex justify-center">
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className={`
              inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold
              text-white transition-all duration-150
              ${isUploading
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md hover:shadow-lg'
              }
            `}
          >
            {isUploading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Process File
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

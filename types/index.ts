/** A single row of filtered production data */
export interface ExcelRow {
  line: string;
  product: string;
  quantity: number;
}

/** Per-line aggregated statistics */
export interface LineStats {
  totalQuantity: number;
  count: number;
}

/** Everything returned by the parser / API */
export interface ProcessedData {
  filteredData: ExcelRow[];
  totalsByLine: Record<string, LineStats>;
  overallTotal: number;
}

/** Shape of the JSON the /api/upload route returns */
export interface ApiResponse {
  success: boolean;
  data?: ProcessedData;
  error?: string;
  warning?: string;
}

/** One filtered row — mirrors the columns visible in the Excel file */
export interface ExcelRow {
  line: string;
  product: string;
  quantity: number;      // from "Qty" column
  itemCode: string;
  uom: string;
  type: string;
  planningGroup: string;
  sequence: string;
  comments: string;
  // Enriched by client-side batch calculator (optional — absent before enrichment)
  batches?: number;
  batchBreakdown?: string;
}

/** One item on the Production Board */
export interface BoardItem {
  id: string;
  type: 'product' | 'cleaning';
  line: string;
  product: string;
  quantity: number;
  batches: number;
  batchBreakdown: string;
  time: string;           // editable HH:MM string
  allergens: string[];
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

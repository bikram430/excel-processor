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
  physicalBatchSize?: number; // max kg in a single physical batch/cycle (for compatibility checks)
  batchSizes?: number[];      // individual batch sizes in kg (for recipe file generation)
}

/** One item on the Production Board */
export interface BoardItem {
  id: string;
  type: 'product' | 'cleaning';
  line: string;
  product: string;
  itemCode: string;       // WIP item code — used for meat recipe lookup
  quantity: number;
  batches: number;
  batchBreakdown: string;
  time: string;           // editable HH:MM string
  allergens: string[];
  physicalBatchSize: number; // max kg in a single physical batch (for line compatibility)
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
  productionDate?: string;  // ISO date "YYYY-MM-DD" extracted from Excel metadata rows
}

/** Shape of the JSON the /api/upload route returns */
export interface ApiResponse {
  success: boolean;
  data?: ProcessedData;
  error?: string;
  warning?: string;
}

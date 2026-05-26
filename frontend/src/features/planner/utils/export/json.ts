import type { ExportData, ExportOptions } from "./types";

export function exportToJson(data: ExportData, _options: ExportOptions): string {
  return JSON.stringify(data, null, 2);
}

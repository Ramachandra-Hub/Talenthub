import type { DsaContestExportWorkbook } from '@/lib/dsa/contest/admin-tournament-export';

/** Build and download a real .xlsx workbook in the browser. */
export async function downloadXlsxWorkbook(workbook: DsaContestExportWorkbook): Promise<void> {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();

  for (const sheet of workbook.sheets) {
    const headerRow = sheet.columns.map((c) => c.header);
    const dataRows = sheet.rows.map((row) =>
      sheet.columns.map((c) => {
        const v = row[c.key];
        return v ?? '';
      }),
    );
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const safeName = sheet.name.replace(/[\\/*?:\[\]]/g, '').slice(0, 31) || 'Sheet';
    XLSX.utils.book_append_sheet(book, ws, safeName);
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(book, `${workbook.fileBase}-${dateStamp}.xlsx`);
}

import type {
  Account, Category, CategoryMonthTotal, Transaction,
} from '@compass/shared-types';

import type { Locale } from '@/shared/i18n';

/**
 * Native stub for the PDF export. The web implementation
 * (`generateReportPdf.ts`) imports `jspdf` + `jspdf-autotable`,
 * which bundle for browsers but pull in DOM-leaning deps Metro
 * rejects on native. This `.native.ts` extension is picked by Metro
 * for native bundles and keeps `jspdf` out of the RN graph.
 *
 * On native, the report screen builds a PDF via `expo-print` from
 * `generateReportHtml.ts` instead — same input shape, different
 * engine, identical visual output. The throw here is defence-in-
 * depth; the screen's `Platform.OS` check prevents this code path
 * from ever executing.
 */
export type GenerateReportPdfInput = {
  yearMonth: string;
  lang: Locale;
  monthLabel: string;
  thisIncomeTotal: number;
  thisExpenseTotal: number;
  thisNet: number;
  lastIncomeTotal: number;
  lastExpenseTotal: number;
  lastNet: number;
  breakdown: CategoryMonthTotal[];
  topExpenses: Transaction[];
  categoriesById: Map<string, Category>;
  accountsById: Map<string, Account>;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export async function generateReportPdfBlob(
  _input: GenerateReportPdfInput,
): Promise<Blob> {
  throw new Error(
    'generateReportPdfBlob is web-only on native — caller should use expo-print + generateReportHtml instead.',
  );
}

export function reportPdfFilename(yearMonth: string): string {
  return `compass-report-${yearMonth}.pdf`;
}

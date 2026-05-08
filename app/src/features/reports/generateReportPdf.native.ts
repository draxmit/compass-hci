import type {
  Account, Category, CategoryMonthTotal, Transaction,
} from '@compass/shared-types';

import type { Locale } from '@/shared/i18n';

/**
 * Native stub for the PDF export. The real implementation
 * (`generateReportPdf.ts`) imports `jspdf` + `jspdf-autotable`,
 * both browser-targeted with internal `require([...])` calls
 * Metro can't resolve. Metro picks THIS file for native bundles
 * because of the `.native.ts` extension priority, leaving the
 * `.ts` variant as web-only.
 *
 * The screen guards with `Platform.OS !== 'web'` before calling,
 * so this stub should never execute. The throw is a defence-in-
 * depth signal in case the platform check is ever bypassed.
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
  throw new Error('PDF export is not available on native — use the web app.');
}

export function reportPdfFilename(yearMonth: string): string {
  return `compass-report-${yearMonth}.pdf`;
}

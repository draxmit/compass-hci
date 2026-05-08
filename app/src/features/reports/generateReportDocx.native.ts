import type {
  Account, Category, CategoryMonthTotal, Transaction,
} from '@compass/shared-types';

import type { Locale } from '@/shared/i18n';

/**
 * Native stub for the DOCX export. The real implementation
 * (`generateReportDocx.ts`) imports the `docx` package + jszip,
 * which bundle for web but get into trouble on native via
 * Metro's dynamic-chunk handling. Metro picks THIS file for
 * native bundles via the `.native.ts` extension priority — same
 * pattern PDF uses.
 *
 * The screen guards with `Platform.OS !== 'web'` before calling,
 * so this stub never executes. The throw is defence-in-depth.
 */

export type GenerateReportDocxInput = {
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

export async function generateReportDocxBlob(
  _input: GenerateReportDocxInput,
): Promise<Blob> {
  throw new Error('DOCX export is not available on native — use the web app.');
}

export function reportDocxFilename(yearMonth: string): string {
  return `compass-report-${yearMonth}.docx`;
}

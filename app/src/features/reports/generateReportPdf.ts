import type {
  Account, Category, CategoryMonthTotal, Transaction,
} from '@compass/shared-types';

import type { Locale } from '@/shared/i18n';
import { formatDate } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';
import { formatPercent } from '@/shared/utils/formatPercent';

/**
 * v3 — PDF export of the monthly report (companion to the DOCX export).
 *
 * Same input shape as `generateReportDocx` so callers can share the
 * data fetch + i18n boilerplate. Renders to PDF via `jspdf` +
 * `jspdf-autotable` (table-rendering plugin). Web-only — `jspdf` and
 * its dependencies aren't built for React Native, so this module is
 * dynamic-imported behind the platform check in /report.
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
  /** Translator primed with the `report` and `transactions` namespaces. */
  t: (key: string, opts?: Record<string, unknown>) => string;
};

// Light-page palette — same as the DOCX builder uses. Fixed across
// themes so the file renders identically wherever opened. Plain
// tuples (not `as const`) so they spread cleanly into jspdf's
// setTextColor / fillColor APIs which type their args as discrete
// numbers, not rest params.
type RGBTuple = [number, number, number];
const RGB: Record<'fg' | 'muted' | 'border' | 'positive' | 'danger' | 'zebra', RGBTuple> = {
  fg: [17, 17, 17],
  muted: [107, 114, 128],
  border: [229, 231, 235],
  positive: [21, 128, 61],
  danger: [185, 28, 28],
  zebra: [249, 250, 251],
};

/**
 * Build the PDF in memory and return a Blob. Browser-only.
 */
export async function generateReportPdfBlob(
  input: GenerateReportPdfInput,
): Promise<Blob> {
  // Dynamic imports keep jspdf out of the Metro graph for native
  // bundles. The autotable plugin's `.mjs` build auto-applies via
  // `window.jsPDF` — but Metro gives us a separate jsPDF module
  // instance that's never on the window, so the auto-apply skips.
  // Use the function-style `autoTable(doc, options)` API instead,
  // which doesn't depend on monkey-patching.
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  // The .mjs default export IS the autoTable function. Webpack's
  // UMD bundle wrapped it in `.default` — keep both fallbacks.
  const autoTable: (doc: unknown, options: unknown) => void =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (autoTableModule as any).default ?? (autoTableModule as any).autoTable ?? autoTableModule;

  const { lang, monthLabel, t } = input;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;   // 0.5"
  let y = margin;

  // ---------- Title ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...RGB.fg);
  doc.text(t('report:title', { month: monthLabel }), margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...RGB.muted);
  doc.text(
    t('report:exportSubtitle', {
      generatedOn: formatDate(new Date(), 'long', lang),
    }),
    margin, y,
  );
  y += 24;

  // ---------- Summary table ----------
  drawSectionHeading(doc, t('report:sections.summary'), margin, y);
  y += 14;

  const incomeDelta = input.thisIncomeTotal - input.lastIncomeTotal;
  const expenseDelta = input.thisExpenseTotal - input.lastExpenseTotal;
  const summaryHead = [[
    t('report:summary.income'),
    t('report:summary.expense'),
  ]];
  const summaryBody = [[
    summaryCellText(input.thisIncomeTotal, incomeDelta, false, lang, t),
    summaryCellText(input.thisExpenseTotal, expenseDelta, true, lang, t),
  ]];
   
  autoTable(doc, {
    head: summaryHead,
    body: summaryBody,
    startY: y,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [...RGB.zebra],
      textColor: [...RGB.muted],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 11,
      cellPadding: 8,
      textColor: [...RGB.fg],
    },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'left' },
    },
    theme: 'grid',
    styles: { lineColor: [...RGB.border], lineWidth: 0.5 },
  });
   
  y = (doc as any).lastAutoTable.finalY + 24;

  // ---------- Net hero ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...RGB.muted);
  doc.text(t('report:summary.net').toUpperCase(), margin, y);
  y += 14;
  const netRgb = input.thisNet >= 0 ? RGB.positive : RGB.danger;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...netRgb);
  doc.text(formatIDR(input.thisNet, lang), margin, y);
  y += 18;
  // Delta line
  const netDelta = input.thisNet - input.lastNet;
  const netDeltaText = netDelta === 0
    ? `${t('report:delta.vsLastMonth')} — ${t('report:delta.same')}`
    : netDelta > 0
      ? `${t('report:delta.vsLastMonth')} — ${t('report:delta.up', { amount: formatIDR(Math.abs(netDelta), lang) })}`
      : `${t('report:delta.vsLastMonth')} — ${t('report:delta.down', { amount: formatIDR(Math.abs(netDelta), lang) })}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...RGB.muted);
  doc.text(netDeltaText, margin, y);
  y += 28;

  // ---------- Breakdown table ----------
  if (input.breakdown.length > 0) {
    drawSectionHeading(doc, t('report:sections.breakdown'), margin, y);
    y += 14;
    const sumExpense = input.thisExpenseTotal;
    const breakdownBody = input.breakdown.map((row) => {
      const cat = input.categoriesById.get(row.categoryId);
      const ratio = sumExpense === 0 ? 0 : row.totalIDR / sumExpense;
      const name = cat ? cat.name[lang] : t('report:export.unknownCategory');
      return [name, formatIDR(row.totalIDR, lang), formatPercent(ratio, lang)];
    });
    // Total row
    breakdownBody.push([
      t('report:export.totalLabel'),
      formatIDR(sumExpense, lang),
      '100%',
    ]);
     
    autoTable(doc, {
      head: [[
        t('report:export.col.category'),
        t('report:export.col.amount'),
        t('report:export.col.share'),
      ]],
      body: breakdownBody,
      startY: y,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: [...RGB.zebra],
        textColor: [...RGB.muted],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 6,
        textColor: [...RGB.fg],
      },
      alternateRowStyles: { fillColor: [...RGB.zebra] },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' },
      },
      // Total-row styling: bold + no zebra (it's the last row, idx
      // equal to data length).
       
      didParseCell: (hookData: any) => {
        if (
          hookData.section === 'body'
          && hookData.row.index === breakdownBody.length - 1
        ) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [255, 255, 255];
        }
      },
      theme: 'grid',
      styles: { lineColor: [...RGB.border], lineWidth: 0.5 },
    });
     
    y = (doc as any).lastAutoTable.finalY + 24;
  }

  // ---------- Top expenses table ----------
  if (input.topExpenses.length > 0) {
    drawSectionHeading(doc, t('report:sections.topTransactions'), margin, y);
    y += 14;
    const topBody = input.topExpenses.map((tx) => {
      const cat = input.categoriesById.get(tx.splits[0]?.categoryId ?? '');
      const desc = (tx.description ?? '').trim() || t('report:export.noDescription');
      const catName = cat ? cat.name[lang] : t('report:export.unknownCategory');
      const dateLabel = formatDate(new Date(`${tx.date}T00:00:00`), 'medium', lang);
      return [dateLabel, desc, catName, formatIDR(tx.amount, lang)];
    });
     
    autoTable(doc, {
      head: [[
        t('report:export.col.date'),
        t('report:export.col.description'),
        t('report:export.col.category'),
        t('report:export.col.amount'),
      ]],
      body: topBody,
      startY: y,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: [...RGB.zebra],
        textColor: [...RGB.muted],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 6,
        textColor: [...RGB.fg],
      },
      alternateRowStyles: { fillColor: [...RGB.zebra] },
      columnStyles: {
        0: { halign: 'left', cellWidth: 70 },
        1: { halign: 'left' },
        2: { halign: 'left', cellWidth: 90 },
        3: { halign: 'right', cellWidth: 90 },
      },
      theme: 'grid',
      styles: { lineColor: [...RGB.border], lineWidth: 0.5 },
    });
     
    y = (doc as any).lastAutoTable.finalY + 24;
  }

  // ---------- Footer ----------
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...RGB.muted);
  const footerText = t('report:exportFooter');
  const footerWidth = doc.getTextWidth(footerText);
  doc.text(footerText, (pageWidth - footerWidth) / 2, doc.internal.pageSize.getHeight() - 24);

  return doc.output('blob');
}

/**
 * Suggested filename. Matches the DOCX naming so multiple-format
 * exports of the same month sit next to each other in Downloads.
 */
export function reportPdfFilename(yearMonth: string): string {
  return `compass-report-${yearMonth}.pdf`;
}

// ---------- helpers ----------

 
function drawSectionHeading(doc: any, label: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...RGB.muted);
  doc.text(label.toUpperCase(), x, y);
}

function summaryCellText(
  amount: number,
  delta: number,
  invertDelta: boolean,
  lang: Locale,
  t: GenerateReportPdfInput['t'],
): string {
  const goodWhenUp = !invertDelta;
  const direction = delta === 0 ? 'same' : delta > 0 ? 'up' : 'down';
  // (good when up) === up + good when up — we don't render coloured
  // delta in PDF cells (autotable cell-level colour overrides are
  // possible but add complexity). Plain text instead, prefixed with
  // an arrow so direction is still glanceable.
  void goodWhenUp;
  const deltaText = direction === 'same'
    ? t('report:delta.same')
    : direction === 'up'
      ? t('report:delta.up', { amount: formatIDR(Math.abs(delta), lang) })
      : t('report:delta.down', { amount: formatIDR(Math.abs(delta), lang) });
  return `${formatIDR(amount, lang)}\n${deltaText}`;
}

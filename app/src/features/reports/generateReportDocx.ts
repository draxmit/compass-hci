import type {
  Account, Category, CategoryMonthTotal, Transaction,
} from '@compass/shared-types';
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';

import type { Locale } from '@/shared/i18n';
import { formatDate } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';
import { formatPercent } from '@/shared/utils/formatPercent';

/**
 * v3 — DOCX export of the monthly report.
 *
 * Mirrors the on-screen `/report/[yearMonth]` layout in a Word-friendly
 * shape. The same data the screen renders (income / expense / net /
 * per-category breakdown / top-5 expenses) is materialised into a
 * single `Document` whose Packer output can be either a Blob (web) or
 * a base64 string (native, via expo-file-system).
 *
 * This is a pure helper — caller fetches the data via the same
 * `listMonthTotals` / `listTransactions` / `listCategories` /
 * `listAccounts` calls as the screen, then hands the result here.
 *
 * Bilingual: every string used in the doc is sourced from i18n via the
 * `t` callback the caller passes in. We don't hardcode any UI copy
 * here — the doc respects the user's active locale.
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
  /** Translator from the caller — must be primed with the `report` and `transactions` namespaces. */
  t: (key: string, opts?: Record<string, unknown>) => string;
};

// Word-document colour palette. We don't use the on-screen tokens —
// Word renders best on a light page, and the screen palette is tuned
// for dark surfaces. Hardcoded (no theme variants) so the file renders
// identically wherever it's opened.
const HEX = {
  fg: '111111',
  muted: '6B7280',
  border: 'E5E7EB',
  positive: '15803D',
  danger: 'B91C1C',
  zebra: 'F9FAFB',
} as const;

/**
 * Build the DOCX in memory. Returns a Blob on web (where it can be
 * downloaded via createObjectURL) and a `Document` instance on native
 * (where the caller wraps with `Packer.toBase64String`). Browsers and
 * Node both support `Packer.toBlob`; React Native does not — see the
 * caller for the platform branching.
 */
export function buildReportDocument(input: GenerateReportDocxInput): Document {
  const { lang, monthLabel, t } = input;

  const sections = [
    // Title
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: t('report:title', { month: monthLabel }),
          bold: true,
          size: 48,   // half-points → 24pt
          color: HEX.fg,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: t('report:exportSubtitle', {
            generatedOn: formatDate(new Date(), 'long', lang),
          }),
          size: 20,
          color: HEX.muted,
        }),
      ],
    }),

    // ===== SUMMARY =====
    sectionHeading(t('report:sections.summary')),
    summaryTable(input),

    // Net hero
    new Paragraph({ spacing: { before: 240, after: 80 }, children: [] }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: t('report:summary.net').toUpperCase(),
          bold: true,
          size: 18,
          color: HEX.muted,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: formatIDR(input.thisNet, lang),
          bold: true,
          size: 56,   // 28pt
          color: input.thisNet >= 0 ? HEX.positive : HEX.danger,
        }),
      ],
    }),
    deltaParagraph(input.thisNet - input.lastNet, lang, t),
  ];

  // ===== BREAKDOWN =====
  if (input.breakdown.length > 0) {
    sections.push(
      new Paragraph({ spacing: { before: 320, after: 0 }, children: [] }),
      sectionHeading(t('report:sections.breakdown')),
      breakdownTable(input),
    );
  }

  // ===== TOP EXPENSES =====
  if (input.topExpenses.length > 0) {
    sections.push(
      new Paragraph({ spacing: { before: 320, after: 0 }, children: [] }),
      sectionHeading(t('report:sections.topTransactions')),
      topExpensesTable(input),
    );
  }

  // Footer
  sections.push(
    new Paragraph({ spacing: { before: 480 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: t('report:exportFooter'),
          italics: true,
          size: 16,   // 8pt
          color: HEX.muted,
        }),
      ],
    }),
  );

  return new Document({
    creator: 'Compass',
    title: t('report:title', { month: monthLabel }),
    description: t('report:exportSubtitle', {
      generatedOn: formatDate(new Date(), 'long', lang),
    }),
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },   // 11pt body
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },   // 0.5"
          },
        },
        children: sections,
      },
    ],
  });
}

// ---------- helpers ----------

function sectionHeading(label: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text: label.toUpperCase(),
        bold: true,
        size: 18,   // 9pt
        color: HEX.muted,
      }),
    ],
  });
}

function summaryTable(input: GenerateReportDocxInput): Table {
  const { lang, t } = input;
  const incomeDelta = input.thisIncomeTotal - input.lastIncomeTotal;
  const expenseDelta = input.thisExpenseTotal - input.lastExpenseTotal;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(HEX.border),
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          summaryCell(t('report:summary.income'), input.thisIncomeTotal, incomeDelta, false, lang, t),
          summaryCell(t('report:summary.expense'), input.thisExpenseTotal, expenseDelta, true, lang, t),
        ],
      }),
    ],
  });
}

function summaryCell(
  label: string,
  amount: number,
  delta: number,
  invertDelta: boolean,
  lang: Locale,
  t: GenerateReportDocxInput['t'],
): TableCell {
  const goodWhenUp = !invertDelta;
  const direction = delta === 0 ? 'same' : delta > 0 ? 'up' : 'down';
  const deltaColor =
    direction === 'same'
      ? HEX.muted
      : (direction === 'up') === goodWhenUp
        ? HEX.positive
        : HEX.danger;

  const amountColor = invertDelta ? HEX.danger : HEX.positive;

  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 200, bottom: 200, left: 200, right: 200 },
    children: [
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: label.toUpperCase(),
            bold: true,
            size: 16,
            color: HEX.muted,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: formatIDR(amount, lang),
            bold: true,
            size: 32,   // 16pt
            color: amountColor,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: direction === 'same'
              ? t('report:delta.same')
              : direction === 'up'
                ? t('report:delta.up', { amount: formatIDR(Math.abs(delta), lang) })
                : t('report:delta.down', { amount: formatIDR(Math.abs(delta), lang) }),
            size: 18,
            color: deltaColor,
          }),
        ],
      }),
    ],
  });
}

function deltaParagraph(
  delta: number, lang: Locale, t: GenerateReportDocxInput['t'],
): Paragraph {
  const direction = delta === 0 ? 'same' : delta > 0 ? 'up' : 'down';
  const text =
    direction === 'same'
      ? `${t('report:delta.vsLastMonth')} — ${t('report:delta.same')}`
      : `${t('report:delta.vsLastMonth')} — ${
          direction === 'up'
            ? t('report:delta.up', { amount: formatIDR(Math.abs(delta), lang) })
            : t('report:delta.down', { amount: formatIDR(Math.abs(delta), lang) })
        }`;
  return new Paragraph({
    children: [new TextRun({ text, size: 18, color: HEX.muted })],
  });
}

function breakdownTable(input: GenerateReportDocxInput): Table {
  const { lang, t } = input;
  const sumExpense = input.thisExpenseTotal;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell(t('report:export.col.category'), 60),
      headerCell(t('report:export.col.amount'), 25, AlignmentType.RIGHT),
      headerCell(t('report:export.col.share'), 15, AlignmentType.RIGHT),
    ],
  });

  const dataRows = input.breakdown.map((row, idx) => {
    const cat = input.categoriesById.get(row.categoryId);
    const ratio = sumExpense === 0 ? 0 : row.totalIDR / sumExpense;
    const name = cat ? cat.name[lang] : t('report:export.unknownCategory');
    const zebra = idx % 2 === 1 ? HEX.zebra : 'FFFFFF';

    return new TableRow({
      children: [
        bodyCell(name, 60, AlignmentType.LEFT, zebra),
        bodyCell(formatIDR(row.totalIDR, lang), 25, AlignmentType.RIGHT, zebra),
        bodyCell(formatPercent(ratio, lang), 15, AlignmentType.RIGHT, zebra),
      ],
    });
  });

  // Total footer row
  const totalRow = new TableRow({
    children: [
      footerCell(t('report:export.totalLabel'), 60),
      footerCell(formatIDR(sumExpense, lang), 25, AlignmentType.RIGHT),
      footerCell('100%', 15, AlignmentType.RIGHT),
    ],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(HEX.border),
    rows: [headerRow, ...dataRows, totalRow],
  });
}

function topExpensesTable(input: GenerateReportDocxInput): Table {
  const { lang, t } = input;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell(t('report:export.col.date'), 18),
      headerCell(t('report:export.col.description'), 32),
      headerCell(t('report:export.col.category'), 25),
      headerCell(t('report:export.col.amount'), 25, AlignmentType.RIGHT),
    ],
  });

  const dataRows = input.topExpenses.map((tx, idx) => {
    const cat = input.categoriesById.get(tx.splits[0]?.categoryId ?? '');
    const desc = (tx.description ?? '').trim() || t('report:export.noDescription');
    const catName = cat ? cat.name[lang] : t('report:export.unknownCategory');
    const dateLabel = formatDate(new Date(`${tx.date}T00:00:00`), 'medium', lang);
    const zebra = idx % 2 === 1 ? HEX.zebra : 'FFFFFF';

    return new TableRow({
      children: [
        bodyCell(dateLabel, 18, AlignmentType.LEFT, zebra),
        bodyCell(desc, 32, AlignmentType.LEFT, zebra),
        bodyCell(catName, 25, AlignmentType.LEFT, zebra),
        bodyCell(formatIDR(tx.amount, lang), 25, AlignmentType.RIGHT, zebra),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(HEX.border),
    rows: [headerRow, ...dataRows],
  });
}

// Common cell builders -----------------------------------------------

// `AlignmentType` is exported as a const-object value by docx, not a TS
// enum, so we derive the matching type with `(typeof X)[keyof typeof X]`
// rather than using the identifier in type position.
type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

function headerCell(text: string, widthPct: number, align?: Align): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    shading: { type: ShadingType.SOLID, color: HEX.zebra, fill: HEX.zebra },
    children: [
      new Paragraph({
        alignment: align ?? AlignmentType.LEFT,
        children: [
          new TextRun({
            text: text.toUpperCase(),
            bold: true,
            size: 16,
            color: HEX.muted,
          }),
        ],
      }),
    ],
  });
}

function bodyCell(
  text: string, widthPct: number, align?: Align, fillHex?: string,
): TableCell {
  // exactOptionalPropertyTypes forbids assigning `undefined` to optional
  // fields, so we conditionally spread `shading` rather than setting it
  // and then discarding it.
  const base = {
    width: { size: widthPct, type: WidthType.PERCENTAGE } as const,
    margins: { top: 100, bottom: 100, left: 120, right: 120 } as const,
    children: [
      new Paragraph({
        alignment: align ?? AlignmentType.LEFT,
        children: [new TextRun({ text, size: 20, color: HEX.fg })],
      }),
    ],
  };
  return new TableCell(
    fillHex && fillHex !== 'FFFFFF'
      ? {
          ...base,
          shading: { type: ShadingType.SOLID, color: fillHex, fill: fillHex },
        }
      : base,
  );
}

function footerCell(text: string, widthPct: number, align?: Align): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: align ?? AlignmentType.LEFT,
        children: [
          new TextRun({ text, bold: true, size: 20, color: HEX.fg }),
        ],
      }),
    ],
  });
}

function tableBorders(hex: string) {
  return {
    top: { style: BorderStyle.SINGLE, size: 4, color: hex },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: hex },
    left: { style: BorderStyle.SINGLE, size: 4, color: hex },
    right: { style: BorderStyle.SINGLE, size: 4, color: hex },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: hex },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: hex },
  };
}

/**
 * Web entry point. Takes the same input the doc builder needs and
 * returns a Blob ready for download via createObjectURL.
 *
 * `Packer.toBlob` is browser-only; on React Native callers should use
 * the alternate `toBase64String` path documented inline in the report
 * screen's export handler.
 */
export async function generateReportDocxBlob(
  input: GenerateReportDocxInput,
): Promise<Blob> {
  const doc = buildReportDocument(input);
  return Packer.toBlob(doc);
}

/**
 * Suggested filename for the export. Uses the yearMonth string + a
 * Compass prefix so multiple exports sort chronologically when the
 * user accumulates a year of reports in their Downloads folder.
 */
export function reportDocxFilename(yearMonth: string): string {
  return `compass-report-${yearMonth}.docx`;
}

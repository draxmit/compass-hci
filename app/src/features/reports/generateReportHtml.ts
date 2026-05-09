import type {
  Account, Category, CategoryMonthTotal, Transaction,
} from '@compass/shared-types';

import type { Locale } from '@/shared/i18n';
import { formatDate } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';
import { formatPercent } from '@/shared/utils/formatPercent';

/**
 * HTML report generator. Used by `expo-print` on native to produce a
 * PDF (which then funnels through `expo-sharing` to the system share
 * sheet). Mirrors the DOCX/PDF web exports' visual hierarchy in inline
 * CSS — no external stylesheets, no images, no fonts beyond the system
 * defaults. expo-print's PDF engine is conservative; staying within its
 * supported HTML/CSS subset is what keeps PDFs rendering on every
 * device.
 *
 * The input shape is intentionally identical to `GenerateReportDocxInput`
 * so the report screen can hand the same payload to both the web and
 * native code paths without re-shaping data.
 */

export type GenerateReportHtmlInput = {
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

// Light-page palette — matches the DOCX HEX so the two formats look
// visually consistent when the user opens both side by side.
const PALETTE = {
  fg: '#111111',
  muted: '#6B7280',
  border: '#E5E7EB',
  positive: '#15803D',
  danger: '#B91C1C',
  zebra: '#F9FAFB',
  pageBg: '#FFFFFF',
} as const;

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deltaText(delta: number, lang: Locale, t: GenerateReportHtmlInput['t']): { text: string; color: string } {
  if (delta === 0) {
    return { text: t('report:delta.same'), color: PALETTE.muted };
  }
  const isUp = delta > 0;
  const formatted = formatIDR(Math.abs(delta), lang);
  // Pull localised wording from i18n then strip the up/down arrow
  // glyph (↑/↓) at the front. expo-print's PDF renderer uses the
  // system font cache which often lacks Unicode arrow coverage —
  // they render as `!'` placeholders. Use ASCII +/- prefixes
  // instead, with the colour already conveying direction.
  const raw = isUp
    ? t('report:delta.up', { amount: formatted })
    : t('report:delta.down', { amount: formatted });
  const cleaned = raw.replace(/[↑↓]\s*/u, '');
  const sign = isUp ? '+' : '-';
  return { text: `${sign}${cleaned}`, color: PALETTE.muted };
}

function summaryCell(
  label: string,
  amount: number,
  delta: number,
  invertDelta: boolean,
  lang: Locale,
  t: GenerateReportHtmlInput['t'],
): string {
  // For income: up = good (positive). For expense: up = danger
  // (invertDelta swaps the colour mapping). Same convention the
  // on-screen DeltaLine uses.
  const deltaColor: string = (() => {
    if (delta === 0) return PALETTE.muted;
    const isUp = delta > 0;
    const goodWhenUp = !invertDelta;
    return isUp === goodWhenUp ? PALETTE.positive : PALETTE.danger;
  })();
  const d = deltaText(delta, lang, t);
  return `
    <td style="width:50%;padding:14px 16px;vertical-align:top;border:1px solid ${PALETTE.border};">
      <div style="font-size:10px;font-weight:600;color:${PALETTE.muted};text-transform:uppercase;margin-bottom:6px;">
        ${escape(label)}
      </div>
      <div style="font-size:18px;font-weight:700;color:${PALETTE.fg};margin-bottom:3px;">
        ${escape(formatIDR(amount, lang))}
      </div>
      <div style="font-size:11px;color:${deltaColor};">
        ${escape(d.text)}
      </div>
    </td>
  `;
}

function summaryTable(input: GenerateReportHtmlInput): string {
  const { lang, t } = input;
  const incomeDelta = input.thisIncomeTotal - input.lastIncomeTotal;
  const expenseDelta = input.thisExpenseTotal - input.lastExpenseTotal;
  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      <tr>
        ${summaryCell(t('report:summary.income'), input.thisIncomeTotal, incomeDelta, false, lang, t)}
        ${summaryCell(t('report:summary.expense'), input.thisExpenseTotal, expenseDelta, true, lang, t)}
      </tr>
    </table>
  `;
}

function netHero(input: GenerateReportHtmlInput): string {
  const { lang, t, thisNet, lastNet } = input;
  const heroColor = thisNet >= 0 ? PALETTE.positive : PALETTE.danger;
  const delta = thisNet - lastNet;
  const d = deltaText(delta, lang, t);
  return `
    <div style="margin-top:20px;">
      <div style="font-size:10px;font-weight:700;color:${PALETTE.muted};text-transform:uppercase;margin-bottom:2px;">
        ${escape(t('report:summary.net'))}
      </div>
      <div style="font-size:28px;font-weight:700;color:${heroColor};margin-bottom:2px;">
        ${escape(formatIDR(thisNet, lang))}
      </div>
      <div style="font-size:11px;color:${PALETTE.muted};">
        ${escape(t('report:delta.vsLastMonth'))} &middot; ${escape(d.text)}
      </div>
    </div>
  `;
}

function breakdownTable(input: GenerateReportHtmlInput): string {
  const { lang, t, breakdown, categoriesById, thisExpenseTotal } = input;
  const sorted = [...breakdown]
    .filter((b) => b.totalIDR > 0)
    .sort((a, b) => b.totalIDR - a.totalIDR);

  const rows = sorted.map((row, i) => {
    const cat = categoriesById.get(row.categoryId);
    const name = cat?.name[lang] ?? row.categoryId;
    const share = thisExpenseTotal > 0 ? row.totalIDR / thisExpenseTotal : 0;
    const bg = i % 2 === 1 ? PALETTE.zebra : 'transparent';
    return `
      <tr style="background:${bg};">
        <td style="padding:8px 12px;border-bottom:1px solid ${PALETTE.border};font-size:11px;color:${PALETTE.fg};">
          ${escape(name)}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${PALETTE.border};font-size:11px;color:${PALETTE.muted};text-align:right;">
          ${escape(formatPercent(share, lang))}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${PALETTE.border};font-size:11px;font-weight:600;color:${PALETTE.fg};text-align:right;">
          ${escape(formatIDR(row.totalIDR, lang))}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;border:1px solid ${PALETTE.border};">
      <thead>
        <tr style="background:${PALETTE.zebra};">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:${PALETTE.muted};text-transform:uppercase;border-bottom:1px solid ${PALETTE.border};">
            ${escape(t('report:export.col.category'))}
          </th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:600;color:${PALETTE.muted};text-transform:uppercase;border-bottom:1px solid ${PALETTE.border};">
            ${escape(t('report:export.col.share'))}
          </th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:600;color:${PALETTE.muted};text-transform:uppercase;border-bottom:1px solid ${PALETTE.border};">
            ${escape(t('report:export.col.amount'))}
          </th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function topExpensesTable(input: GenerateReportHtmlInput): string {
  const { lang, t, topExpenses, categoriesById, accountsById } = input;
  const rows = topExpenses.slice(0, 5).map((tx, i) => {
    const cat = tx.splits[0]?.categoryId
      ? categoriesById.get(tx.splits[0].categoryId)
      : null;
    const acc = accountsById.get(tx.accountId);
    const desc = tx.description.trim() || (cat?.name[lang] ?? '');
    const meta = [cat?.name[lang], acc?.name].filter(Boolean).join(' · ');
    const bg = i % 2 === 1 ? PALETTE.zebra : 'transparent';
    return `
      <tr style="background:${bg};">
        <td style="padding:8px 12px;border-bottom:1px solid ${PALETTE.border};font-size:11px;color:${PALETTE.muted};white-space:nowrap;">
          ${escape(formatDate(new Date(`${tx.date}T00:00:00`), 'medium', lang))}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${PALETTE.border};font-size:11px;color:${PALETTE.fg};">
          <div>${escape(desc)}</div>
          ${meta ? `<div style="font-size:10px;color:${PALETTE.muted};margin-top:2px;">${escape(meta)}</div>` : ''}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid ${PALETTE.border};font-size:11px;font-weight:600;color:${PALETTE.fg};text-align:right;white-space:nowrap;">
          ${escape(formatIDR(tx.amountIDR, lang))}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;border:1px solid ${PALETTE.border};">
      <thead>
        <tr style="background:${PALETTE.zebra};">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:${PALETTE.muted};text-transform:uppercase;border-bottom:1px solid ${PALETTE.border};">
            ${escape(t('report:export.col.date'))}
          </th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:${PALETTE.muted};text-transform:uppercase;border-bottom:1px solid ${PALETTE.border};">
            ${escape(t('report:export.col.description'))}
          </th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:600;color:${PALETTE.muted};text-transform:uppercase;border-bottom:1px solid ${PALETTE.border};">
            ${escape(t('report:export.col.amount'))}
          </th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function sectionHeading(label: string): string {
  return `
    <div style="margin-top:24px;margin-bottom:8px;font-size:11px;font-weight:700;color:${PALETTE.muted};text-transform:uppercase;">
      ${escape(label)}
    </div>
  `;
}

/**
 * Build the full HTML document. Includes a `<style>` block with a
 * @page rule for PDF page margins (expo-print honours these).
 */
export function generateReportHtml(input: GenerateReportHtmlInput): string {
  const { lang, monthLabel, t } = input;
  const generatedOn = formatDate(new Date(), 'long', lang);
  const title = t('report:title', { month: monthLabel });

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escape(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: ${PALETTE.fg};
      background: ${PALETTE.pageBg};
    }
  </style>
</head>
<body>
  <div style="font-size:24px;font-weight:700;color:${PALETTE.fg};margin-bottom:4px;">
    ${escape(title)}
  </div>
  <div style="font-size:11px;color:${PALETTE.muted};margin-bottom:16px;">
    ${escape(t('report:exportSubtitle', { generatedOn }))}
  </div>

  ${sectionHeading(t('report:sections.summary'))}
  ${summaryTable(input)}
  ${netHero(input)}

  ${input.breakdown.length > 0 ? `
    ${sectionHeading(t('report:sections.breakdown'))}
    ${breakdownTable(input)}
  ` : ''}

  ${input.topExpenses.length > 0 ? `
    ${sectionHeading(t('report:sections.topTransactions'))}
    ${topExpensesTable(input)}
  ` : ''}

  <div style="margin-top:32px;text-align:center;font-style:italic;font-size:9px;color:${PALETTE.muted};">
    ${escape(t('report:exportFooter'))}
  </div>
</body>
</html>`;
}

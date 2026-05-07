import type {
  AccountSubtype, AccountType, CategoryColor, CategoryIcon,
} from '@compass/shared-types';

/**
 * Curated Indonesian-leaning subtype set (ADR-06 §2). Each subtype maps
 * to its parent type, a default icon (overridable in the picker), and a
 * default colour. Display names are NOT here — they live in the
 * `accounts` i18n namespace because the subtype is a stable enum key,
 * not user data.
 *
 * Adding a subtype: extend the AccountSubtype union in shared-types,
 * add an entry here, add `accounts.subtypes.<key>` in both locale JSONs.
 */

export type SubtypeMeta = {
  key: AccountSubtype;
  type: AccountType;
  icon: CategoryIcon;
  color: CategoryColor;
};

export const ACCOUNT_SUBTYPES: readonly SubtypeMeta[] = [
  // Cash
  { key: 'cash',          type: 'cash',        icon: 'coins',       color: 'amber'  },

  // Banks
  { key: 'bca',           type: 'bank',        icon: 'landmark',    color: 'blue'   },
  { key: 'mandiri',       type: 'bank',        icon: 'landmark',    color: 'yellow' },
  { key: 'bri',           type: 'bank',        icon: 'landmark',    color: 'blue'   },
  { key: 'bni',           type: 'bank',        icon: 'landmark',    color: 'orange' },
  { key: 'cimb',          type: 'bank',        icon: 'landmark',    color: 'red'    },
  { key: 'permata',       type: 'bank',        icon: 'landmark',    color: 'green'  },
  { key: 'danamon',       type: 'bank',        icon: 'landmark',    color: 'orange' },
  { key: 'btn',           type: 'bank',        icon: 'landmark',    color: 'blue'   },
  { key: 'bsi',           type: 'bank',        icon: 'landmark',    color: 'teal'   },
  { key: 'jago',          type: 'bank',        icon: 'landmark',    color: 'pink'   },
  { key: 'jenius',        type: 'bank',        icon: 'landmark',    color: 'blue'   },
  { key: 'blu',           type: 'bank',        icon: 'landmark',    color: 'cyan'   },
  { key: 'seabank',       type: 'bank',        icon: 'landmark',    color: 'cyan'   },
  { key: 'bank_other',    type: 'bank',        icon: 'landmark',    color: 'slate'  },

  // E-wallets
  { key: 'gopay',         type: 'ewallet',     icon: 'wallet',      color: 'green'  },
  { key: 'ovo',           type: 'ewallet',     icon: 'wallet',      color: 'violet' },
  { key: 'dana',          type: 'ewallet',     icon: 'wallet',      color: 'cyan'   },
  { key: 'shopeepay',     type: 'ewallet',     icon: 'wallet',      color: 'orange' },
  { key: 'linkaja',       type: 'ewallet',     icon: 'wallet',      color: 'red'    },
  { key: 'doku',          type: 'ewallet',     icon: 'wallet',      color: 'orange' },
  { key: 'ewallet_other', type: 'ewallet',     icon: 'wallet',      color: 'slate'  },

  // Credit cards
  { key: 'visa',          type: 'credit_card', icon: 'credit-card', color: 'blue'   },
  { key: 'mastercard',    type: 'credit_card', icon: 'credit-card', color: 'red'    },
  { key: 'jcb',           type: 'credit_card', icon: 'credit-card', color: 'blue'   },
  { key: 'amex',          type: 'credit_card', icon: 'credit-card', color: 'green'  },
  { key: 'card_other',    type: 'credit_card', icon: 'credit-card', color: 'slate'  },

  // Investments (v3 phase A — manual balance entry; live valuation
  // deferred to v3.5). Iconography reuses the existing registry: stocks
  // get the chart-going-up shape, mutual funds wear the briefcase, and
  // crypto reuses coins (visually distinct enough next to a 'cash' row
  // since the parent type group separates them).
  { key: 'reksadana',         type: 'investment',  icon: 'briefcase',   color: 'teal'   },
  { key: 'saham',             type: 'investment',  icon: 'trending-up', color: 'green'  },
  { key: 'crypto',            type: 'investment',  icon: 'coins',       color: 'orange' },
  { key: 'investment_other',  type: 'investment',  icon: 'briefcase',   color: 'slate'  },
];

const SUBTYPE_BY_KEY: Map<AccountSubtype, SubtypeMeta> = new Map(
  ACCOUNT_SUBTYPES.map((s) => [s.key, s]),
);

export function getSubtypeMeta(key: AccountSubtype): SubtypeMeta {
  const meta = SUBTYPE_BY_KEY.get(key);
  if (!meta) throw new Error(`Unknown account subtype: ${key}`);
  return meta;
}

export function subtypesForType(type: AccountType): SubtypeMeta[] {
  return ACCOUNT_SUBTYPES.filter((s) => s.type === type);
}

export const ACCOUNT_TYPES: readonly AccountType[] = [
  'cash', 'bank', 'ewallet', 'credit_card', 'investment',
];

import type { BudgetGroup, CategoryColor, CategoryIcon, CategoryName } from '@compass/shared-types';

/**
 * Indonesian-focused category presets seeded into every new workspace
 * (ADR-05 §3). 9 parents × ~4 children = ~45 docs. The shape here is the
 * input to `seedPresets` — the service maps each entry to a Firestore doc
 * with auto-generated id, `isPreset: true`, `isArchived: false`, and
 * `createdAt: serverTimestamp()`.
 *
 * `key` is a stable identifier for the preset within the seed module — it
 * does NOT become the Firestore doc id (that's auto-generated) but lets
 * children reference their parent in this static data without ordering
 * fragility. The seeder resolves keys → generated ids before writing.
 *
 * Order is determined by array position; the seeder assigns `order`
 * incrementing from 0 within each parent group.
 */

export type PresetCategory = {
  key: string;                  // stable within this module; NOT the Firestore id
  parentKey: string | null;     // references another preset's key, or null for top-level
  name: CategoryName;
  icon: CategoryIcon;
  color: CategoryColor;
  /**
   * 50/30/20 budget designation (ADR-21). Only consulted when the
   * user picks the `fifty_thirty_twenty` budget style. Top-level
   * parents leave this `null` since spending happens at leaves; the
   * 50/30/20 view aggregates each leaf's group. Income +
   * Investment categories are excluded from the 50/30/20 buckets
   * (income drives the targets; savings is handled separately).
   */
  budgetGroup?: BudgetGroup | null;
};

export const CATEGORY_PRESETS: readonly PresetCategory[] = [
  // Makanan & Minuman — groceries are needs, the rest are wants
  // (warteg / restoran / cafe / delivery are discretionary; the
  // user can re-tag if their living situation differs).
  { key: 'food',           parentKey: null,   name: { id: 'Makanan & Minuman', en: 'Food & Drink' }, icon: 'utensils',      color: 'orange' },
  { key: 'food.warteg',    parentKey: 'food', name: { id: 'Warteg',            en: 'Warteg'        }, icon: 'utensils',      color: 'orange', budgetGroup: 'wants' },
  { key: 'food.restoran',  parentKey: 'food', name: { id: 'Restoran',          en: 'Restaurant'    }, icon: 'pizza',         color: 'orange', budgetGroup: 'wants' },
  { key: 'food.cafe',      parentKey: 'food', name: { id: 'Cafe',              en: 'Cafe'          }, icon: 'coffee',        color: 'amber',  budgetGroup: 'wants' },
  { key: 'food.groceries', parentKey: 'food', name: { id: 'Belanja Dapur',     en: 'Groceries'     }, icon: 'shopping-cart', color: 'green',  budgetGroup: 'needs' },
  { key: 'food.delivery',  parentKey: 'food', name: { id: 'Delivery',          en: 'Delivery'      }, icon: 'pizza',         color: 'red',    budgetGroup: 'wants' },
  { key: 'food.jajan',     parentKey: 'food', name: { id: 'Jajan',             en: 'Snack'         }, icon: 'cookie',        color: 'yellow', budgetGroup: 'wants' },

  // Transportasi — Grab/Gojek/BBM/Parkir/KRL/Tol are mobility =
  // needs in most setups (work commute). User can flip to wants
  // if their commute is mostly leisure.
  { key: 'transport',          parentKey: null,        name: { id: 'Transportasi', en: 'Transportation' }, icon: 'car',             color: 'blue' },
  { key: 'transport.grab',     parentKey: 'transport', name: { id: 'Grab',         en: 'Grab'           }, icon: 'car',             color: 'green', budgetGroup: 'needs' },
  { key: 'transport.gojek',    parentKey: 'transport', name: { id: 'Gojek',        en: 'Gojek'          }, icon: 'bike',            color: 'green', budgetGroup: 'needs' },
  { key: 'transport.bbm',      parentKey: 'transport', name: { id: 'BBM',          en: 'Fuel'           }, icon: 'fuel',            color: 'red',   budgetGroup: 'needs' },
  { key: 'transport.parkir',   parentKey: 'transport', name: { id: 'Parkir',       en: 'Parking'        }, icon: 'parking-circle',  color: 'slate', budgetGroup: 'needs' },
  { key: 'transport.krl',      parentKey: 'transport', name: { id: 'KRL/MRT',      en: 'KRL/MRT'        }, icon: 'train',           color: 'cyan',  budgetGroup: 'needs' },
  { key: 'transport.tol',      parentKey: 'transport', name: { id: 'Tol',          en: 'Toll'           }, icon: 'car',             color: 'slate', budgetGroup: 'needs' },

  // Tagihan — utilities + insurance = needs by definition.
  // Streaming = wants (Netflix/Spotify aren't essential).
  { key: 'bills',            parentKey: null,    name: { id: 'Tagihan',  en: 'Bills'      }, icon: 'zap',         color: 'yellow' },
  { key: 'bills.listrik',    parentKey: 'bills', name: { id: 'Listrik',  en: 'Electricity' }, icon: 'zap',        color: 'yellow', budgetGroup: 'needs' },
  { key: 'bills.air',        parentKey: 'bills', name: { id: 'Air',      en: 'Water'      }, icon: 'droplet',     color: 'cyan',   budgetGroup: 'needs' },
  { key: 'bills.internet',   parentKey: 'bills', name: { id: 'Internet', en: 'Internet'   }, icon: 'wifi',        color: 'blue',   budgetGroup: 'needs' },
  { key: 'bills.pulsa',      parentKey: 'bills', name: { id: 'Pulsa',    en: 'Phone Credit' }, icon: 'phone',     color: 'violet', budgetGroup: 'needs' },
  { key: 'bills.streaming',  parentKey: 'bills', name: { id: 'Streaming', en: 'Streaming' }, icon: 'tv',          color: 'red',    budgetGroup: 'wants' },
  { key: 'bills.bpjs',       parentKey: 'bills', name: { id: 'BPJS',     en: 'BPJS'       }, icon: 'heart-pulse', color: 'green',  budgetGroup: 'needs' },

  // Belanja — pakaian / elektronik / skincare are wants;
  // rumah-tangga (household goods) is needs (cleaning supplies etc).
  { key: 'shopping',          parentKey: null,       name: { id: 'Belanja',         en: 'Shopping'      }, icon: 'shopping-cart', color: 'pink' },
  { key: 'shopping.pakaian',  parentKey: 'shopping', name: { id: 'Pakaian',         en: 'Clothing'      }, icon: 'shirt',         color: 'pink',  budgetGroup: 'wants' },
  { key: 'shopping.elektronik', parentKey: 'shopping', name: { id: 'Elektronik',    en: 'Electronics'   }, icon: 'tv-2',          color: 'slate', budgetGroup: 'wants' },
  { key: 'shopping.rumah',    parentKey: 'shopping', name: { id: 'Rumah Tangga',    en: 'Home Goods'    }, icon: 'home',          color: 'amber', budgetGroup: 'needs' },
  { key: 'shopping.skincare', parentKey: 'shopping', name: { id: 'Skincare',        en: 'Skincare'      }, icon: 'sparkles',      color: 'pink',  budgetGroup: 'wants' },

  // Hiburan — all wants by definition.
  { key: 'fun',           parentKey: null,  name: { id: 'Hiburan',  en: 'Entertainment' }, icon: 'film',      color: 'violet' },
  { key: 'fun.bioskop',   parentKey: 'fun', name: { id: 'Bioskop',  en: 'Cinema'        }, icon: 'film',      color: 'violet', budgetGroup: 'wants' },
  { key: 'fun.konser',    parentKey: 'fun', name: { id: 'Konser',   en: 'Concert'       }, icon: 'music',     color: 'pink',   budgetGroup: 'wants' },
  { key: 'fun.game',      parentKey: 'fun', name: { id: 'Game',     en: 'Games'         }, icon: 'gamepad-2', color: 'indigo', budgetGroup: 'wants' },
  { key: 'fun.liburan',   parentKey: 'fun', name: { id: 'Liburan',  en: 'Holiday'       }, icon: 'plane',     color: 'cyan',   budgetGroup: 'wants' },

  // Kesehatan — doctor + medication = needs; fitness = wants.
  { key: 'health',           parentKey: null,     name: { id: 'Kesehatan', en: 'Health'     }, icon: 'heart-pulse', color: 'green' },
  { key: 'health.dokter',    parentKey: 'health', name: { id: 'Dokter',    en: 'Doctor'     }, icon: 'stethoscope', color: 'green',  budgetGroup: 'needs' },
  { key: 'health.obat',      parentKey: 'health', name: { id: 'Obat',      en: 'Pharmacy'   }, icon: 'pill',        color: 'red',    budgetGroup: 'needs' },
  { key: 'health.olahraga',  parentKey: 'health', name: { id: 'Olahraga',  en: 'Fitness'    }, icon: 'dumbbell',    color: 'orange', budgetGroup: 'wants' },

  // Pendidikan — formal education + courses = needs (career),
  // books are wants by default (re-tag if working through a syllabus).
  { key: 'edu',          parentKey: null,  name: { id: 'Pendidikan', en: 'Education' }, icon: 'graduation-cap', color: 'indigo' },
  { key: 'edu.buku',     parentKey: 'edu', name: { id: 'Buku',       en: 'Books'    }, icon: 'book-open',       color: 'indigo', budgetGroup: 'wants' },
  { key: 'edu.kursus',   parentKey: 'edu', name: { id: 'Kursus',     en: 'Course'   }, icon: 'graduation-cap',  color: 'blue',   budgetGroup: 'needs' },
  { key: 'edu.sekolah',  parentKey: 'edu', name: { id: 'Sekolah',    en: 'School'   }, icon: 'graduation-cap',  color: 'indigo', budgetGroup: 'needs' },

  // Pemasukan — income categories don't get a 50/30/20 group;
  // they DRIVE the bucket targets, they don't fill them.
  { key: 'income',           parentKey: null,     name: { id: 'Pemasukan', en: 'Income'    }, icon: 'wallet',    color: 'teal' },
  { key: 'income.gaji',      parentKey: 'income', name: { id: 'Gaji',      en: 'Salary'    }, icon: 'briefcase', color: 'teal' },
  { key: 'income.bonus',     parentKey: 'income', name: { id: 'Bonus',     en: 'Bonus'     }, icon: 'gift',      color: 'teal' },
  { key: 'income.freelance', parentKey: 'income', name: { id: 'Freelance', en: 'Freelance' }, icon: 'briefcase', color: 'green' },
  { key: 'income.hadiah',    parentKey: 'income', name: { id: 'Hadiah',    en: 'Gift'      }, icon: 'gift',      color: 'pink' },

  // Investasi — savings group fills the 20% bucket.
  { key: 'invest',           parentKey: null,     name: { id: 'Investasi', en: 'Investment' }, icon: 'trending-up', color: 'teal' },
  { key: 'invest.saham',     parentKey: 'invest', name: { id: 'Saham',     en: 'Stocks'     }, icon: 'trending-up', color: 'green', budgetGroup: 'savings' },
  { key: 'invest.reksadana', parentKey: 'invest', name: { id: 'Reksa Dana', en: 'Mutual Fund' }, icon: 'landmark',  color: 'blue',  budgetGroup: 'savings' },
  { key: 'invest.emas',      parentKey: 'invest', name: { id: 'Emas',      en: 'Gold'       }, icon: 'coins',       color: 'amber', budgetGroup: 'savings' },
];

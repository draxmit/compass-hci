import type { CategoryColor, CategoryIcon, CategoryName } from '@compass/shared-types';

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
};

export const CATEGORY_PRESETS: readonly PresetCategory[] = [
  // Makanan & Minuman
  { key: 'food',           parentKey: null,   name: { id: 'Makanan & Minuman', en: 'Food & Drink' }, icon: 'utensils',      color: 'orange' },
  { key: 'food.warteg',    parentKey: 'food', name: { id: 'Warteg',            en: 'Warteg'        }, icon: 'utensils',      color: 'orange' },
  { key: 'food.restoran',  parentKey: 'food', name: { id: 'Restoran',          en: 'Restaurant'    }, icon: 'pizza',         color: 'orange' },
  { key: 'food.cafe',      parentKey: 'food', name: { id: 'Cafe',              en: 'Cafe'          }, icon: 'coffee',        color: 'amber' },
  { key: 'food.groceries', parentKey: 'food', name: { id: 'Belanja Dapur',     en: 'Groceries'     }, icon: 'shopping-cart', color: 'green' },
  { key: 'food.delivery',  parentKey: 'food', name: { id: 'Delivery',          en: 'Delivery'      }, icon: 'pizza',         color: 'red' },
  { key: 'food.jajan',     parentKey: 'food', name: { id: 'Jajan',             en: 'Snack'         }, icon: 'cookie',        color: 'yellow' },

  // Transportasi
  { key: 'transport',          parentKey: null,        name: { id: 'Transportasi', en: 'Transportation' }, icon: 'car',             color: 'blue' },
  { key: 'transport.grab',     parentKey: 'transport', name: { id: 'Grab',         en: 'Grab'           }, icon: 'car',             color: 'green' },
  { key: 'transport.gojek',    parentKey: 'transport', name: { id: 'Gojek',        en: 'Gojek'          }, icon: 'bike',            color: 'green' },
  { key: 'transport.bbm',      parentKey: 'transport', name: { id: 'BBM',          en: 'Fuel'           }, icon: 'fuel',            color: 'red' },
  { key: 'transport.parkir',   parentKey: 'transport', name: { id: 'Parkir',       en: 'Parking'        }, icon: 'parking-circle',  color: 'slate' },
  { key: 'transport.krl',      parentKey: 'transport', name: { id: 'KRL/MRT',      en: 'KRL/MRT'        }, icon: 'train',           color: 'cyan' },
  { key: 'transport.tol',      parentKey: 'transport', name: { id: 'Tol',          en: 'Toll'           }, icon: 'car',             color: 'slate' },

  // Tagihan
  { key: 'bills',            parentKey: null,    name: { id: 'Tagihan',  en: 'Bills'      }, icon: 'zap',         color: 'yellow' },
  { key: 'bills.listrik',    parentKey: 'bills', name: { id: 'Listrik',  en: 'Electricity' }, icon: 'zap',        color: 'yellow' },
  { key: 'bills.air',        parentKey: 'bills', name: { id: 'Air',      en: 'Water'      }, icon: 'droplet',     color: 'cyan' },
  { key: 'bills.internet',   parentKey: 'bills', name: { id: 'Internet', en: 'Internet'   }, icon: 'wifi',        color: 'blue' },
  { key: 'bills.pulsa',      parentKey: 'bills', name: { id: 'Pulsa',    en: 'Phone Credit' }, icon: 'phone',     color: 'violet' },
  { key: 'bills.streaming',  parentKey: 'bills', name: { id: 'Streaming', en: 'Streaming' }, icon: 'tv',          color: 'red' },
  { key: 'bills.bpjs',       parentKey: 'bills', name: { id: 'BPJS',     en: 'BPJS'       }, icon: 'heart-pulse', color: 'green' },

  // Belanja
  { key: 'shopping',          parentKey: null,       name: { id: 'Belanja',         en: 'Shopping'      }, icon: 'shopping-cart', color: 'pink' },
  { key: 'shopping.pakaian',  parentKey: 'shopping', name: { id: 'Pakaian',         en: 'Clothing'      }, icon: 'shirt',         color: 'pink' },
  { key: 'shopping.elektronik', parentKey: 'shopping', name: { id: 'Elektronik',    en: 'Electronics'   }, icon: 'tv-2',          color: 'slate' },
  { key: 'shopping.rumah',    parentKey: 'shopping', name: { id: 'Rumah Tangga',    en: 'Home Goods'    }, icon: 'home',          color: 'amber' },
  { key: 'shopping.skincare', parentKey: 'shopping', name: { id: 'Skincare',        en: 'Skincare'      }, icon: 'sparkles',      color: 'pink' },

  // Hiburan
  { key: 'fun',           parentKey: null,  name: { id: 'Hiburan',  en: 'Entertainment' }, icon: 'film',      color: 'violet' },
  { key: 'fun.bioskop',   parentKey: 'fun', name: { id: 'Bioskop',  en: 'Cinema'        }, icon: 'film',      color: 'violet' },
  { key: 'fun.konser',    parentKey: 'fun', name: { id: 'Konser',   en: 'Concert'       }, icon: 'music',     color: 'pink' },
  { key: 'fun.game',      parentKey: 'fun', name: { id: 'Game',     en: 'Games'         }, icon: 'gamepad-2', color: 'indigo' },
  { key: 'fun.liburan',   parentKey: 'fun', name: { id: 'Liburan',  en: 'Holiday'       }, icon: 'plane',     color: 'cyan' },

  // Kesehatan
  { key: 'health',           parentKey: null,     name: { id: 'Kesehatan', en: 'Health'     }, icon: 'heart-pulse', color: 'green' },
  { key: 'health.dokter',    parentKey: 'health', name: { id: 'Dokter',    en: 'Doctor'     }, icon: 'stethoscope', color: 'green' },
  { key: 'health.obat',      parentKey: 'health', name: { id: 'Obat',      en: 'Pharmacy'   }, icon: 'pill',        color: 'red' },
  { key: 'health.olahraga',  parentKey: 'health', name: { id: 'Olahraga',  en: 'Fitness'    }, icon: 'dumbbell',    color: 'orange' },

  // Pendidikan
  { key: 'edu',          parentKey: null,  name: { id: 'Pendidikan', en: 'Education' }, icon: 'graduation-cap', color: 'indigo' },
  { key: 'edu.buku',     parentKey: 'edu', name: { id: 'Buku',       en: 'Books'    }, icon: 'book-open',       color: 'indigo' },
  { key: 'edu.kursus',   parentKey: 'edu', name: { id: 'Kursus',     en: 'Course'   }, icon: 'graduation-cap',  color: 'blue' },
  { key: 'edu.sekolah',  parentKey: 'edu', name: { id: 'Sekolah',    en: 'School'   }, icon: 'graduation-cap',  color: 'indigo' },

  // Pemasukan
  { key: 'income',           parentKey: null,     name: { id: 'Pemasukan', en: 'Income'    }, icon: 'wallet',    color: 'teal' },
  { key: 'income.gaji',      parentKey: 'income', name: { id: 'Gaji',      en: 'Salary'    }, icon: 'briefcase', color: 'teal' },
  { key: 'income.bonus',     parentKey: 'income', name: { id: 'Bonus',     en: 'Bonus'     }, icon: 'gift',      color: 'teal' },
  { key: 'income.freelance', parentKey: 'income', name: { id: 'Freelance', en: 'Freelance' }, icon: 'briefcase', color: 'green' },
  { key: 'income.hadiah',    parentKey: 'income', name: { id: 'Hadiah',    en: 'Gift'      }, icon: 'gift',      color: 'pink' },

  // Investasi
  { key: 'invest',           parentKey: null,     name: { id: 'Investasi', en: 'Investment' }, icon: 'trending-up', color: 'teal' },
  { key: 'invest.saham',     parentKey: 'invest', name: { id: 'Saham',     en: 'Stocks'     }, icon: 'trending-up', color: 'green' },
  { key: 'invest.reksadana', parentKey: 'invest', name: { id: 'Reksa Dana', en: 'Mutual Fund' }, icon: 'landmark',  color: 'blue' },
  { key: 'invest.emas',      parentKey: 'invest', name: { id: 'Emas',      en: 'Gold'       }, icon: 'coins',       color: 'amber' },
];

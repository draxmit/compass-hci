// Seeds a demo user + varied workspace data into the project's Firebase
// project so the user can sign in to see every feature populated.
//
// Run with:
//   node scripts/seed-demo.mjs
//
// Reads `app/.env.local` for the Firebase Web SDK config — same vars the
// app itself uses, so this script works against whatever project the app
// is currently pointed at. No Firebase Admin SDK needed; the script signs
// in as the demo user and writes through the same Firestore security
// rules as the live app.
//
// Idempotent: re-running wipes the demo user's existing accounts /
// transactions / budgets / category_month_totals first, then re-seeds.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, query,
  serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';

// ---- Config ----

const DEMO_EMAIL = 'demo@compass.app';
const DEMO_PASSWORD = 'compass2026';

// ---- Helpers ----

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function loadEnvLocal() {
  const path = resolve(REPO_ROOT, 'app', '.env.local');
  const raw = readFileSync(path, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    env[k] = v;
  }
  return env;
}

function log(...args) {
  console.log('[seed]', ...args);
}

// ---- Category presets (mirrors app/src/shared/data/categoryPresets.ts) ----
//
// Kept in sync manually since the script can't use TS path aliases. If the
// app's preset list changes, update this too. The script seeds these only
// when a fresh demo user is being created (ensureUserDoc-equivalent).

const CATEGORY_PRESETS = [
  { key: 'food',           parentKey: null,   name: { id: 'Makanan & Minuman', en: 'Food & Drink' }, icon: 'utensils',      color: 'orange' },
  { key: 'food.warteg',    parentKey: 'food', name: { id: 'Warteg',            en: 'Warteg'        }, icon: 'utensils',      color: 'orange' },
  { key: 'food.restoran',  parentKey: 'food', name: { id: 'Restoran',          en: 'Restaurant'    }, icon: 'pizza',         color: 'orange' },
  { key: 'food.cafe',      parentKey: 'food', name: { id: 'Cafe',              en: 'Cafe'          }, icon: 'coffee',        color: 'amber' },
  { key: 'food.groceries', parentKey: 'food', name: { id: 'Belanja Dapur',     en: 'Groceries'     }, icon: 'shopping-cart', color: 'green' },
  { key: 'food.delivery',  parentKey: 'food', name: { id: 'Delivery',          en: 'Delivery'      }, icon: 'pizza',         color: 'red' },
  { key: 'food.jajan',     parentKey: 'food', name: { id: 'Jajan',             en: 'Snack'         }, icon: 'cookie',        color: 'yellow' },

  { key: 'transport',          parentKey: null,        name: { id: 'Transportasi', en: 'Transportation' }, icon: 'car',             color: 'blue' },
  { key: 'transport.grab',     parentKey: 'transport', name: { id: 'Grab',         en: 'Grab'           }, icon: 'car',             color: 'green' },
  { key: 'transport.gojek',    parentKey: 'transport', name: { id: 'Gojek',        en: 'Gojek'          }, icon: 'bike',            color: 'green' },
  { key: 'transport.bbm',      parentKey: 'transport', name: { id: 'BBM',          en: 'Fuel'           }, icon: 'fuel',            color: 'red' },
  { key: 'transport.parkir',   parentKey: 'transport', name: { id: 'Parkir',       en: 'Parking'        }, icon: 'parking-circle',  color: 'slate' },
  { key: 'transport.krl',      parentKey: 'transport', name: { id: 'KRL/MRT',      en: 'KRL/MRT'        }, icon: 'train',           color: 'cyan' },
  { key: 'transport.tol',      parentKey: 'transport', name: { id: 'Tol',          en: 'Toll'           }, icon: 'car',             color: 'slate' },

  { key: 'bills',           parentKey: null,    name: { id: 'Tagihan',  en: 'Bills'      }, icon: 'zap',         color: 'yellow' },
  { key: 'bills.listrik',   parentKey: 'bills', name: { id: 'Listrik',  en: 'Electricity' }, icon: 'zap',        color: 'yellow' },
  { key: 'bills.air',       parentKey: 'bills', name: { id: 'Air',      en: 'Water'      }, icon: 'droplet',     color: 'cyan' },
  { key: 'bills.internet',  parentKey: 'bills', name: { id: 'Internet', en: 'Internet'   }, icon: 'wifi',        color: 'blue' },
  { key: 'bills.pulsa',     parentKey: 'bills', name: { id: 'Pulsa',    en: 'Phone Credit' }, icon: 'phone',     color: 'violet' },
  { key: 'bills.streaming', parentKey: 'bills', name: { id: 'Streaming', en: 'Streaming' }, icon: 'tv',          color: 'red' },
  { key: 'bills.bpjs',      parentKey: 'bills', name: { id: 'BPJS',     en: 'BPJS'       }, icon: 'heart-pulse', color: 'green' },

  { key: 'shopping',            parentKey: null,       name: { id: 'Belanja',      en: 'Shopping'    }, icon: 'shopping-cart', color: 'pink' },
  { key: 'shopping.pakaian',    parentKey: 'shopping', name: { id: 'Pakaian',      en: 'Clothing'    }, icon: 'shirt',         color: 'pink' },
  { key: 'shopping.elektronik', parentKey: 'shopping', name: { id: 'Elektronik',   en: 'Electronics' }, icon: 'tv-2',          color: 'slate' },
  { key: 'shopping.rumah',      parentKey: 'shopping', name: { id: 'Rumah Tangga', en: 'Home Goods'  }, icon: 'home',          color: 'amber' },
  { key: 'shopping.skincare',   parentKey: 'shopping', name: { id: 'Skincare',     en: 'Skincare'    }, icon: 'sparkles',      color: 'pink' },

  { key: 'fun',           parentKey: null,  name: { id: 'Hiburan',  en: 'Entertainment' }, icon: 'film',      color: 'violet' },
  { key: 'fun.bioskop',   parentKey: 'fun', name: { id: 'Bioskop',  en: 'Cinema'        }, icon: 'film',      color: 'violet' },
  { key: 'fun.konser',    parentKey: 'fun', name: { id: 'Konser',   en: 'Concert'       }, icon: 'music',     color: 'pink' },
  { key: 'fun.game',      parentKey: 'fun', name: { id: 'Game',     en: 'Games'         }, icon: 'gamepad-2', color: 'indigo' },
  { key: 'fun.liburan',   parentKey: 'fun', name: { id: 'Liburan',  en: 'Holiday'       }, icon: 'plane',     color: 'cyan' },

  { key: 'health',          parentKey: null,     name: { id: 'Kesehatan', en: 'Health'   }, icon: 'heart-pulse', color: 'green' },
  { key: 'health.dokter',   parentKey: 'health', name: { id: 'Dokter',    en: 'Doctor'   }, icon: 'stethoscope', color: 'green' },
  { key: 'health.obat',     parentKey: 'health', name: { id: 'Obat',      en: 'Pharmacy' }, icon: 'pill',        color: 'red' },
  { key: 'health.olahraga', parentKey: 'health', name: { id: 'Olahraga',  en: 'Fitness'  }, icon: 'dumbbell',    color: 'orange' },

  { key: 'edu',         parentKey: null,  name: { id: 'Pendidikan', en: 'Education' }, icon: 'graduation-cap', color: 'indigo' },
  { key: 'edu.buku',    parentKey: 'edu', name: { id: 'Buku',       en: 'Books'    }, icon: 'book-open',       color: 'indigo' },
  { key: 'edu.kursus',  parentKey: 'edu', name: { id: 'Kursus',     en: 'Course'   }, icon: 'graduation-cap',  color: 'blue' },
  { key: 'edu.sekolah', parentKey: 'edu', name: { id: 'Sekolah',    en: 'School'   }, icon: 'graduation-cap',  color: 'indigo' },

  { key: 'income',           parentKey: null,     name: { id: 'Pemasukan', en: 'Income'    }, icon: 'wallet',    color: 'teal' },
  { key: 'income.gaji',      parentKey: 'income', name: { id: 'Gaji',      en: 'Salary'    }, icon: 'briefcase', color: 'teal' },
  { key: 'income.bonus',     parentKey: 'income', name: { id: 'Bonus',     en: 'Bonus'     }, icon: 'gift',      color: 'teal' },
  { key: 'income.freelance', parentKey: 'income', name: { id: 'Freelance', en: 'Freelance' }, icon: 'briefcase', color: 'green' },
  { key: 'income.hadiah',    parentKey: 'income', name: { id: 'Hadiah',    en: 'Gift'      }, icon: 'gift',      color: 'pink' },

  { key: 'invest',           parentKey: null,     name: { id: 'Investasi',  en: 'Investment'  }, icon: 'trending-up', color: 'teal' },
  { key: 'invest.saham',     parentKey: 'invest', name: { id: 'Saham',      en: 'Stocks'      }, icon: 'trending-up', color: 'green' },
  { key: 'invest.reksadana', parentKey: 'invest', name: { id: 'Reksa Dana', en: 'Mutual Fund' }, icon: 'landmark',    color: 'blue' },
  { key: 'invest.emas',      parentKey: 'invest', name: { id: 'Emas',       en: 'Gold'        }, icon: 'coins',       color: 'amber' },
];

// ---- Date helpers ----

function ym(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dayOfMonth(year, month, day) {
  // year is full year, month is 1-indexed
  return new Date(year, month - 1, day);
}

// Return all Saturday + Sunday day-of-month numbers for the given
// year/month (month is 1-indexed). Used by the demo seeder to engineer
// a weekend-heavy spending pattern so Insights tab's day-of-week
// section has something to surface.
function weekendsInMonth(year, month) {
  const days = new Date(year, month, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) out.push(d);
  }
  return out;
}

// ---- Main ----

async function main() {
  const env = loadEnvLocal();
  const cfg = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  for (const [k, v] of Object.entries(cfg)) {
    if (!v) {
      console.error(`[seed] missing env var for ${k} — check app/.env.local`);
      process.exit(1);
    }
  }
  log(`Firebase project: ${cfg.projectId}`);

  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // ---- Sign in or sign up ----
  let user;
  try {
    const cred = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
    user = cred.user;
    log(`Signed in as existing demo user (uid: ${user.uid})`);
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      log('Demo user not found — creating…');
      const cred = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
      user = cred.user;
      log(`Created demo user (uid: ${user.uid})`);
    } else {
      throw err;
    }
  }

  const uid = user.uid;
  const wid = `solo-${uid}`;

  // ---- Ensure user + workspace + preset categories ----
  // Merge-style upsert so re-runs of the script also refresh the demo
  // user's profile fields (e.g., when we add new fields like primaryGoal
  // in T10). The categories seed only happens on first creation.
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const userData = {
    uid,
    email: DEMO_EMAIL,
    displayName: 'Demo Compass',
    locale: 'id',
    theme: 'system',
    baseCurrency: 'IDR',
    budgetStyle: 'monthly_limit',
    biometricEnabled: false,
    fcmTokens: [],
    onboardingComplete: true,    // skip onboarding for the demo
    primaryGoal: 'Lebaran 2027', // T10 / ADR-11 — surfaces as Dashboard goal pill
    createdAt: serverTimestamp(),
    defaultWorkspaceId: wid,
    workspaceIds: [wid],
  };
  if (!userSnap.exists()) {
    log('Seeding user + workspace + preset categories…');
    const batch = writeBatch(db);
    batch.set(userRef, userData);
    batch.set(doc(db, 'workspaces', wid), {
      id: wid,
      ownerId: uid,
      memberIds: [uid],
      name: 'Personal',
      createdAt: serverTimestamp(),
    });
    // Seed preset categories — same shape as the app's seedPresets().
    const keyToId = {};
    for (const preset of CATEGORY_PRESETS) {
      const ref = doc(collection(db, 'workspaces', wid, 'categories'));
      keyToId[preset.key] = ref.id;
    }
    let order = 0;
    for (const preset of CATEGORY_PRESETS) {
      const ref = doc(db, 'workspaces', wid, 'categories', keyToId[preset.key]);
      batch.set(ref, {
        id: keyToId[preset.key],
        parentId: preset.parentKey ? keyToId[preset.parentKey] : null,
        name: preset.name,
        icon: preset.icon,
        color: preset.color,
        isPreset: true,
        isArchived: false,
        order: order++,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    log(`Seeded ${CATEGORY_PRESETS.length} preset categories.`);
  } else {
    log('User doc already exists; refreshing profile fields (merge)…');
    // Refresh the user doc with the latest field set without clobbering
    // anything else. Specifically picks up primaryGoal added in T10.
    await setDoc(userRef, {
      onboardingComplete: true,
      primaryGoal: 'Lebaran 2027',
      displayName: 'Demo Compass',
    }, { merge: true });
  }

  // ---- Wipe existing accounts / transactions / budgets / month totals / goals ----
  log('Wiping existing demo data…');
  await wipeCollection(db, ['workspaces', wid, 'accounts']);
  await wipeCollection(db, ['workspaces', wid, 'transactions']);
  await wipeCollection(db, ['workspaces', wid, 'budgets']);
  await wipeCollection(db, ['workspaces', wid, 'category_month_totals']);
  await wipeCollection(db, ['workspaces', wid, 'goals']);
  await wipeCollection(db, ['workspaces', wid, 'saved_filters']);

  // ---- Seed pinned dashboard goal (ADR-20) ----
  // Lebaran 2027 with target Rp 12jt + current Rp 5jt → ~42% progress
  // bar on the Dashboard pill. Replaces the legacy primaryGoal field
  // path; the migration helper will no-op since pinnedGoalId is now set.
  log('Seeding goals…');
  const goalRef = doc(collection(db, 'workspaces', wid, 'goals'));
  await setDoc(goalRef, {
    kind: 'sinking_fund',
    name: 'Lebaran 2027',
    targetMinor: 12_000_000_00,
    currentMinor: 5_000_000_00,
    targetDate: '2027-04-01',
    templateKey: 'lebaran_thr',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Update user doc to pin this goal + clear legacy primaryGoal.
  await setDoc(userRef, {
    pinnedGoalId: goalRef.id,
    primaryGoal: null,
  }, { merge: true });

  // ---- Look up category ids by their stored name.id ----
  const catSnap = await getDocs(collection(db, 'workspaces', wid, 'categories'));
  const catByNameId = new Map();
  for (const d of catSnap.docs) {
    const data = d.data();
    catByNameId.set(data.name.id, d.id);
  }
  function catId(idName) {
    const id = catByNameId.get(idName);
    if (!id) throw new Error(`Category not found: ${idName}`);
    return id;
  }

  // ---- Seed accounts ----
  log('Seeding accounts…');
  // Initial balances chosen to absorb the 6-month seeded outflow
  // without any account going negative. BCA gets monthly Gaji so its
  // initial just needs to cover one-month float; GoPay + Cash get no
  // income, so their initials must cover total 6-month outflow + a
  // healthy positive ending balance.
  const accountSpecs = [
    { localKey: 'bca',   name: 'BCA',           type: 'bank',        subtype: 'bca',        currency: 'IDR', initialBalance: 1_200_000_000, includedInNetWorth: true,  icon: 'landmark',    color: 'blue' },   // Rp 12.000.000 (~1 month float)
    { localKey: 'gopay', name: 'GoPay',         type: 'ewallet',     subtype: 'gopay',      currency: 'IDR', initialBalance: 400_000_000,   includedInNetWorth: true,  icon: 'wallet',      color: 'green' }, // Rp 4.000.000
    { localKey: 'cash',  name: 'Tunai',         type: 'cash',        subtype: 'cash',       currency: 'IDR', initialBalance: 250_000_000,   includedInNetWorth: true,  icon: 'wallet',      color: 'amber' }, // Rp 2.500.000
    // Credit cards conceptually carry "amount you owe" but we track
    // them on the same number-line as cash accounts (negative =
    // you owe). Starting at 0 so the demo doesn't pre-load a debt
    // that the user has to mentally explain — any tx swiped on the
    // card during the seeded period will move it negative naturally.
    { localKey: 'card',  name: 'Mandiri Card',  type: 'credit_card', subtype: 'mastercard', currency: 'IDR', initialBalance: 0,            includedInNetWorth: true, icon: 'credit-card', color: 'red' },
    // v2: showcase the multi-currency feature with a USD savings account.
    // $2,150 (215000 minor) at the snapshot rate of Rp 16,500/USD ≈ Rp 35.5M
    // — appears on the dashboard net-worth via FX conversion + carries the
    // 'USD' badge on the accounts list row.
    { localKey: 'usd',   name: 'USD Savings',   type: 'bank',        subtype: 'bank_other', currency: 'USD', initialBalance: 215_000,     includedInNetWorth: true,  icon: 'landmark',    color: 'teal' },
  ];
  const acctIds = {};
  {
    const batch = writeBatch(db);
    let order = 0;
    for (const spec of accountSpecs) {
      const ref = doc(collection(db, 'workspaces', wid, 'accounts'));
      acctIds[spec.localKey] = ref.id;
      batch.set(ref, {
        id: ref.id,
        name: spec.name,
        type: spec.type,
        subtype: spec.subtype,
        currency: spec.currency,
        currentBalance: spec.initialBalance,    // we'll re-derive via tx writes below
        initialBalance: spec.initialBalance,
        includedInNetWorth: spec.includedInNetWorth,
        isArchived: false,
        icon: spec.icon,
        color: spec.color,
        order: order++,
        // Mark seeded accounts as already-migrated for both the
        // minor-units shift and the ADR-22 liability sign-flip so the
        // auth-time migrations skip them on subsequent sign-ins.
        _balanceUnitsV2: true,
        _liabilityModelV2: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  // ---- Build the transaction list ----
  // Today's date drives the month windows. Use a stable now reference so all
  // dates we generate fall before "today" — the report screen and Dashboard
  // both filter by yearMonth, so the dates just need to land in the right
  // month.
  //
  // 6-month trend window so the Insights tab's trend bar has shape (per
  // ADR-13). Anomaly seeding (engineered category bump + single-tx outlier)
  // is layered into current-month transactions inside buildDemoTransactions.
  const now = new Date();
  const monthOffsets = [0, -1, -2, -3, -4, -5];   // current → 5 months ago
  const months = monthOffsets.map((off) => {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    return { date: d, ym: ym(d) };
  });
  const thisYM = months[0].ym;
  const lastYM = months[1].ym;
  const twoMAgoYM = months[2].ym;

  log(`Seeding transactions for ${months.map((m) => m.ym).reverse().join(' / ')}…`);

  const txs = buildDemoTransactions({
    now, months,
    accountIds: acctIds, catId,
  });
  log(`  ${txs.length} transactions queued.`);

  // ---- Write transactions in chunks ----
  // Each tx = 1 set (tx doc) + 1 update (account balance) + (expense only)
  // 1 set-merge (category month total). Stay under Firestore's 500 / batch
  // limit by chunking.
  const CHUNK = 100;  // ~300 writes per chunk worst case
  for (let start = 0; start < txs.length; start += CHUNK) {
    const slice = txs.slice(start, start + CHUNK);
    const batch = writeBatch(db);
    for (const tx of slice) {
      const ref = doc(collection(db, 'workspaces', wid, 'transactions'));
      batch.set(ref, {
        type: tx.type,
        date: tx.date,
        yearMonth: tx.date.slice(0, 7),
        accountId: tx.accountId,
        toAccountId: tx.toAccountId ?? null,
        currency: 'IDR',
        amount: tx.amount,
        amountIDR: tx.amount,
        splits: tx.type === 'transfer' ? [] : [{ categoryId: tx.categoryId, amount: tx.amount }],
        description: tx.description,
        // Demo seed engineers a few tags so the new tag UI has something
        // to render: `dinas`, `nongki`, `lebaran-2027`, `bandung-trip`,
        // applied via tx.tags from buildDemoTransactions's tag helpers.
        tags: tx.tags ?? [],
        source: 'manual',
        rawInput: null,
        confidence: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      // Balance delta — applies ADR-22 liability sign-flip: credit_card
      // accounts INCREMENT on outflow (debt grows) and DECREMENT on
      // inflow (debt paid). Asset accounts use the natural model.
      const acctRef = doc(db, 'workspaces', wid, 'accounts', tx.accountId);
      const sourceSpec = accountSpecs.find((s) => acctIds[s.localKey] === tx.accountId);
      const sourceIsLiability = sourceSpec?.type === 'credit_card';
      const sourceOutDelta = sourceIsLiability ? tx.amount : -tx.amount;
      const sourceInDelta = sourceIsLiability ? -tx.amount : tx.amount;
      if (tx.type === 'expense') {
        batch.update(acctRef, { currentBalance: increment(sourceOutDelta), updatedAt: serverTimestamp() });
      } else if (tx.type === 'income') {
        batch.update(acctRef, { currentBalance: increment(sourceInDelta), updatedAt: serverTimestamp() });
      } else {
        // transfer
        batch.update(acctRef, { currentBalance: increment(sourceOutDelta), updatedAt: serverTimestamp() });
        if (tx.toAccountId) {
          const destSpec = accountSpecs.find((s) => acctIds[s.localKey] === tx.toAccountId);
          const destIsLiability = destSpec?.type === 'credit_card';
          const destInDelta = destIsLiability ? -tx.amount : tx.amount;
          batch.update(doc(db, 'workspaces', wid, 'accounts', tx.toAccountId), {
            currentBalance: increment(destInDelta),
            updatedAt: serverTimestamp(),
          });
        }
      }
      // Category month total upsert (expense only)
      if (tx.type === 'expense') {
        const ymKey = tx.date.slice(0, 7);
        const cmtRef = doc(db, 'workspaces', wid, 'category_month_totals', `${ymKey}_${tx.categoryId}`);
        batch.set(cmtRef, {
          categoryId: tx.categoryId,
          yearMonth: ymKey,
          totalIDR: increment(tx.amount),
          txCount: increment(1),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    }
    await batch.commit();
    log(`  wrote ${Math.min(start + CHUNK, txs.length)} / ${txs.length}`);
  }

  // ---- Seed budgets for the active month ----
  log('Seeding budgets for the active month…');
  // Budget targets are tuned against the txs above so the Budgets tab
  // renders one under-budget row, one near-limit row, one over-budget row,
  // and a couple comfortably-under rows.
  const budgetSpecs = [
    { categoryName: 'Warteg',    limitMinor: 700_000_00 },   // expect ~50% — under
    { categoryName: 'Grab',      limitMinor: 400_000_00 },   // expect ~95% — near
    { categoryName: 'Bioskop',   limitMinor: 100_000_00 },   // expect ~160% — OVER
    { categoryName: 'Pulsa',     limitMinor: 200_000_00 },   // expect ~25% — comfortably under
    { categoryName: 'Skincare',  limitMinor: 700_000_00 },   // expect ~57% — under
    { categoryName: 'Cafe',      limitMinor: 400_000_00 },   // expect ~85%
  ];
  {
    const batch = writeBatch(db);
    for (const b of budgetSpecs) {
      const cid = catId(b.categoryName);
      const id = `${thisYM}_${cid}`;
      batch.set(doc(db, 'workspaces', wid, 'budgets', id), {
        yearMonth: thisYM,
        categoryId: cid,
        style: 'monthly_limit',
        limitMinor: b.limitMinor,
        rolloverPolicy: 'none',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }

  // ---- Seed last-month budgets so the Envelope view has carryover ----
  // Slightly wider limits last month so a couple categories carry
  // surplus into this month — gives the envelope-rollover line
  // something to show. Last-month spending generally undershot
  // (see buildDemoTransactions).
  log('Seeding last-month budgets for envelope carryover…');
  {
    const batch = writeBatch(db);
    const lastBudgetSpecs = [
      { categoryName: 'Warteg',   limitMinor: 350_000_00 },
      { categoryName: 'Grab',     limitMinor: 600_000_00 },
      { categoryName: 'Pulsa',    limitMinor: 200_000_00 },
      { categoryName: 'Cafe',     limitMinor: 500_000_00 },
    ];
    for (const b of lastBudgetSpecs) {
      const cid = catId(b.categoryName);
      const id = `${lastYM}_${cid}`;
      batch.set(doc(db, 'workspaces', wid, 'budgets', id), {
        yearMonth: lastYM,
        categoryId: cid,
        style: 'envelope',
        limitMinor: b.limitMinor,
        rolloverPolicy: 'carry_over',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }

  // ---- Seed saved filter presets ----
  // Three presets that showcase the feature on first sight: a tag
  // filter (bandung-trip), a type-and-tag filter (cafe nongki), and
  // a date-range preset (last month).
  log('Seeding saved filters…');
  {
    const batch = writeBatch(db);
    const presets = [
      {
        name: 'Bandung trip',
        search: '',
        typeFilter: 'all',
        dateFilter: 'all_time',
        tagFilter: ['bandung-trip'],
      },
      {
        name: 'Nongki sessions',
        search: '',
        typeFilter: 'expense',
        dateFilter: 'this_month',
        tagFilter: ['nongki'],
      },
      {
        name: 'Last month spending',
        search: '',
        typeFilter: 'expense',
        dateFilter: 'last_month',
        tagFilter: [],
      },
    ];
    for (const p of presets) {
      const ref = doc(collection(db, 'workspaces', wid, 'saved_filters'));
      batch.set(ref, {
        ...p,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(' Demo data seeded. Sign in to the app with:');
  log('');
  log(`   Email:    ${DEMO_EMAIL}`);
  log(`   Password: ${DEMO_PASSWORD}`);
  log('');
  log(' Months populated (6-month trend window for Insights):');
  log(`   ${months.map((m) => m.ym).reverse().join(', ')}`);
  log(' 4 accounts: BCA, GoPay, Tunai, Mandiri Card');
  log(' 6 budgets:  Warteg, Grab, Bioskop, Pulsa, Skincare, Cafe');
  log(' Engineered for Insights tab:');
  log('   - Bioskop ANOMALY: 4 movies this month vs ~1 historically');
  log('   - Skincare ANOMALY: Rp 1.5M splurge tx vs ~Rp 200k baseline avg');
  log('   - Weekend Grab spike for day-of-week pattern');
  log('   - Heavy day-14 cluster (Bandung trip) for heatmap signal');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // The Web SDK keeps a long-lived listener; force-exit so the script
  // finishes cleanly.
  process.exit(0);
}

// ---- Wipe helper ----

async function wipeCollection(db, pathSegments) {
  const ref = collection(db, ...pathSegments);
  const snap = await getDocs(ref);
  if (snap.empty) return;
  // Chunk deletions in case there are 500+ docs.
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

// ---- Demo transaction list ----
//
// Hand-curated for storytelling: the user opens the app and sees a
// believable Indonesian-context spend pattern. Amounts are tuned so:
//
//   - Warteg ≈ Rp 350k spent vs Rp 700k limit → 50% (under)
//   - Grab ≈ Rp 380k vs Rp 400k limit → 95% (near limit)
//   - Bioskop ≈ Rp 160k vs Rp 100k limit → 160% (over budget)
//   - Pulsa ≈ Rp 50k vs Rp 200k limit → 25%
//   - Skincare ≈ Rp 400k vs Rp 700k limit → 57%
//   - Cafe ≈ Rp 340k vs Rp 400k limit → 85%
//
// + income (Gaji + Freelance) so net is positive
// + variety across accounts (BCA, GoPay, Cash, Card)
//
// Last month and two-months-ago have similar but not identical patterns
// so the report's vs-last-month delta isn't all zeros.

function buildDemoTransactions({
  now, months, accountIds, catId,
}) {
  const txs = [];
  const yyyy = now.getFullYear();
  const mm = now.getMonth() + 1;       // 1-indexed
  const today = now.getDate();

  // Pull out the canonical references the existing inline-block code
  // expects (current / last / two-ago).
  const lastM = months[1].date;
  const twoMAgo = months[2].date;

  const A = accountIds;
  // Helper to build a date string within a given month, clamped so we
  // never seed transactions in the future relative to "today" of the
  // month it's running in.
  function date(year, month, day) {
    const clamped = month === mm && year === yyyy ? Math.min(day, today) : day;
    return ymd(dayOfMonth(year, month, clamped));
  }

  // ===== Current month =====
  // Income (Gaji + Freelance)
  txs.push({ type: 'income',  date: date(yyyy, mm, 1),  accountId: A.bca,   categoryId: catId('Gaji'),       amount: 8_500_000_00, description: 'Gaji bulan ini' });
  txs.push({ type: 'income',  date: date(yyyy, mm, 5),  accountId: A.bca,   categoryId: catId('Freelance'),  amount: 1_200_000_00, description: 'Project freelance' });

  // Bills
  txs.push({ type: 'expense', date: date(yyyy, mm, 1),  accountId: A.bca,   categoryId: catId('Internet'),   amount: 350_000_00,   description: 'Indihome' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 1),  accountId: A.bca,   categoryId: catId('Listrik'),    amount: 410_000_00,   description: 'PLN Mei' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 2),  accountId: A.gopay, categoryId: catId('Pulsa'),      amount: 50_000_00,    description: 'Topup Telkomsel' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 3),  accountId: A.bca,   categoryId: catId('BPJS'),       amount: 150_000_00,   description: 'BPJS bulanan' });

  // Warteg ~Rp 350k
  txs.push({ type: 'expense', date: date(yyyy, mm, 2),  accountId: A.cash,  categoryId: catId('Warteg'),     amount: 28_000_00,    description: 'Warteg makan siang' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 4),  accountId: A.cash,  categoryId: catId('Warteg'),     amount: 32_000_00,    description: 'Warteg' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 6),  accountId: A.cash,  categoryId: catId('Warteg'),     amount: 30_000_00,    description: 'Warteg' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 7),  accountId: A.cash,  categoryId: catId('Warteg'),     amount: 35_000_00,    description: 'Warteg makan malam' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 9),  accountId: A.cash,  categoryId: catId('Warteg'),     amount: 27_000_00,    description: 'Warteg' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 11), accountId: A.cash,  categoryId: catId('Warteg'),     amount: 33_000_00,    description: 'Warteg' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 13), accountId: A.cash,  categoryId: catId('Warteg'),     amount: 40_000_00,    description: 'Warteg + es teh' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 16), accountId: A.cash,  categoryId: catId('Warteg'),     amount: 30_000_00,    description: 'Warteg' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 18), accountId: A.cash,  categoryId: catId('Warteg'),     amount: 32_000_00,    description: 'Warteg' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 20), accountId: A.cash,  categoryId: catId('Warteg'),     amount: 35_000_00,    description: 'Warteg' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 23), accountId: A.cash,  categoryId: catId('Warteg'),     amount: 28_000_00,    description: 'Warteg' });

  // Cafe ~Rp 340k. Tag a few `nongki` so the demo's tag-frequency
  // table has a second meaningful entry beyond `bandung-trip`.
  txs.push({ type: 'expense', date: date(yyyy, mm, 3),  accountId: A.card,  categoryId: catId('Cafe'),       amount: 65_000_00,    description: 'Kopi Janji Jiwa', tags: ['nongki'] });
  txs.push({ type: 'expense', date: date(yyyy, mm, 5),  accountId: A.card,  categoryId: catId('Cafe'),       amount: 78_000_00,    description: 'Cafe meeting',    tags: ['dinas'] });
  txs.push({ type: 'expense', date: date(yyyy, mm, 8),  accountId: A.gopay, categoryId: catId('Cafe'),       amount: 55_000_00,    description: 'Starbucks',       tags: ['nongki'] });
  txs.push({ type: 'expense', date: date(yyyy, mm, 14), accountId: A.card,  categoryId: catId('Cafe'),       amount: 72_000_00,    description: 'Cafe sambil kerja' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 19), accountId: A.gopay, categoryId: catId('Cafe'),       amount: 70_000_00,    description: 'Kopi Kenangan',   tags: ['nongki'] });

  // Grab ~Rp 380k
  txs.push({ type: 'expense', date: date(yyyy, mm, 2),  accountId: A.gopay, categoryId: catId('Grab'),       amount: 35_000_00,    description: 'Grab ke kantor' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 4),  accountId: A.gopay, categoryId: catId('Grab'),       amount: 28_000_00,    description: 'Grab pulang' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 6),  accountId: A.gopay, categoryId: catId('Grab'),       amount: 42_000_00,    description: 'Grab ke mall' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 10), accountId: A.gopay, categoryId: catId('Grab'),       amount: 55_000_00,    description: 'Grab nge-meeting' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 12), accountId: A.gopay, categoryId: catId('Grab'),       amount: 38_000_00,    description: 'Grab' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 15), accountId: A.gopay, categoryId: catId('Grab'),       amount: 65_000_00,    description: 'Grab ke bandara' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 17), accountId: A.gopay, categoryId: catId('Grab'),       amount: 40_000_00,    description: 'Grab' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 21), accountId: A.gopay, categoryId: catId('Grab'),       amount: 32_000_00,    description: 'Grab' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 24), accountId: A.gopay, categoryId: catId('Grab'),       amount: 45_000_00,    description: 'Grab' });

  // Gojek
  txs.push({ type: 'expense', date: date(yyyy, mm, 7),  accountId: A.gopay, categoryId: catId('Gojek'),      amount: 18_000_00,    description: 'Gojek bike' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 14), accountId: A.gopay, categoryId: catId('Gojek'),      amount: 22_000_00,    description: 'Gojek bike' });

  // BBM
  txs.push({ type: 'expense', date: date(yyyy, mm, 8),  accountId: A.bca,   categoryId: catId('BBM'),        amount: 200_000_00,   description: 'Pertamax' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 22), accountId: A.bca,   categoryId: catId('BBM'),        amount: 180_000_00,   description: 'Pertamax' });

  // Skincare ~Rp 400k routine + ENGINEERED Rp 1.5M anomaly so the
  // Insights tab's single-transaction anomaly callout has something
  // concrete to surface (per ADR-13 §9 demo-seed update).
  txs.push({ type: 'expense', date: date(yyyy, mm, 5),  accountId: A.bca,   categoryId: catId('Skincare'),   amount: 250_000_00,   description: 'Skincare The Originote' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 18), accountId: A.card,  categoryId: catId('Skincare'),   amount: 150_000_00,   description: 'Sunscreen Wardah' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 12), accountId: A.card,  categoryId: catId('Skincare'),   amount: 1_500_000_00, description: 'Splurge: La Roche-Posay set lengkap' });

  // Bioskop — engineered ANOMALY: 4 movies + 1 concert this month vs ~1
  // historically, so the Insights category-anomaly callout triggers.
  txs.push({ type: 'expense', date: date(yyyy, mm, 9),  accountId: A.gopay, categoryId: catId('Bioskop'),    amount: 75_000_00,    description: 'CGV — Doctor Strange' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 23), accountId: A.gopay, categoryId: catId('Bioskop'),    amount: 85_000_00,    description: 'XXI weekend' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 16), accountId: A.gopay, categoryId: catId('Bioskop'),    amount: 90_000_00,    description: 'XXI premiere' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 24), accountId: A.gopay, categoryId: catId('Bioskop'),    amount: 95_000_00,    description: 'CGV imax' });

  // Weekend Grab spike for the day-of-week pattern signal.
  // Find Saturdays + Sundays inside this month and front-load Grab on them.
  for (const day of weekendsInMonth(yyyy, mm).slice(0, 4)) {
    txs.push({ type: 'expense', date: date(yyyy, mm, day), accountId: A.gopay, categoryId: catId('Grab'), amount: 80_000_00, description: 'Grab weekend' });
  }
  // One particularly heavy day early in the month for the heatmap
  // (multiple expensive transactions cluster on day 14, a single
  // weekend day-trip). Tag-seeded so the new Tags filter (ADR-17) has
  // a clear "show me everything from the Bandung trip" use-case ready
  // for the demo.
  txs.push({ type: 'expense', date: date(yyyy, mm, 14), accountId: A.gopay, categoryId: catId('Restoran'), amount: 380_000_00, description: 'Day-trip Bandung — makan siang', tags: ['bandung-trip'] });
  txs.push({ type: 'expense', date: date(yyyy, mm, 14), accountId: A.bca,   categoryId: catId('BBM'),     amount: 250_000_00, description: 'Pertamax Bandung',           tags: ['bandung-trip'] });
  txs.push({ type: 'expense', date: date(yyyy, mm, 14), accountId: A.cash,  categoryId: catId('Tol'),     amount: 95_000_00,  description: 'Tol PP',                     tags: ['bandung-trip'] });

  // Delivery + Restoran + Jajan
  txs.push({ type: 'expense', date: date(yyyy, mm, 11), accountId: A.gopay, categoryId: catId('Delivery'),   amount: 120_000_00,   description: 'GoFood weekend' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 17), accountId: A.gopay, categoryId: catId('Delivery'),   amount: 95_000_00,    description: 'GrabFood' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 16), accountId: A.card,  categoryId: catId('Restoran'),   amount: 250_000_00,   description: 'Dinner di Sushi Tei' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 12), accountId: A.cash,  categoryId: catId('Jajan'),      amount: 25_000_00,    description: 'Indomie + Aqua' });

  // Belanja Dapur
  txs.push({ type: 'expense', date: date(yyyy, mm, 5),  accountId: A.bca,   categoryId: catId('Belanja Dapur'), amount: 380_000_00, description: 'Belanja mingguan' });
  txs.push({ type: 'expense', date: date(yyyy, mm, 19), accountId: A.bca,   categoryId: catId('Belanja Dapur'), amount: 280_000_00, description: 'Indomaret' });

  // Transfer to GoPay (varied account mvmt)
  txs.push({ type: 'transfer', date: date(yyyy, mm, 4),  accountId: A.bca,   toAccountId: A.gopay, amount: 500_000_00, description: 'Topup GoPay' });

  // ===== Last month — similar but distinct totals so deltas are interesting =====
  const ly = lastM.getFullYear();
  const lmn = lastM.getMonth() + 1;
  const lmDays = new Date(ly, lmn, 0).getDate();   // last day of last month

  txs.push({ type: 'income',  date: date(ly, lmn, 1),  accountId: A.bca,   categoryId: catId('Gaji'),       amount: 8_500_000_00, description: 'Gaji April' });
  txs.push({ type: 'expense', date: date(ly, lmn, 1),  accountId: A.bca,   categoryId: catId('Internet'),   amount: 350_000_00,   description: 'Indihome' });
  txs.push({ type: 'expense', date: date(ly, lmn, 2),  accountId: A.bca,   categoryId: catId('Listrik'),    amount: 380_000_00,   description: 'PLN April' });
  txs.push({ type: 'expense', date: date(ly, lmn, 5),  accountId: A.gopay, categoryId: catId('Pulsa'),      amount: 50_000_00,    description: 'Topup' });

  // Warteg Last month — slightly less
  for (const d of [3, 5, 8, 10, 12, 15, 17, 20, 22]) {
    txs.push({ type: 'expense', date: date(ly, lmn, Math.min(d, lmDays)), accountId: A.cash, categoryId: catId('Warteg'), amount: 30_000_00, description: 'Warteg' });
  }
  // Cafe last month — bigger
  for (const d of [4, 9, 13, 19, 25]) {
    txs.push({ type: 'expense', date: date(ly, lmn, Math.min(d, lmDays)), accountId: A.card, categoryId: catId('Cafe'), amount: 80_000_00, description: 'Cafe' });
  }
  // Grab last month — bigger overall (so this-month delta reads as DOWN)
  for (const d of [2, 4, 7, 11, 14, 16, 19, 22, 25, 28]) {
    txs.push({ type: 'expense', date: date(ly, lmn, Math.min(d, lmDays)), accountId: A.gopay, categoryId: catId('Grab'), amount: 50_000_00, description: 'Grab' });
  }
  // Big April hiburan
  txs.push({ type: 'expense', date: date(ly, lmn, Math.min(15, lmDays)), accountId: A.card,  categoryId: catId('Konser'),     amount: 600_000_00, description: 'Konser Tulus' });
  txs.push({ type: 'expense', date: date(ly, lmn, Math.min(7, lmDays)),  accountId: A.gopay, categoryId: catId('Bioskop'),    amount: 75_000_00,  description: 'XXI' });
  txs.push({ type: 'expense', date: date(ly, lmn, Math.min(20, lmDays)), accountId: A.card,  categoryId: catId('Restoran'),   amount: 320_000_00, description: 'Dinner birthday' });
  txs.push({ type: 'expense', date: date(ly, lmn, Math.min(10, lmDays)), accountId: A.bca,   categoryId: catId('BBM'),        amount: 200_000_00, description: 'Pertamax' });
  txs.push({ type: 'expense', date: date(ly, lmn, Math.min(28, lmDays)), accountId: A.bca,   categoryId: catId('Belanja Dapur'), amount: 350_000_00, description: 'Belanja' });
  txs.push({ type: 'expense', date: date(ly, lmn, Math.min(6, lmDays)),  accountId: A.bca,   categoryId: catId('Pakaian'),    amount: 450_000_00, description: 'Uniqlo' });
  txs.push({ type: 'expense', date: date(ly, lmn, Math.min(12, lmDays)), accountId: A.bca,   categoryId: catId('Skincare'),   amount: 380_000_00, description: 'Skincare set' });

  // ===== Two months ago — leaner spend =====
  const ty2 = twoMAgo.getFullYear();
  const tm2 = twoMAgo.getMonth() + 1;
  const tm2Days = new Date(ty2, tm2, 0).getDate();

  txs.push({ type: 'income',  date: date(ty2, tm2, 1), accountId: A.bca,  categoryId: catId('Gaji'),     amount: 8_500_000_00, description: 'Gaji' });
  txs.push({ type: 'expense', date: date(ty2, tm2, 1), accountId: A.bca,  categoryId: catId('Internet'), amount: 350_000_00,   description: 'Indihome' });
  txs.push({ type: 'expense', date: date(ty2, tm2, 1), accountId: A.bca,  categoryId: catId('Listrik'),  amount: 360_000_00,   description: 'PLN' });
  for (const d of [4, 8, 12, 16, 22, 26]) {
    txs.push({ type: 'expense', date: date(ty2, tm2, Math.min(d, tm2Days)), accountId: A.cash, categoryId: catId('Warteg'), amount: 28_000_00, description: 'Warteg' });
  }
  for (const d of [3, 9, 17, 21, 28]) {
    txs.push({ type: 'expense', date: date(ty2, tm2, Math.min(d, tm2Days)), accountId: A.gopay, categoryId: catId('Grab'), amount: 35_000_00, description: 'Grab' });
  }
  txs.push({ type: 'expense', date: date(ty2, tm2, Math.min(14, tm2Days)), accountId: A.bca, categoryId: catId('Belanja Dapur'), amount: 320_000_00, description: 'Indomaret' });
  txs.push({ type: 'expense', date: date(ty2, tm2, Math.min(20, tm2Days)), accountId: A.bca, categoryId: catId('BBM'),           amount: 200_000_00, description: 'Pertamax' });

  // ===== 3, 4, 5 months ago — baseline-pattern fill so the 6-month
  // trend bar on Insights has shape (per ADR-13 §9). Each month has a
  // similar but not identical mix; amounts vary so the trend isn't flat.
  for (let monthIdx = 3; monthIdx <= 5; monthIdx++) {
    const md = months[monthIdx].date;
    const myr = md.getFullYear();
    const mmn = md.getMonth() + 1;
    const mdays = new Date(myr, mmn, 0).getDate();
    // Salary
    txs.push({ type: 'income',  date: date(myr, mmn, 1), accountId: A.bca, categoryId: catId('Gaji'),     amount: 8_500_000_00, description: 'Gaji' });
    // Bills
    txs.push({ type: 'expense', date: date(myr, mmn, 1), accountId: A.bca, categoryId: catId('Internet'), amount: 350_000_00,   description: 'Indihome' });
    txs.push({ type: 'expense', date: date(myr, mmn, 2), accountId: A.bca, categoryId: catId('Listrik'),  amount: (350_000 + monthIdx * 10_000) * 100, description: 'PLN' });
    txs.push({ type: 'expense', date: date(myr, mmn, 5), accountId: A.gopay, categoryId: catId('Pulsa'),  amount: 50_000_00,    description: 'Topup' });
    txs.push({ type: 'expense', date: date(myr, mmn, 3), accountId: A.bca, categoryId: catId('BPJS'),     amount: 150_000_00,   description: 'BPJS' });
    // Warteg
    for (const d of [3, 6, 9, 12, 15, 18, 21, 24]) {
      txs.push({ type: 'expense', date: date(myr, mmn, Math.min(d, mdays)), accountId: A.cash, categoryId: catId('Warteg'), amount: (28_000 + monthIdx * 1_000) * 100, description: 'Warteg' });
    }
    // Cafe
    for (const d of [4, 11, 18, 25]) {
      txs.push({ type: 'expense', date: date(myr, mmn, Math.min(d, mdays)), accountId: A.card, categoryId: catId('Cafe'), amount: (60_000 + monthIdx * 5_000) * 100, description: 'Cafe' });
    }
    // Grab
    for (const d of [2, 6, 10, 14, 18, 22, 26]) {
      txs.push({ type: 'expense', date: date(myr, mmn, Math.min(d, mdays)), accountId: A.gopay, categoryId: catId('Grab'), amount: (35_000 + monthIdx * 2_000) * 100, description: 'Grab' });
    }
    // BBM
    txs.push({ type: 'expense', date: date(myr, mmn, Math.min(11, mdays)), accountId: A.bca, categoryId: catId('BBM'),    amount: 200_000_00, description: 'Pertamax' });
    // Belanja Dapur
    txs.push({ type: 'expense', date: date(myr, mmn, Math.min(8, mdays)),  accountId: A.bca, categoryId: catId('Belanja Dapur'), amount: 300_000_00, description: 'Belanja' });
    // Skincare — small amounts so the historical median stays low
    // (makes the current-month Rp 1.5M splurge stand out for the
    // Insights single-tx anomaly callout).
    txs.push({ type: 'expense', date: date(myr, mmn, Math.min(15, mdays)), accountId: A.bca, categoryId: catId('Skincare'),     amount: (200_000 + monthIdx * 10_000) * 100, description: 'Skincare basics' });
    // Bioskop — just one movie historically (so the current-month 4
    // movies trigger the category-anomaly callout)
    txs.push({ type: 'expense', date: date(myr, mmn, Math.min(20, mdays)), accountId: A.gopay, categoryId: catId('Bioskop'),    amount: 75_000_00, description: 'XXI' });
  }

  // Sort ascending by date so oldest writes first (cosmetic — Firestore
  // doesn't care, but it makes the in-batch ordering reflect intent).
  txs.sort((a, b) => a.date.localeCompare(b.date));
  return txs;
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(1);
});

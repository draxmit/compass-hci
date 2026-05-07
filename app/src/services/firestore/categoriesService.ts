import type {
  BudgetGroup, Category, CategoryColor, CategoryIcon, CategoryName,
} from '@compass/shared-types';
import {
  collection, doc, getDocs, onSnapshot,
  serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import type { WriteBatch } from 'firebase/firestore';

import { db } from '../firebase/client';
import { CATEGORY_PRESETS } from '@/shared/data/categoryPresets';

/** Reference helpers — kept inline rather than exported because the path is
 * an internal detail of the service. */
function categoriesCollection(wid: string) {
  return collection(db, 'workspaces', wid, 'categories');
}
function categoryRef(wid: string, id: string) {
  return doc(db, 'workspaces', wid, 'categories', id);
}

export type CreateCategoryInput = {
  parentId: string | null;
  name: CategoryName;
  icon: CategoryIcon;
  color: CategoryColor;
  /** 50/30/20 group designation (ADR-21). Optional — defaults to
   * `null` (= treated as 'wants' by the 50/30/20 view). */
  budgetGroup?: BudgetGroup | null;
};

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

/**
 * One-shot read. Used for places that don't need realtime updates (e.g. the
 * transaction-entry sheet picking a category once). Excludes archived rows.
 *
 * Note: filter + sort run client-side because combining `where(isArchived)` +
 * `orderBy(order)` on Firestore would require a composite index. Categories
 * collections stay small (<100 docs even after years), so client-side is fine.
 */
export async function listCategories(wid: string): Promise<Category[]> {
  const snap = await getDocs(categoriesCollection(wid));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<Category, 'id'>), id: d.id }))
    .filter((c) => !c.isArchived)
    .sort((a, b) => a.order - b.order);
}

/**
 * Realtime subscription used by the /categories screen. Returns the
 * unsubscribe function. Excludes archived rows from the default view; the
 * "Show archived" toggle (v2) will use a separate subscription path. Filter +
 * sort run client-side (see `listCategories` for rationale).
 */
export function subscribeCategories(
  wid: string,
  cb: (categories: Category[]) => void,
): () => void {
  return onSnapshot(categoriesCollection(wid), (snap) => {
    const list = snap.docs
      .map((d) => ({ ...(d.data() as Omit<Category, 'id'>), id: d.id }))
      .filter((c) => !c.isArchived)
      .sort((a, b) => a.order - b.order);
    cb(list);
  });
}

/**
 * In-flight promise so concurrent callers share one execution. Without
 * this, React StrictMode's double-mount + Firebase's auth-state replay can
 * fire the seeder twice in quick succession; both invocations would see
 * "no presets" and both commit full preset batches, leaving the user with
 * 2× presets.
 */
let seedInFlight: Promise<void> | null = null;

/**
 * Idempotent first-launch / backfill / self-heal helper. Three states:
 *
 *   - **Healthy:** ~45 preset docs, no duplicates → no-op.
 *   - **Fresh user:** 0 preset docs → seed the full list.
 *   - **Corrupted (duplicated):** seed previously raced and produced 2×+
 *     copies of each preset → wipe ALL `isPreset:true` docs and reseed.
 *
 * Custom user categories (`isPreset:false`) are never touched — they
 * survive both fresh and self-heal paths.
 *
 * Concurrency-safe via a module-level in-flight promise.
 */
export function ensureCategoriesSeeded(wid: string): Promise<void> {
  if (seedInFlight) return seedInFlight;
  seedInFlight = (async () => {
    try {
      const snap = await getDocs(categoriesCollection(wid));
      const presets = snap.docs.filter((d) => (d.data() as Category).isPreset === true);

      // Detect duplicates by `name.id` (preset names are deterministic;
      // any repeat means we got duplicated by an earlier race).
      const seen = new Set<string>();
      let hasDuplicates = false;
      for (const d of presets) {
        const key = (d.data() as Category).name.id;
        if (seen.has(key)) {
          hasDuplicates = true;
          break;
        }
        seen.add(key);
      }

      // Healthy state: presets exist and are unique. Nothing to do.
      if (presets.length > 0 && !hasDuplicates) return;

      // Self-heal: wipe all preset docs first if any exist (corrupted
      // state). Custom user docs are left intact.
      if (presets.length > 0) {
        const wipeBatch = writeBatch(db);
        for (const d of presets) wipeBatch.delete(d.ref);
        await wipeBatch.commit();
      }

      // Seed fresh.
      const seedBatch = writeBatch(db);
      seedPresets(seedBatch, wid);
      await seedBatch.commit();
    } finally {
      seedInFlight = null;
    }
  })();
  return seedInFlight;
}

/**
 * Append a new custom category. `order` is set to (max existing order in
 * sibling group) + 1 so it lands at the bottom of its parent group.
 */
export async function createCategory(wid: string, input: CreateCategoryInput): Promise<string> {
  const ref = doc(categoriesCollection(wid));
  // Compute next order within the sibling group. Filter client-side for the
  // same reason listCategories does — avoids the where()+orderBy() composite
  // index requirement.
  const all = await getDocs(categoriesCollection(wid));
  const nextOrder = all.docs.reduce((max, d) => {
    const data = d.data() as Category;
    if (data.parentId !== input.parentId) return max;
    return typeof data.order === 'number' && data.order > max ? data.order : max;
  }, -1) + 1;

  await writeBatch(db)
    .set(ref, {
      parentId: input.parentId,
      name: input.name,
      icon: input.icon,
      color: input.color,
      // 50/30/20 group — caller passes the group, otherwise null
      // (read layer treats null as 'wants' for aggregation).
      budgetGroup: input.budgetGroup ?? null,
      isPreset: false,
      isArchived: false,
      order: nextOrder,
      createdAt: serverTimestamp(),
    })
    .commit();
  return ref.id;
}

/** Patch a subset of fields. Caller passes only what changed. */
export async function updateCategory(
  wid: string,
  id: string,
  patch: UpdateCategoryInput,
): Promise<void> {
  await updateDoc(categoryRef(wid, id), patch);
}

/** Soft delete: archive. Reversible via {@link restoreCategory}. */
export async function archiveCategory(wid: string, id: string): Promise<void> {
  await updateDoc(categoryRef(wid, id), { isArchived: true });
}

export async function restoreCategory(wid: string, id: string): Promise<void> {
  await updateDoc(categoryRef(wid, id), { isArchived: false });
}

/**
 * Add preset writes to the caller's existing `WriteBatch`. Caller is
 * responsible for `batch.commit()` — we share the batch so user + workspace
 * + categories all land atomically (ADR-05 §2).
 *
 * Resolves preset `key` strings to Firestore-generated doc ids before
 * writing, so child rows can reference their parent's id correctly.
 */
export function seedPresets(batch: WriteBatch, wid: string): void {
  // Pass 1: assign a Firestore ref + id per preset key.
  const keyToRef = new Map<string, ReturnType<typeof categoryRef>>();
  for (const preset of CATEGORY_PRESETS) {
    keyToRef.set(preset.key, doc(categoriesCollection(wid)));
  }

  // Pass 2: write each doc with parentId resolved to the parent's generated id.
  // Order increments globally; renderer groups by parentId so the absolute
  // value just needs to preserve the array's relative ordering.
  let order = 0;
  for (const preset of CATEGORY_PRESETS) {
    const ref = keyToRef.get(preset.key)!;
    const parentRef = preset.parentKey ? keyToRef.get(preset.parentKey) : null;
    batch.set(ref, {
      parentId: parentRef ? parentRef.id : null,
      name: preset.name,
      icon: preset.icon,
      color: preset.color,
      // 50/30/20 group designation (ADR-21). Defaults from the preset
      // table; persisted as `null` for income/parent rows that aren't
      // budgeted under 50/30/20.
      budgetGroup: preset.budgetGroup ?? null,
      isPreset: true,
      isArchived: false,
      order: order++,
      createdAt: serverTimestamp(),
    });
  }
}

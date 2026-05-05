import type { Category, CategoryColor, CategoryIcon, CategoryName } from '@compass/shared-types';
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
 * Idempotent first-launch (or one-off backfill) helper. Reads the categories
 * collection for the workspace; if empty, seeds the presets in a fresh batch.
 *
 * Required for users created before T4 shipped — `ensureUserDoc` runs the
 * seed atomically *only* when it creates the user doc, so existing accounts
 * miss the seed. This function fills that gap idempotently.
 */
export async function ensureCategoriesSeeded(wid: string): Promise<void> {
  const snap = await getDocs(categoriesCollection(wid));
  if (snap.size > 0) return;
  const batch = writeBatch(db);
  seedPresets(batch, wid);
  await batch.commit();
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
      isPreset: true,
      isArchived: false,
      order: order++,
      createdAt: serverTimestamp(),
    });
  }
}

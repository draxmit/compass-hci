import type { Category, CategoryColor, CategoryIcon, CategoryName } from '@compass/shared-types';
import {
  collection, deleteDoc as _delete, doc, getDocs, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import type { WriteBatch } from 'firebase/firestore';

import { db } from '../firebase/client';
import { CATEGORY_PRESETS } from '@/shared/data/categoryPresets';

// Suppress unused-imports warning — these are part of the documented service
// surface even if not yet wired into screens.
void _delete;

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
 */
export async function listCategories(wid: string): Promise<Category[]> {
  const q = query(categoriesCollection(wid), where('isArchived', '==', false), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Category, 'id'>), id: d.id }));
}

/**
 * Realtime subscription used by the /categories screen. Returns the
 * unsubscribe function. Excludes archived rows from the default view; the
 * "Show archived" toggle (v2) will use a separate subscription with the
 * filter flipped.
 */
export function subscribeCategories(
  wid: string,
  cb: (categories: Category[]) => void,
): () => void {
  const q = query(categoriesCollection(wid), where('isArchived', '==', false), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ ...(d.data() as Omit<Category, 'id'>), id: d.id }));
    cb(list);
  });
}

/**
 * Append a new custom category. `order` is set to (max existing order in
 * sibling group) + 1 so it lands at the bottom of its parent group.
 */
export async function createCategory(wid: string, input: CreateCategoryInput): Promise<string> {
  const ref = doc(categoriesCollection(wid));
  // Compute next order within the sibling group. One round-trip; T6 will
  // do this differently when transactions land (cached siblings list).
  const siblingsQuery = query(
    categoriesCollection(wid),
    where('parentId', '==', input.parentId),
  );
  const siblings = await getDocs(siblingsQuery);
  const nextOrder = siblings.docs.reduce((max, d) => {
    const o = (d.data() as Category).order;
    return typeof o === 'number' && o > max ? o : max;
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

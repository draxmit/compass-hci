import type { SavedFilter, TransactionType } from '@compass/shared-types';
import {
  collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc,
} from 'firebase/firestore';

import { db } from '../firebase/client';

function savedFiltersCollection(wid: string) {
  return collection(db, 'workspaces', wid, 'saved_filters');
}

function savedFilterRef(wid: string, id: string) {
  return doc(db, 'workspaces', wid, 'saved_filters', id);
}

export type CreateSavedFilterInput = {
  name: string;
  search: string;
  typeFilter: 'all' | TransactionType;
  dateFilter: 'this_month' | 'last_month' | 'all_time';
  tagFilter: string[];
};

/**
 * Realtime subscription for the /transactions tab. The list is
 * small (typical user keeps ~3–8 presets) so client-side sort by
 * createdAt-desc is fine.
 */
export function subscribeSavedFilters(
  wid: string,
  cb: (filters: SavedFilter[]) => void,
): () => void {
  return onSnapshot(savedFiltersCollection(wid), (snap) => {
    const list = snap.docs.map(
      (d) => ({ ...(d.data() as Omit<SavedFilter, 'id'>), id: d.id }),
    );
    // Stable sort: most recently created first. createdAt may be null
    // briefly during the local optimistic write window, so guard.
    list.sort((a, b) => {
      const ta = (a.createdAt as { seconds?: number } | null)?.seconds ?? 0;
      const tb = (b.createdAt as { seconds?: number } | null)?.seconds ?? 0;
      return tb - ta;
    });
    cb(list);
  });
}

/**
 * Create a new preset. Doc id is auto-generated; the name is the
 * user-facing handle. Duplicate names are allowed — the chip row
 * renders both, and users can delete the older one.
 */
export async function createSavedFilter(
  wid: string,
  input: CreateSavedFilterInput,
): Promise<string> {
  const ref = doc(savedFiltersCollection(wid));
  await setDoc(ref, {
    name: input.name,
    search: input.search,
    typeFilter: input.typeFilter,
    dateFilter: input.dateFilter,
    tagFilter: input.tagFilter,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Hard delete — presets carry no transactional state, so no
 *  cleanup beyond the doc removal. */
export async function deleteSavedFilter(wid: string, id: string): Promise<void> {
  await deleteDoc(savedFilterRef(wid, id));
}

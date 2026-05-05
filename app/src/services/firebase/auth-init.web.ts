import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import type { Auth } from 'firebase/auth';

import { app } from './client-app';

/**
 * Web auth init. `getAuth` is synchronous; `setPersistence` returns a Promise
 * but we don't await it — Firebase queues subsequent calls until persistence
 * resolves. Surface failures to the console rather than blocking module load.
 */
export const firebaseAuth: Auth = getAuth(app);
setPersistence(firebaseAuth, browserLocalPersistence).catch((err: unknown) => {
  console.warn('[firebase] setPersistence failed', err);
});

import { getFirestore } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';

import { firebaseAuth } from './auth-init';
import { app } from './client-app';

export { app };
export const auth: Auth = firebaseAuth;
export const db: Firestore = getFirestore(app);

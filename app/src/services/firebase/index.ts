// Public surface of the firebase service module. App code imports from here.
// Internal files (`client-app`, `auth-init.*`, `google-signin.*`) are
// implementation details; only client + auth + firestore + the hooks are
// public.

export { app, auth, db } from './client';
export {
  signInWithEmailPassword,
  signUpWithEmailPassword,
  sendPasswordReset,
  signOut,
  updateDisplayName,
  useAuthSubscription,
  useGoogleSignIn,
} from './auth';
export type { GoogleSignInResult, UseGoogleSignIn } from './auth';
export { ensureUserDoc, getUserDoc, subscribeUserDoc, updateUserDoc } from './firestore';

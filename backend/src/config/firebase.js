'use strict';
import admin from 'firebase-admin';

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL,
} = process.env;

/** Whether Firebase is fully configured via environment variables. */
const isConfigured =
  Boolean(FIREBASE_PROJECT_ID) &&
  Boolean(FIREBASE_PRIVATE_KEY) &&
  Boolean(FIREBASE_CLIENT_EMAIL);

if (!isConfigured) {
  console.warn(
    '[STUB] Firebase not configured — using mock mode. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL to enable real Firebase.'
  );
}

let firebaseApp = null;

if (isConfigured && !admin.apps.length) {
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('[Firebase] Initialized successfully for project:', FIREBASE_PROJECT_ID);
  } catch (err) {
    console.error('[Firebase] Initialization failed:', err.message);
  }
} else if (admin.apps.length) {
  firebaseApp = admin.app();
}

/**
 * Verify a Firebase ID token.
 * In stub mode (no Firebase credentials), returns a mock decoded user.
 *
 * @async
 * @param {string} idToken - The Firebase ID token from the client.
 * @returns {Promise<{uid: string, email: string}>} Decoded token payload.
 */
export async function verifyFirebaseToken(idToken) {
  if (!isConfigured || !firebaseApp) {
    console.log('[STUB] Firebase verifyFirebaseToken called — returning mock user');
    return { uid: 'mock-uid', email: 'mock@test.com' };
  }
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded;
}

export { admin };
export default firebaseApp;

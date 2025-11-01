import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID?.trim();
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const PRIVATE_KEY_RAW = process.env.FIREBASE_PRIVATE_KEY?.trim();

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY_RAW) {
  const missing = [];
  if (!PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
  if (!CLIENT_EMAIL) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!PRIVATE_KEY_RAW) missing.push('FIREBASE_PRIVATE_KEY');
  throw new Error(
    `Firebase Admin credentials missing: ${missing.join(', ')}. Configure in .env.local`,
  );
}

// Normalizar private key: remover espaços extras, garantir quebras de linha corretas
const PRIVATE_KEY = PRIVATE_KEY_RAW
  .replace(/\\n/g, '\n')
  .replace(/^["']|["']$/g, '')
  .trim();

let app: App;
if (!getApps().length) {
  try {
    app = initializeApp({
      credential: cert({
        projectId: PROJECT_ID,
        clientEmail: CLIENT_EMAIL,
        privateKey: PRIVATE_KEY,
      }),
    });
  } catch (error) {
    console.error('[firebaseAdmin] initialization failed:', error);
    if (error instanceof Error && error.message.includes('DECODER')) {
      throw new Error(
        'Firebase Private Key inválida. Verifique se copiou corretamente do Firebase Console.',
      );
    }
    throw error;
  }
} else {
  app = getApps()[0]!;
}

export const db = getFirestore(app);
export const adminAuth = getAdminAuth(app);


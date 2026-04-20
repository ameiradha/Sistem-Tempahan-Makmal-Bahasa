import { initializeApp } from 'firebase/app';
import { 
  browserLocalPersistence, 
  browserPopupRedirectResolver,
  initializeAuth 
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Use explicit initialization for better compatibility with iframe environments
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
    emailVerified: boolean;
    isAnonymous: boolean;
  }
}

export function handleFirestoreError(err: any, operation: FirestoreErrorInfo['operationType'], path: string | null = null): never {
  if (err?.code === 'permission-denied') {
    const errorInfo: FirestoreErrorInfo = {
      error: err.message,
      operationType: operation,
      path,
      authInfo: {
        userId: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null,
        emailVerified: auth.currentUser?.emailVerified || false,
        isAnonymous: auth.currentUser?.isAnonymous || false,
      }
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw err;
}

// Connectivity check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'system', 'health'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('permission-denied')) {
        // This is expected if the doc doesn't exist and rules are tight
        console.log("Firebase connection verified (permission denied as expected)");
    } else if (error instanceof Error && error.message.includes('offline')) {
      console.error("Firebase is offline. Check configuration.");
    }
  }
}
testConnection();

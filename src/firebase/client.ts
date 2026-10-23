import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const options = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(options).every(
  (value) => typeof value === "string" && value.trim().length > 0,
);

// Missing configuration never triggers Firebase calls or breaks the landing page.
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let initializationFailed = false;

if (isFirebaseConfigured) {
  try {
    app = getApps().length ? getApp() : initializeApp(options);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch {
    initializationFailed = true;
  }
}

export { app, auth, db, initializationFailed };

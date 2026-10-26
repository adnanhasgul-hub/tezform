import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "../firebase/client";
import { canCheckAdminMembership } from "./authPolicy";

let memoryAuthPromise: Promise<Auth> | null = null;
let anonymousPromise: Promise<User> | null = null;

async function memoryAuth(): Promise<Auth> {
  if (!auth) throw new Error("Authentication unavailable");
  if (!memoryAuthPromise) {
    memoryAuthPromise = (async () => {
      await setPersistence(auth, inMemoryPersistence);
      await auth.authStateReady();
      return auth;
    })().catch(() => {
      memoryAuthPromise = null;
      throw new Error("Authentication unavailable");
    });
  }
  return memoryAuthPromise;
}

// One in-flight sign-in across React StrictMode effects and concurrent save calls.
// An administrator session is never silently replaced with an anonymous identity.
export async function ensureAnonymousUser(): Promise<User> {
  if (!anonymousPromise) {
    anonymousPromise = (async () => {
      const instance = await memoryAuth();
      if (instance.currentUser) {
        if (!instance.currentUser.isAnonymous)
          throw new Error("Public identity unavailable");
        return instance.currentUser;
      }
      const result = await signInAnonymously(instance);
      return result.user;
    })().finally(() => {
      anonymousPromise = null;
    });
  }
  return anonymousPromise;
}

export async function isAuthorizedAdmin(user: User | null): Promise<boolean> {
  if (
    !canCheckAdminMembership(
      user
        ? {
            isAnonymous: user.isAnonymous,
            providerIds: user.providerData.map(
              (provider) => provider.providerId,
            ),
          }
        : null,
    )
  )
    return false;
  if (!db || !user) return false;
  const membership = await getDocFromServer(doc(db, "admins", user.uid));
  return membership.exists();
}

export type AdminLoginFailure = "credentials" | "unauthorized" | "unavailable";
export class AdminLoginError extends Error {
  readonly reason: AdminLoginFailure;
  constructor(reason: AdminLoginFailure) {
    super("Admin login failed");
    this.reason = reason;
  }
}

export async function loginAdmin(password: string): Promise<void> {
  if (!password) throw new AdminLoginError("credentials");
  const email = import.meta.env.VITE_ADMIN_AUTH_EMAIL?.trim();
  if (!email || !auth || !db) throw new AdminLoginError("unavailable");
  let user: User;
  try {
    const instance = await memoryAuth();
    user = (await signInWithEmailAndPassword(instance, email, password)).user;
  } catch {
    // No account-existence, provider or Firebase error details reach the UI.
    throw new AdminLoginError("credentials");
  }
  try {
    if (!(await isAuthorizedAdmin(user)))
      throw new AdminLoginError("unauthorized");
  } catch (error) {
    if (error instanceof AdminLoginError) throw error;
    throw new AdminLoginError("unavailable");
  }
}

export type AdminSession =
  | { status: "checking" | "signed-out" | "unauthorized" | "unavailable" }
  | { status: "authorized"; uid: string };

export function observeAdminSession(
  listener: (session: AdminSession) => void,
): () => void {
  let disposed = false;
  let generation = 0;
  let unsubscribe: (() => void) | undefined;
  void memoryAuth()
    .then((instance) => {
      if (disposed) return;
      unsubscribe = onAuthStateChanged(
        instance,
        (user) => {
          const currentGeneration = ++generation;
          if (!user || user.isAnonymous) {
            listener({ status: "signed-out" });
            return;
          }
          listener({ status: "checking" });
          void isAuthorizedAdmin(user)
            .then((authorized) => {
              if (disposed || generation !== currentGeneration) return;
              listener(
                authorized
                  ? { status: "authorized", uid: user.uid }
                  : { status: "unauthorized" },
              );
            })
            .catch(() => {
              if (!disposed && generation === currentGeneration)
                listener({ status: "unavailable" });
            });
        },
        () => {
          if (!disposed) listener({ status: "unavailable" });
        },
      );
    })
    .catch(() => {
      if (!disposed) listener({ status: "unavailable" });
    });
  return () => {
    disposed = true;
    generation++;
    unsubscribe?.();
  };
}

export async function logoutAdmin(): Promise<void> {
  const instance = await memoryAuth();
  await signOut(instance);
}

export async function reauthenticateAdmin(password: string): Promise<void> {
  const instance = await memoryAuth();
  const user = instance.currentUser;
  if (!user || !user.email || !password || !(await isAuthorizedAdmin(user)))
    throw new Error("Reauthentication required");
  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(user.email, password),
  );
  await user.getIdToken(true);
  if (!(await isAuthorizedAdmin(user))) throw new Error("Unauthorized");
}

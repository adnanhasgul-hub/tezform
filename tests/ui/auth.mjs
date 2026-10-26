import assert from "node:assert/strict";

// Exercise the real auth service; replace only Firebase SDK/network boundaries.
export async function checkAuth(browser, origin) {
  const page = await browser.newPage();
  try {
    await page.route("https://**", route => route.abort());
    await page.route("**/auth-harness", route => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="tr"><head><title>Auth test</title></head><body></body></html>',
    }));
    await page.route(/\/src\/firebase\/client\.ts(?:\?.*)?$/, route => route.fulfill({
      contentType: "text/javascript",
      body: `export const auth=window.authFixture.auth; export const db={};`,
    }));
    await page.route(/\/node_modules\/\.vite\/deps\/firebase_auth\.js(?:\?.*)?$/, route => route.fulfill({
      contentType: "text/javascript",
      body: `
        const state=window.authFixture;
        export const inMemoryPersistence={type:'NONE'};
        export const setPersistence=async(_auth,persistence)=>{state.persistence=persistence.type;};
        export const signInWithEmailAndPassword=async(instance,email,password)=>{
          state.signIns.push({email,password});
          if(state.rejectCredentials)throw Error('synthetic internal Firebase detail');
          instance.currentUser=state.identity;
          return {user:state.identity};
        };
        export const onAuthStateChanged=(instance,listener)=>{listener(instance.currentUser);return()=>{};};
        export const signOut=async(instance)=>{instance.currentUser=null;};
        export const signInAnonymously=async()=>{throw Error('unexpected anonymous sign-in');};
        export const EmailAuthProvider={credential:()=>({})};
        export const reauthenticateWithCredential=async()=>{};
      `,
    }));
    await page.route(/\/node_modules\/\.vite\/deps\/firebase_firestore\.js(?:\?.*)?$/, route => route.fulfill({
      contentType: "text/javascript",
      body: `
        export const doc=(_db,collection,uid)=>({collection,uid});
        export const getDocFromServer=async(reference)=>{
          const state=window.authFixture;
          state.membershipReads.push(reference);
          if(state.failMembership)throw Error('synthetic server unavailable');
          return {exists:()=>reference.collection==='admins'&&reference.uid==='approved-admin'};
        };
      `,
    }));
    await page.goto(`${origin}/auth-harness`);
    const result = await page.evaluate(async () => {
      const identity = (uid, isAnonymous = false, provider = "password") => ({
        uid, isAnonymous, providerData: [{ providerId: provider }],
      });
      const state = (window.authFixture = {
        auth: { currentUser: null, authStateReady: async () => {} },
        identity: identity("approved-admin"),
        signIns: [], membershipReads: [], rejectCredentials: false,
        failMembership: false, persistence: null,
      });
      const { loginAdmin, isAuthorizedAdmin } = await import("/src/services/auth.ts");
      const failure = async (action) => {
        try { await action(); return { reason: "unexpected-success" }; }
        catch (error) { return { reason: error.reason, message: error.message }; }
      };
      const blank = await failure(() => loginAdmin(""));
      const callsAfterBlank = state.signIns.length;
      state.rejectCredentials = true;
      const wrong = await failure(() => loginAdmin("synthetic-wrong"));
      const readsAfterWrong = state.membershipReads.length;
      state.rejectCredentials = false;
      await loginAdmin("synthetic-correct");
      const successfulCall = state.signIns.at(-1);
      const successfulMembership = state.membershipReads.at(-1);
      const authorized = await isAuthorizedAdmin(state.identity);
      state.identity = identity("unlisted-user");
      const unauthorized = await failure(() => loginAdmin("synthetic-correct"));
      const deniedMembership = state.membershipReads.at(-1);
      const readsBeforeAnonymous = state.membershipReads.length;
      const anonymous = await isAuthorizedAdmin(identity("approved-admin", true));
      const missing = await isAuthorizedAdmin(null);
      const nonPassword = await isAuthorizedAdmin(identity("approved-admin", false, "google.com"));
      const readsAfterAnonymous = state.membershipReads.length;
      state.identity = identity("approved-admin");
      state.failMembership = true;
      const unavailable = await failure(() => loginAdmin("synthetic-correct"));
      return {
        blank, callsAfterBlank, wrong, readsAfterWrong,
        email: successfulCall.email,
        passwordForwardedUnchanged: successfulCall.password === "synthetic-correct",
        persistence: state.persistence,
        successfulMembership, authorized, unauthorized, deniedMembership,
        anonymous, missing, nonPassword,
        noDeniedIdentityRead: readsBeforeAnonymous === readsAfterAnonymous,
        unavailable,
      };
    });
    const credentials = { reason: "credentials", message: "Admin login failed" };
    assert.deepEqual(result.blank, credentials);
    assert.equal(result.callsAfterBlank, 0);
    assert.deepEqual(result.wrong, credentials);
    assert.equal(result.readsAfterWrong, 0);
    assert.equal(result.email, "admin-test@example.invalid");
    assert.equal(result.passwordForwardedUnchanged, true);
    assert.equal(result.persistence, "NONE");
    assert.deepEqual(result.successfulMembership, { collection: "admins", uid: "approved-admin" });
    assert.equal(result.authorized, true);
    assert.deepEqual(result.unauthorized, { reason: "unauthorized", message: "Admin login failed" });
    assert.deepEqual(result.deniedMembership, { collection: "admins", uid: "unlisted-user" });
    assert.equal(result.anonymous, false);
    assert.equal(result.missing, false);
    assert.equal(result.nonPassword, false);
    assert.equal(result.noDeniedIdentityRead, true);
    assert.deepEqual(result.unavailable, { reason: "unavailable", message: "Admin login failed" });
    console.log("PASS real password-only auth service: empty/wrong passwords denied; environment email and unchanged password forwarded; in-memory persistence; UID + admins membership required; anonymous/non-password denied without lookup; server errors remain safe");
  } finally {
    await page.close();
  }
}

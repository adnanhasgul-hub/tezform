import assert from "node:assert/strict";
import { test } from "node:test";
import { canCheckAdminMembership } from "../src/services/authPolicy.ts";

test("only a non-anonymous password identity can be checked for admin membership", () => {
  assert(!canCheckAdminMembership({ isAnonymous: false, providerIds: ["google.com"] }));
  assert(!canCheckAdminMembership({ isAnonymous: false, providerIds: ["anonymous"] }));
  assert(canCheckAdminMembership({ isAnonymous: false, providerIds: ["password", "google.com"] }));
});

test("anonymous and missing identities never qualify for an admin membership lookup", () => {
  assert(!canCheckAdminMembership(null));
  assert(!canCheckAdminMembership({ isAnonymous: true, providerIds: [] }));
  assert(
    !canCheckAdminMembership({ isAnonymous: true, providerIds: ["password"] }),
  );
  assert(!canCheckAdminMembership({ isAnonymous: false, providerIds: [] }));
  assert(
    canCheckAdminMembership({ isAnonymous: false, providerIds: ["password"] }),
  );
});

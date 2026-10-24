import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptsAdminAlias,
  canCheckAdminMembership,
} from "../src/services/authPolicy.ts";

test("the visible adnan username is only a case-sensitive UI alias", () => {
  assert(acceptsAdminAlias("adnan"));
  assert(acceptsAdminAlias(" adnan "));
  assert(!acceptsAdminAlias("Adnan"));
  assert(!acceptsAdminAlias("other"));
  assert(!acceptsAdminAlias(""));
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

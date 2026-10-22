import assert from "node:assert/strict";
import test from "node:test";

import { assertWindowsLockerSecret, windowsLockerPasswordLimit } from "../src/windows.js";

test("Windows locker rejects OAuth-sized secrets before PasswordVault", () => {
  assertWindowsLockerSecret("x".repeat(windowsLockerPasswordLimit), "test.oauth");
  assert.throws(
    () => assertWindowsLockerSecret("x".repeat(windowsLockerPasswordLimit + 1), "test.oauth"),
    /513-character secret for test\.oauth.*PasswordVault limit is 512.*credential-store-local.*backend file/u,
  );
});

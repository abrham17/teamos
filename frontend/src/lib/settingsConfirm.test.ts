import { describe, expect, it } from "vitest";

import {
  getPendingActionMessage,
  isConfirmActionDisabled,
  isConfirmationMatch,
  normalizeEmail,
} from "./settingsConfirm";

describe("settings confirmation helpers", () => {
  it("normalizes email by trimming and lowercasing", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("matches confirmation input case-insensitively", () => {
    expect(isConfirmationMatch("User@Example.com", "user@example.com")).toBe(true);
    expect(isConfirmationMatch("wrong@example.com", "user@example.com")).toBe(false);
  });

  it("disables confirm action while busy or when confirmation invalid", () => {
    expect(
      isConfirmActionDisabled({
        actionBusy: true,
        myEmail: "user@example.com",
        confirmationInput: "user@example.com",
      })
    ).toBe(true);
    expect(
      isConfirmActionDisabled({
        actionBusy: false,
        myEmail: "user@example.com",
        confirmationInput: "wrong@example.com",
      })
    ).toBe(true);
    expect(
      isConfirmActionDisabled({
        actionBusy: false,
        myEmail: "user@example.com",
        confirmationInput: "USER@example.com",
      })
    ).toBe(false);
  });

  it("returns expected action message per pending action type", () => {
    expect(getPendingActionMessage({ type: "remove_member", userId: "u1", label: "a@b.com" })).toContain("removing");
    expect(getPendingActionMessage({ type: "transfer_owner", userId: "u2", label: "a@b.com" })).toContain(
      "transferring ownership"
    );
    expect(getPendingActionMessage({ type: "delete_team" })).toContain("full team deletion");
  });
});

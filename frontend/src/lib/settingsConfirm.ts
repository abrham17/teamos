export type PendingAction =
  | { type: "remove_member"; userId: string; label: string }
  | { type: "transfer_owner"; userId: string; label: string }
  | { type: "delete_team" };

export function normalizeEmail(input: string | null | undefined): string {
  return (input || "").trim().toLowerCase();
}

export function isConfirmationMatch(input: string, expectedEmail: string): boolean {
  const normalizedExpected = normalizeEmail(expectedEmail);
  if (!normalizedExpected) return false;
  return normalizeEmail(input) === normalizedExpected;
}

export function isConfirmActionDisabled(params: {
  actionBusy: boolean;
  myEmail: string;
  confirmationInput: string;
}): boolean {
  return params.actionBusy || !normalizeEmail(params.myEmail) || !isConfirmationMatch(params.confirmationInput, params.myEmail);
}

export function getPendingActionMessage(action: PendingAction): string {
  if (action.type === "remove_member") {
    return `You are removing ${action.label} from this team.`;
  }
  if (action.type === "transfer_owner") {
    return `You are transferring ownership to ${action.label}. Your role will become editor.`;
  }
  return "You are scheduling full team deletion. The team is soft-deleted now and permanently purged after the grace period.";
}

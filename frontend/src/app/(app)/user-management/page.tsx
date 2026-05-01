import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function UserManagementPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const user = await currentUser();

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-900)] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">User management</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          This page shows the active Clerk account identity used in TeamOS.
        </p>

        <div className="mt-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 space-y-4">
          <div>
            <div className="text-sm text-[var(--text-muted)]">User ID</div>
            <div className="font-mono text-sm break-all">{user?.id}</div>
          </div>
          <div>
            <div className="text-sm text-[var(--text-muted)]">Name</div>
            <div>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-[var(--text-muted)]">Primary Email</div>
            <div>{user?.primaryEmailAddress?.emailAddress || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

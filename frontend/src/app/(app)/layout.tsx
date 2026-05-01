import { Sidebar } from "@/components/sidebar/Sidebar";
import { CommandPalette } from "@/components/command/CommandPalette";
import { ProvisionUser } from "@/components/auth/ProvisionUser";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-900)]">
      <ProvisionUser />
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-900)]">
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}

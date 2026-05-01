import { Sidebar } from "@/components/sidebar/Sidebar";
import { CommandPalette } from "@/components/command/CommandPalette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-900)]">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-900)]">
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}

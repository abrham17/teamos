import type { Metadata } from "next";
import "@fontsource-variable/geist";
import { ClerkProvider } from "@clerk/nextjs";
import { DashboardShell } from "@/components/layout/DashboardShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeamOS Admin",
  description: "TeamOS Administrative Dashboard — ops.team-os.tech",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <ClerkProvider>
          <DashboardShell>{children}</DashboardShell>
        </ClerkProvider>
      </body>
    </html>
  );
}

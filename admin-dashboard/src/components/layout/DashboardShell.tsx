"use client";

import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/nextjs";
import { ShieldAlert } from "lucide-react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Toaster } from "sonner";
import { AppSidebar } from "./AppSidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="bg-background">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/40 px-6">
              <SidebarTrigger className="-ml-2" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <div className="flex-1" />
              <UserButton />
            </header>
            <main className="flex-1 overflow-auto">{children}</main>
          </SidebarInset>
        </SidebarProvider>
        <Toaster richColors position="top-right" />
      </SignedIn>

      <SignedOut>
        <div className="flex h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md border-border/40 bg-card/30 backdrop-blur-xl">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto bg-primary w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 mb-2">
                <ShieldAlert size={28} className="text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  Restricted Access
                </CardTitle>
                <CardDescription>
                  Authentication required for TeamOS Administrative Services
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-8">
              <SignIn routing="hash" />
            </CardContent>
          </Card>
        </div>
      </SignedOut>
    </>
  );
}

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { SignedIn, SignedOut, UserButton, SignIn } from "@clerk/clerk-react";
import { Toaster } from "sonner";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { OverviewPage } from '@/pages/OverviewPage';
import { TeamsPage } from '@/pages/TeamsPage';
import { UsersPage } from '@/pages/UsersPage';
import { TrialsPage } from '@/pages/TrialsPage';
import { DelinquentPage } from '@/pages/DelinquentPage';
import { ForecastPage } from '@/pages/ForecastPage';
import { OperationsPage } from '@/pages/OperationsPage';
import { HealthPage } from '@/pages/HealthPage';

function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/40 px-6">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex-1" />
          <UserButton afterSignOutUrl="/" />
        </header>
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/trials" element={<TrialsPage />} />
            <Route path="/delinquent" element={<DelinquentPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="/health" element={<HealthPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

const App: React.FC = () => {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <BrowserRouter>
      <SignedIn>
        <DashboardLayout />
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
                <CardTitle className="text-2xl font-bold tracking-tight">Restricted Access</CardTitle>
                <CardDescription>Authentication required for TeamOS Administrative Services</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-8">
              <SignIn routing="hash" />
            </CardContent>
          </Card>
        </div>
      </SignedOut>
    </BrowserRouter>
  );
};

export default App;

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TeamOS — Team Knowledge Wiki",
  description: "Your team's intelligence, beautifully structured and seamlessly interlinked.",
};

// Inline script — runs before React hydrates to prevent theme flash
function ThemeScript() {
  const script = `try{var t=localStorage.getItem('teamos-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClerkProvider>
          <ThemeProvider>
            <ToastProvider>
              <header className="h-12 border-b border-[var(--border-subtle)] bg-[var(--surface-1)] flex items-center justify-end px-4 gap-2">
                <SignedOut>
                  <SignInButton />
                  <SignUpButton />
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </header>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { PaddleProvider } from "@/components/providers/PaddleProvider";

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
  openGraph: {
    title: "TeamOS — Team Knowledge Wiki",
    description: "Your team's intelligence, beautifully structured and seamlessly interlinked.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TeamOS — Team Knowledge Wiki",
    description: "Your team's intelligence, beautifully structured and seamlessly interlinked.",
  },
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
              <PaddleProvider>
                {children}
              </PaddleProvider>
            </ToastProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

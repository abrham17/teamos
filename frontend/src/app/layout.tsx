import type { Metadata } from "next";
import { DM_Sans, DM_Mono, Instrument_Serif } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { getClerkPublishableKey } from "@/lib/clerk-env";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { PaddleProvider } from "@/components/providers/PaddleProvider";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
      <body className={`${dmSans.variable} ${dmMono.variable} ${instrumentSerif.variable} antialiased`}>
        <ClerkProvider publishableKey={getClerkPublishableKey()}>
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

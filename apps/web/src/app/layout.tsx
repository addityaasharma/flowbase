import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { THEME_BOOT } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#f5f5f7" }; // no pinch / focus zoom
export const metadata: Metadata = { title: "Flowbase", description: "Plan, track and ship work with your team", applicationName: "Flowbase", appleWebApp: { capable: true, title: "Flowbase", statusBarStyle: "default" } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body className="font-sans"><Providers>{children}</Providers></body>
    </html>
  );
}

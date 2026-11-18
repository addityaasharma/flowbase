import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = { title: "Flowbase", description: "Plan, track and ship work with your team" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans"><Providers>{children}</Providers></body>
    </html>
  );
}

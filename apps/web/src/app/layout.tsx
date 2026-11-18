import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = { title: "Bitcode Tracker", description: "Work tracker for Bitcode Software" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans"><Providers>{children}</Providers></body>
    </html>
  );
}

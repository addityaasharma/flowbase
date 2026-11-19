"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { registerServiceWorker } from "@/lib/pwa";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 2000, refetchOnWindowFocus: true } } }));
  useEffect(() => { registerServiceWorker(); }, []); // lets Flowbase be installed and receive push messages
  return <QueryClientProvider client={qc}><AuthProvider>{children}</AuthProvider></QueryClientProvider>;
}

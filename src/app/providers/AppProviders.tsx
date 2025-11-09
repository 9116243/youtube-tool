import type { PropsWithChildren } from "react";
import { Suspense } from "react";
import { AnimatePresence } from "framer-motion";

import { ThemeProvider } from "@/app/providers/ThemeProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-slate-400">
            Loading workspace...
          </div>
        }
      >
        <AnimatePresence mode="wait">{children}</AnimatePresence>
      </Suspense>
    </ThemeProvider>
  );
}

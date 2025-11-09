import { type PropsWithChildren } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { useAppStore } from '@/lib/store';

export function Shell({ children }: PropsWithChildren) {
  const mobileOpen = useAppStore((state) => state.sidebarMobileOpen);
  const closeMobile = useAppStore((state) => state.closeSidebarMobile);

  return (
    <div
      className="relative flex min-h-screen overflow-hidden text-[var(--text-primary)] transition-colors duration-500"
      style={{
        background: 'linear-gradient(135deg, var(--background-gradient-start), var(--background-gradient-end))'
      }}
    >
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="sidebar-overlay"
            className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeMobile}
          />
        )}
      </AnimatePresence>

      <Sidebar />

      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex flex-1 flex-col overflow-y-auto px-4 pb-12 pt-6 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}

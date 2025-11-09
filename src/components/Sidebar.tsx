import { useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  Bot,
  FileText,
  Gauge,
  LayoutDashboard,
  Layers,
  Library,
  ShieldCheck,
  Sparkles,
  Upload,
  X
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';

export const SIDEBAR_LINKS = [
  { labelKey: 'nav.dashboard', descriptionKey: 'navDescription.dashboard', to: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'nav.workflow', descriptionKey: 'navDescription.workflow', to: '/workflow', icon: Sparkles },
  { labelKey: 'nav.aiwriting', descriptionKey: 'navDescription.aiwriting', to: '/aiwriting', icon: Bot },
  { labelKey: 'nav.cover', descriptionKey: 'navDescription.cover', to: '/cover', icon: Layers },
  { labelKey: 'nav.publishing', descriptionKey: 'navDescription.publishing', to: '/publish', icon: Upload },
  { labelKey: 'nav.qa', descriptionKey: 'navDescription.qa', to: '/qa', icon: Gauge },
  { labelKey: 'nav.reports', descriptionKey: 'navDescription.reports', to: '/reports', icon: FileText },
  { labelKey: 'nav.assets', descriptionKey: 'navDescription.assets', to: '/downloads', icon: Library },
  { labelKey: 'nav.admin', descriptionKey: 'navDescription.admin', to: '/admin', icon: ShieldCheck }
] as const;

export type SidebarLink = (typeof SIDEBAR_LINKS)[number];

export function Sidebar() {
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleCollapsed = useAppStore((state) => state.toggleSidebarCollapsed);
  const mobileOpen = useAppStore((state) => state.sidebarMobileOpen);
  const closeMobile = useAppStore((state) => state.closeSidebarMobile);
  const [hovered, setHovered] = useState<string | null>(null);
  const computedWidth = collapsed && !mobileOpen ? 72 : 264;

  return (
    <motion.aside
      aria-label="Primary navigation"
      initial={false}
      animate={{ width: computedWidth }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group/sidebar fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-slate-800/40 bg-slate-950/80 backdrop-blur-2xl shadow-[0_24px_60px_rgba(15,23,42,0.55)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        'lg:static lg:translate-x-0'
      )}
      style={{ width: computedWidth }}
    >
      <div className="flex items-center justify-between px-5 pb-6 pt-6 lg:px-6">
        <Logo className="text-sm font-semibold" showLabel={!collapsed || mobileOpen} />
        <motion.button
          type="button"
          onClick={closeMobile}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800/40 bg-slate-900/70 text-slate-200 shadow-[0_0_20px_rgba(15,23,42,0.35)] hover:border-sky-500/40 hover:text-sky-300 lg:hidden"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Close navigation"
        >
          <X size={18} strokeWidth={1.8} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-6 lg:px-4">
        <LayoutGroup id="sidebar-nav">
          <nav className="space-y-2">
            {SIDEBAR_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} className="block">
                  {({ isActive }) => (
                    <motion.div
                      onMouseEnter={() => setHovered(item.to)}
                      onMouseLeave={() => setHovered((value) => (value === item.to ? null : value))}
                      whileHover={{ scale: collapsed && !mobileOpen ? 1.08 : 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'group relative flex items-center gap-3 overflow-visible rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition-all duration-200',
                        collapsed && !mobileOpen ? 'justify-center px-2' : 'pl-5',
                        isActive
                          ? 'bg-sky-500/15 text-sky-200 shadow-[0_0_35px_rgba(14,165,233,0.35)]'
                          : 'hover:bg-slate-800/50 hover:text-slate-100'
                      )}
                    >
                      <motion.span
                        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/70 text-slate-200 shadow-[0_0_20px_rgba(15,23,42,0.45)] transition-colors duration-200 group-hover:text-sky-300"
                      >
                        <Icon size={18} strokeWidth={1.7} />
                        <AnimatePresence>
                          {isActive && (
                            <motion.span
                              layoutId="sidebar-active-ring"
                              className="absolute inset-0 rounded-xl border border-sky-400/40"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.18 }}
                            />
                          )}
                        </AnimatePresence>
                      </motion.span>

                      {(!collapsed || mobileOpen) && (
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold tracking-tight">{item.label}</span>
                          <span className="truncate text-xs text-slate-400">{item.description}</span>
                        </div>
                      )}

                      <AnimatePresence>
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active-indicator"
                            className="absolute left-0 top-1/2 h-10 w-[3px] -translate-y-1/2 rounded-full bg-sky-400 shadow-[0_0_16px_rgba(14,165,233,0.9)]"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 40 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                          />
                        )}
                      </AnimatePresence>

                      <AnimatePresence>
                        {collapsed && !mobileOpen && hovered === item.to && (
                          <motion.span
                            key={item.to}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.18 }}
                            className="pointer-events-none absolute left-full ml-4 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-[0_14px_35px_rgba(15,23,42,0.55)]"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </LayoutGroup>
      </div>

      <div className="space-y-4 px-4 pb-6 pt-2 lg:px-6">
        <motion.div
          layout
          className={cn(
            'relative overflow-hidden rounded-2xl border border-slate-800/40 bg-slate-900/70 p-4 text-xs text-slate-300 shadow-[0_12px_30px_rgba(15,23,42,0.45)]',
            collapsed && !mobileOpen && 'px-3 py-4 text-center'
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-indigo-500/10" />
          {!collapsed || mobileOpen ? (
            <>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Gauge size={16} className="text-sky-300" />
                Realtime efficiency up
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                Workflow automation saved <span className="text-sky-300">68%</span> of production time this week.
              </p>
            </>
          ) : (
            <Gauge size={18} className="mx-auto text-sky-300" />
          )}
        </motion.div>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleCollapsed}
          className="hidden w-full items-center justify-center gap-2 rounded-xl border-slate-800/40 bg-slate-900/70 text-xs font-medium text-slate-300 shadow-[0_0_18px_rgba(15,23,42,0.45)] hover:border-sky-500/40 hover:bg-slate-900/90 hover:text-sky-200 lg:flex"
        >
          {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        </Button>
      </div>
    </motion.aside>
  );
}

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronDown, Menu, Moon, Settings, Sun, User } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { SIDEBAR_LINKS } from '@/components/Sidebar';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';

const routeTitleMap = SIDEBAR_LINKS.reduce<Record<string, string>>((acc, link) => {
  acc[link.to] = link.label;
  return acc;
}, {});

export function TopBar() {
  const location = useLocation();
  const notifications = useAppStore((state) => state.notifications);
  const clearNotifications = useAppStore((state) => state.clearNotifications);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const toggleSidebarMobile = useAppStore((state) => state.toggleSidebarMobile);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebarCollapsed = useAppStore((state) => state.toggleSidebarCollapsed);

  const workspace = useAppStore((state) => state.activeWorkspace);
  const setWorkspace = useAppStore((state) => state.setActiveWorkspace);

  const breadcrumbItems = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      return [{ label: routeTitleMap['/dashboard'] ?? 'Mission Control', path: '/dashboard' }];
    }

    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        label: routeTitleMap[path] ?? segment.replace(/-/g, ' '),
        path
      };
    });
  }, [location.pathname]);

  return (
    <motion.header
      className="sticky top-0 z-30 border-b border-slate-800/40 bg-slate-950/70 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8"
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800/40 bg-slate-900/60 text-slate-200 shadow-[0_0_20px_rgba(15,23,42,0.45)] transition-colors hover:border-sky-500/40 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 lg:hidden"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            onClick={toggleSidebarMobile}
            aria-label="Toggle navigation"
          >
            <Menu size={20} strokeWidth={1.7} />
          </motion.button>

          <Logo className="lg:hidden" />

          <div className="hidden items-center gap-3 lg:flex">
            <motion.button
              type="button"
              onClick={toggleSidebarCollapsed}
              className={cn(
                'hidden h-11 rounded-xl border border-slate-800/40 bg-slate-900/60 px-4 text-xs font-semibold uppercase tracking-wide text-slate-300 shadow-[0_0_24px_rgba(15,23,42,0.45)] transition-colors hover:border-sky-500/40 hover:text-sky-100 lg:inline-flex',
                sidebarCollapsed && 'text-sky-200 hover:text-sky-200'
              )}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
            >
              {sidebarCollapsed ? 'Expand' : 'Collapse'}
            </motion.button>

            <motion.nav
              key={location.pathname}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-sm font-semibold text-slate-100"
            >
              <AnimatePresence initial={false}>
                {breadcrumbItems.map((item, index) => (
                  <motion.span
                    key={item.path}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="flex items-center gap-2"
                  >
                    {index > 0 && <span className="text-slate-500">/</span>}
                    <span className="capitalize text-slate-200">{item.label}</span>
                  </motion.span>
                ))}
              </AnimatePresence>
            </motion.nav>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                type="button"
                className="hidden items-center gap-2 rounded-xl border border-slate-800/40 bg-slate-900/60 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-300 shadow-[0_0_20px_rgba(15,23,42,0.45)] transition-all hover:border-sky-500/40 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:flex"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <span>Workspace</span>
                <ChevronDown size={14} />
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Select workspace</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={workspace}
                  onValueChange={(value) => setWorkspace(value as typeof workspace)}
                >
                <DropdownMenuRadioItem value="global">Global HQ</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="cn">Shanghai Studio</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="intl">International Team</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <motion.button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800/40 bg-slate-900/60 text-slate-200 shadow-[0_0_22px_rgba(15,23,42,0.45)] transition-colors hover:border-sky-500/40 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              {theme === 'dark' ? (
                <motion.span
                  key="moon"
                  initial={{ opacity: 0, rotate: -25, scale: 0.8 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 25, scale: 0.8 }}
                  transition={{ duration: 0.24, ease: 'easeOut' }}
                  className="text-sky-300"
                >
                  <Moon size={18} strokeWidth={1.7} />
                </motion.span>
              ) : (
                <motion.span
                  key="sun"
                  initial={{ opacity: 0, rotate: -25, scale: 0.8 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 25, scale: 0.8 }}
                  transition={{ duration: 0.24, ease: 'easeOut' }}
                  className="text-amber-400"
                >
                  <Sun size={18} strokeWidth={1.8} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <motion.button
            type="button"
            onClick={clearNotifications}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800/40 bg-slate-900/60 text-slate-200 shadow-[0_0_22px_rgba(15,23,42,0.45)] transition-colors hover:border-sky-500/40 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            aria-label="View notifications"
          >
            <Bell size={18} strokeWidth={1.7} />
            <AnimatePresence>
              {notifications > 0 && (
                <motion.span
                  key="notifications"
                  initial={{ scale: 0.6, opacity: 0, y: -4 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.6, opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="absolute -right-1 -top-1"
                >
                  <Badge className="h-5 min-w-[22px] justify-center bg-sky-500 text-[11px] text-slate-950 shadow-[0_0_18px_rgba(14,165,233,0.65)]">
                    {notifications}
                  </Badge>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <motion.button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800/40 bg-slate-900/60 text-slate-200 shadow-[0_0_22px_rgba(15,23,42,0.45)] transition-colors hover:border-sky-500/40 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            whileHover={{ rotate: 45, scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            aria-label="Open settings"
          >
            <Settings size={18} strokeWidth={1.7} />
          </motion.button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                type="button"
                className="inline-flex items-center gap-3 rounded-2xl border border-slate-800/40 bg-gradient-to-tr from-slate-900/80 via-slate-900/60 to-slate-800/60 px-3 py-2 text-left shadow-[0_0_24px_rgba(15,23,42,0.55)] transition-colors hover:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:px-4"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 text-white shadow-[0_0_28px_rgba(99,102,241,0.6)]">
                  <User size={18} strokeWidth={1.8} />
                </span>
                <div className="hidden min-w-0 flex-col text-left sm:flex">
                  <span className="text-sm font-semibold text-slate-100">Nova Chen</span>
                  <span className="text-xs text-slate-400">Executive Producer</span>
                </div>
                <ChevronDown size={14} className="hidden text-slate-400 sm:block" />
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Team settings</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked disabled>
                Two-factor enabled
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.header>
  );
}

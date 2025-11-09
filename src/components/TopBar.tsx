import React, { type ChangeEvent, type MouseEvent, type ReactNode, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bell, Menu, Moon, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAppStore } from '@/lib/store';
import { Logo } from '@/components/Logo';

type NavItem = {
  key: string;
  to: string;
  label: string;
  icon: ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', to: '/dashboard', label: 'nav.dashboard', icon: <Menu size={16} /> },
  { key: 'workflow', to: '/workflow', label: 'nav.workflow', icon: <Menu size={16} /> },
  { key: 'publishing', to: '/publish', label: 'nav.publishing', icon: <Menu size={16} /> },
  { key: 'analytics', to: '/analytics', label: 'nav.analytics', icon: <Menu size={16} /> },
  { key: 'reports', to: '/reports', label: 'nav.reports', icon: <Menu size={16} /> },
  { key: 'teams', to: '/teams', label: 'nav.teams', icon: <Menu size={16} /> },
  { key: 'settings', to: '/settings', label: 'nav.settings', icon: <Menu size={16} /> }
];

const routeTitleMap = NAV_ITEMS.reduce<Record<string, string>>((acc, link) => {
  acc[link.to] = link.label;
  return acc;
}, {});

export type Breadcrumb = {
  label: string;
  path: string;
};

export interface TopbarProps {
  onMenuToggle?: (event: MouseEvent<HTMLButtonElement>) => void;
  onThemeToggle?: (event: MouseEvent<HTMLButtonElement>) => void;
  onNotificationsClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onSearchChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  navItems?: NavItem[];
  breadcrumbs?: Breadcrumb[];
  searchValue?: string | number;
  theme?: 'dark' | 'light';
}

const Topbar: React.FC<TopbarProps> = ({
  breadcrumbs: breadcrumbsOverride,
  navItems: navItemsOverride,
  onMenuToggle,
  onThemeToggle,
  onNotificationsClick,
  onSearchChange,
  searchValue,
  theme: themeOverride
}) => {
  const { t } = useTranslation('common');
  const location = useLocation();
  const storageTheme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const activeTheme = themeOverride ?? storageTheme;

  const breadcrumbs = useMemo(() => {
    const computed = (() => {
      const segments = location.pathname.split('/').filter(Boolean);
      if (!segments.length) {
        return [{ label: t('nav.dashboard'), path: '/dashboard' }];
      }
      return segments.map((segment, index) => {
        const path = `/${segments.slice(0, index + 1).join('/')}`;
        const key = routeTitleMap[path];
        return {
          label: key ? t(key) : segment.replace(/-/g, ' '),
          path
        };
      });
    })();
    return breadcrumbsOverride ?? computed;
  }, [breadcrumbsOverride, location.pathname, t]);

  const normalizedSearchValue =
    searchValue === undefined || searchValue === null ? '' : String(searchValue);
  const showSearch = Boolean(onSearchChange);

  const handleMenuToggle = (event: MouseEvent<HTMLButtonElement>) => {
    onMenuToggle?.(event);
  };

  const handleThemeToggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (onThemeToggle) {
      onThemeToggle(event);
      return;
    }
    toggleTheme();
  };

  const handleNotificationsClick = (event: MouseEvent<HTMLButtonElement>) => {
    onNotificationsClick?.(event);
  };

  const navItems = navItemsOverride ?? NAV_ITEMS;

  return (
    <motion.header
      className="sticky top-0 z-30 border-b border-slate-800/40 bg-slate-950/70 px-4 py-3 backdrop-blur-xl"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800/40 bg-slate-900/60 text-slate-200 shadow-lg transition hover:border-sky-500/60"
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle navigation"
            onClick={handleMenuToggle}
          >
            <Menu size={18} />
          </motion.button>
          <Logo />
          <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-2 text-sm font-semibold">
            {(breadcrumbs ?? []).map((item, index) => (
              <span key={item.path} className="flex items-center gap-2 text-slate-200">
                {index > 0 && <span className="text-slate-500">/</span>}
                <Link to={item.path} className="text-slate-100 transition hover:text-sky-300">
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {showSearch && (
            <div className="hidden h-full items-center gap-2 rounded-full border border-slate-800/40 bg-slate-900/60 px-3 py-1 text-sm text-slate-300 lg:flex">
              <input
                type="search"
                value={normalizedSearchValue}
                onChange={onSearchChange}
                placeholder={t('actions.search') || 'Search'}
                aria-label={t('actions.search') || 'Search'}
                className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleThemeToggle}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800/40 bg-slate-900/60 text-slate-200 transition hover:border-sky-500/40"
            aria-label="Toggle theme"
          >
            {activeTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            onClick={handleNotificationsClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800/40 bg-slate-900/60 text-slate-200 transition hover:border-sky-500/40"
            aria-label="View notifications"
          >
            <Bell size={18} />
            <span className="sr-only">{t('actions.new') || 'Notifications'}</span>
          </button>
          <div className="rounded-full bg-slate-900/70 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
            {t('brand.name')}
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export { Topbar };
export default Topbar;

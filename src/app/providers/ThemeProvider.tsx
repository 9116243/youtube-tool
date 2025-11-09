import { type PropsWithChildren, useEffect } from 'react';

import { useAppStore } from '@/lib/store';

export function ThemeProvider({ children }: PropsWithChildren) {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');

    if (theme === 'dark') {
      document.body.classList.add('bg-brand-gradient');
    } else {
      document.body.classList.remove('bg-brand-gradient');
    }
  }, [theme]);

  return children;
}


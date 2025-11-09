import { Outlet } from 'react-router-dom';

import { Shell } from '@/components/Shell';

export function AppLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}


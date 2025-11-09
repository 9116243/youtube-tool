import { Navigate, useRoutes } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { WorkflowPage } from '@/features/workflow/WorkflowPage';
import { AiWritingPage } from '@/features/aiwriting/AiWritingPage';
import { CoverPage } from '@/features/cover/CoverPage';
import { PublishPage } from '@/features/publish/PublishPage';
import { DownloadsPage } from '@/features/downloads/DownloadsPage';
import { AdminPage } from '@/features/admin/AdminPage';
import { QALabPage } from '@/features/qa/QALabPage';
import { ReportCenterPage } from '@/features/reports/ReportCenterPage';

export function AppRoutes() {
  return useRoutes([
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: <DashboardPage /> },
        { path: 'workflow', element: <WorkflowPage /> },
        { path: 'aiwriting', element: <AiWritingPage /> },
        { path: 'cover', element: <CoverPage /> },
        { path: 'publish', element: <PublishPage /> },
        { path: 'downloads', element: <DownloadsPage /> },
        { path: 'reports', element: <ReportCenterPage /> },
        { path: 'qa', element: <QALabPage /> },
        { path: 'admin', element: <AdminPage /> },
        { path: '*', element: <Navigate to="/dashboard" replace /> }
      ]
    }
  ]);
}


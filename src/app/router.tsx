import { Navigate, createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '../features/auth/LoginPage'
import { MePage } from '../features/auth/MePage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { EmployeesPage } from '../features/employees/EmployeesPage'
import { ContainersPage } from '../features/containers/ContainersPage'
import { InventoryPage } from '../features/inventory/InventoryPage'
import { ProductsPage } from '../features/products/ProductsPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SalesPage } from '../features/sales/SalesPage'
import { CustomersPage } from '../features/customers/CustomersPage'
import { ReportsPage } from '../features/reports/ReportsPage'
import { PcfPage } from '../features/pcf/PcfPage'
import { FundRequestsPage } from '../features/fund-requests/FundRequestsPage'
import { LandingPage } from '../features/website/LandingPage'
import { InquiriesPage } from '../features/website/InquiriesPage'
import { AuditLogPage } from '../features/audit/AuditLogPage'
import { AppShell } from './AppShell'
import { RequireAuth } from './RequireAuth'

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/app',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'employees', element: <EmployeesPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'me', element: <MePage /> },
          { path: 'sales', element: <SalesPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'containers', element: <ContainersPage /> },
          { path: 'expenses', element: <Navigate to="/app/pcf" replace /> },
          { path: 'pcf', element: <PcfPage /> },
          { path: 'fund-requests', element: <FundRequestsPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'inquiries', element: <InquiriesPage /> },
          { path: 'audit', element: <AuditLogPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

import { Suspense, lazy } from 'react'
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { SplashLoader } from '../components/Loading'
import { RequireAuth } from './RequireAuth'
import { AppShell } from './AppShell'

const LandingPage = lazy(() =>
  import('../features/website/LandingPage').then((m) => ({ default: m.LandingPage })),
)
const LoginPage = lazy(() => import('../features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))

// Staff modules load on first visit instead of shipping every screen in the
// initial bundle (the dashboard alone pulls charts, tables and print views).
const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const MePage = lazy(() => import('../features/auth/MePage').then((m) => ({ default: m.MePage })))
const EmployeesPage = lazy(() =>
  import('../features/employees/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
)
const ContainersPage = lazy(() =>
  import('../features/containers/ContainersPage').then((m) => ({ default: m.ContainersPage })),
)
const InventoryPage = lazy(() =>
  import('../features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })),
)
const ProductsPage = lazy(() =>
  import('../features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })),
)
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const SalesPage = lazy(() => import('../features/sales/SalesPage').then((m) => ({ default: m.SalesPage })))
const CustomersPage = lazy(() =>
  import('../features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })),
)
const ReportsPage = lazy(() =>
  import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const PcfPage = lazy(() => import('../features/pcf/PcfPage').then((m) => ({ default: m.PcfPage })))
const FundRequestsPage = lazy(() =>
  import('../features/fund-requests/FundRequestsPage').then((m) => ({ default: m.FundRequestsPage })),
)
const InquiriesPage = lazy(() =>
  import('../features/website/InquiriesPage').then((m) => ({ default: m.InquiriesPage })),
)
const AuditLogPage = lazy(() =>
  import('../features/audit/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
)

function RootRoute() {
  return (
    <Suspense fallback={<SplashLoader />}>
      <Outlet />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootRoute />,
    children: [
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
    ],
  },
])

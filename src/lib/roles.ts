import type { AppRole } from '../types/database'

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Owner',
  general_accountant: 'General Accountant',
  branch_accountant: 'Branch Accountant',
  cashier: 'Cashier',
  warehouse: 'Warehouse',
  employee: 'Employee',
  system_admin: 'System Admin',
}

export const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[]

export type NavItemId =
  | 'dashboard'
  | 'sales'
  | 'inventory'
  | 'containers'
  | 'expenses'
  | 'pcf'
  | 'fund_requests'
  | 'reports'
  | 'employees'
  | 'products'
  | 'settings'
  | 'audit'
  | 'inquiries'
  | 'me'

export interface NavItem {
  id: NavItemId
  label: string
  path: string
  roles: AppRole[]
  phoneTab?: boolean
}

/** Menu visibility from the Phase 1 permission matrix (View or higher). */
export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/app',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse', 'system_admin'],
  },
  {
    id: 'sales',
    label: 'Sales & Customers',
    path: '/app/sales',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier'],
    phoneTab: true,
  },
  {
    id: 'products',
    label: 'Products & Prices',
    path: '/app/products',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse', 'system_admin'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    path: '/app/inventory',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse'],
    phoneTab: true,
  },
  {
    id: 'containers',
    label: 'Containers',
    path: '/app/containers',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'warehouse'],
  },
  {
    id: 'expenses',
    label: 'Expenses',
    path: '/app/expenses',
    roles: ['owner', 'general_accountant', 'branch_accountant'],
  },
  {
    id: 'pcf',
    label: 'Petty Cash',
    path: '/app/pcf',
    roles: ['owner', 'general_accountant', 'branch_accountant'],
  },
  {
    id: 'fund_requests',
    label: 'Fund Requests',
    path: '/app/fund-requests',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'warehouse', 'employee'],
    phoneTab: true,
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/app/reports',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'warehouse'],
  },
  {
    id: 'employees',
    label: 'Employees & Roles',
    path: '/app/employees',
    roles: ['owner', 'general_accountant', 'system_admin'],
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/app/settings',
    roles: ['owner', 'general_accountant', 'system_admin'],
  },
  {
    id: 'audit',
    label: 'Audit Log',
    path: '/app/audit',
    roles: ['owner', 'general_accountant'],
  },
  {
    id: 'inquiries',
    label: 'Inquiries',
    path: '/app/inquiries',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'system_admin'],
  },
  {
    id: 'me',
    label: 'Me',
    path: '/app/me',
    roles: ALL_ROLES,
    phoneTab: true,
  },
]

/** System Admin is a superuser, so every menu is visible to it. */
export function canAccessNav(role: AppRole, item: NavItem): boolean {
  return role === 'system_admin' || item.roles.includes(role)
}

export function navForRole(role: AppRole, phoneOnly = false): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccessNav(role, item) && (!phoneOnly || item.phoneTab))
}

function roleIn(role: AppRole, allowed: AppRole[]): boolean {
  return role === 'system_admin' || allowed.includes(role)
}

export function canManageEmployees(role: AppRole): boolean {
  return role === 'system_admin'
}

export function canViewEmployees(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canManageSettings(role: AppRole): boolean {
  return roleIn(role, ['owner'])
}

export function canViewSettings(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canViewAuditLog(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canManageProducts(role: AppRole): boolean {
  return roleIn(role, ['owner'])
}

export function canManagePrices(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canViewProducts(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse'])
}

export function canViewInventory(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse'])
}

export function canViewAllBranchesInventory(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canCreateStockOps(role: AppRole): boolean {
  return roleIn(role, ['warehouse', 'branch_accountant', 'owner'])
}

export function canApproveStockOps(role: AppRole): boolean {
  return roleIn(role, ['owner', 'branch_accountant'])
}

export function canViewContainers(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'warehouse'])
}

export function canManageSuppliers(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canReceiveContainers(role: AppRole): boolean {
  return roleIn(role, ['warehouse', 'branch_accountant', 'owner'])
}

export function canViewSales(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'cashier'])
}

export function canCreateSales(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'cashier'])
}

export function canViewAllBranchesSales(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canViewExpenses(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

export function canManageExpenses(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

export function canViewAllBranchesExpenses(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canViewReports(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'warehouse'])
}

export function canViewAllBranchesReports(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canViewPcf(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

export function canManagePcf(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

export function canReplenishPcf(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

/** Branch accountants prepare the replenishment request; releasing stays with owner/GA. */
export function canRequestPcfFund(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

export function canViewAllBranchesPcf(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

// Fund requests
export function canCreateFundRequest(role: AppRole): boolean {
  return roleIn(role, ['employee', 'warehouse'])
}

export function canReviewFundRequest(role: AppRole): boolean {
  return roleIn(role, ['branch_accountant'])
}

export function canApproveFundRequest(role: AppRole): boolean {
  return roleIn(role, ['owner'])
}

export function canReleaseFundRequest(role: AppRole): boolean {
  return roleIn(role, ['general_accountant'])
}

export function canViewAllBranchesFundRequests(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
}

export function canViewFundRequests(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'employee', 'warehouse'])
}

// Website inquiries
export function canViewInquiries(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

export function canManageInquiries(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

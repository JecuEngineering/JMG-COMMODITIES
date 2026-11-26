import type { AppRole } from '../types/database'

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Owner',
  general_accountant: 'General Accountant',
  branch_accountant: 'Branch Accountant',
  cashier: 'Cashier',
  warehouse: 'Warehouse Inventory',
  employee: 'Employee',
  system_admin: 'System Admin',
}

export const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[]

export type NavItemId =
  | 'dashboard'
  | 'sales'
  | 'customers'
  | 'inventory'
  | 'containers'
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
  group?: NavGroupId
  phoneTab?: boolean
}

export type NavGroupId = 'overview' | 'sales' | 'stock' | 'finance' | 'admin'

export const NAV_GROUPS: { id: NavGroupId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales & Customers' },
  { id: 'stock', label: 'Stock' },
  { id: 'finance', label: 'Finance' },
  { id: 'admin', label: 'Admin' },
]

/** Sidebar groups in display order; empty groups (no permission) are dropped. */
export function groupedNav(items: NavItem[]): { id: NavGroupId; label: string; items: NavItem[] }[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0)
}

/** Menu visibility from the Phase 1 permission matrix (View or higher). */
export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/app',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse', 'system_admin'],
    group: 'overview',
  },
  {
    id: 'sales',
    label: 'Sales',
    path: '/app/sales',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse'],
    group: 'sales',
    phoneTab: true,
  },
  {
    id: 'customers',
    label: 'Customers',
    path: '/app/customers',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier'],
    group: 'sales',
  },
  {
    id: 'products',
    label: 'Products & Prices',
    path: '/app/products',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse', 'system_admin'],
    group: 'stock',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    path: '/app/inventory',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse'],
    group: 'stock',
    phoneTab: true,
  },
  {
    id: 'containers',
    label: 'Containers',
    path: '/app/containers',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'warehouse'],
    group: 'stock',
  },
  {
    id: 'pcf',
    label: 'Petty Cash',
    path: '/app/pcf',
    roles: ['owner', 'general_accountant', 'branch_accountant'],
    group: 'finance',
  },
  {
    id: 'fund_requests',
    label: 'Fund Requests',
    path: '/app/fund-requests',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'warehouse', 'employee'],
    group: 'finance',
    phoneTab: true,
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/app/reports',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'warehouse'],
    group: 'finance',
  },
  {
    id: 'employees',
    label: 'Employees & Roles',
    path: '/app/employees',
    roles: ['owner', 'general_accountant', 'system_admin'],
    group: 'admin',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/app/settings',
    roles: ['owner', 'general_accountant', 'system_admin'],
    group: 'admin',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    path: '/app/audit',
    roles: ['owner', 'general_accountant'],
    group: 'admin',
  },
  {
    id: 'inquiries',
    label: 'Inquiries',
    path: '/app/inquiries',
    roles: ['owner', 'general_accountant', 'branch_accountant', 'system_admin'],
    group: 'admin',
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

/** Creating accounts and changing passwords stays with System Admin. */
export function canManageEmployees(role: AppRole): boolean {
  return role === 'system_admin'
}

/** Owners and General Accountants may edit profile details (not credentials). */
export function canEditEmployees(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant'])
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

/** Warehouse Inventory (and receivers) may register inbound containers; owner/admin still see all. */
export function canCreateContainers(role: AppRole): boolean {
  return roleIn(role, ['warehouse', 'branch_accountant', 'owner'])
}

export function canReceiveContainers(role: AppRole): boolean {
  return roleIn(role, ['warehouse', 'branch_accountant', 'owner'])
}

export function canViewSales(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse'])
}

export function canCreateSales(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse'])
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
  return roleIn(role, ['employee', 'warehouse', 'branch_accountant'])
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

// Customers
export function canViewCustomers(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'cashier'])
}

export function canManageCustomers(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant', 'cashier'])
}

// Website inquiries
export function canViewInquiries(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

export function canManageInquiries(role: AppRole): boolean {
  return roleIn(role, ['owner', 'general_accountant', 'branch_accountant'])
}

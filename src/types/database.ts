export type AppRole =
  | 'owner'
  | 'general_accountant'
  | 'branch_accountant'
  | 'cashier'
  | 'warehouse'
  | 'employee'
  | 'system_admin'

export type SackSize = 5 | 25 | 50
export type VarietyOrigin = 'local' | 'imported'

export interface Branch {
  id: string
  name: string
  address: string | null
  contact: string | null
  active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Profile {
  id: string
  full_name: string
  role: AppRole
  branch_id: string | null
  phone: string | null
  email: string | null
  active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  branch?: Branch | null
}

export interface CompanySettings {
  id: string
  name: string
  address: string | null
  tin: string | null
  contacts: string | null
  logo_url: string | null
  dr_prefix: string | null
  updated_at: string
  updated_by: string | null
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

export interface Variety {
  id: string
  name: string
  origin: VarietyOrigin
  active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Sku {
  id: string
  variety_id: string
  sack_size: SackSize
  barcode: string | null
  reorder_level: number
  active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  variety?: Variety | null
}

export type StockMovementType =
  | 'stock_in'
  | 'sale'
  | 'adjustment'
  | 'repack_in'
  | 'repack_out'
  | 'transfer_in'
  | 'transfer_out'

export type AdjustmentStatus = 'pending' | 'approved' | 'rejected'
export type TransferStatus = 'draft' | 'in_transit' | 'received' | 'cancelled'
export type RepackDirection = 'in' | 'out'

export interface StockMovement {
  id: string
  sku_id: string
  branch_id: string
  quantity: number
  movement_type: StockMovementType
  reference_table: string | null
  reference_id: string | null
  note: string | null
  created_by: string | null
  moved_at: string
  created_at: string
  sku?: Sku | null
  branch?: Branch | null
}

export interface StockOnHand {
  branch_id: string
  sku_id: string
  on_hand: number
}

export interface StockAdjustment {
  id: string
  branch_id: string
  sku_id: string
  quantity: number
  reason: string
  status: AdjustmentStatus
  requested_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  sku?: Sku | null
  branch?: Branch | null
}

export interface Repacking {
  id: string
  branch_id: string
  repack_date: string
  input_weight_kg: number
  output_weight_kg: number
  weight_lost_kg: number
  reason: string | null
  status: string
  created_by: string | null
  created_at: string
  lines?: RepackingLine[]
  branch?: Branch | null
}

export interface RepackingLine {
  id: string
  repacking_id: string
  sku_id: string
  direction: RepackDirection
  sacks: number
  sku?: Sku | null
}

export interface Transfer {
  id: string
  from_branch_id: string
  to_branch_id: string
  status: TransferStatus
  notes: string | null
  created_by: string | null
  shipped_at: string | null
  received_at: string | null
  received_by: string | null
  created_at: string
  updated_at: string
  from_branch?: Branch | null
  to_branch?: Branch | null
  lines?: TransferLine[]
}

export interface TransferLine {
  id: string
  transfer_id: string
  sku_id: string
  sacks_sent: number
  sacks_received: number | null
  sku?: Sku | null
}

export interface Price {
  id: string
  sku_id: string
  price: number
  effective_from: string
  set_by: string | null
  created_at: string
  sku?: Sku | null
  set_by_profile?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface SessionUser {
  id: string
  email: string | undefined
  profile: Profile
}

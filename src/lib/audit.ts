import { supabase } from './supabase'

export async function writeAuditLog(params: {
  action: string
  tableName: string
  recordId?: string | null
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('audit_log').insert({
    user_id: user?.id ?? null,
    action: params.action,
    table_name: params.tableName,
    record_id: params.recordId ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
  })

  if (error) {
    console.error('[JMG] audit_log insert failed', error)
  }
}

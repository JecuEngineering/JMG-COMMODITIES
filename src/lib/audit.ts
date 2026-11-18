import { supabase } from './supabase'

export async function writeAuditLog(params: {
  action: string
  tableName: string
  recordId?: string | null
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
}): Promise<void> {
  // getSession reads local storage; getUser would hit the auth server and
  // sign the operator out if that session was revoked from another device.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { error } = await supabase.from('audit_log').insert({
    user_id: session?.user.id ?? null,
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

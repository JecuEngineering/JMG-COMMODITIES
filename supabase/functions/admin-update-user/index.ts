import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// System Admin only: reset an employee's password and/or login email.
// Profile fields (name, role, branch, phone) are edited directly in the app.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401)

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: callerProfile } = await caller
      .from('profiles')
      .select('role, active')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'system_admin' || callerProfile.active === false) {
      return json({ error: 'Only System Admin can change credentials.' }, 403)
    }

    const body = await req.json()
    const userId = String(body.userId ?? '')
    const password = body.password == null ? null : String(body.password)
    const email = body.email == null ? null : String(body.email).trim()

    if (!userId) return json({ error: 'Missing userId' }, 400)
    if (!password && !email) return json({ error: 'Nothing to update' }, 400)
    if (password !== null && password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400)
    }
    if (email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: 'Enter a valid email address.' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, email, role')
      .eq('id', userId)
      .single()
    if (targetError || !target) return json({ error: 'Employee not found.' }, 404)
    if (target.role === 'system_admin' && email) {
      return json({ error: 'Change the System Admin login email in the Supabase dashboard.' }, 400)
    }

    const attributes: Record<string, unknown> = {}
    if (password) attributes.password = password
    if (email) {
      attributes.email = email
      attributes.email_confirm = true
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, attributes)
    if (updateError) return json({ error: updateError.message }, 400)

    if (email) {
      const { error: profileError } = await admin
        .from('profiles')
        .update({ email })
        .eq('id', userId)
      if (profileError) return json({ error: profileError.message }, 400)
    }

    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'update_credentials',
      table_name: 'profiles',
      record_id: userId,
      new_value: { password_reset: Boolean(password), email_changed: Boolean(email) },
    })

    return json({ ok: true })
  } catch (error) {
    return json({ error: String(error) }, 500)
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const LIMITS = { name: 120, contact: 160, message: 2000, branch: 120 }

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clip(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, max)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json()
    const name = clip(body.name, LIMITS.name)
    const contact = clip(body.contact, LIMITS.contact)
    const message = String(body.message ?? '').trim().slice(0, LIMITS.message)
    const branch = clip(body.branchInterest, LIMITS.branch)

    if (!name || !contact || message.length < 10) {
      return json({ error: 'Missing or incomplete inquiry.' }, 400)
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const to = Deno.env.get('INQUIRY_NOTIFY_TO')
    const from = Deno.env.get('INQUIRY_NOTIFY_FROM') ?? 'JMG Website <onboarding@resend.dev>'

    if (!apiKey || !to) {
      return json({ skipped: true, reason: 'Email notification is not configured.' })
    }

    const recipients = to
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean)

    const text = [
      `Name: ${name}`,
      `Contact: ${contact}`,
      `Area / branch: ${branch || '—'}`,
      '',
      message,
    ].join('\n')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: `Website inquiry from ${name}`,
        text,
        reply_to: contact.includes('@') ? contact : undefined,
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('Resend rejected the inquiry email', response.status, detail)
      return json({ error: 'Email provider rejected the message.' }, 502)
    }

    return json({ sent: true })
  } catch (error) {
    console.error('notify-inquiry failed', error)
    return json({ error: 'Unexpected error.' }, 500)
  }
})

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1'
const SUNITA_ID = '8924bdb8-8cdd-42b6-88ab-7037af86513d'

function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function extractHtml(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/html' && payload.body?.data) return decodeB64Url(payload.body.data)
  for (const part of payload.parts ?? []) {
    const html = extractHtml(part)
    if (html) return html
  }
  // fall back to plain text if no html found
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeB64Url(payload.body.data)
  return ''
}

async function gmailFetch(path: string, lovableKey: string, connKey: string) {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': connKey },
  })
  if (!res.ok) throw new Error(`Gmail ${path} failed [${res.status}]: ${await res.text()}`)
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY')
    const connKey = Deno.env.get('GOOGLE_MAIL_API_KEY_1')
    if (!lovableKey || !connKey) throw new Error('Missing gateway keys')

    // 1. List all messages sent to Sunita
    const messageIds: string[] = []
    let pageToken: string | undefined
    do {
      const q = encodeURIComponent('to:khankasunita415@gmail.com')
      const url = `/users/me/messages?maxResults=500&q=${q}${pageToken ? `&pageToken=${pageToken}` : ''}`
      const data = await gmailFetch(url, lovableKey, connKey)
      for (const m of data.messages ?? []) messageIds.push(m.id)
      pageToken = data.nextPageToken
    } while (pageToken)

    // 2. Fetch each message and extract invoice numbers (parallel batches)
    const invoiceNumbers = new Set<string>()
    let emailsRead = 0
    const BATCH = 15
    for (let i = 0; i < messageIds.length; i += BATCH) {
      const chunk = messageIds.slice(i, i + BATCH)
      const msgs = await Promise.all(
        chunk.map((id) => gmailFetch(`/users/me/messages/${id}?format=full`, lovableKey, connKey)),
      )
      for (const msg of msgs) {
        const html = extractHtml(msg.payload)
        const text = html.replace(/<[^>]+>/g, ' ')
        const matches = text.match(/INV-[A-Z0-9]{5,}/g) ?? []
        for (const m of matches) invoiceNumbers.add(m)
        emailsRead++
      }
    }

    // 3. Reassign matching invoices to Sunita
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const invList = [...invoiceNumbers]
    const { data: matched, error: matchErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, employee_id')
      .in('invoice_number', invList)
    if (matchErr) throw matchErr

    const toUpdate = (matched ?? []).filter((i) => i.employee_id !== SUNITA_ID).map((i) => i.id)
    let updated = 0
    if (toUpdate.length > 0) {
      const { error: updErr, count } = await supabase
        .from('invoices')
        .update({ employee_id: SUNITA_ID }, { count: 'exact' })
        .in('id', toUpdate)
      if (updErr) throw updErr
      updated = count ?? toUpdate.length
    }

    return new Response(
      JSON.stringify({
        emailsFound: messageIds.length,
        emailsRead,
        uniqueInvoiceNumbers: invList.length,
        matchedInDb: matched?.length ?? 0,
        updated,
        alreadySunita: (matched?.length ?? 0) - toUpdate.length,
        notFoundInDb: invList.length - (matched?.length ?? 0),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

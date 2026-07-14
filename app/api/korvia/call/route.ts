import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── POST /api/korvia/call ──────────────────────────────────────────────────
// Initiates an outbound Twilio Voice call to a subcontractor.
// The call plays a TwiML message from KORVIA.

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { toPhone, message, subName, projectName } = body as {
    toPhone: string; message?: string; subName?: string; projectName?: string
  }

  if (!toPhone) {
    return NextResponse.json({ error: 'toPhone required' }, { status: 400 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromPhone  = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromPhone) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  const firstName = (subName ?? '').split(' ')[0] || 'there'
  const callMsg   = message
    ?? `Hi ${firstName}, this is KORVIA from Brivox Construction calling about your work on ${projectName ?? 'your current project'}. Please check your messages or call your builder back. Thank you.`

  // TwiML as a plain string (no external bin needed)
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">${escapeXml(callMsg)}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna" language="en-US">Goodbye.</Say>
</Response>`

  // Twilio REST API — initiate call with inline TwiML
  const cleanTo   = toPhone.startsWith('+') ? toPhone : `+1${toPhone.replace(/\D/g, '')}`
  const cleanFrom = fromPhone.startsWith('+') ? fromPhone : `+1${fromPhone.replace(/\D/g, '')}`

  const formData = new URLSearchParams({
    To:   cleanTo,
    From: cleanFrom,
    Twiml: twiml,
  })

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`
  const res = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  })

  const json = await res.json() as any
  if (!res.ok) {
    console.error('[KORVIA/call] Twilio error:', json)
    return NextResponse.json({ ok: false, error: json.message ?? 'Call failed' }, { status: 500 })
  }

  // fire-and-forget — log call
  void supabaseAdmin.from('bf_notifications').insert({
    type: 'subcontractor',
    title: `KORVIA called ${subName ?? toPhone}`,
    body: `Outbound call placed to ${cleanTo}`,
    is_read: false,
    created_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, callSid: json.sid, status: json.status })
}

function escapeXml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

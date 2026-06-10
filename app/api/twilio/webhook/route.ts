import { NextRequest, NextResponse } from 'next/server'

// Sofia AI — interpreta respuestas SMS de subcontratistas
function interpretSofiaReply(body: string): { action: string; days?: number } | null {
  const text = body.trim().toUpperCase()

  if (/^(START|INICIO|STARTED|EMPEZANDO|COMENZANDO)/.test(text))
    return { action: 'in_progress' }
  if (/^(DONE|COMPLETE|COMPLETADO|LISTO|FINISHED|TERMINADO)/.test(text))
    return { action: 'completed' }
  if (/^DELAY/.test(text) || /^RETRASO/.test(text) || /^RETRASADO/.test(text)) {
    const match = text.match(/(\d+)/)
    return { action: 'delayed', days: match ? parseInt(match[1]) : 1 }
  }
  if (/^(INSPECTION|INSPECCION|INSPECCIÓN)/.test(text)) {
    if (/PASS|PASSED|PASO|PASÓ|OK/.test(text)) return { action: 'inspection_passed' }
    if (/FAIL|FAILED|FALLO|FALLÓ|NO/.test(text)) return { action: 'inspection_failed' }
    return { action: 'inspection_scheduled' }
  }
  if (/^HELP/.test(text) || /^AYUDA/.test(text)) return { action: 'help' }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const from = formData.get('From') as string
    const body = formData.get('Body') as string

    console.log(`SMS from ${from}: ${body}`)

    const interpretation = interpretSofiaReply(body)

    let responseText = ''

    if (!interpretation) {
      responseText = `BuildFlow: Sofia didn't understand "${body}". Reply: START | DONE | DELAY [days] | INSPECTION PASSED | INSPECTION FAILED | HELP`
    } else if (interpretation.action === 'help') {
      responseText = `BuildFlow Commands:
START — Task in progress
DONE — Task completed
DELAY 3 — Delayed 3 days
INSPECTION PASSED
INSPECTION FAILED
Or update via your link.`
    } else {
      // Sofia confirms the action — actual update happens via the portal link
      const actionMessages: Record<string, string> = {
        in_progress:          '✅ Got it! Marked as In Progress.',
        completed:            '🎉 Great! Marked as Completed. Builder notified.',
        delayed:              `⚠️ Noted. Marked as Delayed${interpretation.days ? ` ${interpretation.days} day(s)` : ''}. Please update your portal with the new date.`,
        inspection_passed:    '✅ Inspection PASSED logged! Builder notified.',
        inspection_failed:    '❌ Inspection FAILED logged. Builder notified.',
        inspection_scheduled: '📅 Inspection scheduled noted.',
      }
      responseText = `BuildFlow Sofia: ${actionMessages[interpretation.action] ?? 'Update received!'}`
    }

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${responseText}</Message></Response>`

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (e: any) {
    console.error('Webhook error:', e)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
  }
}

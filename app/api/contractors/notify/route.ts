import { NextRequest, NextResponse } from 'next/server'
import { sendSMS } from '@/lib/sms'
import { getTradeLabel } from '@/lib/tradeMapping'

export async function POST(req: NextRequest) {
  try {
    const { phone, company, contactName, trade, projectName, projectAddress, assignedCount } = await req.json()

    const tradeLabel = getTradeLabel(trade)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow.vercel.app'

    const message = `🏗️ BuildFlow — Welcome!

Hi ${contactName}! You've been registered for:

📋 Project: ${projectName}
📍 ${projectAddress}
🔧 Your trade: ${tradeLabel}
📌 Tasks assigned: ${assignedCount}

You'll receive an SMS automatically when:
• Your phase is ready to start
• A parallel trade begins (e.g. Electrical + Plumbing)
• Inspections are needed
• Schedule changes

Reply HELP for commands.
— BuildFlow (405) 873-8877`

    const result = await sendSMS(phone, message)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

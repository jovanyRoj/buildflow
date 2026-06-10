import { NextRequest, NextResponse } from 'next/server'
import { sendSMS, buildBuilderUpdateSMS } from '@/lib/sms'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [projectId, taskId] = decoded.split(':')
    return NextResponse.json({ token, projectId, taskId, _clientLoad: true })
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    const body = await req.json()
    const { status, inspectionStatus, inspectionNotes, notes, delayDays,
      taskName, projectName, projectAddress, subName, builderPhone } = body

    if (builderPhone) {
      await sendSMS(
        builderPhone,
        buildBuilderUpdateSMS(
          { name: taskName } as any,
          { name: projectName, address: projectAddress } as any,
          status, subName ?? 'Subcontractor'
        )
      )
    }
    return NextResponse.json({ ok: true, token, status, inspectionStatus })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

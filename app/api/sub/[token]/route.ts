import { NextRequest, NextResponse } from 'next/server'
import { sendSMS, buildBuilderUpdateSMS } from '@/lib/sms'

// In-memory store bridge — reads/writes localStorage via a shared file
// For Vercel serverless, we use a simple file-based approach
// Production upgrade: replace with Supabase/PlanetScale

function getProjectsFromStorage(): any[] {
  // Serverless functions can't access localStorage
  // We use a global in-memory cache warmed by client calls
  return (global as any).__buildflowProjects ?? []
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params

  try {
    // Decode token: base64url of "projectId:taskId:timestamp"
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [projectId, taskId] = decoded.split(':')

    // Since serverless can't access client localStorage, we rely on the
    // client-side portal to load its own data via the token
    // Return token metadata only — client will hydrate from localStorage
    return NextResponse.json({
      token,
      projectId,
      taskId,
      // Signal to client to load from its own storage
      _clientLoad: true,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params

  try {
    const body = await req.json()
    const { status, inspectionStatus, inspectionNotes, notes, delayDays, taskName, projectName, projectAddress, subName, builderPhone } = body

    // Notify builder via SMS if they have a phone number configured
    if (builderPhone) {
      const taskInfo = { name: taskName } as any
      const projectInfo = { name: projectName, address: projectAddress } as any
      await sendSMS(builderPhone, buildBuilderUpdateSMS(taskInfo, projectInfo, status, subName ?? 'Subcontractor'))
    }

    return NextResponse.json({ ok: true, token, status, inspectionStatus })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

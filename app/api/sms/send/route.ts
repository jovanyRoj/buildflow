import { NextRequest, NextResponse } from 'next/server'
import { sendSMS, buildTaskNotificationSMS, buildCascadeNotificationSMS } from '@/lib/sms'
import { Task, Project } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, task, project, builderName, nextTask, completedTaskName } = body as {
      type: 'task_assigned' | 'cascade'
      task?: Task
      project: Project
      builderName?: string
      nextTask?: Task
      completedTaskName?: string
    }

    if (type === 'task_assigned' && task) {
      const phone = task.subcontractorPhone
      if (!phone) return NextResponse.json({ ok: false, error: 'No phone number' }, { status: 400 })
      const message = buildTaskNotificationSMS(task, project, builderName ?? 'Your builder')
      const result = await sendSMS(phone, message)
      return NextResponse.json(result)
    }

    if (type === 'cascade' && nextTask && completedTaskName) {
      const phone = nextTask.subcontractorPhone
      if (!phone) return NextResponse.json({ ok: true, skipped: 'No phone for next task' })
      const message = buildCascadeNotificationSMS(nextTask, project, completedTaskName)
      const result = await sendSMS(phone, message)
      return NextResponse.json(result)
    }

    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

import { addDays, format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

export interface TaskTemplate {
  name: string
  order: number
  durationDays: number
  dependencyOrders: number[]
  inspectionRequired: boolean
  trade: string
}

// Tasks that require Oklahoma building inspections
const INSPECTION_TASKS = new Set([
  'Footings', 'Foundation', 'Framing', 'Electrical Rough-In',
  'Plumbing Rough-In', 'HVAC Rough-In', 'Insulation',
  'Final Electrical', 'Final Plumbing', 'Final Inspection',
])

export const TASK_TEMPLATES: TaskTemplate[] = [
  { name: 'Site Survey',               order: 1,  durationDays: 2,  dependencyOrders: [],        inspectionRequired: false, trade: 'Surveyor' },
  { name: 'Property Boundary Marking', order: 2,  durationDays: 1,  dependencyOrders: [1],       inspectionRequired: false, trade: 'Surveyor' },
  { name: 'Excavation',                order: 3,  durationDays: 5,  dependencyOrders: [2],       inspectionRequired: false, trade: 'Excavation' },
  { name: 'Footings',                  order: 4,  durationDays: 4,  dependencyOrders: [3],       inspectionRequired: true,  trade: 'Concrete' },
  { name: 'Foundation',                order: 5,  durationDays: 7,  dependencyOrders: [4],       inspectionRequired: true,  trade: 'Concrete' },
  { name: 'Framing',                   order: 6,  durationDays: 14, dependencyOrders: [5],       inspectionRequired: true,  trade: 'Framing' },
  { name: 'Roofing',                   order: 7,  durationDays: 7,  dependencyOrders: [6],       inspectionRequired: false, trade: 'Roofing' },
  { name: 'Windows',                   order: 8,  durationDays: 3,  dependencyOrders: [6],       inspectionRequired: false, trade: 'Windows' },
  { name: 'Electrical Rough-In',       order: 9,  durationDays: 5,  dependencyOrders: [6],       inspectionRequired: true,  trade: 'Electrical' },
  { name: 'Plumbing Rough-In',         order: 10, durationDays: 5,  dependencyOrders: [9],       inspectionRequired: true,  trade: 'Plumbing' },
  { name: 'HVAC Rough-In',             order: 11, durationDays: 4,  dependencyOrders: [10],      inspectionRequired: true,  trade: 'HVAC' },
  { name: 'Insulation',                order: 12, durationDays: 3,  dependencyOrders: [11],      inspectionRequired: true,  trade: 'Insulation' },
  { name: 'Drywall',                   order: 13, durationDays: 7,  dependencyOrders: [12],      inspectionRequired: false, trade: 'Drywall' },
  { name: 'Interior Paint',            order: 14, durationDays: 5,  dependencyOrders: [13],      inspectionRequired: false, trade: 'Paint' },
  { name: 'Flooring',                  order: 15, durationDays: 5,  dependencyOrders: [14],      inspectionRequired: false, trade: 'Flooring' },
  { name: 'Cabinets',                  order: 16, durationDays: 4,  dependencyOrders: [15],      inspectionRequired: false, trade: 'Cabinets' },
  { name: 'Fixtures',                  order: 17, durationDays: 3,  dependencyOrders: [15],      inspectionRequired: false, trade: 'Fixtures' },
  { name: 'Final Electrical',          order: 18, durationDays: 2,  dependencyOrders: [16, 17],  inspectionRequired: true,  trade: 'Electrical' },
  { name: 'Final Plumbing',            order: 19, durationDays: 2,  dependencyOrders: [16, 17],  inspectionRequired: true,  trade: 'Plumbing' },
  { name: 'Final Inspection',          order: 20, durationDays: 1,  dependencyOrders: [18, 19],  inspectionRequired: true,  trade: 'Inspector' },
  { name: 'Punch List',                order: 21, durationDays: 3,  dependencyOrders: [20],      inspectionRequired: false, trade: 'General' },
  { name: 'Closing',                   order: 22, durationDays: 1,  dependencyOrders: [21],      inspectionRequired: false, trade: 'General' },
]

export function generateTasks(projectId: string, projectStartDate: string): import('./types').Task[] {
  const start = new Date(projectStartDate)
  const tasks: import('./types').Task[] = []
  const orderToId: Record<number, string> = {}
  const orderToEndDate: Record<number, Date> = {}

  for (const tmpl of TASK_TEMPLATES) {
    const id = uuidv4()
    orderToId[tmpl.order] = id

    let taskStart = start
    if (tmpl.dependencyOrders.length > 0) {
      const latestDep = tmpl.dependencyOrders.reduce((latest, depOrder) => {
        const depEnd = orderToEndDate[depOrder]
        return depEnd > latest ? depEnd : latest
      }, start)
      taskStart = addDays(latestDep, 1)
    }

    const taskEnd = addDays(taskStart, tmpl.durationDays - 1)
    orderToEndDate[tmpl.order] = taskEnd

    // Generate a portal token for subcontractor access
    const portalToken = Buffer.from(`${projectId}:${id}:${Date.now()}`).toString('base64url')

    tasks.push({
      id,
      projectId,
      name: tmpl.name,
      order: tmpl.order,
      startDate: format(taskStart, 'yyyy-MM-dd'),
      endDate: format(taskEnd, 'yyyy-MM-dd'),
      originalEndDate: format(taskEnd, 'yyyy-MM-dd'),
      durationDays: tmpl.durationDays,
      status: 'pending',
      delayDays: 0,
      assignedTo: '',
      subcontractorPhone: '',
      notes: '',
      dependencies: tmpl.dependencyOrders.map(o => orderToId[o]),
      inspectionRequired: tmpl.inspectionRequired,
      inspectionStatus: tmpl.inspectionRequired ? 'pending' : 'not_required',
      portalToken,
      updatedAt: new Date().toISOString(),
    })
  }

  return tasks
}

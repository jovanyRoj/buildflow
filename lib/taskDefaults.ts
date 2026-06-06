import { addDays, format } from 'date-fns'

export interface TaskTemplate {
  name: string
  order: number
  durationDays: number
  dependencyOrders: number[] // orders of predecessor tasks
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  { name: 'Site Survey',            order: 1,  durationDays: 2,  dependencyOrders: [] },
  { name: 'Property Boundary Marking', order: 2, durationDays: 1, dependencyOrders: [1] },
  { name: 'Excavation',             order: 3,  durationDays: 5,  dependencyOrders: [2] },
  { name: 'Footings',               order: 4,  durationDays: 4,  dependencyOrders: [3] },
  { name: 'Foundation',             order: 5,  durationDays: 7,  dependencyOrders: [4] },
  { name: 'Framing',                order: 6,  durationDays: 14, dependencyOrders: [5] },
  { name: 'Roofing',                order: 7,  durationDays: 7,  dependencyOrders: [6] },
  { name: 'Windows',                order: 8,  durationDays: 3,  dependencyOrders: [6] },
  { name: 'Electrical Rough-In',    order: 9,  durationDays: 5,  dependencyOrders: [6] },
  { name: 'Plumbing Rough-In',      order: 10, durationDays: 5,  dependencyOrders: [9] },
  { name: 'HVAC Rough-In',          order: 11, durationDays: 4,  dependencyOrders: [10] },
  { name: 'Insulation',             order: 12, durationDays: 3,  dependencyOrders: [11] },
  { name: 'Drywall',                order: 13, durationDays: 7,  dependencyOrders: [12] },
  { name: 'Interior Paint',         order: 14, durationDays: 5,  dependencyOrders: [13] },
  { name: 'Flooring',               order: 15, durationDays: 5,  dependencyOrders: [14] },
  { name: 'Cabinets',               order: 16, durationDays: 4,  dependencyOrders: [15] },
  { name: 'Fixtures',               order: 17, durationDays: 3,  dependencyOrders: [15] },
  { name: 'Final Electrical',       order: 18, durationDays: 2,  dependencyOrders: [16, 17] },
  { name: 'Final Plumbing',         order: 19, durationDays: 2,  dependencyOrders: [16, 17] },
  { name: 'Final Inspection',       order: 20, durationDays: 1,  dependencyOrders: [18, 19] },
  { name: 'Punch List',             order: 21, durationDays: 3,  dependencyOrders: [20] },
  { name: 'Closing',                order: 22, durationDays: 1,  dependencyOrders: [21] },
]

export function generateTasks(projectId: string, projectStartDate: string): import('./types').Task[] {
  const { v4: uuidv4 } = require('uuid')
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
      notes: '',
      dependencies: tmpl.dependencyOrders.map(o => orderToId[o]),
      updatedAt: new Date().toISOString(),
    })
  }

  return tasks
}

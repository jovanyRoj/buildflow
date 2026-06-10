// Maps trade names to task names in the project
// Supports both English and Spanish trade names

export const TRADES = [
  { value: 'surveyor',    label: 'Surveyor / Topógrafo',           tasks: ['Site Survey', 'Property Boundary Marking'] },
  { value: 'excavation',  label: 'Excavation / Excavación',        tasks: ['Excavation'] },
  { value: 'concrete',    label: 'Concrete / Concreto',            tasks: ['Footings', 'Foundation'] },
  { value: 'framing',     label: 'Framing / Estructura',           tasks: ['Framing'] },
  { value: 'roofing',     label: 'Roofing / Techo',                tasks: ['Roofing'] },
  { value: 'windows',     label: 'Windows & Doors / Ventanas',     tasks: ['Windows'] },
  { value: 'electrical',  label: 'Electrical / Eléctrico',         tasks: ['Electrical Rough-In', 'Final Electrical'] },
  { value: 'plumbing',    label: 'Plumbing / Plomería',            tasks: ['Plumbing Rough-In', 'Final Plumbing'] },
  { value: 'hvac',        label: 'HVAC / Aire Acondicionado',      tasks: ['HVAC Rough-In'] },
  { value: 'insulation',  label: 'Insulation / Aislamiento',       tasks: ['Insulation'] },
  { value: 'drywall',     label: 'Drywall / Tablaroca',            tasks: ['Drywall'] },
  { value: 'paint',       label: 'Paint / Pintura',                tasks: ['Interior Paint'] },
  { value: 'flooring',    label: 'Flooring / Pisos',               tasks: ['Flooring'] },
  { value: 'cabinets',    label: 'Cabinets & Millwork / Gabinetes',tasks: ['Cabinets'] },
  { value: 'fixtures',    label: 'Fixtures / Accesorios',          tasks: ['Fixtures'] },
  { value: 'inspector',   label: 'Inspector / Inspección',         tasks: ['Final Inspection'] },
  { value: 'general',     label: 'General Contractor / General',   tasks: ['Punch List', 'Closing'] },
]

// Trades that can work simultaneously (parallel execution)
export const PARALLEL_GROUPS = [
  ['electrical', 'plumbing', 'hvac'],     // All rough-ins at the same time
  ['cabinets', 'fixtures'],               // Finish work overlap
  ['final_electrical', 'final_plumbing'], // Final trades simultaneous
]

export function getTasksForTrade(tradeValue: string): string[] {
  return TRADES.find(t => t.value === tradeValue)?.tasks ?? []
}

export function getTradeLabel(tradeValue: string): string {
  return TRADES.find(t => t.value === tradeValue)?.label ?? tradeValue
}

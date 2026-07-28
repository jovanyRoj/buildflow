import { supabaseAdmin } from './supabase-admin'

export type AuditAction = 'created' | 'updated' | 'archived' | 'restored' | 'deleted'
export type PerformedByType = 'user' | 'korvia' | 'subcontractor'

export interface AuditEntry {
  project_id: string
  entity_type: string           // 'phase' | 'item' | 'task' | 'quote'
  entity_id: string
  entity_name?: string
  action: AuditAction
  changed_fields?: Record<string, { from: unknown; to: unknown }>
  previous_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
  performed_by_type: PerformedByType
  performed_by_id?: string
  performed_by_name?: string
  reason?: string
  approval_status?: string
}

/**
 * Write a single audit entry. Never throws — errors are logged to console.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const { error } = await supabaseAdmin.from('bf_audit_log').insert(entry)
  if (error) console.error('[audit] Failed to log:', error.message, entry)
}

/**
 * Compute a changed_fields diff between two plain objects.
 * Returns { field: { from, to } } for every key whose value changed.
 */
export function diffFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  ignoreKeys: string[] = ['updated_at', 'created_at', 'id', 'project_id', 'quote_id', 'phase_id'],
): Record<string, { from: unknown; to: unknown }> {
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const k of keys) {
    if (ignoreKeys.includes(k)) continue
    // Use JSON comparison to handle nested objects
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
      changed[k] = { from: prev[k] ?? null, to: next[k] ?? null }
    }
  }
  return changed
}

/**
 * Build a "performed_by" object from the request's auth header.
 * Falls back to { type: 'user', id: 'builder', name: 'Builder' }.
 */
export function performedBy(
  type: PerformedByType = 'user',
  id = 'builder',
  name = 'Builder',
): Pick<AuditEntry, 'performed_by_type' | 'performed_by_id' | 'performed_by_name'> {
  return { performed_by_type: type, performed_by_id: id, performed_by_name: name }
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { useBrivoxStore } from '@/lib/store'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'

// ─── types ────────────────────────────────────────────────────────────────────
interface SubEntry {
  id: string
  name: string
  company: string
  phone: string
  trade: string
  email: string
  notes: string
  projectId: string
  projectName: string
}

// Merge duplicate subs by phone → list all projects they've worked on
interface MergedSub {
  phone: string
  name: string
  company: string
  trade: string
  email: string
  notes: string
  projects: { id: string; name: string }[]
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function SubsPage() {
  const { ready, user } = useAuthGuard()
  const [rawSubs, setRawSubs] = useState<SubEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    // Re-use existing builder/subs endpoint without excludeProjectId
    fetch(`/api/builder/subs?userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.subs) setRawSubs(d.subs) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.id])

  // Merge subs by phone number
  const subs = useMemo<MergedSub[]>(() => {
    const map = new Map<string, MergedSub>()
    for (const s of rawSubs) {
      const key = s.phone || s.name
      if (map.has(key)) {
        const existing = map.get(key)!
        if (!existing.projects.find(p => p.id === s.projectId)) {
          existing.projects.push({ id: s.projectId, name: s.projectName })
        }
      } else {
        map.set(key, {
          phone:    s.phone,
          name:     s.name,
          company:  s.company,
          trade:    s.trade,
          email:    s.email,
          notes:    s.notes,
          projects: [{ id: s.projectId, name: s.projectName }],
        })
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.company || a.name).localeCompare(b.company || b.name)
    )
  }, [rawSubs])

  const filtered = useMemo(() => {
    if (!search.trim()) return subs
    const q = search.toLowerCase()
    return subs.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.company.toLowerCase().includes(q) ||
      s.trade.toLowerCase().includes(q) ||
      s.phone.includes(q)
    )
  }, [subs, search])

  if (!ready || loading) return <Spinner />

  return (
    <div className="pb-24">
      <TopBar title="Subcontractors" backHref="/dashboard" />

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text" placeholder="Search by name, company, trade…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-700 focus:outline-none focus:border-blue-400"/>
        </div>
      </div>

      {/* Count */}
      <div className="px-4 pb-2">
        <p className="text-xs text-gray-400">{filtered.length} subcontractor{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* List */}
      <div className="px-4 flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 gap-3">
            <span className="text-5xl">👷</span>
            <p className="text-[#1A2B4A] font-semibold">No subcontractors found</p>
            <p className="text-gray-400 text-sm max-w-[240px]">
              Subs appear here once they're added to any of your projects.
            </p>
          </div>
        ) : (
          filtered.map(sub => {
            const isOpen = expanded === sub.phone
            const initials = (sub.company || sub.name || '?').slice(0, 2).toUpperCase()
            const cleanPhone = sub.phone?.replace(/\D/g, '')
            const smsHref  = cleanPhone ? `sms:+1${cleanPhone.replace(/^1/, '')}` : undefined
            const callHref = cleanPhone ? `tel:+1${cleanPhone.replace(/^1/, '')}` : undefined

            return (
              <div key={sub.phone} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Header row */}
                <button className="w-full px-4 pt-4 pb-3 flex items-start gap-3 text-left"
                  onClick={() => setExpanded(isOpen ? null : sub.phone)}>
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-xl bg-[#1A2B4A] flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#1A2B4A] text-sm leading-tight truncate">
                      {sub.company || sub.name}
                    </p>
                    {sub.company && <p className="text-xs text-gray-500 truncate">{sub.name}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {sub.trade && (
                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 rounded-full px-2 py-0.5">
                          {sub.trade}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {sub.projects.length} project{sub.projects.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <svg width="16" height="16" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"
                    className={`mt-1 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>

                {/* Expanded details */}
                {isOpen && (
                  <div className="border-t border-gray-50 px-4 pb-4 pt-3 flex flex-col gap-3">
                    {/* Info rows */}
                    <div className="flex flex-col gap-1.5 text-sm">
                      {sub.phone && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-xs">Phone</span>
                          <span className="text-[#1A2B4A] font-medium text-xs">{sub.phone}</span>
                        </div>
                      )}
                      {sub.email && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-xs">Email</span>
                          <a href={`mailto:${sub.email}`} className="text-blue-600 font-medium text-xs truncate max-w-[200px]">{sub.email}</a>
                        </div>
                      )}
                      {sub.notes && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-gray-400 text-xs">Notes</span>
                          <p className="text-xs text-gray-600 leading-relaxed">{sub.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Projects worked on */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">Projects</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sub.projects.map(p => (
                          <span key={p.id} className="text-[11px] bg-gray-100 text-gray-600 rounded-lg px-2 py-1">
                            🏗️ {p.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Contact buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {smsHref && (
                        <a href={smsHref}
                          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold active:scale-[0.97] transition">
                          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                          Send Message
                        </a>
                      )}
                      {callHref && (
                        <a href={callHref}
                          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-50 border border-green-100 text-green-700 text-xs font-bold active:scale-[0.97] transition">
                          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l1.17-1.17a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                          </svg>
                          Call
                        </a>
                      )}
                    </div>

                    {/* KORVIA call button */}
                    {callHref && (
                      <button
                        onClick={async () => {
                          if (!sub.phone) return
                          await fetch('/api/korvia/call', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              to: sub.phone,
                              message: `Hello, this is KORVIA calling on behalf of your builder. Please check your messages or contact the builder regarding your current project. Thank you.`,
                            }),
                          })
                        }}
                        className="w-full py-2.5 rounded-xl bg-[#1A2B4A] text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition">
                        🤖 Have KORVIA Call This Sub
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <BottomNav />
    </div>
  )
}

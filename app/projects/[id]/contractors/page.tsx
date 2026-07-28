'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { useBrivoxStore } from '@/lib/store'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'
import { TRADES, getTradeLabel } from '@/lib/tradeMapping'

type Sub = {
  id: string; name: string; company: string; phone: string;
  trade: string; email: string; notes: string
}
type CrossSub = Sub & { projectId: string; projectName: string; alreadyHere: boolean }

const TRADE_COLORS: Record<string, string> = {
  electrical:'bg-yellow-100 text-yellow-800', plumbing:'bg-blue-100 text-blue-800',
  hvac:'bg-cyan-100 text-cyan-800',           framing:'bg-orange-100 text-orange-800',
  concrete:'bg-stone-100 text-stone-700',     roofing:'bg-red-100 text-red-700',
  drywall:'bg-gray-100 text-gray-700',        paint:'bg-purple-100 text-purple-700',
  flooring:'bg-amber-100 text-amber-800',     general:'bg-green-100 text-green-700',
}

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
  </div>
}
function normName(s: string): string {
  if (!s) return s
  return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}
function fmtPhone(p: string): string {
  if (!p) return p
  const d = p.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}
function getSubStatus(sub: Sub, tasks: any[]): 'activo'|'invitado'|'registrado' {
  const assigned = tasks.filter(t =>
    (t.assignedTo && sub.company?.toLowerCase().trim() === t.assignedTo?.toLowerCase().trim()) ||
    t.subcontractorPhone === sub.phone
  )
  if (assigned.some(t => t.status === 'active' || t.status === 'in_progress')) return 'activo'
  if (sub.notes?.includes('__invited__')) return 'invitado'
  return 'registrado'
}
const STATUS_CONFIG = {
  activo:     { label:'🟢 Activo',     cls:'bg-green-100 text-green-700' },
  invitado:   { label:'📨 Invitado',   cls:'bg-blue-100 text-blue-700' },
  registrado: { label:'✅ Registrado', cls:'bg-gray-100 text-gray-600' },
}

export default function ContractorsPage() {
  const { id } = useParams() as { id: string }
  const { getProject, refreshProjects, updateTask, currentUser } = useBrivoxStore()
  const { ready } = useAuthGuard()
  const project = getProject(id)

  // All state — must be before any early return
  const [activeTab, setActiveTab]           = useState<'subs'|'tasks'>('subs')
  const [qrDataUrl, setQrDataUrl]           = useState('')
  const [copied, setCopied]                 = useState(false)
  const [copiedLink, setCopiedLink]         = useState<string|null>(null)
  const [sending, setSending]               = useState<string|null>(null)
  const [sent, setSent]                     = useState<string|null>(null)
  const [editSub, setEditSub]               = useState<Sub|null>(null)
  const [editForm, setEditForm]             = useState<Sub|null>(null)
  const [editSaving, setEditSaving]         = useState(false)
  const [deleting, setDeleting]             = useState<string|null>(null)
  const [assignTask, setAssignTask]         = useState<any|null>(null)
  const [assignSub, setAssignSub]           = useState('')
  const [assigning, setAssigning]           = useState(false)
  const [showImport, setShowImport]         = useState(false)
  const [crossSubs, setCrossSubs]           = useState<CrossSub[]>([])
  const [loadingCross, setLoadingCross]     = useState(false)
  const [importingSub, setImportingSub]     = useState<string|null>(null)
  const [importedSubs, setImportedSubs]     = useState<Set<string>>(new Set())
  const [showInvite, setShowInvite]         = useState(false)
  const [inviteForm, setInviteForm]         = useState({ company:'', contactName:'', phone:'', trade:'general', email:'' })
  const [inviting, setInviting]             = useState(false)
  const [invitedPortalUrl, setInvitedPortalUrl] = useState<string|null>(null)
  const [searchQ, setSearchQ]               = useState('')
  const [filterTrade, setFilterTrade]       = useState('all')
  const [filterStatus, setFilterStatus]     = useState('all')

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow-eight-sigma.vercel.app')
  const joinUrl = `${appUrl}/join/${id}`

  // Derive contractors before guard so useMemo can reference it
  const contractors: Sub[] = ((project as any)?.subcontractors ?? []) as Sub[]
  const projectTasks: any[] = project?.tasks ?? []

  // useMemo BEFORE conditional return (hooks rules)
  const filteredContractors = useMemo(() => {
    return contractors.filter(c => {
      const status = getSubStatus(c, projectTasks)
      const q = searchQ.toLowerCase()
      const matchSearch = !q ||
        c.company?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.trade?.toLowerCase().includes(q)
      const matchTrade  = filterTrade === 'all' || c.trade === filterTrade
      const matchStatus = filterStatus === 'all' || status === filterStatus
      return matchSearch && matchTrade && matchStatus
    })
  }, [contractors, searchQ, filterTrade, filterStatus, projectTasks])

  const tradesInUse = useMemo(
    () => [...new Set(contractors.map(c => c.trade))],
    [contractors]
  )

  useEffect(() => {
    if (!project) return
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(joinUrl, { width:300, margin:2, color:{ dark:'#1A2B4A', light:'#FFFFFF' } })
        .then(setQrDataUrl)
    })
  }, [project, joinUrl])

  // Early return after all hooks
  if (!ready || !project) return <Spinner />

  function getTaskSub(task: any): Sub|undefined {
    return contractors.find(c =>
      (task.assignedTo && c.company?.toLowerCase().trim() === task.assignedTo?.toLowerCase().trim()) ||
      (task.subcontractorPhone && c.phone === task.subcontractorPhone)
    )
  }
  function portalUrl(subId: string) { return `${appUrl}/portal/${id}/${subId}` }
  function handleCopy() { navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2500) }
  function copyLink(url: string, key: string) { navigator.clipboard.writeText(url); setCopiedLink(key); setTimeout(() => setCopiedLink(null), 2500) }

  async function handleNotify(c: Sub) {
    setSending(c.id)
    const nextTask = projectTasks.filter(t => t.subcontractorPhone === c.phone).find(t => t.status === 'pending' || t.status === 'active')
    if (nextTask) await fetch('/api/sms/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'task_assigned', task:nextTask, project, builderName:'Builder' }) })
    setSending(null); setSent(c.id); setTimeout(() => setSent(null), 3000)
  }

  async function handleEditSave() {
    if (!editForm) return
    setEditSaving(true)
    await fetch(`/api/join/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(editForm) })
    await refreshProjects()
    setEditSaving(false); setEditSub(null)
  }

  async function handleDelete(subId: string) {
    if (!confirm('Remove this subcontractor from this project?')) return
    setDeleting(subId)
    await fetch(`/api/join/${id}?subId=${subId}`, { method:'DELETE' })
    await refreshProjects(); setDeleting(null)
  }

  async function handleAssignSub() {
    if (!assignTask || !assignSub) return
    const sub = contractors.find(c => c.id === assignSub)
    if (!sub) return
    setAssigning(true)
    updateTask(id, assignTask.id, { assignedTo: sub.company, subcontractorPhone: sub.phone })
    await new Promise(r => setTimeout(r, 800))
    setAssigning(false); setAssignTask(null); setAssignSub('')
  }

  async function handleInvite() {
    const { company, contactName, phone, trade, email } = inviteForm
    if (!company || !contactName || !phone || !trade) return
    setInviting(true)
    const res = await fetch(`/api/join/${id}`, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ company, contactName, phone, email, trade }) })
    const data = await res.json()
    if (data.subId) {
      await fetch(`/api/join/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id:data.subId, company, name:contactName, phone, email, trade, notes:'__invited__' }) })
      setInvitedPortalUrl(portalUrl(data.subId))
      await refreshProjects()
    }
    setInviting(false)
  }

  async function openImportModal() {
    if (!currentUser) return
    setShowImport(true); setLoadingCross(true)
    const res = await fetch(`/api/builder/subs?userId=${currentUser.id}&excludeProjectId=${id}`)
    const data = await res.json()
    setCrossSubs(data.subs ?? []); setLoadingCross(false)
  }

  async function handleImportSub(sub: CrossSub) {
    setImportingSub(sub.id)
    await fetch(`/api/join/${id}`, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ company:sub.company, contactName:sub.name, phone:sub.phone, email:sub.email, trade:sub.trade }) })
    setImportedSubs(prev => new Set([...prev, sub.id]))
    setImportingSub(null); await refreshProjects()
  }

  const crossSubsByProject = crossSubs.reduce<Record<string, CrossSub[]>>((acc, s) => {
    ;(acc[s.projectName] ??= []).push(s); return acc
  }, {})

  return (
    <div className="pb-24">
      <TopBar title="Subcontractors" backHref={`/projects/${id}`}
        action={
          <button onClick={() => { setShowInvite(true); setInviteForm({ company:'', contactName:'', phone:'', trade:'general', email:'' }); setInvitedPortalUrl(null) }}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl">
            + Invitar Sub
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-0 z-10">
        {[
          { key:'subs',  label:`Subs (${contractors.length})`, icon:'👷' },
          { key:'tasks', label:`Tasks (${projectTasks.length})`, icon:'📋' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-0.5 border-b-2 transition ${activeTab===t.key ? 'border-[#2E7CF6] text-[#2E7CF6]' : 'border-transparent text-gray-400'}`}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">

        {/* ── SUBS TAB ──────────────────────────────────── */}
        {activeTab === 'subs' && (<>

          {/* Search + Filter */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm placeholder:text-gray-400"
                placeholder="Buscar por nombre, empresa, oficio…" value={searchQ} onChange={e => setSearchQ(e.target.value)}/>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <select className="text-xs border border-gray-200 rounded-xl px-2 py-1.5 bg-white text-gray-600 flex-shrink-0"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="registrado">Registrado</option>
                <option value="invitado">Invitado</option>
              </select>
              <select className="text-xs border border-gray-200 rounded-xl px-2 py-1.5 bg-white text-gray-600 flex-shrink-0"
                value={filterTrade} onChange={e => setFilterTrade(e.target.value)}>
                <option value="all">Todos los oficios</option>
                {tradesInUse.map(t => <option key={t} value={t}>{getTradeLabel(t).split(' /')[0]}</option>)}
              </select>
            </div>
          </div>

          {/* Project registration link */}
          <div className="card p-4 border border-dashed border-gray-200">
            <p className="text-xs font-bold text-gray-500 mb-1">🔗 Enlace de Registro del Proyecto</p>
            <p className="text-xs text-gray-400 mb-2">Cualquier sub puede usar este enlace para auto-registrarse. Para invitar directamente, usa el botón "+ Invitar Sub".</p>
            <div className="flex gap-2">
              <p className="flex-1 text-xs text-gray-600 font-mono bg-gray-50 rounded-lg px-2 py-1.5 break-all">{joinUrl}</p>
              <button onClick={handleCopy} className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold ${copied ? 'bg-green-500 text-white' : 'bg-[#1A2B4A] text-white'}`}>
                {copied ? '✓' : '📋'}
              </button>
            </div>
          </div>

          {/* Contractors list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[#1A2B4A]">
                {filteredContractors.length === contractors.length ? `Subcontratistas (${contractors.length})` : `${filteredContractors.length} de ${contractors.length}`}
              </h2>
              <span className="text-xs text-gray-400">{projectTasks.filter(t => t.subcontractorPhone).length} tareas asignadas</span>
            </div>

            {contractors.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-4xl mb-3">👷</div>
                <p className="font-semibold text-[#1A2B4A] mb-1">Sin subcontratistas</p>
                <p className="text-gray-400 text-sm mb-4">Invítalos con el botón "Invitar Sub" o comparte el enlace de registro.</p>
                <button onClick={() => setShowInvite(true)} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl">+ Invitar Sub</button>
              </div>
            ) : filteredContractors.length === 0 ? (
              <div className="card p-6 text-center">
                <p className="text-gray-400 text-sm">Ningún sub coincide con los filtros.</p>
                <button onClick={() => { setSearchQ(''); setFilterTrade('all'); setFilterStatus('all') }} className="mt-2 text-xs text-blue-500 underline">Limpiar filtros</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredContractors.map(c => {
                  const assignedTasks = projectTasks.filter(t =>
                    (t.assignedTo && c.company?.toLowerCase().trim() === t.assignedTo?.toLowerCase().trim()) ||
                    (t.subcontractorPhone && c.phone === t.subcontractorPhone)
                  )
                  const completedCount = assignedTasks.filter(t => t.status === 'completed').length
                  const activeTask = assignedTasks.find(t => t.status === 'active' || t.status === 'in_progress')
                  const status = getSubStatus(c, projectTasks)
                  const statusCfg = STATUS_CONFIG[status]
                  const pLink = portalUrl(c.id)
                  return (
                    <div key={c.id} className="card p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-[#1A2B4A] text-sm">{normName(c.company || c.name)}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TRADE_COLORS[c.trade] ?? 'bg-gray-100 text-gray-700'}`}>{getTradeLabel(c.trade).split(' /')[0]}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.cls}`}>{statusCfg.label}</span>
                          </div>
                          <p className="text-xs text-gray-500">{normName(c.name)} · {fmtPhone(c.phone)}</p>
                          {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Link href={pLink} target="_blank" className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition text-blue-600" title="Ver portal personal">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          </Link>
                          <button onClick={() => { setEditSub(c); setEditForm({ ...c }) }} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition" title="Editar">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => handleDelete(c.id)} disabled={deleting===c.id} className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition text-red-500 disabled:opacity-50" title="Revocar">
                            {deleting===c.id ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/> : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: assignedTasks.length ? `${(completedCount/assignedTasks.length)*100}%` : '0%' }}/>
                        </div>
                        <span className="text-xs text-gray-400">{completedCount}/{assignedTasks.length} tareas</span>
                      </div>
                      {activeTask && (
                        <div className="mb-2 bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-2">
                          <span className="text-blue-500">🔨</span>
                          <p className="text-xs text-blue-700 font-medium truncate">{activeTask.name}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {assignedTasks.slice(0,4).map(t => (
                          <Link key={t.id} href={`/projects/${id}/tasks/${t.id}`}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium hover:opacity-80 ${t.status==='completed'?'bg-green-100 text-green-700':t.status==='active'||t.status==='in_progress'?'bg-orange-100 text-orange-700':t.status==='delayed'?'bg-red-100 text-red-700':'bg-gray-100 text-gray-600'}`}>{t.name}</Link>
                        ))}
                        {assignedTasks.length>4 && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">+{assignedTasks.length-4} más</span>}
                        {assignedTasks.length===0 && <span className="text-xs text-gray-400 italic">Sin tareas asignadas</span>}
                      </div>
                      {/* Quick actions */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <button onClick={() => copyLink(pLink, c.id)} className={`py-2 rounded-xl text-xs font-semibold transition ${copiedLink===c.id?'bg-green-500 text-white':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                          {copiedLink===c.id ? '✓ Copiado' : '🔗 Link Personal'}
                        </button>
                        <button onClick={() => handleNotify(c)} disabled={sending===c.id} className={`py-2 rounded-xl text-xs font-semibold transition disabled:opacity-60 ${sent===c.id?'bg-green-500 text-white':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                          {sending===c.id?'…':sent===c.id?'✅ SMS!':'📱 Reenviar SMS'}
                        </button>
                        <button onClick={() => { setAssignTask({ id:'__change__', name:`Cambiar tarea de ${c.company}` }); setAssignSub(c.id) }} className="py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                          🔄 Cambiar Tarea
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-400 truncate">🔒 Portal personal: <span className="font-mono">{pLink}</span></p>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={openImportModal} className="w-full mt-3 py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-indigo-50 transition">
              ↑ Importar sub de otro proyecto
            </button>
          </div>

          {/* Trade coverage */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">COBERTURA DE OFICIOS</p>
            <div className="flex flex-col gap-2">
              {TRADES.map(trade => {
                const covered = contractors.some(c => c.trade === trade.value)
                return (
                  <div key={trade.value} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">{trade.label.split(' /')[0]}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${covered?'bg-green-100 text-green-700':'bg-gray-100 text-gray-400'}`}>{covered?'✓ Cubierto':'Pendiente'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>)}

        {/* ── TASKS TAB ──────────────────────────────────── */}
        {activeTab === 'tasks' && (<>
          <div className="flex gap-2 flex-wrap">
            {[{color:'bg-green-500',label:'Sub registrado'},{color:'bg-amber-400',label:'Asignado, sin registrar'},{color:'bg-red-400',label:'Necesita sub'}].map(l=>(
              <div key={l.label} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${l.color}`}/><span className="text-xs text-gray-500">{l.label}</span></div>
            ))}
          </div>
          {(() => {
            const registered  = projectTasks.filter(t => getTaskSub(t))
            const awaitingReg = projectTasks.filter(t => t.assignedTo && !getTaskSub(t))
            const unassigned  = projectTasks.filter(t => !t.assignedTo)
            return (
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs bg-green-50 border border-green-200 text-green-700 rounded-full px-2.5 py-1 font-medium">✅ {registered.length} cubiertos</span>
                {awaitingReg.length>0 && <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2.5 py-1 font-medium">⏳ {awaitingReg.length} esperando</span>}
                {unassigned.length>0 && <span className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-full px-2.5 py-1 font-medium">🔴 {unassigned.length} sin sub</span>}
              </div>
            )
          })()}
          <div className="card divide-y divide-gray-50">
            {projectTasks.map(task => {
              const registeredSub = getTaskSub(task)
              return (
                <div key={task.id} className="px-4 py-3.5 flex items-start gap-3">
                  <div className="mt-1.5 flex-shrink-0"><span className={`w-2.5 h-2.5 rounded-full block ${registeredSub?'bg-green-500':task.assignedTo?'bg-amber-400':'bg-red-400'}`}/></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/projects/${id}/tasks/${task.id}`} className="text-sm font-semibold text-[#1A2B4A] hover:text-blue-600 transition truncate flex-1">{task.name}</Link>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${task.status==='completed'?'bg-green-100 text-green-700':task.status==='in_progress'||task.status==='active'?'bg-orange-100 text-orange-700':task.status==='delayed'?'bg-red-100 text-red-700':'bg-gray-100 text-gray-500'}`}>{task.status?.replace('_',' ')}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{task.startDate?format(parseISO(task.startDate),'MMM d'):'—'} → {task.endDate?format(parseISO(task.endDate),'MMM d'):'—'}</p>
                    <div className="mt-1.5">
                      {registeredSub ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-green-50 border border-green-200 text-green-700 rounded-full px-2 py-0.5 font-medium">✓ {normName(registeredSub.company)}</span>
                          <Link href={`/portal/${id}/${registeredSub.id}`} target="_blank" className="text-xs text-blue-500">Portal ↗</Link>
                        </div>
                      ) : task.assignedTo ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 font-medium">⏳ {normName(task.assignedTo)} · sin registrar</span>
                          <button onClick={() => { setAssignTask(task); setAssignSub('') }} className="text-xs text-blue-600 font-medium">Reasignar</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAssignTask(task); setAssignSub('') }} className="inline-flex items-center gap-1 text-xs bg-red-50 border border-red-100 text-red-600 rounded-full px-2 py-0.5 font-medium hover:bg-red-100 transition">+ Asignar sub</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>)}
      </div>
      <BottomNav />

      {/* ── INVITE MODAL ──────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowInvite(false)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="font-bold text-[#1A2B4A]">Invitar Subcontratista</h3><p className="text-xs text-gray-400 mt-0.5">Genera acceso directo sin que el sub use el enlace de registro.</p></div>
              <button onClick={() => setShowInvite(false)} className="text-gray-400"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            {!invitedPortalUrl ? (
              <div className="flex flex-col gap-3">
                {([{ label:'Empresa / Compañía', field:'company', type:'text', placeholder:'ABC Electric LLC' },
                   { label:'Nombre del Contacto', field:'contactName', type:'text', placeholder:'Juan Rodríguez' },
                   { label:'Teléfono', field:'phone', type:'tel', placeholder:'+1 (555) 000-0000' },
                   { label:'Email (opcional)', field:'email', type:'email', placeholder:'juan@abc.com' }
                ] as const).map(({ label, field, type, placeholder }) => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                    <input className="input" type={type} placeholder={placeholder} value={(inviteForm as any)[field]}
                      onChange={e => setInviteForm(f => ({ ...f, [field]: e.target.value }))}/>
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Oficio</label>
                  <select className="input" value={inviteForm.trade} onChange={e => setInviteForm(f => ({ ...f, trade: e.target.value }))}>
                    {TRADES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {inviteForm.company && inviteForm.contactName && inviteForm.phone && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                    <p className="font-semibold mb-1">Vista previa</p>
                    <p>Se creará acceso para <strong>{normName(inviteForm.company)}</strong> ({normName(inviteForm.contactName)}) con oficio <strong>{inviteForm.trade}</strong>. Recibirá un enlace personal de portal único.</p>
                  </div>
                )}
                <button onClick={handleInvite} disabled={inviting || !inviteForm.company || !inviteForm.contactName || !inviteForm.phone}
                  className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm disabled:opacity-50">
                  {inviting ? 'Creando acceso…' : '✉️ Crear Acceso y Ver Enlace'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                  <p className="text-2xl mb-1">🎉</p>
                  <p className="font-bold text-green-700">¡Acceso creado!</p>
                  <p className="text-xs text-green-600 mt-1">{normName(inviteForm.company)} tiene su portal personal listo.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">🔒 Enlace Personal del Portal</p>
                  <p className="text-xs font-mono bg-gray-50 rounded-xl p-3 break-all text-gray-700">{invitedPortalUrl}</p>
                  <p className="text-xs text-gray-400 mt-1">Este enlace es único para {normName(inviteForm.company)}. No necesita usar el enlace general de registro.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => copyLink(invitedPortalUrl!, 'invite')} className={`py-3 rounded-2xl text-sm font-semibold ${copiedLink==='invite'?'bg-green-500 text-white':'bg-[#1A2B4A] text-white'}`}>
                    {copiedLink==='invite' ? '✓ Copiado' : '📋 Copiar Enlace'}
                  </button>
                  <button onClick={() => navigator.share?.({ title:`Portal de ${inviteForm.company}`, url: invitedPortalUrl! })} className="py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700">📤 Compartir</button>
                </div>
                <button onClick={() => { setShowInvite(false); setInvitedPortalUrl(null) }} className="w-full py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cerrar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EDIT SUB MODAL ────────────────────────────────── */}
      {editSub && editForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setEditSub(null)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="font-bold text-[#1A2B4A]">Editar Sub</h3><p className="text-xs text-gray-400">{normName(editSub.company)}</p></div>
              <div className="flex gap-2">
                <Link href={`/portal/${id}/${editSub.id}`} target="_blank" className="text-xs text-blue-600 font-semibold border border-blue-200 rounded-lg px-2 py-1">Portal ↗</Link>
                <button onClick={() => setEditSub(null)} className="text-gray-400"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {([{label:'Empresa',field:'company',type:'text'},{label:'Nombre Contacto',field:'name',type:'text'},{label:'Teléfono',field:'phone',type:'tel'},{label:'Email',field:'email',type:'email'}] as const).map(({label,field,type}) => (
                <div key={field}><label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                  <input className="input" type={type} value={(editForm as any)[field]??''} onChange={e => setEditForm(f => f?{...f,[field]:e.target.value}:f)}/></div>
              ))}
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Oficio</label>
                <select className="input" value={editForm.trade} onChange={e => setEditForm(f => f?{...f,trade:e.target.value}:f)}>
                  {TRADES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select></div>
            </div>
            <button onClick={handleEditSave} disabled={editSaving} className="w-full mt-4 py-3.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-60">
              {editSaving?'Guardando…':'Guardar Cambios'}
            </button>
          </div>
        </div>
      )}

      {/* ── ASSIGN SUB MODAL ──────────────────────────────── */}
      {assignTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setAssignTask(null)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="font-bold text-[#1A2B4A]">Asignar Subcontratista</h3><p className="text-xs text-gray-400">{assignTask.name}</p></div>
              <button onClick={() => setAssignTask(null)} className="text-gray-400"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            {contractors.length===0 ? <p className="text-center py-6 text-gray-400 text-sm">Sin subs. Invita uno primero.</p> : (
              <div className="flex flex-col gap-2 mb-4">
                {contractors.map(c => (
                  <button key={c.id} onClick={() => setAssignSub(c.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition text-left ${assignSub===c.id?'border-blue-500 bg-blue-50':'border-gray-100 hover:border-gray-200'}`}>
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-blue-700">{c.company?.charAt(0)?.toUpperCase()}</span></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[#1A2B4A] truncate">{normName(c.company)}</p><p className="text-xs text-gray-400">{c.trade} · {fmtPhone(c.phone)}</p></div>
                    {assignSub===c.id && <svg width="18" height="18" fill="none" stroke="#2E7CF6" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                ))}
              </div>
            )}
            <button onClick={handleAssignSub} disabled={!assignSub||assigning} className="w-full py-3.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-50">
              {assigning?'Asignando…':'✓ Asignar'}
            </button>
          </div>
        </div>
      )}

      {/* ── IMPORT MODAL ──────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowImport(false)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div><h3 className="font-bold text-[#1A2B4A]">Importar Sub</h3><p className="text-xs text-gray-400">Elige de otro proyecto</p></div>
              <button onClick={() => setShowImport(false)} className="text-gray-400"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {loadingCross ? <div className="flex justify-center py-10"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
              : crossSubs.length===0 ? <div className="text-center py-10 text-gray-400"><p className="text-2xl mb-2">🤷</p><p className="text-sm">Sin subs en otros proyectos</p></div>
              : <div className="flex flex-col gap-4">
                  {Object.entries(crossSubsByProject).map(([projectName, subs]) => (
                    <div key={projectName}>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">📁 {projectName}</p>
                      <div className="flex flex-col gap-2">
                        {subs.map(sub => {
                          const alreadyImported = importedSubs.has(sub.id) || sub.alreadyHere
                          const isImporting = importingSub===sub.id
                          return (
                            <div key={sub.id} className={`flex items-center gap-3 p-3 rounded-xl border ${alreadyImported?'border-green-200 bg-green-50':'border-gray-100 bg-white hover:border-indigo-200'}`}>
                              <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-indigo-700">{sub.company?.charAt(0)?.toUpperCase()??'?'}</span></div>
                              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[#1A2B4A] truncate">{normName(sub.company||sub.name)}</p><p className="text-xs text-gray-400">{normName(sub.name)} · {fmtPhone(sub.phone)}</p></div>
                              <button onClick={() => !alreadyImported && handleImportSub(sub)} disabled={alreadyImported||isImporting}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 ${alreadyImported?'bg-green-100 text-green-700 cursor-default':'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60'}`}>
                                {isImporting?<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>:alreadyImported?'✓ Añadido':'Importar'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

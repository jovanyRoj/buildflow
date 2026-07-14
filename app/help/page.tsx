'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useBrivoxStore } from '@/lib/store'

// ─── Help Content ─────────────────────────────────────────────────────────────
interface Article { q: string; a: string; link: string; linkLabel: string }
interface Topic {
  id: string; icon: string; title: string; subtitle: string
  color: string; keywords: string[]; articles: Article[]
}

const TOPICS: Topic[] = [
  {
    id: 'subs', icon: '👷', title: 'Subcontractors',
    subtitle: 'Invite, manage, import and delete subs',
    color: 'bg-orange-50 border-orange-100',
    keywords: ['sub','subcontractor','contractor','invite','portal','register','sms','phone','company','trade','import','delete','remove','assign','agregar','eliminar','importar','registrar','invitar','comercial'],
    articles: [
      { q: 'How do I invite a subcontractor?',
        a: 'Project → 👷 Subs button → copy the link or QR code and share it. They register in 30 seconds — no app needed.',
        link: '/projects', linkLabel: 'Go to Projects' },
      { q: 'How do I delete a sub from a project?',
        a: 'Subs tab → find the sub card → tap the red 🗑️ trash icon → confirm. The sub is removed from this project only.',
        link: '/projects', linkLabel: 'Go to Subs' },
      { q: 'How do I import a sub from another project?',
        a: 'Subs tab → scroll down → tap "Import sub from another project" → pick any sub you\'ve worked with before. They are instantly added with auto-assigned tasks.',
        link: '/projects', linkLabel: 'Go to Subs' },
      { q: 'What is the sub portal?',
        a: 'A private web page your sub accesses without an account. They can update task status, confirm dates, set crew size, and submit their quoted price for KORVIA AI to compare.',
        link: '/projects', linkLabel: 'Go to Projects' },
      { q: 'How do I send an SMS to a sub?',
        a: 'In the Subs tab, tap "📱 Send SMS Update" on any sub\'s card. KORVIA AI sends an automatic SMS when you complete a predecessor task too.',
        link: '/projects', linkLabel: 'Go to Subs' },
      { q: 'How do I assign a task to a sub?',
        a: 'Subs button → Tasks tab → find the task → tap "+ Assign sub" or "Reassign" → pick from registered subs.',
        link: '/projects', linkLabel: 'Go to Subs → Tasks tab' },
    ],
  },
  {
    id: 'tasks', icon: '📋', title: 'Tasks',
    subtitle: 'Add, delete, assign and track task status',
    color: 'bg-blue-50 border-blue-100',
    keywords: ['task','tarea','add','agregar','delete','eliminar','status','complete','completado','assign','asignar','pending','active','delayed','progress','progreso','order','orden'],
    articles: [
      { q: 'How do I add a custom task?',
        a: 'Open a project → Tasks section → tap "+ Add Task" → enter name, start date, end date and optional notes.',
        link: '/projects', linkLabel: 'Go to Projects' },
      { q: 'How do I delete a task?',
        a: 'In the Tasks list, swipe left or hover a task to reveal the trash icon → tap it → confirm deletion.',
        link: '/projects', linkLabel: 'Go to Projects' },
      { q: 'How do I change a task\'s status?',
        a: 'Tap the task to open its detail page → tap the status dropdown → choose: Pending, Active, In Progress, Delayed, or Completed.',
        link: '/projects', linkLabel: 'Go to Projects' },
      { q: 'Why is a task showing "Needs sub"?',
        a: 'No registered sub is matched to that task yet. Go to the Subs tab and assign a registered sub to the task.',
        link: '/projects', linkLabel: 'Go to Subs' },
      { q: 'What is the default task list?',
        a: 'Every new project starts with 22 pre-built tasks covering a full residential build (Site Survey → Final Punch List). You can edit, delete or add tasks at any time.',
        link: '/projects', linkLabel: 'Go to Projects' },
    ],
  },
  {
    id: 'timeline', icon: '📅', title: 'Timeline & Progress',
    subtitle: 'Gantt chart, progress bar, sub task visibility',
    color: 'bg-indigo-50 border-indigo-100',
    keywords: ['timeline','gantt','progress','progreso','schedule','calendar','bar','chart','percentage','porcentaje','fecha','orange','sub task','subtarea'],
    articles: [
      { q: 'How do I open the Timeline?',
        a: 'Open any project → tap the blue "📅 Timeline" button in the top-right, or tap Timeline in the Project Modules row.',
        link: '/projects', linkLabel: 'Go to Projects → Timeline' },
      { q: 'How do I identify sub tasks in the timeline?',
        a: 'Sub-assigned tasks have an orange background stripe, an orange ring on their bar, and show "👷 Company name" below the task name in the left panel.',
        link: '/projects', linkLabel: 'Open Timeline' },
      { q: 'Why was progress showing 100% when subs had active tasks?',
        a: 'Fixed! Progress is now recalculated live from actual task statuses every time the page loads, so sub portal updates immediately affect the progress bar.',
        link: '/projects', linkLabel: 'Open Timeline' },
      { q: 'How is progress percentage calculated?',
        a: 'Progress = completed tasks ÷ total tasks × 100. A task only counts as done when its status is "Completed". Sub portal status changes count immediately.',
        link: '/projects', linkLabel: 'Open Timeline' },
    ],
  },
  {
    id: 'quote', icon: '💵', title: 'Quote / Estimate',
    subtitle: 'House template, phases, line items and sub quotes',
    color: 'bg-green-50 border-green-100',
    keywords: ['quote','estimate','presupuesto','house template','plantilla','phase','fase','item','cost','precio','costo','total','material','labor','mano de obra','variance','diferencia'],
    articles: [
      { q: 'What is the House Template?',
        a: 'A 18-phase pre-built quote covering a full residential build. Tap "🏠 Use House Template" when you open the Quote module to load it instantly.',
        link: '/projects', linkLabel: 'Go to Projects → Quote' },
      { q: 'How do I add a custom phase or line item?',
        a: 'Quote page → "+ Add Phase" to add a section → inside any phase tap "+ Add Item" to add materials/labor with unit cost and quantity.',
        link: '/projects', linkLabel: 'Go to Projects → Quote' },
      { q: 'Can my sub submit their quoted price?',
        a: 'Yes — the sub opens their portal → taps "💵 My Quoted Price" on a task → enters their price. KORVIA AI compares it to your estimate and sends an alert if the variance is significant.',
        link: '/projects', linkLabel: 'Go to Projects → Quote' },
      { q: 'How does KORVIA compare sub quotes to my estimate?',
        a: 'KORVIA calculates the % difference between the sub\'s submitted price and the line item total in your quote. If it\'s over/under budget she sends you an alert with the exact variance.',
        link: '/notifications', linkLabel: 'Go to Alerts' },
    ],
  },
  {
    id: 'finances', icon: '💰', title: 'Finances',
    subtitle: 'Budget, invoices, payments and project costs',
    color: 'bg-emerald-50 border-emerald-100',
    keywords: ['finance','finanzas','budget','presupuesto','cost','costo','invoice','factura','payment','pago','money','dinero','expense','gasto','income','ingreso','profit'],
    articles: [
      { q: 'What is tracked in the Finances module?',
        a: 'Budget targets, actual costs, invoices received and payments made per project. You can see overall financial health and drill into each cost category.',
        link: '/projects', linkLabel: 'Go to Projects → Finances' },
      { q: 'How do I log a payment or invoice?',
        a: 'Open the project → tap "💰 Finances" in Project Modules → use the invoice or payment entry forms.',
        link: '/projects', linkLabel: 'Go to Finances' },
    ],
  },
  {
    id: 'projects', icon: '🏗️', title: 'Projects',
    subtitle: 'Create, customize and delete projects',
    color: 'bg-slate-50 border-slate-100',
    keywords: ['project','proyecto','create','nuevo','new','color','background','fondo','delete','eliminar','crear','type','tipo','residential','duplex','remodel','commercial'],
    articles: [
      { q: 'How do I create a new project?',
        a: 'Projects list → tap "+ New Project" → fill in name, address, type (Single Family, Remodel, Duplex, Commercial) and start date.',
        link: '/projects', linkLabel: 'Go to Projects' },
      { q: 'How do I change a project\'s background color?',
        a: 'Open a project → tap the color circle or header → pick from Navy, Forest, Brick, Purple, Teal, Walnut, Rose, or Green. Each color helps distinguish projects at a glance.',
        link: '/projects', linkLabel: 'Go to Projects' },
      { q: 'How do I delete a project?',
        a: 'Open the project → top-right trash icon → confirm. This permanently removes the project, all tasks, subs, files and history.',
        link: '/projects', linkLabel: 'Go to Projects' },
    ],
  },
  {
    id: 'inspections', icon: '🔍', title: 'Inspections',
    subtitle: 'Schedule, track and pass/fail task inspections',
    color: 'bg-orange-50 border-orange-100',
    keywords: ['inspection','inspeccion','permit','permiso','passed','aprobado','failed','fallado','scheduled','pendiente','required','requerido'],
    articles: [
      { q: 'How do I mark a task as needing an inspection?',
        a: 'Open the task detail → enable "Inspection Required" toggle → the task appears in the Inspections module.',
        link: '/projects', linkLabel: 'Go to Projects → Inspections' },
      { q: 'What inspection statuses are available?',
        a: 'Not Required, Pending, Scheduled, Passed, or Failed. KORVIA AI sends an alert when an inspection fails.',
        link: '/projects', linkLabel: 'Go to Inspections' },
    ],
  },
  {
    id: 'korvia', icon: '🤖', title: 'KORVIA AI',
    subtitle: 'Automatic alerts, SMS cascade and quote comparison',
    color: 'bg-purple-50 border-purple-100',
    keywords: ['korvia','ai','artificial','intelligence','inteligencia','alert','alerta','notification','notificacion','sms','automatic','automatico','monitor','cascade','delay'],
    articles: [
      { q: 'What does KORVIA AI do?',
        a: 'KORVIA monitors your project 24/7: reads SMS replies from subs, compares sub quotes to your estimate, auto-triggers SMS on task completion, and sends delay/over-budget alerts.',
        link: '/notifications', linkLabel: 'Go to Alerts' },
      { q: 'Where do I see KORVIA's alerts?',
        a: 'Tap the 🔔 Alerts tab in the bottom navigation. The red badge shows unread alert count.',
        link: '/notifications', linkLabel: 'Go to Alerts' },
      { q: 'Does KORVIA send SMS automatically?',
        a: 'Yes — when you mark a task as Completed, KORVIA notifies the next sub in the chain. She also sends a welcome SMS when a new sub registers.',
        link: '/notifications', linkLabel: 'Go to Alerts' },
    ],
  },
  {
    id: 'documents', icon: '📂', title: 'Documents & Files',
    subtitle: 'Upload blueprints, photos, permits and PDFs',
    color: 'bg-violet-50 border-violet-100',
    keywords: ['document','archivo','file','upload','subir','plano','blueprint','pdf','photo','foto','permit','permiso','dwg','drawing','plan'],
    articles: [
      { q: 'What file types can I upload?',
        a: 'PDF, PNG, JPG, SVG, DWG, DXF, XLSX, DOCX — up to 20 MB each. Files are organized by category: Foundation, Framing, Roof, Windows, Renders, Cabinets, Permits, Other.',
        link: '/projects', linkLabel: 'Go to Projects → Files' },
      { q: 'How do I upload a file?',
        a: 'Open a project → scroll to "Planos & Archivos" → select a category → tap the upload area and pick your file.',
        link: '/projects', linkLabel: 'Go to Projects' },
    ],
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function HelpPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [openTopic, setOpenTopic] = useState<string | null>(null)

  // Flat list of all articles with parent topic metadata, filtered by query
  const searchResults = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return TOPICS.flatMap(topic =>
      topic.articles
        .filter(a =>
          a.q.toLowerCase().includes(q) ||
          a.a.toLowerCase().includes(q) ||
          topic.keywords.some(k => k.includes(q)) ||
          topic.title.toLowerCase().includes(q)
        )
        .map(a => ({ ...a, topicIcon: topic.icon, topicTitle: topic.title, topicColor: topic.color }))
    )
  }, [query])

  const isSearching = query.trim().length > 0

  return (
    <div className="pb-28 min-h-screen bg-[#F4F6F9]">
      <TopBar title="Help Center" backHref="/dashboard" />

      {/* Header */}
      <div className="bg-[#1A2B4A] px-5 pt-5 pb-6">
        <p className="text-white/70 text-xs mb-3">What do you need help with?</p>
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='Search... e.g. "sub", "timeline", "quote"'
            className="w-full pl-9 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-800 placeholder-gray-400 outline-none shadow-sm"
            autoComplete="off"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
        {!isSearching && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {['sub','timeline','quote','SMS','inspection','finance'].map(kw => (
              <button key={kw} onClick={() => setQuery(kw)}
                className="shrink-0 px-3 py-1 bg-white/10 rounded-full text-xs text-white/80 hover:bg-white/20 transition">
                {kw}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4">

        {/* ── Search results ── */}
        {isSearching && (
          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">
              {searchResults.length === 0 ? 'No results found' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${query}"`}
            </p>
            {searchResults.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-2xl mb-2">🔍</p>
                <p className="font-semibold text-gray-600 mb-1">No matches found</p>
                <p className="text-xs text-gray-400">Try different keywords like "sub", "SMS", "progress", "file"</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {searchResults.map((item, i) => (
                  <div key={i} className={`card border overflow-hidden ${item.topicColor}`}>
                    {/* Category badge */}
                    <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
                      <span className="text-sm">{item.topicIcon}</span>
                      <span className="text-xs font-semibold text-gray-500">{item.topicTitle}</span>
                    </div>
                    {/* Question */}
                    <div className="px-4 pb-3">
                      <p className="text-sm font-semibold text-[#1A2B4A] mb-1">{item.q}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{item.a}</p>
                      {/* CTA — redirects to origin */}
                      <Link href={item.link}
                        className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition">
                        {item.linkLabel}
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Topic cards (default view) ── */}
        {!isSearching && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Browse by topic</p>
            {TOPICS.map(topic => {
              const isOpen = openTopic === topic.id
              return (
                <div key={topic.id} className={`card border overflow-hidden ${topic.color}`}>
                  {/* Topic header — tap to expand */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                    onClick={() => setOpenTopic(isOpen ? null : topic.id)}
                  >
                    <span className="text-2xl flex-shrink-0">{topic.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#1A2B4A]">{topic.title}</p>
                      <p className="text-xs text-gray-500 truncate">{topic.subtitle}</p>
                    </div>
                    <svg
                      className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>

                  {/* Expanded articles */}
                  {isOpen && (
                    <div className="border-t border-black/5 divide-y divide-black/5">
                      {topic.articles.map((art, i) => (
                        <div key={i} className="px-4 py-3.5">
                          <p className="text-xs font-semibold text-[#1A2B4A] mb-1">{art.q}</p>
                          <p className="text-xs text-gray-500 leading-relaxed mb-2">{art.a}</p>
                          <Link href={art.link}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition">
                            {art.linkLabel}
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
      <BottomNav />
    </div>
  )
}

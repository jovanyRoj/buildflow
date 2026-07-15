'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useBrivoxStore } from '@/lib/store'

export default function BottomNav() {
  const pathname = usePathname()
  const unread = useBrivoxStore(s => s.getUnreadCount())

  const tabs = [
    {
      href: '/dashboard',
      label: 'Home',
      icon: (active: boolean) => (
        <svg width="21" height="21" fill="none" stroke={active ? '#2E7CF6' : '#94a3b8'} strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      href: '/messages',
      label: 'Messages',
      icon: (active: boolean) => (
        <svg width="21" height="21" fill="none" stroke={active ? '#2E7CF6' : '#94a3b8'} strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
    {
      href: '/notifications',
      label: 'Alerts',
      badge: unread,
      icon: (active: boolean) => (
        <svg width="21" height="21" fill="none" stroke={active ? '#2E7CF6' : '#94a3b8'} strokeWidth="2" viewBox="0 0 24 24">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      ),
    },
    {
      href: '/subs',
      label: 'Subs',
      icon: (active: boolean) => (
        <svg width="21" height="21" fill="none" stroke={active ? '#2E7CF6' : '#94a3b8'} strokeWidth="2" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    {
      href: '/help',
      label: 'Help',
      icon: (active: boolean) => (
        <svg width="21" height="21" fill="none" stroke={active ? '#2E7CF6' : '#94a3b8'} strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" strokeWidth="2.5"/>
        </svg>
      ),
    },
  ]

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-100 z-50 pb-safe">
      <div className="flex items-center justify-around h-16">
        {tabs.map(tab => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link key={tab.href} href={tab.href} className="flex flex-col items-center gap-0.5 px-4 py-2 relative">
              {tab.icon(active)}
              {tab.badge ? (
                <span className="absolute -top-0 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              ) : null}
              <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : 'text-slate-400'}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

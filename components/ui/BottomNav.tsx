'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useBrivoxStore } from '@/lib/store'

export default function BottomNav() {
  const pathname = usePathname()
  const unread   = useBrivoxStore(s => s.getUnreadCount())
  const [visible, setVisible] = useState(true)
  const lastY    = useRef(0)
  const ticking  = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const currentY = window.scrollY
        const delta    = currentY - lastY.current
        if (delta > 8 && currentY > 60) setVisible(false)
        else if (delta < -8)            setVisible(true)
        lastY.current  = currentY
        ticking.current = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const tabs = [
    {
      href: '/dashboard',
      label: 'Home',
      icon: (active: boolean) => (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"
            fill={active ? '#2E7CF620' : 'none'} />
          <polyline points="9 22 9 12 15 12 15 22"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"/>
        </svg>
      ),
    },
    {
      href: '/messages',
      label: 'Messages',
      icon: (active: boolean) => (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"
            fill={active ? '#2E7CF620' : 'none'} />
        </svg>
      ),
    },
    {
      href: '/notifications',
      label: 'Alerts',
      badge: unread,
      icon: (active: boolean) => (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"
            fill={active ? '#2E7CF620' : 'none'} />
          <path d="M13.73 21a2 2 0 0 1-3.46 0"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"/>
        </svg>
      ),
    },
    {
      href: '/subs',
      label: 'Subs',
      icon: (active: boolean) => (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"/>
          <circle cx="9" cy="7" r="4"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"
            fill={active ? '#2E7CF620' : 'none'} />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"/>
        </svg>
      ),
    },
    {
      href: '/help',
      label: 'Help',
      icon: (active: boolean) => (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"
            fill={active ? '#2E7CF620' : 'none'} />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2"/>
          <line x1="12" y1="17" x2="12.01" y2="17"
            stroke={active ? '#2E7CF6' : '#64748b'} strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      ),
    },
  ]

  return (
    <nav
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 -1px 0 rgba(0,0,0,0.06), 0 -8px 32px rgba(0,0,0,0.06)',
      }}
      className={[
        'fixed bottom-0 left-1/2 -translate-x-1/2',
        'w-full max-w-[480px]',
        'z-50 pb-safe',
        'transition-transform duration-300 ease-in-out',
        visible ? 'translate-y-0' : 'translate-y-full',
      ].join(' ')}
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map(tab => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 px-4 py-2 relative"
            >
              {active && (
                <span
                  className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500"
                  style={{ boxShadow: '0 0 6px 2px rgba(46,124,246,0.5)' }}
                />
              )}
              {tab.icon(active)}
              {tab.badge ? (
                <span
                  title={`${tab.badge} sin leer`}
                  aria-label={`${tab.badge} sin leer`}
                  className="absolute top-0.5 right-2.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1">
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              ) : null}
              <span className={`text-[10px] font-semibold tracking-wide ${active ? 'text-blue-500' : 'text-slate-400'}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

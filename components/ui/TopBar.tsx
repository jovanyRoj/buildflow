'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  title: string
  backHref?: string
  action?: React.ReactNode
}

export default function TopBar({ title, backHref, action }: Props) {
  const router = useRouter()
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100 px-4 h-14 flex items-center gap-3">
      {backHref ? (
        <Link href={backHref} className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition">
          <svg width="20" height="20" fill="none" stroke="#1A2B4A" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>
      ) : (
        <div className="w-7" />
      )}
      <h1 className="flex-1 text-base font-semibold text-[#1A2B4A] truncate">{title}</h1>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  )
}

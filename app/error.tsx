'use client'
import { useEffect } from 'react'
import Link from 'next/link'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('BuildFlow error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F6F9] px-6 text-center">
      <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-5">
        <svg width="28" height="28" fill="none" stroke="#ef4444" strokeWidth="1.5" viewBox="0 0 24 24">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <h2 className="text-lg font-bold text-[#1A2B4A] mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm mb-6">An unexpected error occurred. Try refreshing or going back.</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-[#2E7CF6] text-white text-sm font-semibold rounded-xl"
        >
          Try Again
        </button>
        <Link href="/dashboard" className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl">
          Dashboard
        </Link>
      </div>
    </div>
  )
}

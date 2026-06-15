import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F6F9] px-6 text-center">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-5">
        <svg width="28" height="28" fill="none" stroke="#2E7CF6" strokeWidth="1.5" viewBox="0 0 24 24">
          <path d="M2 7l10-5 10 5v10l-10 5-10-5V7z"/>
        </svg>
      </div>
      <h2 className="text-lg font-bold text-[#1A2B4A] mb-2">Page not found</h2>
      <p className="text-gray-500 text-sm mb-6">This page doesn&apos;t exist or has been moved.</p>
      <Link href="/dashboard" className="px-5 py-2.5 bg-[#2E7CF6] text-white text-sm font-semibold rounded-xl">
        Go to Dashboard
      </Link>
    </div>
  )
}

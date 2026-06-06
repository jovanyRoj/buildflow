'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loginWithOAuth } from '@/lib/auth'
import { useBuildFlowStore } from '@/lib/store'

export default function GoogleCallbackPage() {
  const router = useRouter()
  const params = useSearchParams()
  const { setCurrentUser } = useBuildFlowStore()

  useEffect(() => {
    const raw = params.get('profile')
    const loginError = params.get('error')

    if (loginError || !raw) {
      router.replace('/login?error=google_failed')
      return
    }

    try {
      const profile = JSON.parse(decodeURIComponent(raw))
      const result = loginWithOAuth('google', profile)
      if (result.ok && result.user) {
        setCurrentUser(result.user)
        router.replace('/dashboard')
      } else {
        router.replace('/login?error=google_failed')
      }
    } catch {
      router.replace('/login?error=google_failed')
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A2B4A] gap-4">
      <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-16 w-16 rounded-2xl shadow-xl" />
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      <p className="text-white/70 text-sm">Signing in with Google...</p>
    </div>
  )
}

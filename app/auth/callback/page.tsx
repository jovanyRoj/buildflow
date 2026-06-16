'use client'
import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { useBuildFlowStore } from '@/lib/store'

function CallbackInner() {
  const router = useRouter()
  const { setCurrentUser } = useBuildFlowStore()

  useEffect(() => {
    // Give Supabase a moment to exchange the OAuth code in the URL hash
    const timer = setTimeout(async () => {
      const session = await getSession()
      if (session) {
        await setCurrentUser(session)
        router.replace('/dashboard')
      } else {
        router.replace('/login?error=oauth_failed')
      }
    }, 800)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A2B4A] gap-4">
      <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-16 w-16 rounded-2xl shadow-xl" />
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      <p className="text-white/70 text-sm">Completing sign in...</p>
      <Suspense>
        <CallbackInner />
      </Suspense>
    </div>
  )
}

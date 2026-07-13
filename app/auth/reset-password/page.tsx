'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { updatePassword } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

function ResetInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [ready, setReady]       = useState(false)

  useEffect(() => {
    // Supabase puts the access_token in the URL hash after the reset link click
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    // Also check if already in a recovery session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError('Passwords do not match.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    const result = await updatePassword(password)
    if (result.ok) {
      setDone(true)
      setTimeout(() => router.replace('/login'), 2500)
    } else {
      setError(result.error ?? 'Could not update password.')
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="text-center py-2">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-xl font-bold text-[#1A2B4A] mb-2">Password Updated!</h2>
        <p className="text-gray-500 text-sm">Redirecting to sign in...</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="text-center py-4">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Verifying reset link...</p>
        <p className="text-gray-400 text-xs mt-2">
          If this takes too long,{' '}
          <Link href="/auth/forgot-password" className="text-blue-600">request a new link</Link>.
        </p>
      </div>
    )
  }

  return (
    <>
      <h2 className="text-xl font-bold text-[#1A2B4A] mb-1">Set New Password</h2>
      <p className="text-gray-500 text-sm mb-5">Choose a strong password for your account.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
          <input type="password" placeholder="New Password" value={password} onChange={e => setPassword(e.target.value)} required
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
        </div>

        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
          <input type="password" placeholder="Confirm New Password" value={confirm} onChange={e => setConfirm(e.target.value)} required
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
        </div>

        {error && <p className="text-red-500 text-xs text-center bg-red-50 rounded-xl py-2.5 px-3">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full py-3.5 rounded-xl bg-[#2E7CF6] text-white font-semibold hover:bg-blue-600 active:scale-[0.98] transition disabled:opacity-60 mt-1">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
              Updating...
            </span>
          ) : 'Update Password'}
        </button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(13,27,56,0.62) 0%, rgba(26,43,74,0.35) 45%, rgba(10,20,40,0.75) 100%), url('/login_background.jpg')`,
          backgroundSize: 'cover',
        }}
      />
      <div className="relative z-10 flex flex-col items-center justify-start pt-16 px-5 min-h-screen">
        <div className="flex items-center gap-3 mb-8">
          <img src="/brivox-logo-dark.svg" alt="Brivox" className="h-12 w-12 object-contain rounded-2xl shadow-lg" />
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Brivox</h1>
            <p className="text-white/60 text-xs">Project Management for Builders</p>
          </div>
        </div>
        <div className="card w-full p-6 pb-7">
          <Suspense fallback={<div className="text-center text-gray-500 text-sm py-4">Loading...</div>}>
            <ResetInner />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

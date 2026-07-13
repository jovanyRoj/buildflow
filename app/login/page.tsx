'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loginUser, getSession } from '@/lib/auth'
import { useBrivoxStore } from '@/lib/store'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import GitHubSignInButton from '@/components/auth/GitHubSignInButton'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { setCurrentUser } = useBrivoxStore()
  const router = useRouter()

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        setCurrentUser(session)
        router.replace('/dashboard')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await loginUser(email, password)
    if (result.ok && result.user) {
      await setCurrentUser(result.user)
      router.push('/dashboard')
    } else {
      setError(result.error ?? 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(13,27,56,0.62) 0%, rgba(26,43,74,0.35) 45%, rgba(10,20,40,0.75) 100%), url('/login_background.jpg')`,
          backgroundSize: 'cover',
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-start pt-14 px-5 min-h-screen">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-7">
          <img src="/brivox-logo-dark.svg" alt="Brivox" className="h-14 w-14 object-contain rounded-2xl shadow-lg" />
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">Brivox</h1>
            <p className="text-white/65 text-sm">Project Management for Builders</p>
          </div>
        </div>

        {/* Card */}
        <div className="card w-full p-6 pb-7">
          <h2 className="text-xl font-bold text-[#1A2B4A] mb-1">Welcome Back!</h2>
          <p className="text-gray-500 text-sm mb-5">Sign in to manage your projects</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
              </span>
              <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full pl-10 pr-32 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
              <Link href="/auth/forgot-password"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600">
                Forgot?
              </Link>
            </div>

            {error && <p className="text-red-500 text-xs text-center bg-red-50 rounded-xl py-2.5 px-3">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#2E7CF6] text-white font-semibold hover:bg-blue-600 active:scale-[0.98] transition disabled:opacity-60 mt-1">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200"/><span className="text-gray-400 text-xs">or continue with</span><div className="flex-1 h-px bg-gray-200"/>
          </div>

          {/* Social */}
          <div className="flex flex-col gap-2.5">
            <GitHubSignInButton label="Sign in with GitHub" />
            <GoogleSignInButton label="Sign in with Google" />
          </div>

          <p className="text-center text-gray-500 text-sm mt-5">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-blue-600">Sign Up &rsaquo;</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

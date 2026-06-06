'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBuildFlowStore } from '@/lib/store'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useBuildFlowStore(s => s.login)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 600))
    const ok = login(email, password)
    if (ok) {
      router.push('/dashboard')
    } else {
      setError('Invalid credentials. Use builder@buildflow.app / build123')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(13,27,56,0.60) 0%, rgba(26,43,74,0.35) 45%, rgba(10,20,40,0.72) 100%), url('/login_background.jpg')`,
          backgroundSize: 'cover',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-start pt-16 px-5 min-h-screen">
        {/* Logo + brand */}
        <div className="flex items-center gap-3 mb-8">
          <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-12 w-12 object-contain drop-shadow-lg" />
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">BuildFlow</h1>
            <p className="text-white/70 text-sm">Project Management for Builders</p>
          </div>
        </div>

        {/* Card */}
        <div className="card w-full p-7">
          <h2 className="text-2xl font-bold text-[#1A2B4A] mb-1">Welcome Back!</h2>
          <p className="text-gray-500 text-sm mb-6">Sign in to manage your projects</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
              </span>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 placeholder-gray-400 transition"
                required
              />
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 placeholder-gray-400 transition"
                required
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600">
                Forgot Password?
              </button>
            </div>

            {error && (
              <p className="text-red-500 text-xs text-center bg-red-50 rounded-lg py-2 px-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#2E7CF6] text-white font-semibold text-base tracking-wide hover:bg-blue-600 active:scale-[0.98] transition disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200"/>
            <span className="text-gray-400 text-xs">or</span>
            <div className="flex-1 h-px bg-gray-200"/>
          </div>

          <div className="flex flex-col gap-3">
            <button className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </button>
            <button className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              Sign in with Apple
            </button>
          </div>

          <p className="text-center text-gray-500 text-sm mt-6">
            New to BuildFlow?{' '}
            <button className="font-semibold text-blue-600">Sign Up &rsaquo;</button>
          </p>

          {/* Demo hint */}
          <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-700 text-center">
            <strong>Demo:</strong> builder@buildflow.app / build123
          </div>
        </div>
      </div>
    </div>
  )
}

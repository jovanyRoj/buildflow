'use client'
import { useState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from '@/lib/auth'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent]   = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await requestPasswordReset(email)
    if (result.ok) {
      setSent(true)
    } else {
      setError(result.error ?? 'Could not send reset email.')
      setLoading(false)
    }
  }

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
          {sent ? (
            <div className="text-center py-2">
              <div className="text-4xl mb-3">✉️</div>
              <h2 className="text-xl font-bold text-[#1A2B4A] mb-2">Check your email</h2>
              <p className="text-gray-500 text-sm mb-5">
                We sent a reset link to <strong>{email}</strong>. Click the link to set a new password.
              </p>
              <Link href="/login" className="text-blue-600 font-semibold text-sm">Back to Sign In</Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-[#1A2B4A] mb-1">Forgot Password?</h2>
              <p className="text-gray-500 text-sm mb-5">Enter your email and we&apos;ll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
                  </span>
                  <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
                </div>

                {error && <p className="text-red-500 text-xs text-center bg-red-50 rounded-xl py-2.5 px-3">{error}</p>}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-[#2E7CF6] text-white font-semibold hover:bg-blue-600 active:scale-[0.98] transition disabled:opacity-60 mt-1">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                      Sending...
                    </span>
                  ) : 'Send Reset Link'}
                </button>
              </form>

              <p className="text-center text-gray-500 text-sm mt-5">
                Remember your password?{' '}
                <Link href="/login" className="font-semibold text-blue-600">Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

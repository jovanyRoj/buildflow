'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registerUser } from '@/lib/auth'
import { useBuildFlowStore } from '@/lib/store'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import GitHubSignInButton from '@/components/auth/GitHubSignInButton'

export default function SignUpPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const { setCurrentUser } = useBuildFlowStore()
  const router = useRouter()

  function update(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Please enter your name.')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    const result = await registerUser(form.name, form.email, form.password)
    if (result.ok && result.user) {
      // Supabase may require email confirmation — if so, show message instead of redirect
      if (result.user.id) {
        await setCurrentUser(result.user)
        router.push('/dashboard')
      } else {
        setSuccess(true)
      }
    } else {
      setError(result.error ?? 'Registration failed')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A2B4A] px-5">
        <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-16 w-16 rounded-2xl shadow-xl mb-6" />
        <div className="card w-full p-6 text-center">
          <div className="text-4xl mb-3">✉️</div>
          <h2 className="text-xl font-bold text-[#1A2B4A] mb-2">Check your email</h2>
          <p className="text-gray-500 text-sm mb-4">
            We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account.
          </p>
          <Link href="/login" className="text-blue-600 font-semibold text-sm">Back to Sign In</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(13,27,56,0.65) 0%, rgba(26,43,74,0.38) 45%, rgba(10,20,40,0.78) 100%), url('/login_background.jpg')`,
          backgroundSize: 'cover',
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-start pt-10 px-5 min-h-screen pb-10">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-12 w-12 object-contain rounded-2xl shadow-lg" />
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">BuildFlow</h1>
            <p className="text-white/60 text-xs">Project Management for Builders</p>
          </div>
        </div>

        {/* Card */}
        <div className="card w-full p-6 pb-7">
          <h2 className="text-xl font-bold text-[#1A2B4A] mb-1">Create Account</h2>
          <p className="text-gray-500 text-sm mb-5">Start managing your construction projects</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <input type="text" placeholder="Full Name" value={form.name} onChange={update('name')} required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
              </span>
              <input type="email" placeholder="Email Address" value={form.email} onChange={update('email')} required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input type="password" placeholder="Password (min 6 chars)" value={form.password} onChange={update('password')} required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input type="password" placeholder="Confirm Password" value={form.confirm} onChange={update('confirm')} required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400" />
            </div>

            {error && <p className="text-red-500 text-xs text-center bg-red-50 rounded-xl py-2.5 px-3">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#2E7CF6] text-white font-semibold hover:bg-blue-600 active:scale-[0.98] transition disabled:opacity-60 mt-1">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                  Creating account...
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200"/><span className="text-gray-400 text-xs">or sign up with</span><div className="flex-1 h-px bg-gray-200"/>
          </div>

          <div className="flex flex-col gap-2.5">
            <GitHubSignInButton label="Sign up with GitHub" />
            <GoogleSignInButton label="Sign up with Google" />
          </div>

          <p className="text-center text-gray-500 text-sm mt-5">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-blue-600">Sign In &rsaquo;</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'
import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  name: string
  email: string
  avatar?: string
}

export interface AuthResult {
  ok: boolean
  error?: string
  user?: Session
}

// ─── Email / Password ─────────────────────────────────────────────────────────

export async function registerUser(
  name: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })
  if (error) return { ok: false, error: error.message }
  if (!data.user) return { ok: false, error: 'Registration failed. Try again.' }
  return {
    ok: true,
    user: {
      id: data.user.id,
      name: data.user.user_metadata?.name ?? email.split('@')[0],
      email: data.user.email!,
      avatar: data.user.user_metadata?.avatar_url,
    },
  }
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  if (!data.user) return { ok: false, error: 'Login failed. Try again.' }
  return {
    ok: true,
    user: {
      id: data.user.id,
      name: data.user.user_metadata?.name ?? email.split('@')[0],
      email: data.user.email!,
      avatar: data.user.user_metadata?.avatar_url,
    },
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow-eight-sigma.vercel.app')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/reset-password`,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

export async function signInWithOAuth(provider: 'google' | 'github'): Promise<void> {
  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow-eight-sigma.vercel.app')
  await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${appUrl}/auth/callback` },
  })
}

// ─── Session ─────────────────────────────────────────────────────────────────

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return null
  return {
    id: user.id,
    name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? '',
    email: user.email!,
    avatar: user.user_metadata?.avatar_url,
  }
}

/** No-op — Supabase manages its own session storage */
export function saveSession(_user: Session): void {}

export async function clearSession(): Promise<void> {
  await supabase.auth.signOut()
}

// ─── Backwards compat (loginWithOAuth) ───────────────────────────────────────

export function loginWithOAuth(
  _provider: 'google' | 'apple',
  _profile: { id: string; name: string; email: string; avatar?: string },
): { ok: boolean; error?: string; user?: Session } {
  // No longer used — kept so old imports don't break at compile time
  return { ok: false, error: 'Use signInWithOAuth instead' }
}

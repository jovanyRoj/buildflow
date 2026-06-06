'use client'

export interface StoredUser {
  id: string
  name: string
  email: string
  passwordHash: string
  salt: string
  createdAt: string
  avatar?: string
  provider?: 'email' | 'google' | 'apple'
}

const USERS_KEY = 'buildflow_users'
const SESSION_KEY = 'buildflow_session'

// ---------- Crypto helpers ----------

async function derivePBKDF2(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateId(): string {
  return crypto.randomUUID()
}

function generateSalt(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------- User storage ----------

function getUsers(): StoredUser[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]') } catch { return [] }
}

function saveUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

// ---------- Auth API ----------

export interface AuthResult {
  ok: boolean
  error?: string
  user?: { id: string; name: string; email: string; avatar?: string }
}

export async function registerUser(name: string, email: string, password: string): Promise<AuthResult> {
  const users = getUsers()
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'An account with this email already exists.' }
  }
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' }

  const salt = generateSalt()
  const passwordHash = await derivePBKDF2(password, salt)
  const user: StoredUser = {
    id: generateId(),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
    provider: 'email',
  }
  saveUsers([...users, user])
  saveSession({ id: user.id, name: user.name, email: user.email })
  return { ok: true, user: { id: user.id, name: user.name, email: user.email } }
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const users = getUsers()
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim())
  if (!user) return { ok: false, error: 'No account found with this email.' }
  if (user.provider && user.provider !== 'email') {
    return { ok: false, error: `This account uses ${user.provider} sign-in. Please use that button.` }
  }
  const hash = await derivePBKDF2(password, user.salt)
  if (hash !== user.passwordHash) return { ok: false, error: 'Incorrect password.' }

  saveSession({ id: user.id, name: user.name, email: user.email })
  return { ok: true, user: { id: user.id, name: user.name, email: user.email } }
}

export function loginWithOAuth(provider: 'google' | 'apple', profile: { id: string; name: string; email: string; avatar?: string }): AuthResult {
  const users = getUsers()
  let user = users.find(u => u.email.toLowerCase() === profile.email.toLowerCase())
  if (!user) {
    user = {
      id: generateId(),
      name: profile.name,
      email: profile.email.toLowerCase(),
      passwordHash: '',
      salt: '',
      createdAt: new Date().toISOString(),
      provider,
      avatar: profile.avatar,
    }
    saveUsers([...users, user])
  }
  saveSession({ id: user.id, name: user.name, email: user.email, avatar: profile.avatar })
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, avatar: profile.avatar } }
}

// ---------- Session ----------

export interface Session {
  id: string
  name: string
  email: string
  avatar?: string
}

export function saveSession(user: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

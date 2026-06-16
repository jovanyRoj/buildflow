import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY

// Client-side (browser) — uses anon key
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// Server-side (API routes) — uses secret key, falls back to anon so client bundle never crashes
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET ?? SUPABASE_ANON)

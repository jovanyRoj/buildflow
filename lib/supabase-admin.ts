// Server-only — do NOT import this in client components or 'use client' files
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY!

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET)

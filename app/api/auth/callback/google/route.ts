import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/login?error=google_denied', req.url))
  }

  try {
    const origin = req.nextUrl.origin

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  `${origin}/api/auth/callback/google`,
        grant_type:    'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      return NextResponse.redirect(new URL('/login?error=google_token', req.url))
    }

    // Get user profile
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const gUser = await userRes.json()

    if (!gUser.email) {
      return NextResponse.redirect(new URL('/login?error=google_email', req.url))
    }

    const profile = {
      id:     gUser.id,
      name:   gUser.name || gUser.email.split('@')[0],
      email:  gUser.email,
      avatar: gUser.picture,
    }

    const encoded = encodeURIComponent(JSON.stringify(profile))
    return NextResponse.redirect(new URL(`/auth/google-callback?profile=${encoded}`, req.url))
  } catch {
    return NextResponse.redirect(new URL('/login?error=google_failed', req.url))
  }
}

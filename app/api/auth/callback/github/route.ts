import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/login?error=github_denied', req.url))
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token
    if (!accessToken) {
      return NextResponse.redirect(new URL('/login?error=github_token', req.url))
    }

    // Get GitHub user profile
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
      }),
    ])

    const ghUser = await userRes.json()
    const ghEmails: { email: string; primary: boolean; verified: boolean }[] = await emailsRes.json()
    const primaryEmail = ghEmails.find(e => e.primary && e.verified)?.email ?? ghUser.email ?? `${ghUser.login}@github.com`

    // Pass user data to client via redirect with encoded params
    const profile = {
      id: String(ghUser.id),
      name: ghUser.name || ghUser.login,
      email: primaryEmail,
      avatar: ghUser.avatar_url,
    }

    const encoded = encodeURIComponent(JSON.stringify(profile))
    return NextResponse.redirect(new URL(`/auth/github-callback?profile=${encoded}`, req.url))
  } catch {
    return NextResponse.redirect(new URL('/login?error=github_failed', req.url))
  }
}

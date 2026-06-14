import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Serve SW with correct headers
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
    ]
  },

  // Redirect root to dashboard if logged in (handled in page.tsx)
  async redirects() {
    return []
  },
}

export default nextConfig

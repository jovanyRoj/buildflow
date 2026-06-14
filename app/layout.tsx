import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'BuildFlow – Construction Management',
  description: 'Construction project management with AI coordination for residential builders',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BuildFlow',
    startupImage: '/BuildFlowSplash.png',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'BuildFlow',
    title: 'BuildFlow – Construction Management',
    description: 'Manage your construction projects with AI coordination',
    images: [{ url: '/BuildFlowLogo.png', width: 1024, height: 1024 }],
  },
  icons: {
    icon: [
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1A2B4A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* iOS PWA full-screen support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Windows tile */}
        <meta name="msapplication-TileColor" content="#1A2B4A" />
        <meta name="msapplication-TileImage" content="/icon-192.png" />
      </head>
      <body>
        <div className="app-container">
          {children}
        </div>
        {/* Service Worker registration */}
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) { console.log('SW registered:', reg.scope); })
                  .catch(function(err) { console.log('SW registration failed:', err); });
              });
            }
          `}
        </Script>
      </body>
    </html>
  )
}

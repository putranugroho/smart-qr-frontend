// pages/_app.js
import Script from 'next/script'
import Head from 'next/head'
import '../styles/globals.css'
import { useEffect } from 'react'

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    window.addEventListener('error', e => console.error('window error:', e.error ?? e.message ?? e));
    window.addEventListener('unhandledrejection', e => console.error('unhandled rejection:', e.reason ?? e));
  }, []);

  useEffect(() => {
    // Register a simple service worker that caches the Tailwind CDN script (if available)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(reg => {
          // console.info('SW registered', reg);
        })
        .catch(err => {
          // silent fail - don't break app if SW fails
          console.warn('ServiceWorker registration failed:', err);
        });
    }
  }, []);

  return (
    <>
      {/* You may keep meta viewport or page-specific Head here */}
      <Head>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Yoshinoya Smart QR</title>
      </Head>

      {/* Tailwind Play CDN via next/script.
          Strategy choices:
            - beforeInteractive: loads very early (useful if relying on CDN CSS to render UI without FOUC)
            - afterInteractive: loads after hydration
          Keep in mind Play CDN is runtime-generated CSS — for production migrate to local Tailwind.
      */}
      <Script
        src="https://cdn.tailwindcss.com"
        strategy="beforeInteractive"
      />

      <Component {...pageProps} />
    </>
  )
}

// pages/_document.js
import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  render() {
    return (
      <Html lang="id">
        <Head>
          {/* Google Fonts: use Document to include stylesheet */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"
            rel="stylesheet"
          />

          {/* Preconnect / dns-prefetch for Tailwind CDN (ok in Document) */}
          <link rel="preconnect" href="https://cdn.tailwindcss.com" crossOrigin="anonymous" />
          <link rel="dns-prefetch" href="https://cdn.tailwindcss.com" />

          {/* Preload script (optional) - starts fetching earlier.
              Note: <link rel="preload" as="script"> is fine in Document head.
          */}
          <link rel="preload" href="https://cdn.tailwindcss.com" as="script" />

          {/* Fallback CSS: small local stylesheet that provides basic styles if CDN fails */}
          <link rel="stylesheet" href="/fallback.css" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument

// next.config.js
const isDev = process.env.NODE_ENV !== 'production';

const devCSP = `
  default-src 'self';
  script-src 'self' https://cdn.tailwindcss.com 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com;
  img-src 'self' data: https://yoshinoya-store-api.akasia.id https://yoshinoya-ho-api.akasia.id https://yoshinoya-store-api.akasia.id;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://fonts.googleapis.com https://cdn.tailwindcss.com ws:;
`;

const prodCSP = `
  default-src 'self';
  script-src 'self' https://cdn.tailwindcss.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: https://yoshinoya-store-api.akasia.id https://yoshinoya-ho-api.akasia.id https://yoshinoya-store-api.akasia.id;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self';
`;

const ContentSecurityPolicy = (isDev ? devCSP : prodCSP).replace(/\s{2,}/g, ' ').trim();

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer-when-downgrade' },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'yoshinoya-store-api.akasia.id',
      'yoshinoya-ho-api.akasia.id',
      'yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net',
      // tambahkan domain lain muncul di imagePath jika perlu
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;

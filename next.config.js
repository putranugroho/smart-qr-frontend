// next.config.js
const isDev = process.env.NODE_ENV !== 'production';

const CSP = `
  default-src 'self';
  script-src 'self' https://cdn.tailwindcss.com 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: blob: https://order.yoshinoya.co.id https://yoshinoya-store-api.akasia.id https://yoshinoya-ho-api.akasia.id http://172.16.100.105:81;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://yoshinoya-store-api.akasia.id https://yoshinoya-ho-api.akasia.id;
`.replace(/\s{2,}/g, " ").trim();

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'order.yoshinoya.co.id',
      'yoshinoya-store-api.akasia.id',
      'yoshinoya-ho-api.akasia.id',
      'yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net',
      '172.16.100.105'
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: CSP
          },
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer-when-downgrade"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;

// next.config.js
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    "default-src 'self'",
    "script-src 'self' https://cdn.tailwindcss.com 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
    "img-src 'self' data: blob: https://yoshinoya-store-api.akasia.id https://yoshinoya-ho-api.akasia.id http://172.16.100.105:81 https://merchants-app.sbx.midtrans.com https://order.yoshinoya.co.id",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://merchants-app.sbx.midtrans.com https://yoshinoya-store-api.akasia.id https://yoshinoya-ho-api.akasia.id https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net https://cdn.tailwindcss.com https://ab.reasonlabsapi.com https://fonts.gstatic.com",
    "frame-src 'self' https://merchants-app.sbx.midtrans.com"
  ].join('; ');

  const nextConfig = {
    reactStrictMode: true,

    images: {
      domains: [
        'yoshinoya-store-api.akasia.id',
        'yoshinoya-ho-api.akasia.id',
        'yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net',
        'order.yoshinoya.co.id',
        '172.16.100.105',
        'merchants-app.sbx.midtrans.com'
      ],
      // gunakan remotePatterns untuk mendukung port atau pola path
      remotePatterns: [
        {
          protocol: 'http',
          hostname: '172.16.100.105',
          port: '81',
          pathname: '/api/file/**'
        },
        {
          protocol: 'https',
          hostname: 'yoshinoya-store-api.akasia.id',
          pathname: '/**'
        }
      ]
    },

    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            {
              key: "Content-Security-Policy",
              value: csp
            }
          ]
        }
      ];
    }
  };

  module.exports = nextConfig;
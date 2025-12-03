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
        'yoshinoya-store-api.akasia.id',
        'yoshinoya-ho-api.akasia.id',
        'yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net',
        'order.yoshinoya.co.id',
        '172.16.100.105',
        'merchants-app.sbx.midtrans.com'
      ],
    },

    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            {
              key: "Content-Security-Policy",
              value: `
                default-src 'self';
                script-src 'self' https://cdn.tailwindcss.com 'unsafe-inline' 'unsafe-eval';
                style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                img-src 'self' data: blob: https://yoshinoya-store-api.akasia.id https://yoshinoya-ho-api.akasia.id http://172.16.100.105:81 https://merchants-app.sbx.midtrans.com;
                font-src 'self' https://fonts.gstatic.com;
                connect-src 'self' https://merchants-app.sbx.midtrans.com https://yoshinoya-store-api.akasia.id https://yoshinoya-ho-api.akasia.id;
                frame-src 'self' https://merchants-app.sbx.midtrans.com;
              `.replace(/\s+/g, ' ')
            }
          ]
        }
      ];
    }
  };

  module.exports = nextConfig;
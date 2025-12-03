// pages/api/proxy/combo-list.js
// Proxy sederhana untuk Combo List API
// Men-support query params: orderCategoryCode, storeCode
// Gunakan env var COMBO_API_BASE untuk URL base API jika mau, atau fallback ke URL publik.

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const {
      orderCategoryCode = 'DI',
      storeCode = 'MGI',
      // allow passthrough of extra params if needed
      ...restQuery
    } = req.query || {};

    const base = process.env.COMBO_API_BASE || 'https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net';

    // build target URL (keep any extra params)
    const url = new URL('/smartqr/v1/menu/combo/list', base);
    url.searchParams.set('orderCategoryCode', orderCategoryCode);
    url.searchParams.set('storeCode', storeCode);
    // copy any other query params passed through
    Object.keys(restQuery).forEach(k => {
      if (restQuery[k] != null && restQuery[k] !== '') url.searchParams.set(k, restQuery[k]);
    });

    // call external API
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        // jika butuh auth, letakkan di env var dan uncomment:
        // 'Authorization': `Bearer ${process.env.COMBO_API_KEY || ''}`
      },
      // timeout isn't native in node fetch; can be added with AbortController if needed
    });

    const text = await response.text();
    // try parse JSON, but if API returned non-json, return raw text
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      payload = text;
    }

    // cache for short time in Vercel/CDN (adjust as needed)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

    // forward status and payload
    return res.status(response.status).json(payload);
  } catch (err) {
    console.error('proxy/combo-list error', err);
    return res.status(500).json({ error: 'Proxy error', detail: String(err?.message || err) });
  }
}

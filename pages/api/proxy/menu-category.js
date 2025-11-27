// pages/api/proxy/menu-category.js
export default async function handler(req, res) {
  try {
    const { storeCode = 'MGI', orderCategoryCode = 'DI' } = req.query;

    const qs = new URLSearchParams();
    if (storeCode) qs.set('storeCode', storeCode);
    if (orderCategoryCode) qs.set('orderCategoryCode', orderCategoryCode);

    const target = `https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net/smartqr/v1/menu/category?${qs.toString()}`;

    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        accept: '*/*'
      }
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const text = await upstream.text();

    res.status(upstream.status).setHeader('Content-Type', contentType).send(text);
  } catch (err) {
    console.error('Proxy menu-category error', err);
    res.status(500).json({ success: false, message: 'Proxy error', error: String(err) });
  }
}

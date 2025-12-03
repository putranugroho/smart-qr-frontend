// pages/api/proxy/condiment.js
export default async function handler(req, res) {
  try {
    const {
      productCode = '',
      storeCode = 'MGI',
      orderCategoryCode = 'DI',
      page,
      pageSize
    } = req.query;

    if (!productCode) {
      return res.status(400).json({ success: false, message: 'Missing productCode' });
    }

    const qs = new URLSearchParams();
    qs.set('productCode', productCode);
    if (storeCode) qs.set('storeCode', storeCode);
    if (orderCategoryCode) qs.set('orderCategoryCode', orderCategoryCode);
    if (page) qs.set('page', page);
    if (pageSize) qs.set('pageSize', pageSize);

    const url = process.env.NEXT_PUBLIC_URL_API || process.env.NEXT_PUBLIC_URL_DEV
    const target = `${url}/smartqr/v1/menu/condiment/list?${qs.toString()}`;

    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        accept: '*/*'
      },
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const text = await upstream.text();

    res.status(upstream.status).setHeader('Content-Type', contentType).send(text);
  } catch (err) {
    console.error('Proxy condiment error', err);
    res.status(500).json({ success: false, message: 'Proxy error', error: String(err) });
  }
}

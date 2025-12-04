// pages/api/proxy/menu-filter.js
export default async function handler(req, res) {
  try {
    const { menuCategoryId } = req.query;
    if (!menuCategoryId) {
      return res.status(400).json({ success: false, message: 'Missing menuCategoryId' });
    }

    // forward full query string (so clients can add extra params if needed)
    const qs = new URLSearchParams(req.query).toString();
    const url = process.env.NEXT_PUBLIC_URL_DEV || process.env.NEXT_PUBLIC_URL_API
    // const url = 'http://localhost:5200'
    const target = `${url}/smartqr/v1/menu/filter?${qs}`;

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
    console.error('Proxy menu/filter error', err);
    res.status(500).json({ success: false, message: 'Proxy error', error: String(err) });
  }
}

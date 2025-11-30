// pages/api/proxy/menu-filter.js
export default async function handler(req, res) {
  try {
    // minimal validation
    const { menuCategoryId } = req.query;
    if (!menuCategoryId) {
      return res.status(400).json({ success: false, message: 'Missing menuCategoryId' });
    }

    // Build query string from incoming request (so we forward any extra params)
    const qs = new URLSearchParams(req.query).toString();

    // Upstream path for filter (adjust domain if needed)
    const target = `https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net/smartqr/v1/menu/filter?${qs}`;

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

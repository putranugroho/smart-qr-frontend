// pages/api/proxy/menu-list.js
export default async function handler(req, res) {
  try {
    const {
      menuCategoryId,
      menuCategoryIds, // accept plural if caller uses different param name
      storeCode = 'MGI',
      orderCategoryCode = 'DI',
      page,
      pageSize,
      search,
      ...rest
    } = req.query;

    // Minimal validation: prefer menuCategoryId (single), but allow fallback to menuCategoryIds
    if (!menuCategoryId && !menuCategoryIds) {
      return res.status(400).json({ success: false, message: 'Missing menuCategoryId' });
    }

    // Build query string from incoming request so we forward any extra params unchanged
    const qs = new URLSearchParams(req.query).toString();

    // Upstream URL (adjust domain/path if necessary)
    const target = `https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net/smartqr/v1/menu/list?${qs}`;

    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        accept: '*/*'
      },
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const text = await upstream.text();

    // Relay status and body exactly as upstream (preserve content-type)
    res.status(upstream.status).setHeader('Content-Type', contentType).send(text);
  } catch (err) {
    console.error('Proxy menu-list error', err);
    res.status(500).json({ success: false, message: 'Proxy error', error: String(err) });
  }
}

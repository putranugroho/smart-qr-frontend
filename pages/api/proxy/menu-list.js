// pages/api/proxy/menu-list.js
export default async function handler(req, res) {
  try {
    // Minimal validation: menuCategoryId disarankan karena backend menggunakannya
    const { menuCategoryId } = req.query;
    if (!menuCategoryId) {
      return res.status(400).json({ success: false, message: 'Missing menuCategoryId' });
    }

    // Build query string from incoming request so we forward all provided params.
    // This preserves menuFilterIds, search, orderCategoryCode, storeCode, page, pageSize, dll.
    const qs = new URLSearchParams(req.query).toString();

    // Upstream endpoint (adjust domain if you need to change)
    const url = process.env.NEXT_PUBLIC_URL_API || process.env.URL_DEV
    const target = `${url}/smartqr/v1/menu/list?${qs}`;

    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        accept: '*/*'
      },
    });

    // Forward content-type and body as-is
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const text = await upstream.text();

    res.status(upstream.status).setHeader('Content-Type', contentType).send(text);
  } catch (err) {
    console.error('Proxy menu-list error', err);
    res.status(500).json({ success: false, message: 'Proxy error', error: String(err) });
  }
}

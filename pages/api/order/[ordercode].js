// pages/api/proxy/order/[orderCode].js
export default async function handler(req, res) {
  const { orderCode } = req.query;
  if (!orderCode) return res.status(400).json({ error: 'orderCode required' });

  try {
    // External API base (the SmartQR endpoint you provided)
    const base = 'https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net';
    // build url
    const url = `${base}/smartqr/v1/order/${encodeURIComponent(orderCode)}`;

    // If you need headers, e.g. API key, put them here:
    const headers = {
      accept: 'application/json',
      // 'x-api-key': process.env.SMARTQR_API_KEY || '', // <-- uncomment if needed
    };

    const r = await fetch(url, { method: 'GET', headers });
    const text = await r.text();
    // try parse JSON, else return raw text
    try {
      const j = JSON.parse(text);
      return res.status(r.status).json(j);
    } catch (e) {
      // not JSON - forward as text
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      return res.status(r.status).send(text);
    }
  } catch (err) {
    console.error('proxy/order error', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

// pages/api/order/taxes.js
// Forwards request to <BASE_API>/smartqr/v1/order/calculate-tax

export default async function handler(req, res) {
    // only accept POST
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, message: 'Method not allowed' });
    }
  
    try {
      const body = req.body || {};
      const baseUrl = process.env.NEXT_PUBLIC_URL_API || process.env.NEXT_PUBLIC_URL_DEV;
      console.log("body taxes", body);
      
      const resp = await fetch(
        `${baseUrl}/smartqr/v1/order/calculate-tax`,
        {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json-patch+json',
          'Accept': '*/*'
        },
        body: JSON.stringify(body)
      });
  
      // try parse json response
      let respBody = null;
      const text = await resp.text().catch(() => null);
      console.log("text taxes",text);
      try {
        respBody = text ? JSON.parse(text.data.orderCode) : null;
      } catch (e) {
        // not JSON
        respBody = text || null;
      }
  
      // propagate status and body
      const status = resp.status || 200;
      return res.status(status).json({
        respBody
      });
    } catch (err) {
      console.error('proxy /api/order/taxes error', err);
      return res.status(500).json({ ok: false, message: 'Internal server error', error: String(err) });
    }
  }
  
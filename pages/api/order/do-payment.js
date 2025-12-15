// pages/api/order/do-payment.js
// Proxy API: /api/order/do-payment
// Forwards request to <BASE_API>/smartqr/v1/order/do-payment

export default async function handler(req, res) {
  // only accept POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const storeCode = 'MGI'
    // basic validation (ensure required fields present)
    const { orderCode, payment, reference } = body;
    if (!orderCode) {
      return res.status(400).json({ ok: false, message: 'orderCode is required' });
    }

    // Resolve base API URL (server-side env). Fallback to IP if not set.
    // const baseApi =
    //   (process.env.NEXT_PUBLIC_URL_API && String(process.env.NEXT_PUBLIC_URL_API).trim()) ||
    //   (process.env.NEXT_URL_API && String(process.env.NEXT_URL_API).trim()) ||
    //   'http://112.78.136.108:5200';
    
    const baseUrl = process.env.NEXT_PUBLIC_URL_API || process.env.NEXT_PUBLIC_URL_DEV;
    // `https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net/smartqr/v1/order/do-order?storeCode=${storeCode}`,

    const resp = await fetch(
      `${baseUrl}/smartqr/v1/order/do-payment?storeCode=${storeCode}`,
      // `https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net/smartqr/v1/order/do-payment?storeCode=${storeCode}`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json-patch+json',
        'Accept': '*/*'
      },
      body: JSON.stringify({
        orderCode: String(orderCode),
        payment: String(payment),
        reference: String(reference)
      })
    });

    // try parse json response
    let respBody = null;
    const text = await resp.text().catch(() => null);
    try {
      respBody = text ? JSON.parse(text) : null;
    } catch (e) {
      // not JSON
      respBody = text || null;
    }

    // propagate status and body
    const status = resp.status || 200;
    return res.status(status).json({
      ok: resp.ok,
      status,
      body: respBody
    });
  } catch (err) {
    console.error('proxy /api/order/do-payment error', err);
    return res.status(500).json({ ok: false, message: 'Internal server error', error: String(err) });
  }
}

// pages/api/order/do-order.js
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { storeCode, payload } = req.body ?? {};

    if (!storeCode) return res.status(400).json({ error: 'storeCode required' });
    if (!payload) return res.status(400).json({ error: 'payload required' });

    // ensure base url set
    const baseUrl = process.env.NEXT_PUBLIC_URL_API || process.env.NEXT_PUBLIC_URL_DEV;
    if (!baseUrl) {
      console.error('Missing NEXT_PUBLIC_URL_API / NEXT_PUBLIC_URL_DEV env var');
      return res.status(500).json({ error: 'Server misconfiguration: missing base url' });
    }

    const targetUrl = `${baseUrl}/smartqr/v1/order/do-order?storeCode=${encodeURIComponent(storeCode)}`;

    // send as application/json (most upstreams expect this). Change back if upstream explicitly requires different content-type.
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // read body as text first (defensive)
    const bodyText = await upstream.text().catch(() => '');

    // log for debugging (remove or lower logging in production)

    // handle no-content
    if (!bodyText || bodyText.trim() === '') {
      // forward status and empty body
      return res.status(upstream.status).json({
        message: 'Upstream returned empty response',
        status: upstream.status
      });
    }

    // try parse JSON, otherwise return raw text
    try {
      const json = JSON.parse(bodyText);
      return res.status(upstream.status).json(json);
    } catch (parseErr) {
      // upstream returned non-JSON (maybe HTML or plain text). Forward as text in a JSON object.
      console.warn('[do-order] upstream returned non-JSON response');
      return res.status(upstream.status).json({
        message: 'Upstream returned non-JSON response',
        raw: bodyText
      });
    }
  } catch (err) {
    console.error('DO ORDER FAILED:', err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
}
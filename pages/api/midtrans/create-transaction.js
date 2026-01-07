// pages/api/midtrans/create-transaction.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, grossAmount, customer, selectedMethod, metadata } = req.body;
  if (!orderId || !grossAmount) {
    return res.status(400).json({ error: 'orderId & grossAmount required' });
  }

  const MIDTRANS_API = 'https://api.midtrans.com/v2/charge';
  const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY_PRODUCTION;

  /**
   * =========================
   * DEVELOPER MODE
   * =========================
   */
  const developerMode =
    process.env.NEXT_PUBLIC_DEVELOPER_MODE === 'true';

  const finalGrossAmount = developerMode
    ? 1
    : Number(grossAmount);

  if (developerMode) {
    console.warn(
      '[DEV MODE] Midtrans gross_amount overridden to Rp. 1',
      { orderId, originalAmount: grossAmount }
    );
  }

  const payload = {
    payment_type: selectedMethod,
    transaction_details: {
      order_id: orderId,
      gross_amount: finalGrossAmount
    },
    metadata,
    customer_details: customer || undefined
  };
    const URLCallback = process.env.MIDTRANS_CALLBACK_URL
    if (selectedMethod === 'gopay') {
      payload.gopay = {
        enable_callback: true,
        callback_url: `${URLCallback}/?orderCode=${orderId}`
      };
    } else if (selectedMethod === 'shopeepay') {
      payload.shopeepay = {
        enable_callback: true,
        callback_url: `${URLCallback}/?orderCode=${orderId}`
      };
    }

  try {
    const auth = Buffer.from(`${SERVER_KEY}:`).toString('base64');
    const r = await fetch(MIDTRANS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    const j = await r.json();
    if (!r.ok) {
      console.error('midtrans error', r.status, j);
      return res.status(r.status).json({ error: j });
    }

    return res.status(200).json(j);
  } catch (err) {
    console.error('create-transaction error', err);
    return res.status(500).json({ error: String(err) });
  }
}
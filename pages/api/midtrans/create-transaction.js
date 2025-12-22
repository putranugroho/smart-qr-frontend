// pages/api/midtrans/create-transaction.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, grossAmount, customer, selectedMethod, metadata } = req.body;
  if (!orderId || !grossAmount) return res.status(400).json({ error: 'orderId & grossAmount required' });

  // Production endpoint
  const MIDTRANS_API = 'https://api.midtrans.com/v2/charge';
  const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY_PRODUCTION; // production server key -> set di env

  // Build base payload (transaction_details + item/customer minimal)
  const payload = {
    payment_type: selectedMethod === 'gopay' ? 'gopay' : 'qris', // contoh. kamu bisa extend per method
    transaction_details: {
      order_id: orderId,
      gross_amount: Number(grossAmount)
    },
    metadata,
    customer_details: customer || undefined
  };
    const URLCallback = process.env.MIDTRANS_CALLBACK_URL
    // khusus GoPay: enable deeplink callback (mobile)
    if (selectedMethod === 'gopay') {
      payload.gopay = {
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

    // kembalikan response ke frontend (frontend akan menyimpan response dan menggunakan deeplink/qr)
    return res.status(200).json(j);
  } catch (err) {
    console.error('create-transaction error', err);
    return res.status(500).json({ error: String(err) });
  }
}
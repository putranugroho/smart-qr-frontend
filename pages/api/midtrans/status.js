// pages/api/midtrans/status.js
import MidtransClient from 'midtrans-client';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  try {
    const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
    const serverKey = process.env.MIDTRANS_SERVER_KEY_PRODUCTION;
    const core = new MidtransClient.CoreApi({ isProduction, serverKey });

    const status = await core.transaction.status(orderId);
    return res.status(200).json(status);
  } catch (err) {
    console.error('status error', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

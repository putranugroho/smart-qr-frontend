// pages/api/midtrans/webhook.js
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const notification = req.body;

  try {
    const { order_id, status_code, gross_amount, signature_key } = notification;

    // verify signature_key: SHA512(order_id + status_code + gross_amount + serverKey)
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    const expected = crypto.createHash('sha512').update(order_id + status_code + gross_amount + serverKey).digest('hex');

    if (expected !== signature_key) {
      console.warn('Invalid midtrans signature', { expected, signature_key });
      return res.status(403).json({ error: 'Invalid signature' });
    }

    // TODO: update order status in DB accordingly (notification.transaction_status)
    console.log('Midtrans notification (verified):', notification);

    // respond 200
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('webhook error', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

// pages/api/midtrans/create-transaction.js
import MidtransClient from 'midtrans-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, grossAmount, customer = {}, selectedMethod } = req.body;
    if (!orderId || !grossAmount || !selectedMethod) {
      return res.status(400).json({ error: 'Missing orderId / grossAmount / selectedMethod' });
    }

    const paymentType = selectedMethod || 'qris';

    const core = new MidtransClient.CoreApi({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY || ''
    });

    const parameter = {
      payment_type: paymentType,
      transaction_details: { order_id: orderId, gross_amount: Number(grossAmount) },
      customer_details: { first_name: customer.first_name || 'Customer', email: customer.email || '' }
    };

    // Add optional config for e-wallets
    if (paymentType === 'gopay') {
      parameter.gopay = {
        enable_callback: true,
        callback_url: process.env.MIDTRANS_CALLBACK_URL || ''
      };
    }

    // Charge via Core API
    const coreResp = await core.charge(parameter);

    // Log full response for debugging (cek terminal)
    console.log('[midtrans] core.charge response:', JSON.stringify(coreResp, null, 2));

    // Extract useful actions (deeplink, qr)
    const actions = coreResp.actions || [];
    const find = (names) => {
      if (!actions) return null;
      for (const n of names) {
        const a = actions.find(x => x.name && x.name.toString().toLowerCase() === n.toLowerCase());
        if (a) return a;
      }
      // fallback: contains
      for (const a of actions) {
        if (!a.name) continue;
        const ln = a.name.toLowerCase();
        if (names.some(n => ln.includes(n.toLowerCase()))) return a;
      }
      return null;
    };

    const deeplinkAction = find(['deeplink-redirect', 'deeplink']);
    const qrV2Action = find(['generate-qr-code-v2', 'generate-qr-code']);
    const statusAction = find(['get-status', 'status']);

    const result = {
      success: true,
      payment_type: paymentType,
      order_id: coreResp.order_id || orderId,
      transaction_id: coreResp.transaction_id || null,
      transaction_status: coreResp.transaction_status || null,
      actions,
      deeplink_url: deeplinkAction?.url || null,
      qr_url: qrV2Action?.url || null,
      status_url: statusAction?.url || null,
      raw: coreResp
    };

    return res.status(201).json(result);

  } catch (err) {
    console.error('[midtrans] create-transaction error:', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

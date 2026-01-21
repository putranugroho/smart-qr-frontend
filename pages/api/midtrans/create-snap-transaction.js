import midtransClient from 'midtrans-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    orderId,
    grossAmount,
    customer,
    selectedMethod,
    metadata
  } = req.body;

  if (!orderId || !grossAmount) {
    return res.status(400).json({ error: 'orderId & grossAmount required' });
  }

  // Hanya izinkan SNAP method
  if (!['dana', 'ovo'].includes(selectedMethod)) {
    return res.status(400).json({ error: 'Invalid SNAP payment method' });
  }

  const snap = new midtransClient.Snap({
    isProduction: true, // 🔥 PROD
    serverKey: process.env.MIDTRANS_SERVER_KEY_PRODUCTION
  });

  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: Number(grossAmount)
    },
    enabled_payments: [selectedMethod],
    customer_details: customer
      ? {
          first_name: customer.first_name || '',
          phone: customer.phone
            ? '+62' + String(customer.phone).replace(/^0/, '')
            : undefined
        }
      : undefined,
    metadata
  };

  try {
    const transaction = await snap.createTransaction(parameter);

    /**
     * RESPONSE PENTING:
     * - token
     * - redirect_url
     */
    return res.status(200).json({
      snap_token: transaction.token,
      snap_redirect_url: transaction.redirect_url
    });
  } catch (err) {
    console.error('create-snap-transaction error', err);
    return res.status(500).json({
      error: err?.message || 'Failed to create SNAP transaction'
    });
  }
}
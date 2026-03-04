export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const envFlag = String(process.env.MIDTRANS_IS_PRODUCTION || 'true').toLowerCase()
  const isProduction = envFlag !== 'false'

  const productionClientKey = process.env.MIDTRANS_CLIENT_KEY_PRODUCTION || process.env.MIDTRANS_CLIENT_KEY || ''
  const sandboxClientKey = process.env.MIDTRANS_CLIENT_KEY_SANDBOX || process.env.MIDTRANS_CLIENT_KEY || ''

  const clientKey = isProduction ? productionClientKey : sandboxClientKey

  if (!clientKey) {
    return res.status(500).json({ error: 'MIDTRANS client key is not configured' })
  }

  return res.status(200).json({
    isProduction,
    clientKey,
  })
}

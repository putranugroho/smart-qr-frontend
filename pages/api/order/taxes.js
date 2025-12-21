export default async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ message: 'Method not allowed' })
    }
  
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_URL_API || process.env.NEXT_PUBLIC_URL_DEV
  
      const resp = await fetch(
        `${baseUrl}/smartqr/v1/order/calculate-tax`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json-patch+json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(req.body || {})
        }
      )
  
      const data = await resp.json()
  
      // langsung kirim orderCode ke frontend
      return res.status(resp.status).json(data.data.orderCode)
  
    } catch (err) {
      console.error('proxy /api/order/taxes error', err)
      return res.status(500).json({ message: 'Internal server error' })
    }
  }  
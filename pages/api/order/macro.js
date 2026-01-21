// api/order/macro.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ message: 'Method not allowed' })
    }
  
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_URL_API || process.env.NEXT_PUBLIC_URL_DEV
  
      const resp = await fetch(
        `${baseUrl}/smartqr/v1/menu/macro?storeCode=MGI`,
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
      return res.status(resp.status).json(data)
  
    } catch (err) {
      console.error('proxy /api/order/macro error', err)
      return res.status(500).json({ message: 'Internal server error', error: err })
    }
  }  
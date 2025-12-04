// api/order/do-order.js
export default async function handler(req, res) {
  try {
    const { storeCode, payload } = req.body;
    

    const upstream = await fetch(
      `https://localhost:5200/smartqr/v1/order/do-order?storeCode=${storeCode}`,
      {
        method: "POST",
        headers: {
          "Accept": "*/*",
          "Content-Type": "application/json-patch+json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await upstream.json();
    res.status(upstream.status).json(data);

  } catch (err) {
    console.error("DO ORDER FAILED:", err);
    res.status(500).json({ error: err.message });
  }
}

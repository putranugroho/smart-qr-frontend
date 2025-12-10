export default async function handler(req, res) {
  try {
    const { storeCode, orderCategoryCode } = req.query;

    const qs = new URLSearchParams({ storeCode, orderCategoryCode });
    const url = process.env.NEXT_PUBLIC_URL_DEV || process.env.NEXT_PUBLIC_URL_API
    const target = `${url}/smartqr/v1/menu/category?` + qs.toString();


    const upstream = await fetch(target, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!upstream.ok) {
      const textErr = await upstream.text();
      console.error("Upstream error:", textErr);
      return res.status(500).json({
        success: false,
        message: "Upstream error",
        error: textErr
      });
    }

    const type = upstream.headers.get("content-type") || "application/json";
    const data = await upstream.text();

    res.setHeader("Content-Type", type);
    res.status(200).send(data);

  } catch (err) {
    console.error("Proxy menu-category error", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
// pages/api/image.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const url = req.query.url?.toString();
    if (!url) return res.status(400).json({ success: false, message: 'url query required' });

    // Mapping URL relatif ke IP internal
    // Misal: user kirim "api/file/M2-3.jpg" -> kita fetch "http://172.16.100.105:81/api/file/M2-3.jpg"
    const internalBase = 'http://172.16.100.105:81/';
    const fullUrl = url.startsWith('http') ? url : internalBase + url;

    const resp = await fetch(fullUrl);
    if (!resp.ok) return res.status(502).json({ success: false, message: 'Failed to fetch image', status: resp.status });

    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');

    // Stream langsung ke client
    const arrayBuffer = await resp.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('image proxy error', err);
    res.status(500).json({ success: false, message: err.message || String(err) });
  }
}
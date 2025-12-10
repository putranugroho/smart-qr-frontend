// pages/api/convert-image-to-base64.js
// Enhanced proxy with HTML fallback: if direct fetch returns HTML page (simulator),
// try to extract <img src="..."> inside and fetch that image (or use inline data: URI).
// Config via ENV: CONVERT_ALLOWED_HOSTS, CONVERTER_API_URL, CONVERT_CACHE_TTL_MS, CONVERT_CACHE_MAX_ENTRIES

const DEFAULT_ALLOWED = [
  'merchants-app.sbx.midtrans.com',
  'api.sandbox.midtrans.com',
  'merchants-app.midtrans.com'
];

const RAW_ALLOWED = process.env.CONVERT_ALLOWED_HOSTS || DEFAULT_ALLOWED.join(',');
const ALLOWED_HOSTS = new Set(RAW_ALLOWED.split(',').map(s => s.trim()).filter(Boolean));

const DEFAULT_TTL_MS = Number(process.env.CONVERT_CACHE_TTL_MS) || 1000 * 60 * 5;
const DEFAULT_MAX_ENTRIES = Number(process.env.CONVERT_CACHE_MAX_ENTRIES) || 200;

if (!global.__IMG_CONVERT_CACHE) {
  global.__IMG_CONVERT_CACHE = { map: new Map(), order: [] };
}
const CACHE = global.__IMG_CONVERT_CACHE;

function setCache(key, entry, ttl = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES) {
  if (CACHE.map.has(key)) {
    const idx = CACHE.order.indexOf(key);
    if (idx >= 0) CACHE.order.splice(idx, 1);
  }
  CACHE.map.set(key, { ...entry, createdAt: Date.now(), ttl });
  CACHE.order.push(key);

  const now = Date.now();
  while (CACHE.order.length) {
    const oldestKey = CACHE.order[0];
    const v = CACHE.map.get(oldestKey);
    if (!v) { CACHE.order.shift(); continue; }
    if (now - v.createdAt > v.ttl) { CACHE.map.delete(oldestKey); CACHE.order.shift(); continue; }
    break;
  }
  while (CACHE.order.length > maxEntries) {
    const evictKey = CACHE.order.shift();
    CACHE.map.delete(evictKey);
  }
}

function getCache(key) {
  const v = CACHE.map.get(key);
  if (!v) return null;
  const now = Date.now();
  if (now - v.createdAt > v.ttl) {
    CACHE.map.delete(key);
    const idx = CACHE.order.indexOf(key);
    if (idx >= 0) CACHE.order.splice(idx, 1);
    return null;
  }
  const idx = CACHE.order.indexOf(key);
  if (idx >= 0) { CACHE.order.splice(idx, 1); CACHE.order.push(key); }
  return v;
}

function guessContentTypeFromUrl(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    if (p.endsWith('.png')) return 'image/png';
    if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
    if (p.endsWith('.svg')) return 'image/svg+xml';
    if (p.endsWith('.webp')) return 'image/webp';
  } catch (e) {}
  return 'image/png';
}

// extract first <img ... src="..."> or <img src='...'> or data-src attributes
function extractImgSrcFromHtml(html) {
  if (!html) return null;
  // try to find data URI inline first
  const dataUriMatch = html.match(/src=["'](data:image\/[^"']+)["']/i);
  if (dataUriMatch) return dataUriMatch[1];

  // look for src attributes pointing to image files
  const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (srcMatch) return srcMatch[1];

  // fallback try data-src or lazy loaded attribute
  const dataSrcMatch = html.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i);
  if (dataSrcMatch) return dataSrcMatch[1];

  // sometimes the page includes <meta property="og:image" content="...">
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch) return ogMatch[1];

  return null;
}

export default async function handler(req, res) {
  try {
    const imageUrl = (req.query.imageUrl || req.body?.imageUrl || '').toString();
    const mode = (req.query.mode || 'binary').toString().toLowerCase();
    const force = (req.query.force || 'false').toString().toLowerCase() === 'true';

    if (!imageUrl) return res.status(400).json({ success: false, message: 'imageUrl query required' });

    let parsed;
    try { parsed = new URL(imageUrl); }
    catch (e) { return res.status(400).json({ success: false, message: 'imageUrl is not a valid URL' }); }

    if (parsed.protocol !== 'https:') {
      return res.status(400).json({ success: false, message: 'Only HTTPS imageUrl is allowed' });
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return res.status(403).json({ success: false, message: 'Host not allowed: ' + parsed.hostname });
    }

    const cacheKey = imageUrl;
    if (!force) {
      const c = getCache(cacheKey);
      if (c) {
        if (mode === 'json') return res.status(200).json({ success: true, data: { Base64Image: c.base64 } });
        if (mode === 'datauri') return res.status(200).json({ success: true, dataUri: c.dataUri });
        res.setHeader('Content-Type', c.contentType || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).send(Buffer.from(c.base64, 'base64'));
      }
    }

    // 1) try converter external
    const converterBase = process.env.CONVERTER_API_URL || 'https://yoshi-smartqr-api-ergyata5hff3cfhz.southeastasia-01.azurewebsites.net/smartqr/v1/menu/image';
    const externalUrl = `${converterBase}?imageUrl=${encodeURIComponent(imageUrl)}`;
    let b64 = null;
    let converterJson = null;
    try {
      const extResp = await fetch(externalUrl, { method: 'GET', headers: { accept: 'application/json' } });
      if (extResp.ok) {
        converterJson = await extResp.json().catch(() => null);
        
        b64 = converterJson?.data?.Base64Image || converterJson?.data?.base64 || null;
      } else {
        console.warn('Converter non-ok', extResp.status);
      }
    } catch (err) {
      console.warn('Converter fetch failed', String(err));
    }

    // 2) if converter returned base64 -> use it
    if (b64) {
      const contentType = guessContentTypeFromUrl(imageUrl) || 'image/png';
      const dataUri = `data:${contentType};base64,${b64}`;
      setCache(cacheKey, { base64: b64, dataUri, contentType }, DEFAULT_TTL_MS, DEFAULT_MAX_ENTRIES);
      if (mode === 'json') return res.status(200).json({ success: true, data: { Base64Image: b64 }, message: 'Converted via external' });
      if (mode === 'datauri') return res.status(200).json({ success: true, dataUri, message: 'Converted via external' });
      const buffer = Buffer.from(b64, 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      
      return res.status(200).send(buffer);
    }

    // 3) external did not give base64 -> try direct fetch of the URL
    let directResp;
    try {
      directResp = await fetch(imageUrl);
    } catch (err) {
      console.warn('Direct fetch failed', String(err));
      return res.status(502).json({ success: false, message: 'Direct fetch failed', error: String(err), converterRaw: converterJson || null });
    }

    if (!directResp.ok) {
      const txt = await directResp.text().catch(() => null);
      console.warn('Direct fetch non-ok', directResp.status);
      return res.status(502).json({ success: false, message: 'Direct fetch non-ok', status: directResp.status, bodySnippet: (txt || '').slice(0, 800), converterRaw: converterJson || null });
    }

    const contentType = (directResp.headers.get('content-type') || '').toLowerCase();

    // if direct response is image -> convert and return
    if (contentType.startsWith('image/')) {
      const arrayBuffer = await directResp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const dataUri = `data:${contentType};base64,${base64}`;
      setCache(cacheKey, { base64, dataUri, contentType }, DEFAULT_TTL_MS, DEFAULT_MAX_ENTRIES);
      if (mode === 'json') return res.status(200).json({ success: true, data: { Base64Image: base64 }, message: 'Converted via direct fetch' });
      if (mode === 'datauri') return res.status(200).json({ success: true, dataUri, message: 'Converted via direct fetch' });
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).send(buffer);
    }

    // 4) direct response is not image (likely HTML simulator) -> try to parse HTML for <img>
    const html = await directResp.text().catch(() => null);
    const found = extractImgSrcFromHtml(html);
    if (!found) {
      // return snippet for debugging
      return res.status(502).json({
        success: false,
        message: 'No image found in HTML page. Converter returned empty.',
        converterRaw: converterJson || null,
        htmlSnippet: (html || '').slice(0, 1200)
      });
    }

    // if found is data URI (inline) -> use directly
    if (found.startsWith('data:image/')) {
      const dataUri = found;
      // extract base64 part
      const parts = dataUri.split(',');
      const b64inline = parts[1] || null;
      const inferredType = parts[0]?.match(/data:([^;]+);/)?.[1] || guessContentTypeFromUrl(imageUrl) || 'image/png';
      setCache(cacheKey, { base64: b64inline, dataUri, contentType: inferredType }, DEFAULT_TTL_MS, DEFAULT_MAX_ENTRIES);
      if (mode === 'json') return res.status(200).json({ success: true, data: { Base64Image: b64inline }, message: 'Found inline data URI in HTML' });
      if (mode === 'datauri') return res.status(200).json({ success: true, dataUri, message: 'Found inline data URI in HTML' });
      const buffer = Buffer.from(b64inline, 'base64');
      res.setHeader('Content-Type', inferredType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).send(buffer);
    }

    // else found is a URL (could be relative) -> resolve to absolute
    let imageCandidateUrl = found;
    try {
      const base = new URL(imageUrl);
      imageCandidateUrl = new URL(found, base).toString();
    } catch (e) {
      // leave as-is
    }

    // fetch that candidate
    try {
      const candResp = await fetch(imageCandidateUrl);
      if (!candResp.ok) {
        const snippet = await candResp.text().catch(() => null);
        return res.status(502).json({ success: false, message: 'Candidate image fetch failed', status: candResp.status, bodySnippet: (snippet || '').slice(0, 800) });
      }
      const candCt = (candResp.headers.get('content-type') || '').toLowerCase();
      if (!candCt.startsWith('image/')) {
        const snippet = await candResp.text().catch(() => null);
        return res.status(502).json({ success: false, message: 'Candidate is not image', candidateUrl: imageCandidateUrl, contentType: candCt, bodySnippet: (snippet || '').slice(0, 800) });
      }
      const arr = await candResp.arrayBuffer();
      const buf = Buffer.from(arr);
      const b64final = buf.toString('base64');
      const dataUri = `data:${candCt};base64,${b64final}`;
      setCache(cacheKey, { base64: b64final, dataUri, contentType: candCt }, DEFAULT_TTL_MS, DEFAULT_MAX_ENTRIES);
      if (mode === 'json') return res.status(200).json({ success: true, data: { Base64Image: b64final }, message: 'Converted via extracted img URL' });
      if (mode === 'datauri') return res.status(200).json({ success: true, dataUri, message: 'Converted via extracted img URL' });
      res.setHeader('Content-Type', candCt);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).send(buf);
    } catch (err) {
      console.warn('Candidate fetch error', String(err));
      return res.status(502).json({ success: false, message: 'Candidate fetch error', error: String(err) });
    }

  } catch (err) {
    console.error('convert-image-to-base64 error', err);
    return res.status(500).json({ success: false, message: err?.message || String(err) });
  }
}

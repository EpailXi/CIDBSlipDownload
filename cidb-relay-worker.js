/* =====================================================================
   CIDB CIMS relay — Cloudflare Worker
   ---------------------------------------------------------------------
   Fetches a construction-personnel record DIRECTLY from
   cims.cidb.gov.my (server-side, so no browser CORS limit) and returns
   name + registration validity as JSON with CORS enabled, so the
   CIDB Slip Console file can read it.

   Runs under YOUR OWN free Cloudflare account. Worker code is public
   here, but the deployed URL is yours; the IC/passport numbers you look
   up go only to Cloudflare → CIMS, never to any third party.

   DEPLOY (about 2 minutes, free):
     1. Sign in at https://dash.cloudflare.com  (free account is fine)
     2. Left menu →  Workers & Pages  →  Create  →  Create Worker
     3. Name it (e.g. cidb-relay) →  Deploy
     4. Click  Edit code , delete the sample, paste THIS whole file, Deploy
     5. Copy the worker URL shown (…​.workers.dev) and paste it into the
        "CIMS relay URL" box in the Slip Console.

   Query it like:
     https://<your-worker>.workers.dev/?sval=910122155039
     https://<your-worker>.workers.dev/?sval=A11968846&ct=BGL
   ===================================================================== */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url   = new URL(request.url);
    const sval  = (url.searchParams.get('sval') || '').trim();
    const ct    = (url.searchParams.get('ct') || '').trim().toUpperCase();
    const local = !ct || ct === 'MYS';

    if (!sval) return json({ error: 'missing sval' }, 400);

    // Build the exact CIMS finder deep-link (English for stable labels).
    const base = 'https://cims.cidb.gov.my/PBSearchv3/';
    const target = local
      ? base + 'movenext?sval='  + encodeURIComponent(sval) + '&lang=en'
      : base + 'movenextF?sval=' + encodeURIComponent(sval) + '&lang=en&ct=' + encodeURIComponent(ct);

    let html = '';
    try {
      const r = await fetch(target, {
        redirect: 'follow',
        headers: {
          // look like a normal browser so the CIMS gateway serves the page
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                        '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en',
        },
      });
      html = await r.text();
    } catch (e) {
      return json({ error: 'fetch failed', detail: String(e) }, 502);
    }

    if (/tidak ditemui|not\s+found/i.test(html)) {
      return json({ found: false, sval, ct: local ? 'MYS' : ct });
    }

    const out = parse(html);
    out.found = !!out.name;
    out.sval  = sval;
    out.ct    = local ? 'MYS' : ct;
    return json(out);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

/* ---- HTML parsing (no DOM in a Worker, so regex on the markup) ---- */
function parse(html) {
  const flat = html.replace(/\s+/g, ' ');
  const res = { name: '', idLine: '', category: '', nationality: '', expiry: '', validity: '' };

  // The identity block:
  //   <div class="customer-info ..."><h5 ...>NAME</h5>
  //     <span>Mykad No : ..</span><br><span>CATEGORY</span><br><span>NATIONALITY</span></div>
  const block = flat.match(/customer-info[^>]*>(.*?)<\/div>/i);
  if (block) {
    const inner = block[1];
    const h5 = inner.match(/<h5[^>]*>(.*?)<\/h5>/i);
    if (h5) res.name = strip(h5[1]);
    const spans = [...inner.matchAll(/<span[^>]*>(.*?)<\/span>/gi)].map(m => strip(m[1]));
    if (spans[0]) res.idLine      = spans[0];   // "Mykad No : 91******5039" / "Passport ..."
    if (spans[1]) res.category    = spans[1];   // e.g. PEKERJA BINAAN MAHIR
    if (spans[2]) res.nationality = spans[2];   // e.g. MALAYSIA
  }

  // Registration end date: label "Registration End Date" sits just AFTER the
  // date on the rendered card; grab the date nearest that label.
  const labelIdx = flat.search(/Registration End Date|Tarikh tamat pendaftaran/i);
  if (labelIdx > -1) {
    const before = flat.slice(Math.max(0, labelIdx - 400), labelIdx);
    const dates = before.match(/\d{2}\/\d{2}\/\d{4}/g);
    if (dates && dates.length) res.expiry = dates[dates.length - 1];
  }

  // "2 (tahun lagi)" / "141 (hari lagi)" / "… (years left)"
  const v = flat.match(/\d+\s*\((?:tahun|hari|years?|days?)[^)]*\)/i);
  if (v) res.validity = strip(v[0]);

  return res;
}

function strip(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
}

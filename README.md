# CIDB Slip Console

A single-page tool to turn a Malaysian IC or a foreign passport + nationality
into a CIDB green-card slip link, check whether CIMS holds a personnel photo,
and (via an optional relay) auto-fill the person's **name, registration expiry
and validity** straight from CIDB.

## Live pages
- **Console:** `console.html`
- Existing downloader: `index.html`

## Files
| File | What it is |
|---|---|
| `console.html` | The slip / photo / name console. Just open it. |
| `cidb-relay-worker.js` | Optional Cloudflare Worker that fetches names from CIMS server-side. |

## Why the relay?
A page opened in a browser cannot read a person's **name** from CIMS directly —
CIDB blocks both cross-origin data reads (no CORS) and page embedding
(X-Frame-Options). Photos still show (images aren't CORS-restricted), but the
name needs a tiny relay that calls CIMS **server-side** and returns JSON with
CORS enabled.

### Deploy the relay (free, ~2 min, runs under your own account)
1. Sign in at <https://dash.cloudflare.com> (free account is fine).
2. **Workers & Pages → Create → Create Worker → Deploy.**
3. **Edit code**, delete the sample, paste all of `cidb-relay-worker.js`, **Deploy**.
4. Copy the `…workers.dev` URL and paste it into the console's **CIMS relay URL** box.

Names, expiry and validity then auto-fill on every lookup. Your worker calls
CIMS directly — the IC/passport numbers you look up never touch any third party.

## URL contract (verified against live CIMS)
| Nationality | Slip | Photo |
|---|---|---|
| `MYS` (local IC) | `…slippass.aspx?collectionid=<IC>` | `…/pbimage/<IC>.jpg` |
| Everything else | `…slippass.aspx?collectionid=<CODE><ID>/1` | `…/pbimage/<CODE><ID>-1.jpg` |

> A missing photo does not mean the person is unregistered — CIMS simply has no
> image on file. Confirm registration on the CIDB personnel finder.

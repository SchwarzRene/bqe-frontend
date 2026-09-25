# Vendored libraries

Third-party scripts are served from this site rather than a CDN, so the
Content-Security-Policy in `_headers` can allow scripts from `'self'` only and
no outside server can run code next to a signed-in user's session.

| Library | Version | From | License |
|---|---|---|---|
| TradingView Lightweight Charts | 4.2.3 | npm `lightweight-charts@4.2.3`, `dist/lightweight-charts.standalone.production.js` | Apache-2.0 (`LICENSE`) |
| Leaflet | 1.9.4 | npm `leaflet@1.9.4`, `dist/leaflet.js`, `dist/leaflet.css`, `dist/images/` | BSD-2-Clause (`LICENSE`) |

The files are byte-for-byte those in the npm tarballs (which is also what
jsDelivr and unpkg serve). To update one:

```bash
npm pack leaflet@<version>
tar xzf leaflet-<version>.tgz
cp package/dist/leaflet.js package/dist/leaflet.css assets/vendor/leaflet-<version>/
```

then point the page at the new folder. The version is in the folder name, so
a browser never mixes an old cached copy with a new page.

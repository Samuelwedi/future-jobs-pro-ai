# Future Jobs Pro AI Private Map Service

This service renders Mapbox-style raster tiles entirely from a privately hosted OpenMapTiles-compatible `region.mbtiles` dataset. Employee GPS coordinates are never sent to a public map API.

## Local test

1. Put `region.mbtiles` in `map-server/data/`.
2. Run:

```powershell
docker build -t future-jobs-private-map .\map-server
docker run --rm -p 8080:8080 future-jobs-private-map
```

3. Open `http://localhost:8080/styles/future-jobs/0/0/0.png` or the TileServer home page.

## Railway

Create a second service from the same repository with root directory `map-server`. Attach persistent storage at `/data/data` containing `region.mbtiles`. Keep this service private whenever possible.

Set this variable on the backend service:

```text
EVIDENCE_MAP_TILE_URL=http://YOUR-PRIVATE-MAP-SERVICE.railway.internal:8080/styles/future-jobs/{z}/{x}/{y}.png
```

The braces are literal. The evidence renderer substitutes zoom, X and Y tile coordinates internally.

For a public custom domain, restrict access at the network layer and set `TILESERVER_GL_ALLOWED_HOSTS` to the exact map hostname. TileServer GL also supports `--public_url` for a canonical URL.

TileServer GL is open-source and uses MapLibre GL Native for server-side rasterization. Preserve the OpenStreetMap attribution in the style and generated evidence.

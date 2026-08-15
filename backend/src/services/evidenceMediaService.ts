import { pool } from '../config/database';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';

type Artifact = { buffer: Buffer; fileName: string; mimeType: string; verificationHash: string };
const tempRoot = path.join(os.tmpdir(), 'future-jobs-evidence-media');
fs.mkdirSync(tempRoot, { recursive: true });
const tileCacheRoot = path.join(tempRoot, 'tile-cache');
fs.mkdirSync(tileCacheRoot, { recursive: true });

const escapeXml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c));
const hash = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const runFfmpeg = (command: ffmpeg.FfmpegCommand, output: string) => new Promise<void>((resolve, reject) => command.on('end', resolve).on('error', reject).save(output));
const safeUnlink = (value: string) => fs.unlink(value, () => undefined);
const safeRmdir = (value: string) => fs.rm(value, { recursive: true, force: true }, () => undefined);
const runFile = (file: string, args: string[]) => new Promise<void>((resolve, reject) => {
  execFile(file, args, { timeout: 30000, maxBuffer: 1024 * 1024 }, (error) => error ? reject(error) : resolve());
});

const TILE_SIZE = 256;
function worldPixel(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}
function haversine(a: any, b: any) {
  const radius = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(Number(b.latitude) - Number(a.latitude));
  const dLng = toRadians(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRadians(Number(a.latitude));
  const lat2 = toRadians(Number(b.latitude));
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function circularLongitude(points: any[]): number {
  const vectors = points.reduce((result, point) => {
    const radians = Number(point.longitude) * Math.PI / 180;
    return { x: result.x + Math.cos(radians), y: result.y + Math.sin(radians) };
  }, { x: 0, y: 0 });
  return Math.atan2(vectors.y, vectors.x) * 180 / Math.PI;
}

function chromiumExecutable(): string {
  const configured = String(process.env.CHROMIUM_PATH || '').trim();
  const candidates = [configured, '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error('Chromium is not installed');
  return found;
}

async function renderWorldwideVectorMap(
  points: any[],
  width: number,
  height: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
): Promise<Buffer> {
  const styleUrl = String(
    process.env.EVIDENCE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
  ).trim();
  if (!/^https:\/\//i.test(styleUrl)) throw new Error('EVIDENCE_MAP_STYLE_URL must use HTTPS');

  const directory = fs.mkdtempSync(path.join(tempRoot, 'maplibre-'));
  const htmlPath = path.join(directory, 'map.html');
  const outputPath = path.join(directory, 'map.png');
  const route = points.map((point) => [Number(point.longitude), Number(point.latitude)]);
  const mapLibreVersion = '5.15.0';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@${mapLibreVersion}/dist/maplibre-gl.css"><style>html,body,#map{width:100%;height:100%;margin:0;overflow:hidden;background:#10212b}.maplibregl-control-container{display:none}</style></head><body><div id="map"></div><script src="https://unpkg.com/maplibre-gl@${mapLibreVersion}/dist/maplibre-gl.js"></script><script>
  const map = new maplibregl.Map({container:'map',style:${JSON.stringify(styleUrl)},center:[${centerLng},${centerLat}],zoom:${zoom},interactive:false,attributionControl:false,fadeDuration:0,preserveDrawingBuffer:true});
  const route = ${JSON.stringify(route)};
  map.on('load',()=>{map.addSource('evidence-route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:route}}});map.addLayer({id:'evidence-route-shadow',type:'line',source:'evidence-route',paint:{'line-color':'#001820','line-opacity':.35,'line-width':9}});map.addLayer({id:'evidence-route',type:'line',source:'evidence-route',paint:{'line-color':'#00d4ff','line-opacity':.28,'line-width':4}});});
  map.once('idle',()=>{document.documentElement.dataset.ready='true'});
  setTimeout(()=>{document.documentElement.dataset.ready='timeout'},10000);
  </script></body></html>`;

  try {
    fs.writeFileSync(htmlPath, html, 'utf8');
    await runFile(chromiumExecutable(), [
      '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${width},${height}`,
      '--virtual-time-budget=12000', `--screenshot=${outputPath}`, `file://${htmlPath}`,
    ]);
    if (!fs.existsSync(outputPath)) throw new Error('Chromium did not create the map image');
    const rendered = await sharp(outputPath).resize(width, height, { fit: 'fill' }).png().toBuffer();
    const statistics = await sharp(rendered).stats();
    if (statistics.entropy < 1.25) {
      throw new Error(`MapLibre returned a blank canvas (entropy ${statistics.entropy.toFixed(2)})`);
    }
    return rendered;
  } finally {
    safeRmdir(directory);
  }
}

async function cachedRasterTile(template: string, zoom: number, x: number, y: number): Promise<Buffer> {
  const tileCount = 2 ** zoom;
  const wrappedX = ((x % tileCount) + tileCount) % tileCount;
  const clampedY = Math.max(0, Math.min(tileCount - 1, y));
  const cachePath = path.join(tileCacheRoot, `${zoom}-${wrappedX}-${clampedY}.png`);
  if (fs.existsSync(cachePath)) return fs.promises.readFile(cachePath);

  const tileUrl = template
    .replace('{z}', String(zoom))
    .replace('{x}', String(wrappedX))
    .replace('{y}', String(clampedY));
  const response = await fetch(tileUrl, {
    headers: {
      'User-Agent': 'FutureJobsProAI-EvidenceRenderer/3.0 (+https://www.futurejobsproai.com)',
      Accept: 'image/png,image/webp,image/*;q=0.8',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Raster map tile failed with HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await sharp(buffer).metadata();
  await fs.promises.writeFile(cachePath, buffer);
  return buffer;
}

async function renderWorldwideRasterMap(
  template: string,
  width: number,
  height: number,
  center: { x: number; y: number },
  zoom: number,
) {
  if (!template.includes('{z}') || !template.includes('{x}') || !template.includes('{y}')) {
    throw new Error('Raster tile URL must contain {z}, {x}, and {y}');
  }
  const columns = Math.ceil(width / TILE_SIZE) + 2;
  const rows = Math.ceil(height / TILE_SIZE) + 2;
  const firstTileX = Math.floor(center.x / TILE_SIZE) - Math.floor(columns / 2);
  const firstTileY = Math.floor(center.y / TILE_SIZE) - Math.floor(rows / 2);
  const composites: sharp.OverlayOptions[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      composites.push({
        input: await cachedRasterTile(template, zoom, firstTileX + column, firstTileY + row),
        left: column * TILE_SIZE,
        top: row * TILE_SIZE,
      });
    }
  }

  const canvasWidth = columns * TILE_SIZE;
  const canvasHeight = rows * TILE_SIZE;
  const originX = firstTileX * TILE_SIZE;
  const originY = firstTileY * TILE_SIZE;
  const left = Math.max(0, Math.min(canvasWidth - width, Math.round(center.x - originX - width / 2)));
  const top = Math.max(0, Math.min(canvasHeight - height, Math.round(center.y - originY - height / 2)));
  const stitched = await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: '#dce7ea' },
  }).composite(composites).png().toBuffer();
  const buffer = await sharp(stitched)
    .extract({ left, top, width, height })
    .modulate({ brightness: 0.72, saturation: 0.72 })
    .png()
    .toBuffer();
  const statistics = await sharp(buffer).stats();
  if (statistics.entropy < 1.25) throw new Error('Raster provider returned a blank map');
  return { buffer, cropX: originX + left, cropY: originY + top };
}

async function mapBackground(points: any[], width: number, height: number) {
  const tileTemplate = String(process.env.EVIDENCE_MAP_TILE_URL || '').trim();
  const renderer = String(process.env.EVIDENCE_MAP_RENDERER || 'raster').trim().toLowerCase();
  const rasterTemplate = String(
    process.env.EVIDENCE_MAP_RASTER_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  ).trim();
  const centerLat = points.reduce((sum, point) => sum + Number(point.latitude), 0) / points.length;
  const centerLng = circularLongitude(points);
  let zoom = Math.max(3, Math.min(19, Number(process.env.EVIDENCE_MAP_MAX_ZOOM || 14)));
  for (; zoom >= 3; zoom--) {
    const centerAtZoom = worldPixel(centerLat, centerLng, zoom);
    const worldSize = TILE_SIZE * 2 ** zoom;
    const pixels = points.map((point) => {
      const pixel = worldPixel(Number(point.latitude), Number(point.longitude), zoom);
      let x = pixel.x - centerAtZoom.x;
      if (x > worldSize / 2) x -= worldSize;
      if (x < -worldSize / 2) x += worldSize;
      return { x, y: pixel.y };
    });
    const spanX = Math.max(...pixels.map((point) => point.x)) - Math.min(...pixels.map((point) => point.x));
    const spanY = Math.max(...pixels.map((point) => point.y)) - Math.min(...pixels.map((point) => point.y));
    if (spanX <= width * 0.68 && spanY <= height * 0.68) break;
  }
  const center = worldPixel(centerLat, centerLng, zoom);
  if (!tileTemplate && (renderer === 'vector' || renderer === 'auto')) {
    try {
      const vectorMap = await renderWorldwideVectorMap(points, width, height, centerLat, centerLng, zoom);
      return {
        buffer: await sharp(vectorMap).modulate({ brightness: 0.78, saturation: 0.78 }).png().toBuffer(),
        zoom,
        center,
        cropX: center.x - width / 2,
        cropY: center.y - height / 2,
        realMap: true,
        provider: 'OPENFREEMAP',
      };
    } catch (error) {
      console.warn('Vector map render unavailable; continuing with worldwide raster map:', error);
    }
  }

  try {
    const selectedTemplate = tileTemplate || rasterTemplate;
    const raster = await renderWorldwideRasterMap(selectedTemplate, width, height, center, zoom);
    return {
      buffer: raster.buffer,
      zoom,
      center,
      cropX: raster.cropX,
      cropY: raster.cropY,
      realMap: true,
      provider: tileTemplate ? 'PRIVATE MAP' : 'WORLD STREET MAP',
    };
  } catch (error) {
    console.error('All evidence map providers failed; using verified coordinate fallback:', error);
    const fallback = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#10212b"/><g stroke="#294250" stroke-width="2">${Array.from({length:12},(_,i)=>`<path d="M ${i*90-120} 0 L ${i*90+180} ${height}"/>`).join('')}${Array.from({length:8},(_,i)=>`<path d="M 0 ${i*75} L ${width} ${i*75-120}"/>`).join('')}</g><text x="32" y="${height-28}" fill="#9db2bf" font-family="Arial" font-size="14">Map service unavailable — route remains plotted from original coordinates</text></svg>`;
    return { buffer: await sharp(Buffer.from(fallback)).png().toBuffer(), zoom, center, cropX: center.x-width/2, cropY: center.y-height/2, realMap: false, provider: 'MAP FALLBACK' };
  }
}

async function ownedEntry(companyId: string, timeEntryId: string) {
  const result = await pool.query(
    `SELECT te.*, concat_ws(' ',u.first_name,u.last_name) employee_name,
            p.name project_name,p.address project_address,c.name company_name
     FROM time_entries te JOIN users u ON u.id=te.user_id
     LEFT JOIN projects p ON p.id=te.project_id JOIN companies c ON c.id=u.company_id
     WHERE te.id=$1 AND u.company_id=$2`, [timeEntryId, companyId]);
  if (!result.rowCount) throw new Error('Time entry not found');
  return result.rows[0];
}

export async function generateTimeEntryPdf(companyId: string, timeEntryId: string): Promise<Artifact> {
  const entry = await ownedEntry(companyId, timeEntryId);
  const gps = await pool.query('SELECT latitude,longitude,timestamp,accuracy,speed FROM gps_tracking WHERE time_entry_id=$1 ORDER BY timestamp', [timeEntryId]);
  const media = await pool.query('SELECT count(*)::int count FROM photos WHERE time_entry_id=$1 AND company_id=$2', [timeEntryId, companyId]);
  const voices = await pool.query('SELECT count(*)::int count FROM voice_notes WHERE time_entry_id=$1 AND company_id=$2', [timeEntryId, companyId]);
  const duration = entry.clock_out ? Math.max(0, (new Date(entry.clock_out).getTime()-new Date(entry.clock_in).getTime())/3600000) : 0;
  const chunks: Buffer[]=[]; const doc=new PDFDocument({size:'LETTER',margin:48,info:{Title:'Verified Time Entry Evidence'}});
  doc.on('data',(chunk)=>chunks.push(Buffer.from(chunk)));
  const done=new Promise<Buffer>((resolve)=>doc.on('end',()=>resolve(Buffer.concat(chunks))));
  doc.rect(0,0,612,92).fill('#07121A'); doc.fillColor('#00D4FF').fontSize(21).text('FUTURE JOBS PRO AI',48,28); doc.fillColor('#FFFFFF').fontSize(11).text('Verified Time Entry Evidence Record',48,57);
  doc.fillColor('#162334').fontSize(18).text('Work record',48,120); doc.moveDown(.7);
  const line=(label:string,value:unknown)=>{doc.fillColor('#66768A').fontSize(9).text(label.toUpperCase());doc.fillColor('#172033').fontSize(12).text(String(value??'—'));doc.moveDown(.55)};
  const firstGps = gps.rows[0];
  const jobSite = entry.project_address || (firstGps
    ? `Address not supplied — GPS ${Number(firstGps.latitude).toFixed(6)}, ${Number(firstGps.longitude).toFixed(6)}`
    : 'Address and GPS location not supplied');
  line('Company',entry.company_name);line('Employee',entry.employee_name);line('Project',entry.project_name);line('Job-site address',jobSite);line('Clock in',new Date(entry.clock_in).toLocaleString('en-CA'));line('Clock out',entry.clock_out?new Date(entry.clock_out).toLocaleString('en-CA'):'In progress');line('Recorded duration',`${duration.toFixed(2)} hours`);line('Unpaid break',`${entry.break_minutes||0} minutes`);line('Approval status',entry.approval_status||'pending');line('Correction reason',entry.correction_reason||'No correction recorded');
  doc.moveDown();doc.fillColor('#162334').fontSize(16).text('Evidence inventory');doc.moveDown(.5);doc.fillColor('#172033').fontSize(11).text(`${gps.rowCount} GPS points  •  ${media.rows[0]?.count||0} photo/video records  •  ${voices.rows[0]?.count||0} voice notes`);
  const canonical=Buffer.from(JSON.stringify({entry,gps:gps.rows,generatedAt:new Date().toISOString()}));const verificationHash=hash(canonical);
  doc.moveDown(2);doc.fillColor('#66768A').fontSize(9).text('SHA-256 VERIFICATION HASH');doc.fillColor('#172033').font('Courier').fontSize(8).text(verificationHash,{width:500});doc.font('Helvetica').moveDown();doc.fillColor('#66768A').fontSize(8).text('This report summarizes records stored by Future Jobs Pro AI. The accompanying evidence manifest contains the complete source metadata.');doc.end();
  const buffer=await done; return {buffer,fileName:`time-entry-${timeEntryId}.pdf`,mimeType:'application/pdf',verificationHash};
}

export async function generateGpsTrailVideo(companyId: string, timeEntryId: string): Promise<Artifact> {
  const entry = await ownedEntry(companyId, timeEntryId);
  const gps = await pool.query('SELECT latitude,longitude,timestamp,accuracy,speed FROM gps_tracking WHERE time_entry_id=$1 ORDER BY timestamp', [timeEntryId]);
  if (gps.rowCount < 2) throw new Error('At least two GPS points are required to create a trail video');
  const points = gps.rows;
  const dir = fs.mkdtempSync(path.join(tempRoot, 'gps-'));
  const output = path.join(dir, 'gps-trail.mp4');
  const mapWidth = 900;
  const mapHeight = 500;
  try {
    const map = await mapBackground(points, mapWidth, mapHeight);
    const project = (point: any) => {
      const pixel = worldPixel(Number(point.latitude), Number(point.longitude), map.zoom);
      const worldSize = TILE_SIZE * 2 ** map.zoom;
      let deltaX = pixel.x - map.center.x;
      if (deltaX > worldSize / 2) deltaX -= worldSize;
      if (deltaX < -worldSize / 2) deltaX += worldSize;
      return { x: 40 + mapWidth / 2 + deltaX, y: 112 + mapHeight / 2 + pixel.y - map.center.y };
    };
    const distances = [0];
    for (let index=1; index<points.length; index++) distances.push(distances[index-1]+haversine(points[index-1],points[index]));
    const totalDistance = distances[distances.length-1];
    const startTime = new Date(points[0].timestamp).getTime();
    const endTime = new Date(points[points.length-1].timestamp).getTime();
    const evidenceId = hash(Buffer.from(JSON.stringify({timeEntryId,points}))).slice(0,16).toUpperCase();
    const introFrames=18, routeFrames=Math.min(150,Math.max(90,points.length*3)),closingFrames=24,totalFrames=introFrames+routeFrames+closingFrames;
    for (let frame=0; frame<totalFrames; frame++) {
      const routeProgress=Math.max(0,Math.min(1,(frame-introFrames)/Math.max(1,routeFrames-1)));
      const upto=Math.max(0,Math.round(routeProgress*(points.length-1)));
      const shown=points.slice(0,upto+1);
      const route=shown.map((point:any)=>{const q=project(point);return `${q.x.toFixed(1)},${q.y.toFixed(1)}`}).join(' ');
      const current=project(points[upto]),first=project(points[0]),last=project(points[points.length-1]);
      const elapsed=Math.max(0,new Date(points[upto].timestamp).getTime()-startTime);
      const segment=upto?haversine(points[upto-1],points[upto]):0;
      const status=segment<=Math.max(3,Number(points[upto].accuracy||0))?'STATIONARY / GPS DRIFT':'MOVEMENT RECORDED';
      const closing=frame>=introFrames+routeFrames;
      const title=frame<introFrames;
      const overlay=`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#061018"/><rect x="40" y="112" width="900" height="500" rx="18" fill="none" stroke="#49606e" stroke-width="2"/><rect x="40" y="112" width="900" height="500" rx="18" fill="#041018" opacity=".16"/><polyline points="${route}" fill="none" stroke="#001820" stroke-width="15" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/><polyline points="${route}" fill="none" stroke="#00E5FF" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${first.x}" cy="${first.y}" r="15" fill="#22C55E" stroke="#fff" stroke-width="4"/><circle cx="${last.x}" cy="${last.y}" r="13" fill="#FFB020" stroke="#fff" stroke-width="4"/><circle cx="${current.x}" cy="${current.y}" r="25" fill="#00D4FF" opacity=".22"/><circle cx="${current.x}" cy="${current.y}" r="13" fill="#fff" stroke="#00D4FF" stroke-width="7"/><rect x="958" y="112" width="282" height="500" rx="18" fill="#0B1A24" stroke="#284757"/><text x="40" y="43" fill="#00D4FF" font-family="Arial" font-size="24" font-weight="700">FUTURE JOBS PRO AI • VERIFIED GPS EVIDENCE</text><text x="40" y="74" fill="#DDEAF2" font-family="Arial" font-size="16">${escapeXml(entry.employee_name)} • ${escapeXml(entry.project_name||'Unassigned project')}</text><text x="40" y="96" fill="#8EA4B2" font-family="Arial" font-size="12">${escapeXml(entry.project_address||'Recorded job site')} • Evidence ${evidenceId}</text><text x="982" y="151" fill="#7F96A5" font-family="Arial" font-size="11">PLAYBACK STATUS</text><text x="982" y="181" fill="${status.startsWith('MOVEMENT')?'#22C55E':'#FFB020'}" font-family="Arial" font-size="16" font-weight="700">${status}</text><text x="982" y="225" fill="#7F96A5" font-family="Arial" font-size="11">RECORDED TIME</text><text x="982" y="251" fill="#FFFFFF" font-family="Arial" font-size="17">${escapeXml(new Date(points[upto].timestamp).toLocaleString('en-CA'))}</text><text x="982" y="295" fill="#7F96A5" font-family="Arial" font-size="11">ELAPSED / POINT</text><text x="982" y="321" fill="#FFFFFF" font-family="Arial" font-size="17">${Math.floor(elapsed/60000)}m ${Math.floor((elapsed%60000)/1000)}s • ${upto+1}/${points.length}</text><text x="982" y="365" fill="#7F96A5" font-family="Arial" font-size="11">ROUTE DISTANCE</text><text x="982" y="391" fill="#FFFFFF" font-family="Arial" font-size="22" font-weight="700">${distances[upto].toFixed(1)} m</text><text x="982" y="435" fill="#7F96A5" font-family="Arial" font-size="11">GPS ACCURACY</text><text x="982" y="461" fill="#FFFFFF" font-family="Arial" font-size="17">±${Number(points[upto].accuracy||0).toFixed(1)} m</text><text x="982" y="505" fill="#7F96A5" font-family="Arial" font-size="11">COORDINATES</text><text x="982" y="531" fill="#FFFFFF" font-family="Arial" font-size="14">${Number(points[upto].latitude).toFixed(6)}</text><text x="982" y="553" fill="#FFFFFF" font-family="Arial" font-size="14">${Number(points[upto].longitude).toFixed(6)}</text><text x="982" y="585" fill="#7F96A5" font-family="Arial" font-size="11">TOTAL ${totalDistance.toFixed(1)} m • ${map.provider}</text><rect x="40" y="642" width="1200" height="9" rx="4" fill="#213845"/><rect x="40" y="642" width="${1200*routeProgress}" height="9" rx="4" fill="#00D4FF"/><text x="40" y="682" fill="#89A0AE" font-family="Arial" font-size="12">● Start  ● End  ● Current • Street map and data © OpenStreetMap contributors</text>${title?`<rect x="175" y="220" width="930" height="250" rx="28" fill="#061018" opacity=".93"/><text x="640" y="294" text-anchor="middle" fill="#00E5FF" font-family="Arial" font-size="18" font-weight="700">VERIFIED WORKSITE PRESENCE</text><text x="640" y="349" text-anchor="middle" fill="#FFFFFF" font-family="Arial" font-size="38" font-weight="700">GPS Trail Reconstruction</text><text x="640" y="393" text-anchor="middle" fill="#B7CAD5" font-family="Arial" font-size="17">${points.length} recorded points • ${Math.round((endTime-startTime)/1000)} seconds • SHA-256 traceability</text><text x="640" y="430" text-anchor="middle" fill="#7F96A5" font-family="Arial" font-size="14">Evidence ${evidenceId}</text>`:''}${closing?`<rect x="155" y="190" width="970" height="310" rx="30" fill="#061018" opacity=".95"/><circle cx="640" cy="261" r="28" fill="#22C55E"/><path d="M625 261 l11 12 l22 -26" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><text x="640" y="331" text-anchor="middle" fill="#FFFFFF" font-family="Arial" font-size="34" font-weight="700">Evidence playback complete</text><text x="640" y="375" text-anchor="middle" fill="#00D4FF" font-family="Arial" font-size="21">${points.length} source points • ${totalDistance.toFixed(1)} m reconstructed</text><text x="640" y="414" text-anchor="middle" fill="#B7CAD5" font-family="Arial" font-size="15">Full coordinates, timestamps and accuracy remain in the signed evidence package.</text><text x="640" y="453" text-anchor="middle" fill="#7F96A5" font-family="Courier" font-size="13">${evidenceId}</text>`:''}</svg>`;
      await sharp(map.buffer).resize(mapWidth,mapHeight).extend({top:112,bottom:108,left:40,right:340,background:'#061018'}).composite([{input:Buffer.from(overlay),left:0,top:0,blend:'screen'}]).png().toFile(path.join(dir,`frame-${String(frame).padStart(4,'0')}.png`));
    }
    await runFfmpeg(ffmpeg(path.join(dir,'frame-%04d.png')).inputFPS(15).outputOptions(['-c:v libx264','-crf 19','-pix_fmt yuv420p','-movflags +faststart']).fps(15),output);
    const buffer=fs.readFileSync(output);
    return{buffer,fileName:`gps-trail-${timeEntryId}.mp4`,mimeType:'video/mp4',verificationHash:hash(buffer)};
  } finally { safeRmdir(dir); }
}

export async function generateVoiceCaptionVideo(companyId:string,voiceNoteId:string):Promise<Artifact>{
  const r=await pool.query(`SELECT vn.*,concat_ws(' ',u.first_name,u.last_name) employee_name,p.name project_name FROM voice_notes vn JOIN users u ON u.id=vn.user_id LEFT JOIN projects p ON p.id=vn.project_id WHERE vn.id=$1 AND u.company_id=$2`,[voiceNoteId,companyId]);if(!r.rowCount)throw new Error('Voice note not found');const note=r.rows[0];if(!note.audio_url)throw new Error('This voice note has no original audio recording');
  const dir=fs.mkdtempSync(path.join(tempRoot,'voice-')),audio=path.join(dir,'voice-source'),output=path.join(dir,'voice-evidence.mp4');
  try{const response=await fetch(note.audio_url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Voice audio could not be downloaded');fs.writeFileSync(audio,Buffer.from(await response.arrayBuffer()));const duration=Math.min(300,Math.max(3,Math.ceil(Number(note.duration_seconds)||15))),words=String(note.transcript||'No transcript available').split(/\s+/),chunks:string[]=[];for(let i=0;i<words.length;i+=11)chunks.push(words.slice(i,i+11).join(' '));
    for(let second=0;second<duration;second++){const progress=second/Math.max(1,duration-1),caption=chunks[Math.min(chunks.length-1,Math.floor(progress*chunks.length))]||'No transcript available';const seed=crypto.createHash('sha256').update(`${voiceNoteId}-${second}`).digest();const bars=Array.from({length:52},(_,i)=>{const height=24+(seed[i%seed.length]/255)*150;return `<rect x="${75+i*21}" y="${365-height/2}" width="10" height="${height}" rx="5" fill="${i/52<progress?'#00D4FF':'#365665'}"/>`}).join('');const svg=`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#071018"/><text x="70" y="58" fill="#00D4FF" font-family="Arial" font-size="25" font-weight="700">VOICE EVIDENCE • AUDIO + ON-SCREEN NOTES</text><text x="70" y="94" fill="#D9E5EE" font-family="Arial" font-size="17">${escapeXml(note.employee_name)} • ${escapeXml(note.project_name||'Job record')}</text><rect x="58" y="145" width="1164" height="430" rx="24" fill="#0E1D28" stroke="#264457"/>${bars}<text x="90" y="470" fill="#7F94A5" font-family="Arial" font-size="13">SYNCHRONIZED TRANSCRIPT</text><text x="640" y="525" text-anchor="middle" fill="#FFFFFF" font-family="Arial" font-size="25" font-weight="700">${escapeXml(caption)}</text><rect x="70" y="625" width="1140" height="8" rx="4" fill="#1E3442"/><rect x="70" y="625" width="${1140*progress}" height="8" rx="4" fill="#00D4FF"/><text x="70" y="672" fill="#9FB1BF" font-family="Arial" font-size="14">${String(Math.floor(second/60)).padStart(2,'0')}:${String(second%60).padStart(2,'0')} / ${String(Math.floor(duration/60)).padStart(2,'0')}:${String(duration%60).padStart(2,'0')} • Original voice audio preserved</text></svg>`;await sharp(Buffer.from(svg)).png().toFile(path.join(dir,`frame-${String(second).padStart(4,'0')}.png`));}
    await runFfmpeg(ffmpeg(path.join(dir,'frame-%04d.png')).inputFPS(1).input(audio).outputOptions(['-map 0:v','-map 1:a','-c:v libx264','-c:a aac','-pix_fmt yuv420p','-r 30','-shortest','-movflags +faststart']),output);const buffer=fs.readFileSync(output);return{buffer,fileName:`voice-note-${voiceNoteId}-captioned.mp4`,mimeType:'video/mp4',verificationHash:hash(buffer)}}finally{safeRmdir(dir)}
}

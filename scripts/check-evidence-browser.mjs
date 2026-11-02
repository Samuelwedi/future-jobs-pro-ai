import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
const runtime = process.env.FJ_QA_NODE_MODULES;
if (!runtime)
  throw Error(
    "Set FJ_QA_NODE_MODULES to isolated QA node_modules containing vite, playwright, @sparticuz/chromium, react and react-dom.",
  );
const { createServer } = await import(
  pathToFileURL(path.join(runtime, "vite/dist/node/index.js")).href
);
const { chromium } = await import(
  pathToFileURL(path.join(runtime, "playwright/index.mjs")).href
);
const { default: chromiumBinary } = await import(
  pathToFileURL(path.join(runtime, "@sparticuz/chromium/build/index.js")).href
);
const dir = path.resolve(".evidence-qa"),
  records = [];
await mkdir(dir, { recursive: true });
process.env.JWT_SECRET = "isolated-year-end-browser-secret";
const require = createRequire(path.resolve("backend/package.json"));
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("./dist/config/database");
process.env.CLOUDINARY_CLOUD_NAME = "fixture-cloud";
const cloudPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=",
  "base64",
);
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const actorIds = { worker: uid(11), cover: uid(12), manager: uid(13) },
  tokens = Object.fromEntries(
    Object.entries(actorIds).map(([k, id]) => [
      k,
      jwt.sign({ id }, process.env.JWT_SECRET),
    ]),
  );
const query = async (sql, args) => {
  const r = await db.query(sql, args);
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};

await db.exec(
  `CREATE TABLE companies(id uuid PRIMARY KEY,name text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean,first_name text,last_name text);CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,name text,address text);CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,project_id uuid,clock_in timestamptz,clock_out timestamptz,regular_hours numeric,overtime_hours numeric,total_wage numeric,approval_status text,extra_private text);CREATE TABLE photos(id uuid PRIMARY KEY,time_entry_id uuid,company_id uuid,s3_key text,file_type text,taken_at timestamptz,verification_hash text);CREATE TABLE voice_notes(id uuid PRIMARY KEY,time_entry_id uuid,company_id uuid,user_id uuid,project_id uuid,audio_url text,transcript text,client_summary text,duration_seconds numeric,taken_at timestamptz);CREATE TABLE attachments(id uuid PRIMARY KEY,time_entry_id uuid,company_id uuid,file_name text,file_url text,file_type text,file_size int,created_at timestamptz);CREATE TABLE gps_tracking(time_entry_id uuid,latitude numeric,longitude numeric,timestamp timestamptz,accuracy numeric,speed numeric);`,
);
for (const n of [1, 2])
  await query("INSERT INTO companies VALUES($1,$2)", [uid(n), "Company " + n]);
for (const [n, c, role, active] of [
  [11, 1, "employee", true],
  [12, 1, "owner", true],
  [13, 1, "manager", true],
  [14, 2, "owner", true],
  [15, 1, "owner", false],
])
  await query("INSERT INTO users VALUES($1,$2,$3,$4,'Fixture','Employee')", [
    uid(n),
    uid(c),
    role,
    active,
  ]);
for (const [n, c, name] of [
  [21, 1, "Current project"],
  [22, 2, "FOREIGN PROJECT SECRET"],
])
  await query("INSERT INTO projects VALUES($1,$2,$3,'Fixture site')", [
    uid(n),
    uid(c),
    name,
  ]);
for (const [n, u, p] of [
  [31, 11, 21],
  [32, 14, 22],
  [33, 11, 22],
])
  await query(
    "INSERT INTO time_entries VALUES($1,$2,$3,'2026-11-01T10:00:00Z','2026-11-01T11:00:00Z',1,0,10,'approved','PRIVATE_UNUSED_COLUMN')",
    [uid(n), uid(u), uid(p)],
  );
for (const [n, c] of [
  [41, 1],
  [42, 2],
])
  await query(
    "INSERT INTO photos VALUES($1,$2,$3,'https://res.cloudinary.com/fixture-cloud/image/upload/v1/photo.png','photo',NOW(),'source-hash')",
    [uid(n), uid(31), uid(c)],
  );
await query(
  "INSERT INTO attachments VALUES($1,$2,$3,'../../escape.txt','https://res.cloudinary.com/fixture-cloud/raw/upload/v1/original.txt','text/plain',4,NOW())",
  [uid(51), uid(31), uid(1)],
);
await query(
  "INSERT INTO gps_tracking VALUES($1,51.01,-114.01,'2026-11-01T10:00:00Z',5,0)",
  [uid(31)],
);
const realFetch = global.fetch;
global.fetch = async (url) => {
  if (!String(url).startsWith("https://res.cloudinary.com/fixture-cloud/"))
    throw Error("Unexpected fixture provider request");
  return String(url).endsWith("photo.png")
    ? new Response(cloudPng, { headers: { "content-type": "image/png" } })
    : new Response("text", { headers: { "content-type": "text/plain" } });
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  records.push({ method: req.method, path: req.url });
  next();
});
app.use(
  ["/evidence-bundles", "/api/evidence-bundles"],
  require("./dist/routes/evidenceBundleRoutes").default,
);
const api = httpServer(app);
await new Promise((r) => api.listen(0, "127.0.0.1", r));
await writeFile(
  path.join(dir, "native.jsx"),
  `import React from 'react';const style=x=>Array.isArray(x)?Object.assign({},...x.filter(Boolean)):x;const view=tag=>({children,style:s,onPress,disabled,accessibilityLabel,accessibilityRole,accessibilityState,...p})=>React.createElement(tag,{style:style(s),onClick:onPress,disabled,'aria-label':accessibilityLabel,role:accessibilityRole,'aria-checked':accessibilityState?.checked},children);export const View=view('div'),Text=view('span'),ScrollView=view('div'),TouchableOpacity=view('button');export const TextInput=({value,onChangeText,placeholder,multiline,style:s,accessibilityLabel,editable})=>React.createElement(multiline?'textarea':'input',{value,onChange:e=>onChangeText?.(e.target.value),placeholder,'aria-label':accessibilityLabel,disabled:editable===false,style:style(s)});export const Image=({source,accessibilityLabel,style:s})=>React.createElement('img',{alt:accessibilityLabel,src:window.qaFiles?.[source.uri]?URL.createObjectURL(new Blob([window.qaFiles[source.uri]],{type:'image/png'})):source.uri,style:style(s)});export const StyleSheet={create:x=>x};export const ActivityIndicator=()=>React.createElement('span',null,'Loading');export const RefreshControl=()=>null;const node=x=>typeof x==='function'?React.createElement(x):x;export const FlatList=({data=[],renderItem,ListEmptyComponent})=>React.createElement('div',null,data.length?data.map((item,index)=>React.createElement(React.Fragment,{key:item.id||index},renderItem({item,index}))):node(ListEmptyComponent));export const SectionList=({sections=[],renderItem,renderSectionHeader,ListEmptyComponent})=>React.createElement('div',null,...sections.map((section,i)=>React.createElement('div',{key:i},renderSectionHeader({section}),...section.data.map((item,j)=>React.createElement(React.Fragment,{key:item.id||j},renderItem({item,index:j}))))),sections.every(s=>!s.data.length)?node(ListEmptyComponent):null);export const AdaptiveModal=({visible,children})=>visible?React.createElement('div',{role:'dialog'},children):null;export const Linking={openURL:()=>{}};export const Alert={alert:(title,message,buttons=[])=>window.dispatchEvent(new CustomEvent('native-alert',{detail:{title,message,buttons}}))};export const Switch=({value,onValueChange,accessibilityLabel,disabled})=>React.createElement('input',{type:'checkbox',checked:value,onChange:e=>onValueChange(e.target.checked),'aria-label':accessibilityLabel,disabled});export const Platform={OS:'web'};`,
);
await writeFile(
  path.join(dir, "nav.jsx"),
  `import React from 'react';const emit=(route,params)=>window.dispatchEvent(new CustomEvent('navigation',{detail:{route,params}}));export const useNavigation=()=>({navigate:emit,goBack:()=>emit('back')});export const useFocusEffect=callback=>React.useEffect(callback,[callback]);export const useRoute=()=>({params:{date:'2026-10-31',shift:{id:'shift',name:'Night Shift',project_id:'project',project_name:'Projects',date:'2026-10-31',start_time:'09:00',end_time:'17:00',assigned_user_ids:['owner']}}});`,
);
await writeFile(
  path.join(dir, "auth.js"),
  `const ids=${JSON.stringify(actorIds)};export const useAuth=()=>({user:{id:ids[window.qaActor||'worker'],companyId:'00000000-0000-4000-a000-000000000001',role:window.qaActor==='manager'?'boss':'employee'}});`,
);
await writeFile(
  path.join(dir, "storage.js"),
  `export default {getItem:async k=>localStorage.getItem(k),setItem:async(k,v)=>localStorage.setItem(k,v)};`,
);
await writeFile(
  path.join(dir, "expo.jsx"),
  `import React from'react';export const MaterialIcons=({name})=>React.createElement('span',null,name);export const useSafeAreaInsets=()=>({top:0,bottom:0});export const getLocales=()=>[{languageTag:'en-CA'}];export const getDocumentAsync=async()=>({canceled:true});export const cacheDirectory='file:///fixture/';export const isAvailableAsync=async()=>true;export const shareAsync=async()=>{window.qaShares=(window.qaShares||0)+1};export const downloadAsync=async(url,file,options)=>{window.qaDownload=url;const r=await fetch(url,{headers:{...options.headers,'x-test-actor':window.qaActor||'worker'}});const bytes=new Uint8Array(await r.arrayBuffer());window.qaFiles=window.qaFiles||{};window.qaFiles[file]=bytes;window.qaPdfPrefix=String.fromCharCode(...bytes.slice(0,5));return {status:r.status,headers:{'Content-Type':r.headers.get('content-type')}}};export const getInfoAsync=async(file)=>({exists:!!window.qaFiles?.[file],size:window.qaFiles?.[file]?.length||0});export const deleteAsync=async(file)=>{if(window.qaFiles)delete window.qaFiles[file]};export const EncodingType={UTF8:'utf8',Base64:'base64'};export const writeAsStringAsync=async(file,data,options)=>{window.qaFiles=window.qaFiles||{};window.qaFiles[file]=Uint8Array.from(atob(data),c=>c.charCodeAt(0));window.qaZipPrefix=Array.from(window.qaFiles[file].slice(0,4)).join(',');};`,
);
await writeFile(
  path.join(dir, "api.js"),
  `const tokens=${JSON.stringify(tokens)};window.qaTokens=tokens;const request=async(method,path,body)=>{const r=await fetch('/fixture-api'+path,{method,headers:{'Content-Type':'application/json','x-test-actor':window.qaActor||'worker',Authorization:'Bearer '+tokens[window.qaActor||'worker']},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.message);return data};export const api={getToken:async()=>tokens[window.qaActor||'worker'],get:p=>request('GET',p),post:(p,b)=>request('POST',p,b),put:(p,b)=>request('PUT',p,b),patch:(p,b)=>request('PATCH',p,b),delete:p=>request('DELETE',p)};export const API_URL='/fixture-api';export const API_BASE='/fixture-api';`,
);
await writeFile(
  path.join(dir, "offline.js"),
  `export const checkOnlineStatus=async()=>!window.qaOffline;`,
);
await writeFile(
  path.join(dir, "players.jsx"),
  `import React from'react';export const useAudioPlayer=()=>({play(){},pause(){},seekTo(){}}),useAudioPlayerStatus=()=>({playing:false,duration:1,currentTime:0}),useVideoPlayer=()=>({}),VideoView=()=>React.createElement('div',null,'video adapter');export default function Slider(){return React.createElement('input',{type:'range'});}`,
);
await writeFile(
  path.join(dir, "app.jsx"),
  `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import Evidence from'/mobile/src/screens/EvidenceScreen.tsx';import WebEvidence from'/web/src/pages/EvidenceCenter.tsx';function App(){const[actor,setActor]=useState('worker'),[screen,setScreen]=useState('Native');const{setLang}=useLang();const C=screen==='Native'?Evidence:WebEvidence;return <><nav>{['Native','Web'].map(s=><button onClick={()=>{localStorage.setItem('token',window.qaTokens.manager);setScreen(s)}}>Screen {s}</button>)}{['worker','manager'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main><C key={screen}/></main></>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
);
await writeFile(
  path.join(dir, "index.html"),
  '<div id="root"></div><script type="module" src="./app.jsx"></script>',
);
const maps = {
  "expo-video": "players.jsx",
  "expo-audio": "players.jsx",
  "@react-native-community/slider": "players.jsx",

  "react-native": "native.jsx",
  "react-native-safe-area-context": "expo.jsx",
  "@react-navigation/native": "nav.jsx",
  "@expo/vector-icons": "expo.jsx",
  "@react-native-async-storage/async-storage": "storage.js",
  "expo-localization": "expo.jsx",
  "expo-document-picker": "expo.jsx",
  "expo-file-system/legacy": "expo.jsx",
  "expo-sharing": "expo.jsx",
};
const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  plugins: [
    {
      name: "native-dom-test-adapters",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "./AdaptiveModal") return path.join(dir, "native.jsx");
        if (
          source === "./api" &&
          importer?.endsWith("/services/evidenceFiles.ts")
        )
          return path.join(dir, "api.js");
        if (maps[source]) return path.join(dir, maps[source]);
        for (const [suffix, file] of [
          ["/context/AuthContext", "auth.js"],
          ["/services/api", "api.js"],
          ["/services/offlineService", "offline.js"],
          ["/components/AdaptiveModal", "native.jsx"],
        ])
          if (source.endsWith(suffix)) return path.join(dir, file);
      },
    },
  ],
  resolve: {
    alias: {
      react: path.join(runtime, "react"),
      "react-dom": path.join(runtime, "react-dom"),
    },
  },
  esbuild: { jsx: "transform" },
  optimizeDeps: { include: ["react", "react-dom/client"] },
  server: {
    host: "127.0.0.1",
    port: 5218,
    proxy: {
      "/fixture-api": {
        target: "http://127.0.0.1:" + api.address().port,
        rewrite: (p) => p.replace("/fixture-api", ""),
      },
    },
  },
});
await vite.listen();
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH || (await chromiumBinary.executablePath()),
  args: chromiumBinary.args,
  headless: true,
});
let passed = 0;
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Edmonton",
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => console.log("UI_ERROR", e.message));
  await page.goto("http://127.0.0.1:5218/.evidence-qa/index.html");
  const main = page.locator("main"),
    button = (name) => main.getByRole("button", { name, exact: true });
  await main.getByText("Manager access required", { exact: true }).waitFor();
  assert.equal(records.length, 0);
  passed++;
  await page
    .getByRole("button", { name: "Actor manager", exact: true })
    .click();
  await button("Fixture Employee · " + uid(31)).click();
  await main.getByText("Package contents", { exact: true }).waitFor();
  assert.equal(
    await main
      .getByText(/PRIVATE_UNUSED_COLUMN|FOREIGN PROJECT SECRET/)
      .count(),
    0,
  );
  assert.equal(await button("Share GPS reconstruction").isDisabled(), true);
  passed++;
  await main
    .getByRole("button", { name: "View " + uid(41), exact: true })
    .click();
  await main.getByRole("img", { name: uid(41), exact: true }).waitFor();
  await page.waitForFunction(() =>
    Array.from(document.images).some((i) => i.naturalWidth > 0),
  );
  assert.ok(
    records.some(
      (r) => r.path === "/evidence-bundles/photos/" + uid(41) + "/content",
    ),
  );
  await button("Close viewer").click();
  passed++;
  await button("Share time-entry PDF").click();
  await page.waitForFunction(() => window.qaShares === 1);
  assert.equal(await page.evaluate(() => window.qaPdfPrefix), "%PDF-");
  passed++;
  await main.getByLabel("Include original photo", { exact: true }).check();
  await button("Generate and share ZIP").click();
  await page.waitForFunction(() => window.qaShares === 2);
  assert.equal(await page.evaluate(() => window.qaZipPrefix), "80,75,3,4");
  await main.getByText(/Provided ZIP SHA-256:/).waitFor();
  assert.equal(records.filter((r) => r.method === "POST").length, 1);
  passed++;
  await page.evaluate(() => (window.qaOffline = true));
  const before = records.length;
  await button("Generate and share ZIP").click();
  await main
    .getByText("Reconnect before reviewing or exporting evidence.", {
      exact: true,
    })
    .waitFor();
  assert.equal(records.length, before);
  passed++;
  await page.evaluate(() => (window.qaOffline = false));
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main.getByText("Centre de preuves", { exact: true }).waitFor();
  passed++;
  await page.getByRole("button", { name: "Actor worker", exact: true }).click();
  await main.getByText("Accès responsable requis", { exact: true }).waitFor();
  assert.equal(
    await main.getByText("Package contents", { exact: true }).count(),
    0,
  );
  passed++;
  await page
    .getByRole("button", { name: "Actor manager", exact: true })
    .click();
  await page.getByRole("button", { name: "Screen Web", exact: true }).click();
  await main
    .getByRole("button", { name: "Select & download", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByText("Evidence Studio — select, generate, and download", {
      exact: true,
    })
    .waitFor();
  await dialog
    .getByText("Stored time-entry report (PDF)", { exact: true })
    .waitFor();
  passed++;
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Actual native Evidence screen/shared image viewer and web MUI dialog through real Express/JWT/PGlite/ZIP/PDF and private original proxy, with explicit DOM/file/share/player/provider adapters. No real audio/video rendering, physical devices or production acceptance.",
    }),
  );
} finally {
  global.fetch = realFetch;
  await browser.close();
  await vite.close();
  await new Promise((r) => api.close(r));
  await rm(dir, { recursive: true, force: true });
  await db.close();
  await pool.end();
}

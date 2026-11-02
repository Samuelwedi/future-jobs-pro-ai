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
const dir = path.resolve(".reports-qa"),
  records = [];
await mkdir(dir, { recursive: true });
process.env.JWT_SECRET = "isolated-year-end-browser-secret";
const require = createRequire(path.resolve("backend/package.json"));
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("./dist/config/database");
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
  `CREATE TABLE companies(id uuid PRIMARY KEY,name text,legal_name text,address text,city text,province text,postal_code text,phone text,email text,timezone text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean,first_name text,last_name text);CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,name text,address text,client_name text,status text);CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,project_id uuid,clock_in timestamptz,clock_out timestamptz,break_minutes numeric,regular_hours numeric,overtime_hours numeric,total_wage numeric,approval_status text);CREATE TABLE photos(id uuid,user_id uuid,project_id uuid,company_id uuid,taken_at timestamptz,file_type text,verification_hash text,compliance_score numeric);CREATE TABLE voice_notes(id uuid,user_id uuid,project_id uuid,taken_at timestamptz,duration_seconds numeric,transcript text);CREATE TABLE gps_tracking(time_entry_id uuid,latitude numeric,longitude numeric,timestamp timestamptz,accuracy numeric);CREATE TABLE attachments(id uuid,project_id uuid,company_id uuid,file_name text,file_type text,file_size int,category text,created_at timestamptz);`,
);
for (const n of [1, 2])
  await query(
    "INSERT INTO companies(id,name,timezone) VALUES($1,$2,'America/Edmonton')",
    [uid(n), "Fixture " + n],
  );
for (const [n, c, role, active] of [
  [11, 1, "employee", true],
  [12, 1, "owner", true],
  [13, 1, "manager", true],
  [14, 2, "owner", true],
  [15, 1, "owner", false],
  [16, 1, "employee", true],
])
  await query("INSERT INTO users VALUES($1,$2,$3,$4,$5,'Same')", [
    uid(n),
    uid(c),
    role,
    active,
    n === 14 ? "Foreign secret" : "=Fixture",
  ]);
for (const [n, c] of [
  [21, 1],
  [22, 2],
])
  await query(
    "INSERT INTO projects VALUES($1,$2,'Fixture Project','Site','Client','active')",
    [uid(n), uid(c)],
  );
for (const [n, u, start, end, approval] of [
  [31, 11, "2026-11-01T05:59:59Z", "2026-11-01T06:30:00Z", "approved"],
  [32, 11, "2026-11-01T06:00:00Z", "2026-11-01T08:00:00Z", "approved"],
  [33, 16, "2026-11-02T06:59:59Z", "2026-11-02T07:59:59Z", "pending"],
  [34, 11, "2026-11-02T07:00:00Z", "2026-11-02T08:00:00Z", "approved"],
  [35, 11, "2026-11-01T09:00:00Z", null, "approved"],
  [36, 14, "2026-11-01T10:00:00Z", "2026-11-01T11:00:00Z", "approved"],
])
  await query("INSERT INTO time_entries VALUES($1,$2,$3,$4,$5,0,1,0,10,$6)", [
    uid(n),
    uid(u),
    uid(21),
    start,
    end,
    approval,
  ]);
await query(
  "INSERT INTO photos VALUES($1,$2,$3,$4,'2026-11-01T09:00:00Z','photo','hash',80)",
  [uid(51), uid(14), uid(21), uid(1)],
);
pool.query = query;
pool.connect = async () => ({ query, release() {} });
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  records.push({ method: req.method, path: req.url });
  next();
});
app.use("/reports", require("./dist/routes/reportRoutes").default);
const api = httpServer(app);
await new Promise((r) => api.listen(0, "127.0.0.1", r));
await writeFile(
  path.join(dir, "native.jsx"),
  `import React from 'react';const style=x=>Array.isArray(x)?Object.assign({},...x.filter(Boolean)):x;const view=tag=>({children,style:s,onPress,disabled,accessibilityLabel,accessibilityRole,accessibilityState,...p})=>React.createElement(tag,{style:style(s),onClick:onPress,disabled,'aria-label':accessibilityLabel,role:accessibilityRole,'aria-checked':accessibilityState?.checked},children);export const View=view('div'),Text=view('span'),ScrollView=view('div'),TouchableOpacity=view('button');export const TextInput=({value,onChangeText,placeholder,multiline,style:s,accessibilityLabel,editable})=>React.createElement(multiline?'textarea':'input',{value,onChange:e=>onChangeText?.(e.target.value),placeholder,'aria-label':accessibilityLabel,disabled:editable===false,style:style(s)});export const StyleSheet={create:x=>x};export const ActivityIndicator=()=>React.createElement('span',null,'Loading');export const RefreshControl=()=>null;const node=x=>typeof x==='function'?React.createElement(x):x;export const FlatList=({data=[],renderItem,ListEmptyComponent})=>React.createElement('div',null,data.length?data.map((item,index)=>React.createElement(React.Fragment,{key:item.id||index},renderItem({item,index}))):node(ListEmptyComponent));export const SectionList=({sections=[],renderItem,renderSectionHeader,ListEmptyComponent})=>React.createElement('div',null,...sections.map((section,i)=>React.createElement('div',{key:i},renderSectionHeader({section}),...section.data.map((item,j)=>React.createElement(React.Fragment,{key:item.id||j},renderItem({item,index:j}))))),sections.every(s=>!s.data.length)?node(ListEmptyComponent):null);export const AdaptiveModal=({visible,children})=>visible?React.createElement('div',{role:'dialog'},children):null;export const Linking={openURL:()=>{}};export const Alert={alert:(title,message,buttons=[])=>window.dispatchEvent(new CustomEvent('native-alert',{detail:{title,message,buttons}}))};export const Switch=({value,onValueChange,accessibilityLabel,disabled})=>React.createElement('input',{type:'checkbox',checked:value,onChange:e=>onValueChange(e.target.checked),'aria-label':accessibilityLabel,disabled});export const Platform={OS:'web'};`,
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
  `import React from'react';export const MaterialIcons=({name})=>React.createElement('span',null,name);export const useSafeAreaInsets=()=>({top:0,bottom:0});export const getLocales=()=>[{languageTag:'en-CA'}];export const getDocumentAsync=async()=>({canceled:true});export const cacheDirectory='file:///fixture/';export const isAvailableAsync=async()=>true;export const shareAsync=async()=>{window.qaShares=(window.qaShares||0)+1};export const downloadAsync=async(url,file,options)=>{window.qaDownload=url;const r=await fetch(url,{headers:{...options.headers,'x-test-actor':window.qaActor||'worker'}});const bytes=new Uint8Array(await r.arrayBuffer());window.qaFiles=window.qaFiles||{};window.qaFiles[file]=bytes;window.qaPdfPrefix=String.fromCharCode(...bytes.slice(0,5));return {status:r.status,headers:{'Content-Type':r.headers.get('content-type')}}};export const getInfoAsync=async(file)=>({exists:!!window.qaFiles?.[file],size:window.qaFiles?.[file]?.length||0});export const deleteAsync=async(file)=>{if(window.qaFiles)delete window.qaFiles[file]};export const EncodingType={UTF8:'utf8'};export const writeAsStringAsync=async()=>{};`,
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
  path.join(dir, "app.jsx"),
  `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import Reports from'/mobile/src/screens/ReportsScreen.tsx';function App(){const[actor,setActor]=useState('worker');const{setLang}=useLang();return <><nav>{['worker','manager'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main><Reports/></main></>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
);
await writeFile(
  path.join(dir, "index.html"),
  '<div id="root"></div><script type="module" src="./app.jsx"></script>',
);
const maps = {
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
        if (
          source === "./api" &&
          importer?.endsWith("/services/reportFiles.ts")
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
    port: 5216,
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
  await page.goto("http://127.0.0.1:5216/.reports-qa/index.html");
  const main = page.locator("main"),
    button = (name) => main.getByRole("button", { name, exact: true }),
    field = (name) => main.getByLabel(name, { exact: true });
  await main.getByText("Manager access required", { exact: true }).waitFor();
  assert.equal(records.length, 0);
  passed++;
  await page
    .getByRole("button", { name: "Actor manager", exact: true })
    .click();
  await button("Fixture Project").click();
  await field("Start date (YYYY-MM-DD)").fill("2026-11-01");
  await field("End date (YYYY-MM-DD)").fill("2026-11-01");
  await button("Generate summary").click();
  await main.getByText("Employees: 2", { exact: true }).waitFor();
  await main
    .getByText("Approved completed entries: 1", { exact: true })
    .waitFor();
  assert.ok(
    await main
      .getByText("Company timezone: America/Edmonton", { exact: true })
      .count(),
  );
  passed++;
  await button("Share report PDF").click();
  await page.waitForFunction(() => window.qaShares === 1);
  assert.equal(await page.evaluate(() => window.qaPdfPrefix), "%PDF-");
  await page.waitForFunction(
    () => Object.keys(window.qaFiles || {}).length === 0,
  );
  passed++;
  await button("Share timesheet CSV").click();
  await page.waitForFunction(() => window.qaShares === 2);
  await page.waitForFunction(
    () => Object.keys(window.qaFiles || {}).length === 0,
  );
  assert.match(await page.evaluate(() => window.qaDownload), /timesheet.csv/);
  passed++;
  await field("End date (YYYY-MM-DD)").fill("2026-11-02");
  assert.equal(await button("Share report PDF").count(), 0);
  passed++;
  await page.evaluate(() => (window.qaOffline = true));
  const before = records.length;
  await button("Generate summary").click();
  await main
    .getByText("Reconnect before loading or exporting reports.", {
      exact: true,
    })
    .waitFor();
  assert.equal(records.length, before);
  passed++;
  await page.evaluate(() => (window.qaOffline = false));
  await field("Start date (YYYY-MM-DD)").fill("2026-02-30");
  await button("Generate summary").click();
  await main
    .getByText("Choose valid reporting dates.", { exact: true })
    .waitFor();
  passed++;
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main.getByText("Rapports et exports", { exact: true }).waitFor();
  passed++;
  await page.getByRole("button", { name: "Actor worker", exact: true }).click();
  await main.getByText("Accès responsable requis", { exact: true }).waitFor();
  assert.equal(
    await main.getByText("=Fixture Same", { exact: true }).count(),
    0,
  );
  assert.equal(await button("Share report PDF").count(), 0);
  passed++;
  assert.ok(records.every((r) => r.method === "GET"));
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Native Reports component with explicit DOM/files/share adapters, signed JWT, real Express/PGlite and actual PDF/CSV. No physical device or production acceptance.",
    }),
  );
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => api.close(r));
  await rm(dir, { recursive: true, force: true });
  await db.close();
  await pool.end();
}

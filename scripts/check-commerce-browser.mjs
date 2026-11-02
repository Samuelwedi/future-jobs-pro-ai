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
const dir = path.resolve(".commerce-qa"),
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
const fs = await import("node:fs"),
  { readFileSync } = fs;

await db.exec(
  `CREATE TABLE companies(id uuid PRIMARY KEY,name text,address text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,full_name text,email text,phone text);CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,client_id uuid,name text,status text,created_at timestamp default now());CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,project_id uuid,status text,approval_status text,clock_in timestamp,clock_out timestamp,regular_hours numeric,overtime_hours numeric,total_wage numeric);`,
);
const old = fs
  .readFileSync(
    path.join(
      path.resolve("backend/tests"),
      "../scripts/run-railway-migration.js",
    ),
    "utf8",
  )
  .split("const sql = `")[1]
  .split("`;")[0];
await db.exec(
  old.slice(
    old.indexOf("CREATE TABLE IF NOT EXISTS invoices"),
    old.indexOf(
      "-- ============================================================\n-- 4. INDEXES",
    ),
  ) +
    old.slice(
      old.indexOf("CREATE OR REPLACE FUNCTION generate_invoice_number"),
    ),
);
const estimates = fs
  .readFileSync(
    path.join(
      path.resolve("backend/tests"),
      "../scripts/add-progress-invoicing.js",
    ),
    "utf8",
  )
  .split("const sql = `")[1]
  .split("`;")[0];
await db.exec(estimates);
const migration = readFileSync(
  path.join(
    path.resolve("backend/tests"),
    "../migrations/20261101_commercial_documents.sql",
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);
for (const n of [1, 2])
  await query("INSERT INTO companies VALUES($1,$2,$3)", [
    uid(n),
    "Company " + n,
    "Fixture address",
  ]);
for (const [n, c, role, active] of [
  [11, 1, "employee", true],
  [12, 1, "owner", true],
  [13, 1, "manager", true],
  [14, 2, "owner", true],
  [15, 1, "owner", false],
])
  await query(
    "INSERT INTO users VALUES($1,$2,$3,$4,'Pat','Fixture','Pat Fixture','fixture@example.test','')",
    [uid(n), uid(c), role, active],
  );
for (const [n, c] of [
  [21, 1],
  [22, 2],
])
  await query(
    "INSERT INTO projects(id,company_id,client_id,name,status) VALUES($1,$2,$3,'Project','active')",
    [uid(n), uid(c), uid(c === 1 ? 11 : 14)],
  );
pool.query = query;
pool.connect = async () => ({ query, release() {} });
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  records.push({ method: req.method, path: req.url });
  next();
});
app.use(
  ["/invoices", "/api/invoices"],
  require("./dist/routes/invoiceRouter").default,
);
app.use(
  ["/estimates", "/api/estimates"],
  require("./dist/routes/estimateRouter").default,
);
app.get(
  "/api/projects",
  require("./dist/middleware/companyActor").companyActor,
  async (req, res) =>
    res.json({
      success: true,
      projects: (
        await query("SELECT * FROM projects WHERE company_id=$1", [
          res.locals.actor.company_id,
        ])
      ).rows,
    }),
);
app.get(
  "/api/users/company",
  require("./dist/middleware/companyActor").companyActor,
  async (req, res) =>
    res.json({
      success: true,
      users: (
        await query("SELECT * FROM users WHERE company_id=$1", [
          res.locals.actor.company_id,
        ])
      ).rows,
    }),
);
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
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import Commerce from'/mobile/src/screens/CommercialDocumentsScreen.tsx';import WebInvoices from'/web/src/pages/Invoices.tsx';import WebEstimates from'/web/src/pages/Estimates.tsx';function App(){const[actor,setActor]=useState('worker'),[dialog,setDialog]=useState(null),[screen,setScreen]=useState('Native');const{setLang}=useLang();useEffect(()=>{const handler=e=>setDialog(e.detail);window.addEventListener('native-alert',handler);return()=>window.removeEventListener('native-alert',handler)},[]);const C=screen==='Native'?Commerce:screen==='Invoices'?WebInvoices:WebEstimates;return <><nav>{['Native','Invoices','Estimates'].map(s=><button onClick={()=>{localStorage.setItem('token',window.qaTokens.manager);setScreen(s)}}>Screen {s}</button>)}{['worker','manager'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main><C key={screen}/></main>{dialog&&<aside role="dialog"><h2>{dialog.title}</h2><p>{dialog.message}</p>{dialog.buttons.map((b,i)=><button key={i} onClick={()=>{setDialog(null);b.onPress?.()}}>{b.text}</button>)}</aside>}</>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
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
          importer?.endsWith("/services/commercialFiles.ts")
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
    port: 5215,
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
  page.on("response", async (r) => {
    if (r.url().includes("fixture-api") && r.status() >= 400)
      console.log("API_ERROR", r.status(), await r.text());
  });
  await page.goto("http://127.0.0.1:5215/.commerce-qa/index.html");
  const main = page.locator("main"),
    button = (name) => main.getByRole("button", { name, exact: true }),
    field = (name) => main.getByLabel(name, { exact: true }),
    confirm = () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
  await main.getByText("Manager access required", { exact: true }).waitFor();
  assert.equal(records.length, 0);
  passed++;
  await page
    .getByRole("button", { name: "Actor manager", exact: true })
    .click();
  await button("New draft").click();
  await field("Description").fill("Browser native invoice");
  await field("Unit price").fill("100");
  await field("Tax rate (%)").fill("5");
  await button("Save draft").click();
  await main.getByText("CAD 105.00", { exact: false }).first().waitFor();
  const id = (
    await query(
      "SELECT id FROM invoices WHERE notes='' ORDER BY created_at DESC LIMIT 1",
    )
  ).rows[0].id;
  assert.equal(
    (await query("SELECT total FROM invoices WHERE id=$1", [id])).rows[0].total,
    "105.00",
  );
  passed++;
  await button("Edit draft").click();
  await field("Unit price").fill("120");
  await button("Save draft").click();
  await main.getByText("CAD 126.00", { exact: false }).first().waitFor();
  passed++;
  await button("Share PDF").click();
  await page.waitForFunction(() => window.qaShares === 1);
  assert.equal(await page.evaluate(() => window.qaPdfPrefix), "%PDF-");
  await page.waitForFunction(
    () => Object.keys(window.qaFiles || {}).length === 0,
  );
  passed++;
  await button("Record external sharing").click();
  await confirm();
  await field("Payment amount").fill("26");
  await field("Receipt reference").fill("browser-receipt-1");
  await button("Record completed payment").click();
  await confirm();
  await main.getByText(/browser-receipt-1/).waitFor();
  assert.equal(
    (await query("SELECT paid_amount FROM invoices WHERE id=$1", [id])).rows[0]
      .paid_amount,
    "26.00",
  );
  passed++;
  await button("Estimates").click();
  await button("New draft").click();
  await button("USD").click();
  await field("Description").fill("Browser native estimate");
  await field("Unit price").fill("55");
  await button("Save draft").click();
  await button("Record external sharing").click();
  await confirm();
  await field("Acceptance reference").fill("browser-acceptance-1");
  await button("Record acceptance").click();
  await confirm();
  await button("Convert to invoice").click();
  await confirm();
  await main.getByText("converted", { exact: false }).first().waitFor();
  assert.equal(
    (await query("SELECT COUNT(*)::int n FROM invoices")).rows[0].n,
    2,
  );
  passed++;
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main.getByText("Factures et devis", { exact: true }).waitFor();
  passed++;
  await page.getByRole("button", { name: "Language en", exact: true }).click();
  await button("Invoices").click();
  await page.evaluate(() => (window.qaOffline = true));
  const writes = records.filter((r) => r.method !== "GET").length;
  await button("New draft").click();
  await field("Description").fill("Offline draft");
  await field("Unit price").fill("50");
  await button("Save draft").click();
  await main
    .getByText("Reconnect before changing financial records.", { exact: true })
    .waitFor();
  assert.equal(records.filter((r) => r.method !== "GET").length, writes);
  passed++;
  await page.evaluate(() => (window.qaOffline = false));
  await page.getByRole("button", { name: "Actor worker", exact: true }).click();
  await main.getByText("Manager access required", { exact: true }).waitFor();
  assert.equal(await field("Description").count(), 0);
  passed++;
  await page
    .getByRole("button", { name: "Actor manager", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Screen Estimates", exact: true })
    .click();
  await main.getByText("USD 55.00", { exact: true }).waitFor();
  await main
    .getByRole("button", { name: "Create Estimate", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Currency", { exact: true }).click();
  await page.getByRole("option", { name: "USD", exact: true }).click();
  await dialog.getByPlaceholder("Description").fill("Web fixture estimate");
  await dialog.getByPlaceholder("Unit Price").fill("75");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    (await query("SELECT currency FROM estimates WHERE subtotal=75")).rows[0]
      .currency,
    "USD",
  );
  passed++;
  let row = main.getByRole("row").filter({ hasText: "USD 75.00" });
  await row.getByTitle("Edit", { exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Unit Price").fill("80");
  await dialog.getByRole("button", { name: "Update", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await main.getByText("USD 80.00", { exact: true }).waitFor();
  passed++;
  page.on("dialog", (d) => d.accept());
  row = main.getByRole("row").filter({ hasText: "USD 80.00" });
  await row.getByTitle("Record external sharing", { exact: true }).click();
  await row.getByText("Shared externally", { exact: true }).waitFor();
  passed++;
  await page
    .getByRole("button", { name: "Screen Invoices", exact: true })
    .click();
  await main.getByText("CAD 100.00", { exact: true }).waitFor();
  await main
    .getByRole("button", { name: "Create Invoice", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Description").fill("Web fixture invoice");
  await dialog.getByPlaceholder("Unit Price").fill("90");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    (await query("SELECT total FROM invoices WHERE subtotal=90")).rows[0].total,
    "90.00",
  );
  passed++;
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Real native commerce component with DOM/file/share adapters, signed JWTs, Express/PGlite and real PDF. No physical device, email delivery or bank settlement acceptance.",
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

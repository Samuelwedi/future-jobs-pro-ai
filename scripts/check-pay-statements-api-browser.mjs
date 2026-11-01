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
const dir = path.resolve(".pay-statements-api-qa"),
  records = [];
await mkdir(dir, { recursive: true });
process.env.JWT_SECRET = "isolated-browser-employee-statement-secret";
const require = createRequire(path.resolve("backend/package.json"));
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("./dist/config/database");
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const actorIds = { worker: uid(11), cover: uid(12), manager: uid(13) },
  tokens = Object.fromEntries(
    Object.entries(actorIds).map(([key, id]) => [
      key,
      jwt.sign({ id }, process.env.JWT_SECRET),
    ]),
  );
const statementId = uid(31);
await db.exec(
  `CREATE TABLE companies(id uuid PRIMARY KEY,name text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,email text);CREATE TABLE payrolls(id uuid PRIMARY KEY,company_id uuid,period_start date,period_end date,status text,manual_review jsonb);CREATE TABLE payroll_items(id uuid PRIMARY KEY,payroll_id uuid,employee_id uuid,hours numeric,hourly_rate numeric,calculation_snapshot jsonb);CREATE TABLE manual_payroll_payments(payroll_item_id uuid,company_id uuid);`,
);
const query = async (sql, args) => {
  const r = await db.query(sql, args);
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};
pool.query = query;
await query("INSERT INTO companies VALUES($1,$2)", [uid(1), "Test Company"]);
for (const [role, id] of Object.entries(actorIds))
  await query("INSERT INTO users VALUES($1,$2,$3,true,$4,$5,$6)", [
    id,
    uid(1),
    role === "manager" ? "boss" : "employee",
    "Pat",
    "Worker",
    "fixture@example.test",
  ]);
await query(
  "INSERT INTO payrolls VALUES($1,$2,'2026-10-01','2026-10-15','approved',$3)",
  [uid(21), uid(1), {}],
);
for (const [n, actor, net] of [
  [31, "worker", "180.125"],
  [32, "cover", "190.125"],
])
  await query("INSERT INTO payroll_items VALUES($1,$2,$3,10,20,$4)", [
    uid(n),
    uid(21),
    actorIds[actor],
    {
      gross: "200.125",
      net,
      currency: "KWD",
      decimals: 3,
      incomeTax: "20.000",
      payDate: "2026-10-16",
      revision: 1,
      lines: [
        { id: "tax", label: "Local tax", amount: "20.000", category: "tax" },
      ],
    },
  ]);
const app = express();
app.use((req, res, next) => {
  records.push({
    method: req.method,
    path: req.url,
    actor: req.headers["x-test-actor"] || "worker",
  });
  next();
});
app.use("/pay-stubs", require("./dist/routes/payStubRouter").default);
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
  `const tokens=${JSON.stringify(tokens)};window.qaTokens=tokens;const request=async(method,path,body)=>{const r=await fetch('/fixture-api'+path,{method,headers:{'Content-Type':'application/json','x-test-actor':window.qaActor||'worker',Authorization:'Bearer '+tokens[window.qaActor||'worker']},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.message);return data};export const api={getToken:async()=>tokens[window.qaActor||'worker'],get:p=>request('GET',p),post:(p,b)=>request('POST',p,b),put:(p,b)=>request('PUT',p,b),patch:(p,b)=>request('PATCH',p,b),delete:p=>request('DELETE',p)};export const API_URL='/fixture-api';`,
);
await writeFile(
  path.join(dir, "offline.js"),
  `export const checkOnlineStatus=async()=>!window.qaOffline;`,
);
await writeFile(
  path.join(dir, "app.jsx"),
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import WorkPreferences from'/mobile/src/screens/PayStatementsScreen.tsx';function App(){const[actor,setActor]=useState('worker'),[dialog,setDialog]=useState(null);const{setLang}=useLang();useEffect(()=>{const handler=e=>setDialog(e.detail);window.addEventListener('native-alert',handler);return()=>window.removeEventListener('native-alert',handler)},[]);return <><nav>{['worker','cover','manager'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main><WorkPreferences/></main>{dialog&&<aside role="dialog"><h2>{dialog.title}</h2><p>{dialog.message}</p>{dialog.buttons.map((b,i)=><button key={i} onClick={()=>{setDialog(null);b.onPress?.()}}>{b.text}</button>)}</aside>}</>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
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
          importer?.endsWith("/services/payStatement.ts")
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
    port: 5211,
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
  await page.goto("http://127.0.0.1:5211/.pay-statements-api-qa/index.html");
  const main = page.locator("main"),
    button = (name) => main.getByRole("button", { name, exact: true });
  const confirm = async (name) =>
    page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
  await main.getByText("Net pay: 180.125 KWD", { exact: true }).waitFor();
  await main
    .getByText("Reviewed — external payment not recorded", { exact: true })
    .waitFor();
  assert.equal(records[0].actor, "worker");
  passed++;
  await button("Export reviewed pay statement").click();
  await page.waitForFunction(() => window.qaShares === 1);
  assert.equal(
    await page.evaluate(() => window.qaDownload),
    "/fixture-api/pay-stubs/reviewed/" + statementId + "/download",
  );
  assert.equal(await page.evaluate(() => window.qaPdfPrefix), "%PDF-");
  assert.equal(
    await page.evaluate(() => Object.keys(window.qaFiles).length),
    0,
  );
  passed++;
  await page.evaluate(() => (window.qaOffline = true));
  await button("Export reviewed pay statement").click();
  await main
    .getByText("Reconnect before downloading a pay statement.", { exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.qaShares), 1);
  passed++;
  await page.evaluate(() => (window.qaOffline = false));
  await page.route("**/fixture-api/pay-stubs/reviewed", (route) =>
    route.fulfill({
      json: {
        actorId: actorIds.worker,
        companyId: uid(1),
        statements: [{ id: statementId, employee_id: "foreign" }],
      },
    }),
  );
  await button("Refresh").click();
  await main
    .getByText("Your pay statements could not be verified.", { exact: true })
    .waitFor();
  assert.equal(await button("Export reviewed pay statement").count(), 0);
  passed++;
  await page.unroute("**/fixture-api/pay-stubs/reviewed");
  await button("Refresh").click();
  await button("Export reviewed pay statement").waitFor();
  await page.getByRole("button", { name: "Actor cover", exact: true }).click();
  await main.getByText("Net pay: 190.125 KWD", { exact: true }).waitFor();
  assert.equal(
    await main.getByText("Net pay: 180.125 KWD", { exact: true }).count(),
    0,
  );
  assert.equal(records.at(-1).actor, "cover");
  passed++;
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main.getByText("Mes bulletins de paie", { exact: true }).waitFor();
  await main.getByText("Salaire net: 190.125 KWD", { exact: true }).waitFor();
  passed++;
  assert.equal(
    records.some((r) => r.method !== "GET"),
    false,
  );
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Real employee PayStatementsScreen/LanguageContext and PDF helper using explicit native/file adapters, signed fixture JWTs, actual Express routes, PGlite SQL and actual PDF generation: exact amount strings, employee download path, offline refusal, foreign-row rejection, actor switch and French rendering. Not physical-device or production-service acceptance.",
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

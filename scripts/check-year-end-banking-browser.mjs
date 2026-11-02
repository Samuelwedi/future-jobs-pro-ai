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
const dir = path.resolve(".year-end-banking-qa"),
  records = [];
await mkdir(dir, { recursive: true });
process.env.JWT_SECRET = "isolated-year-end-browser-secret";
const require = createRequire(path.resolve("backend/package.json"));
const { PGlite } = require("@electric-sql/pglite"),
  express = require("express"),
  jwt = require("jsonwebtoken"),
  { pool } = require("./dist/config/database");
const {
  ALBERTA_2026,
  previewPayroll,
} = require("./dist/services/payrollRules/engine");
const db = new PGlite(),
  uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const actorIds = { worker: uid(11), cover: uid(12), manager: uid(13) },
  tokens = Object.fromEntries(
    Object.entries(actorIds).map(([key, id]) => [
      key,
      jwt.sign({ id }, process.env.JWT_SECRET),
    ]),
  );
await db.exec(
  `CREATE TABLE companies(id uuid PRIMARY KEY,name text,legal_name text,business_number text,payroll_account_number text,address text,city text,province text,postal_code text,phone text,email text);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,full_name text,email text,sin text,employment_type text,province text);CREATE TABLE payrolls(id uuid PRIMARY KEY,company_id uuid,period_end date,status text,manual_review jsonb);CREATE TABLE payroll_items(id uuid PRIMARY KEY,payroll_id uuid,employee_id uuid,calculation_snapshot jsonb);CREATE TABLE manual_payroll_payments(payroll_item_id uuid,company_id uuid,paid_on date,amount numeric,currency text);CREATE TABLE company_payroll_rule_versions(company_id uuid,revision int,rules jsonb);`,
);
const query = async (sql, args) => {
  const r = await db.query(sql, args);
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });
await query(
  "INSERT INTO companies(id,name,legal_name,business_number,payroll_account_number,province) VALUES($1,'Fixture Company','Fixture Legal','123456789','123456789RP0001','AB')",
  [uid(1)],
);
for (const [actor, id] of Object.entries(actorIds)) {
  const names =
    actor === "worker"
      ? ["Pat", "Worker"]
      : actor === "cover"
        ? ["Lee", "Cover"]
        : ["Morgan", "Manager"];
  await query(
    "INSERT INTO users VALUES($1,$2,$3,true,$4,$5,$6,'fixture@example.test','321654987','EMPLOYEE','AB')",
    [
      id,
      uid(1),
      actor === "manager" ? "boss" : "employee",
      ...names,
      names.join(" "),
    ],
  );
}
const input = {
    payDate: "2026-10-16",
    gross: 2000,
    cppYtd: 0,
    cpp2Ytd: 0,
    eiYtd: 0,
    pensionableYtd: 0,
    additionalTax: 0,
    standardCaseConfirmed: true,
  },
  snapshot = {
    ...previewPayroll(ALBERTA_2026, input),
    rules: ALBERTA_2026,
    input,
    revision: 1,
  };
await query("INSERT INTO payrolls VALUES($1,$2,'2026-10-15','paid',$3)", [
  uid(21),
  uid(1),
  {},
]);
await query("INSERT INTO payroll_items VALUES($1,$2,$3,$4)", [
  uid(31),
  uid(21),
  uid(11),
  snapshot,
]);
await query(
  "INSERT INTO manual_payroll_payments VALUES($1,$2,'2026-10-16',$3,'CAD')",
  [uid(31), uid(1), snapshot.net],
);
await db.exec(
  await (
    await import("node:fs/promises")
  ).readFile(
    "backend/migrations/20261101_reviewed_year_end_archive.sql",
    "utf8",
  ),
);
const batch = {
  id: uid(51),
  payrollId: uid(21),
  status: "settled",
  country: "CA",
  currency: "CAD",
  employeeCount: 1,
  totalFormatted: "1614.73",
};
const payout = {
  getCapabilities: async () => ({
    executionEnabled: true,
    capabilities: [
      {
        country: "CA",
        countryName: "Canada",
        currency: "CAD",
        available: true,
        reason: null,
      },
    ],
  }),
  getSettings: async () => ({
    settings: { country: "CA", currency: "CAD" },
    requiresConfiguration: false,
  }),
  listAccounts: async () => [
    {
      employeeId: uid(11),
      employeeName: "Pat Worker",
      country: "CA",
      currency: "CAD",
      status: "ready",
      destination: {
        configured: true,
        last4: "1234",
        label: "DO-NOT-DISPLAY-RAW-ACCOUNT",
      },
    },
  ],
  listPayrolls: async () => [
    {
      id: uid(21),
      periodStart: "2026-10-01",
      periodEnd: "2026-10-15",
      status: "paid",
      country: "CA",
      currency: "CAD",
      employeeCount: 1,
      totalFormatted: "1614.73",
      eligible: true,
      reason: null,
    },
  ],
  listBatches: async () => [batch],
  getBatch: async () => ({
    batch,
    events: [
      {
        id: uid(61),
        type: "fixture-historical-settlement",
        createdAt: "2026-10-17T12:00:00Z",
      },
    ],
  }),
};
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  records.push({
    method: req.method,
    path: req.url,
    actor: req.headers["x-test-actor"] || "worker",
  });
  next();
});
app.use(["/year-end","/api/year-end"], require("./dist/routes/yearEndRouter").default);
app.use(
  "/payouts",
  require("./dist/routes/payoutRoutes").createPayoutRouter(payout),
);
app.get(
  "/operations/work-options",
  require("./dist/middleware/companyActor").companyActor,
  (req, res) =>
    res.json({
      actorId: res.locals.actor.id,
      companyId: res.locals.actor.company_id,
      manager: ["boss", "owner", "manager", "admin"].includes(
        res.locals.actor.role,
      ),
    }),
);
app.get('/api/users/company',require('./dist/middleware/companyActor').companyActor,async(req,res)=>res.json({success:true,users:(await query('SELECT id,first_name,last_name,employment_type,province FROM users WHERE company_id=$1',[res.locals.actor.company_id])).rows}));
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
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import WorkPreferences from'/mobile/src/screens/YearEndScreen.tsx';import PayoutStatus from'/mobile/src/screens/PayoutStatusScreen.tsx';import WebYearEnd from'/web/src/pages/YearEnd.tsx';function App(){const[actor,setActor]=useState('worker'),[dialog,setDialog]=useState(null),[screen,setScreen]=useState('YearEnd');const{setLang}=useLang();useEffect(()=>{const handler=e=>setDialog(e.detail);window.addEventListener('native-alert',handler);return()=>window.removeEventListener('native-alert',handler)},[]);const Component=screen==='YearEnd'?WorkPreferences:screen==='Web'?WebYearEnd:PayoutStatus;return <><nav>{['YearEnd','Banking','Web'].map(s=><button onClick={()=>setScreen(s)}>Screen {s}</button>)}{['worker','cover','manager'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main><Component key={screen}/></main>{dialog&&<aside role="dialog"><h2>{dialog.title}</h2><p>{dialog.message}</p>{dialog.buttons.map((b,i)=><button key={i} onClick={()=>{setDialog(null);b.onPress?.()}}>{b.text}</button>)}</aside>}</>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
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
    port: 5212,
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
  await page.goto("http://127.0.0.1:5212/.year-end-banking-qa/index.html");
  const main = page.locator("main"),
    button = (name) => main.getByRole("button", { name, exact: true });
  const confirm = async (name) =>
    page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
  await main
    .getByText("Payroll manager access required.", { exact: true })
    .waitFor();
  assert.equal(records.length, 0);
  passed++;
  await page
    .getByRole("button", { name: "Actor manager", exact: true })
    .click();
  await button("Save employer identity").waitFor();
  await main
    .getByLabel("Legal name", { exact: true })
    .fill("Reviewed Browser Company");
  await button("Save employer identity").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await main.getByText("Employer identity saved.", { exact: true }).waitFor();
  assert.equal(
    (await query("SELECT legal_name FROM companies")).rows[0].legal_name,
    "Reviewed Browser Company",
  );
  passed++;
  await button("Pat Worker").click();
  await button("Preview year-end totals").click();
  await main
    .getByText("Box 14 — Employment income: 2000.00 CAD", { exact: true })
    .waitFor();
  assert.equal(await main.getByText(/321654987/).count(), 0);
  assert.equal(
    await button("Store reviewed year-end snapshot").isDisabled(),
    true,
  );
  passed++;
  await main
    .getByLabel("Independent year-end review reference", { exact: true })
    .fill("Independent browser fixture");
  await main
    .getByLabel("Confirm independent year-end review", { exact: true })
    .check();
  await button("Store reviewed year-end snapshot").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await main
    .getByText(
      "Reviewed snapshot stored. No government filing was submitted.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (await query("SELECT count(*)::int n FROM reviewed_year_end_slips")).rows[0]
      .n,
    1,
  );
  passed++;
  await button("Open stored snapshot").click();
  await main
    .getByText("Box 14 — Employment income: 2000.00 CAD", { exact: true })
    .waitFor();
  passed++;
  await button("Preview year-end totals").click();
  await main
    .getByLabel("Independent year-end review reference", { exact: true })
    .fill("Second independent fixture");
  await main
    .getByLabel("Confirm independent year-end review", { exact: true })
    .check();
  await query("UPDATE companies SET legal_name='Changed after preview'");
  await button("Store reviewed year-end snapshot").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await main.getByText(/Payroll or employer details changed/).waitFor();
  assert.equal(
    (await query("SELECT snapshot FROM reviewed_year_end_slips")).rows[0]
      .snapshot.employer.name,
    "Reviewed Browser Company",
  );
  passed++;
  await button("Refresh").click();
  await button("RL1").click();
  await button("Preview year-end totals").click();
  await main
    .getByText(/Quebec QPP\/QPIP and RL-1 mapping are not implemented/)
    .waitFor();
  passed++;
  await page
    .getByRole("button", { name: "Screen Banking", exact: true })
    .click();
  await main.getByText("Historical payout batches", { exact: true }).waitFor();
  await main
    .getByText("Destination configured · •••• 1234", { exact: true })
    .waitFor();
  assert.equal(
    await main.getByText("DO-NOT-DISPLAY-RAW-ACCOUNT", { exact: true }).count(),
    0,
  );
  assert.equal(await button("Execute").count(), 0);
  assert.equal(
    records
      .filter((r) => r.path.startsWith("/payouts"))
      .every((r) => r.method === "GET"),
    true,
  );
  passed++;
  await button("Inspect batch history").click();
  await main.getByText(/fixture-historical-settlement/).waitFor();
  assert.equal(
    records
      .filter((r) => r.path.startsWith("/payouts"))
      .every((r) => r.method === "GET"),
    true,
  );
  passed++;
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main
    .getByText("État bancaire et des versements", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Actor worker", exact: true }).click();
  await main
    .getByText("Accès de responsable de paie requis.", { exact: true })
    .waitFor();
  assert.equal(await main.getByText("Pat Worker", { exact: true }).count(), 0);
  passed++;
  await page.evaluate(token=>localStorage.setItem('token',token),tokens.manager);
  await page.getByRole('button',{name:'Screen Web',exact:true}).click();await main.getByRole('button',{name:'Edit company information',exact:true}).click();await main.getByLabel('Legal name',{exact:true}).fill('Web reviewed employer');await main.getByRole('button',{name:'Save company information',exact:true}).click();await main.getByText('Company payroll identity saved.',{exact:true}).waitFor();assert.equal((await query('SELECT legal_name FROM companies')).rows[0].legal_name,'Web reviewed employer');passed++;
  await main.getByRole('combobox').first().click();await page.getByRole('option',{name:/Pat Worker/}).click();await main.getByRole('button',{name:'Preview',exact:true}).click();await main.getByText('T4 – Statement of Remuneration Paid',{exact:true}).waitFor();assert.equal(await main.getByRole('button',{name:'Finalize',exact:true}).isDisabled(),true);await main.getByLabel('Independent year-end review reference',{exact:true}).fill('Independent web fixture');await main.getByRole('checkbox',{name:'I independently reviewed all annual payments and form amounts. Store this snapshot; no government filing is submitted.',exact:true}).check();page.on('dialog',dialog=>dialog.accept());await main.getByRole('button',{name:'Finalize',exact:true}).click();await main.getByText('This slip was finalized from the recorded payroll totals.',{exact:true}).waitFor();assert.equal((await query('SELECT snapshot FROM reviewed_year_end_slips')).rows[0].snapshot.employer.name,'Web reviewed employer');passed++;
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Real native YearEnd/PayoutStatus screens with native-to-DOM adapters. Year-end uses signed fixture JWTs, actual Express routes, PGlite and the real compiler/migration, including changed-preview rejection and archive freezing. Banking uses actual read-only payout routes with fixture orchestration; no provider execution or bank settlement was performed. The real web YearEnd/MUI flow also saves initially nullable employer fields, previews and finalizes through the actual API. Not physical-device or production acceptance.",
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

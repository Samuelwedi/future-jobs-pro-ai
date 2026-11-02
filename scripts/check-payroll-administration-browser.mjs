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
const dir = path.resolve(".payroll-admin-qa"),
  records = [];
await mkdir(dir, { recursive: true });
const settings = {
  payroll_schedule: "weekly",
  payroll_day: 5,
  payroll_time: "09:00",
  default_hourly_rate: "20",
  overtime_multiplier: "1.5",
  tax_rate: "15",
};
const employees = [
  {
    id: "a",
    first_name: "Pat",
    last_name: "Worker",
    current_rate: "20.00",
    history: [{ effective_date: "2026-01-01", hourly_rate: "20.00" }],
  },
  {
    id: "b",
    first_name: "Lee",
    last_name: "Cover",
    current_rate: "30.00",
    history: [{ effective_date: "2026-01-01", hourly_rate: "30.00" }],
  },
];
let ambiguous = true;
const api = httpServer(async (req, res) => {
  let raw = "";
  for await (const part of req) raw += part;
  const data = raw ? JSON.parse(raw) : undefined;
  const actor = req.headers["x-test-actor"] || "worker";
  records.push({ method: req.method, path: req.url, data, actor });
  let out = { success: true };
  if (req.url === "/operations/work-options")
    out = {
      actorId: actor,
      companyId: "company",
      manager: actor === "manager",
      timezone: "America/Edmonton",
    };
  else if (req.url === "/payroll-rules")
    out = { current: { rules: { currency: "CAD" } } };
  else if (
    req.url === "/payroll/employees/compensation" &&
    req.method === "GET"
  )
    out = { employees };
  else if (req.url === "/payroll/settings" && req.method === "GET")
    out = { settings };
  else if (req.url === "/payroll/settings" && req.method === "PUT")
    Object.assign(settings, data);
  else if (req.url === "/payroll/employees/rate") {
    const p = employees.find((p) => p.id === data.employeeId);
    p.current_rate = Number(data.hourlyRate).toFixed(2);
    p.history.unshift({
      effective_date: data.effectiveDate,
      hourly_rate: p.current_rate,
    });
    if (ambiguous) {
      ambiguous = false;
      res.statusCode = 503;
      out = { message: "Connection interrupted after saving rate" };
    }
  } else if (
    req.url === "/payroll/employees/compensation" &&
    req.method === "POST"
  ) {
    for (const p of employees.filter((p) => data.employeeIds.includes(p.id))) {
      p.current_rate = (
        data.raiseType === "percentage"
          ? Number(p.current_rate) * (1 + data.raiseValue / 100)
          : Number(p.current_rate) + data.raiseValue
      ).toFixed(2);
      p.history.unshift({
        effective_date: data.effectiveDate,
        hourly_rate: p.current_rate,
      });
    }
  } else if (req.url === "/payroll/what-if")
    out = { currentTotal: 2000, projectedTotal: 2100, delta: 100 };
  else {
    res.statusCode = 404;
    out = { message: "Unexpected fixture request" };
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(out));
});
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
  `export const useAuth=()=>({user:{id:window.qaActor||'worker',companyId:'company',role:window.qaActor==='manager'?'boss':'employee'}});`,
);
await writeFile(
  path.join(dir, "storage.js"),
  `export default {getItem:async k=>localStorage.getItem(k),setItem:async(k,v)=>localStorage.setItem(k,v)};`,
);
await writeFile(
  path.join(dir, "expo.jsx"),
  `import React from'react';export const MaterialIcons=({name})=>React.createElement('span',null,name);export const useSafeAreaInsets=()=>({top:0,bottom:0});export const getLocales=()=>[{languageTag:'en-CA'}];export const getDocumentAsync=async()=>({canceled:true});export const cacheDirectory='file:///fixture/';export const isAvailableAsync=async()=>true;export const shareAsync=async()=>{window.qaShares=(window.qaShares||0)+1};export const downloadAsync=async()=>({status:200,headers:{'Content-Type':'application/pdf'}});export const getInfoAsync=async()=>({exists:true,size:1024});export const deleteAsync=async()=>{};export const EncodingType={UTF8:'utf8'};export const writeAsStringAsync=async()=>{};`,
);
await writeFile(
  path.join(dir, "api.js"),
  `const request=async(method,path,body)=>{const r=await fetch('/fixture-api'+path,{method,headers:{'Content-Type':'application/json','x-test-actor':window.qaActor||'worker'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.message);return data};export const api={getToken:async()=>'fixture-token',get:p=>request('GET',p),post:(p,b)=>request('POST',p,b),put:(p,b)=>request('PUT',p,b),patch:(p,b)=>request('PATCH',p,b),delete:p=>request('DELETE',p)};export const API_URL='/fixture-api';`,
);
await writeFile(
  path.join(dir, "offline.js"),
  `export const checkOnlineStatus=async()=>!window.qaOffline;`,
);
await writeFile(
  path.join(dir, "app.jsx"),
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import WorkPreferences from'/mobile/src/screens/PayrollAdministrationScreen.tsx';function App(){const[actor,setActor]=useState('worker'),[dialog,setDialog]=useState(null);const{setLang}=useLang();useEffect(()=>{const handler=e=>setDialog(e.detail);window.addEventListener('native-alert',handler);return()=>window.removeEventListener('native-alert',handler)},[]);return <><nav>{['worker','cover','manager'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main><WorkPreferences/></main>{dialog&&<aside role="dialog"><h2>{dialog.title}</h2><p>{dialog.message}</p>{dialog.buttons.map((b,i)=><button key={i} onClick={()=>{setDialog(null);b.onPress?.()}}>{b.text}</button>)}</aside>}</>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
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
    port: 5209,
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
  await page.goto("http://127.0.0.1:5209/.payroll-admin-qa/index.html");
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
  await button("Save payroll settings").waitFor();
  await main
    .getByText("Company timezone: America/Edmonton", { exact: false })
    .waitFor();
  await main.getByLabel("Default hourly rate", { exact: true }).fill("22.50");
  await button("Save payroll settings").click();
  assert.equal(settings.default_hourly_rate, "20");
  await confirm("Cancel");
  await button("Save payroll settings").click();
  await confirm("Confirm");
  await main.getByText("Payroll settings saved.", { exact: true }).waitFor();
  assert.equal(settings.default_hourly_rate, 22.5);
  passed++;
  await main.getByLabel("Pat Worker", { exact: true }).click();
  await main.getByText("Rate history", { exact: true }).waitFor();
  await main.getByLabel("Compensation value", { exact: true }).fill("23.45");
  await main
    .getByLabel("Effective date (YYYY-MM-DD)", { exact: true })
    .fill("2026-10-01");
  await button("Save compensation change").click();
  await confirm("Confirm");
  await main.getByText(/Connection interrupted after saving rate/).waitFor();
  assert.equal(await button("Save compensation change").count(), 0);
  await button("Refresh").click();
  await main.getByText("2026-10-01 · 23.45 CAD", { exact: true }).waitFor();
  assert.equal(
    records.filter((r) => r.path === "/payroll/employees/rate").length,
    1,
  );
  passed++;
  await main.getByLabel("Lee Cover", { exact: true }).click();
  await main.getByLabel("Compensation value", { exact: true }).fill("25");
  await main
    .getByLabel("Effective date (YYYY-MM-DD)", { exact: true })
    .fill("2026-10-02");
  await button("Save compensation change").click();
  await main
    .getByText("An exact rate requires exactly one employee.", { exact: true })
    .waitFor();
  assert.equal(
    records.filter((r) => r.path === "/payroll/employees/rate").length,
    1,
  );
  passed++;
  await button("Percentage raise").click();
  await main.getByLabel("Compensation value", { exact: true }).fill("5");
  await button("Save compensation change").click();
  await confirm("Confirm");
  await main.getByText("Compensation change saved.", { exact: true }).waitFor();
  const raise = records.find(
    (r) => r.method === "POST" && r.path === "/payroll/employees/compensation",
  ).data;
  assert.deepEqual(raise.employeeIds, ["a", "b"]);
  assert.equal(raise.raiseType, "percentage");
  assert.equal(raise.raiseValue, 5);
  passed++;
  const histories = employees.map((p) => p.history.length);
  await main.getByLabel("Scenario value", { exact: true }).fill("5");
  await button("Preview cost scenario").click();
  await main
    .getByText("Projected 40-hour estimate: 2100 CAD", { exact: true })
    .waitFor();
  assert.deepEqual(
    employees.map((p) => p.history.length),
    histories,
  );
  assert.equal(
    records.find((r) => r.path === "/payroll/what-if").data.scenarioType,
    "raise_percent",
  );
  passed++;
  const writes = records.filter((r) => r.method !== "GET").length;
  await page.evaluate(() => (window.qaOffline = true));
  await button("Save payroll settings").click();
  await confirm("Confirm");
  await main.getByText(/Payroll requires a connection/).waitFor();
  assert.equal(records.filter((r) => r.method !== "GET").length, writes);
  passed++;
  await page.evaluate(() => (window.qaOffline = false));
  await button("Refresh").click();
  await button("Save payroll settings").waitFor();
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main.getByText("Administration de la paie", { exact: true }).waitFor();
  passed++;
  await page.route("**/fixture-api/operations/work-options", (route) =>
    route.fulfill({
      json: {
        actorId: "manager",
        companyId: "foreign",
        manager: true,
        timezone: "UTC",
      },
    }),
  );
  await button("Actualiser").click();
  await main
    .getByText(
      "Impossible de vérifier les dossiers de paie. Actualisez avant de continuer.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await main.getByLabel("Pat Worker", { exact: true }).count(), 0);
  passed++;
  await page.unroute("**/fixture-api/operations/work-options");
  await page.getByRole("button", { name: "Actor worker", exact: true }).click();
  await main
    .getByText("Accès de responsable de paie requis.", { exact: true })
    .waitFor();
  assert.equal(await main.getByLabel("Pat Worker", { exact: true }).count(), 0);
  passed++;
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Real PayrollAdministrationScreen/LanguageContext with explicit native-to-DOM adapters and synthetic HTTP records. Manager gate, confirmed settings, effective-rate history, ambiguous response reconciliation, exact-rate selection guard, bulk raises, read-only cost preview, offline refusal, French rendering, company-response mismatch and account isolation. Not deployed API, physical-device or live payroll acceptance.",
    }),
  );
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => api.close(r));
  await rm(dir, { recursive: true, force: true });
}

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
const dir = path.resolve(".manual-payroll-qa"),
  records = [];
await mkdir(dir, { recursive: true });
let runs = [],
  items = [],
  worldwide = false,
  ambiguousPayment = true;
const runId = "11111111-1111-4111-8111-111111111111",
  itemId = "22222222-2222-4222-8222-222222222222";
const api = httpServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const data = raw ? JSON.parse(raw) : undefined;
  const actor = req.headers["x-test-actor"] || "worker";
  records.push({ method: req.method, path: req.url, data, actor });
  const rules = worldwide
    ? {
        engine: "company_rules_v1",
        country: "JP",
        subdivision: "Tokyo",
        currency: "JPY",
        lines: [
          { id: "tax", label: "Local tax", method: "manual", annualCap: null },
          {
            id: "pension",
            label: "Pension",
            method: "percentage",
            annualCap: 10000,
          },
        ],
      }
    : { country: "CA", subdivision: "AB", currency: "CAD" };
  let out = { success: true };
  if (req.url === "/operations/work-options")
    out = { actorId: actor, manager: actor === "manager" };
  else if (req.url === "/payroll-rules")
    out = { current: { revision: worldwide ? 2 : 1, rules } };
  else if (req.url === "/payroll" && req.method === "GET")
    out = { payrolls: runs };
  else if (req.url === "/payroll/generate") {
    runs = [
      {
        id: runId,
        company_id: "company",
        period_start: data.periodStart,
        period_end: data.periodEnd,
        status: "draft",
      },
    ];
    items = [
      {
        id: itemId,
        first_name: "Pat",
        last_name: "Worker",
        hours: "10",
        hourly_rate: "20",
        adjustments: "0",
        cpp_deduction: "0",
        ei_deduction: "0",
        tax_deduction: "0",
      },
    ];
    out = { payrollId: runId };
  } else if (req.url === "/manual-payroll/" + runId && req.method === "GET")
    out = { payroll: runs[0], items };
  else if (req.url === "/payroll/" + runId && req.method === "PUT")
    runs[0].notes = data.notes;
  else if (req.url.endsWith("/calculate"))
    items[0].calculation_snapshot = {
      gross: String(data.input.gross),
      net: worldwide ? "150" : "160.00",
      currency: rules.currency,
      payDate: data.input.payDate,
      incomeTax: "20",
      cpp: "10",
      cpp2: "0",
      ei: "10",
      classification: "custom_rules_review_required",
      ...(worldwide
        ? {
            lines: [
              { id: "tax", label: "Local tax", category: "tax", amount: "50" },
            ],
          }
        : {}),
    };
  else if (req.url.endsWith("/review")) runs[0].status = "approved";
  else if (req.url.endsWith("/record-payment")) {
    items[0].payment_reference = data.reference;
    items[0].paid_on = data.paidOn;
    runs[0].status = "paid";
    if (ambiguousPayment) {
      ambiguousPayment = false;
      res.statusCode = 503;
      out = { message: "Connection interrupted after recording" };
    }
  } else if (req.url === "/payroll/" + runId && req.method === "DELETE") {
    runs = [];
    items = [];
  } else {
    res.statusCode = 404;
    out = { message: "Unexpected fixture request" };
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(out));
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
await writeFile(
  path.join(dir, "native.jsx"),
  `import React from 'react';const style=x=>Array.isArray(x)?Object.assign({},...x.filter(Boolean)):x;const view=tag=>({children,style:s,onPress,disabled,accessibilityLabel,...p})=>React.createElement(tag,{style:style(s),onClick:onPress,disabled,'aria-label':accessibilityLabel},children);export const View=view('div'),Text=view('span'),ScrollView=view('div'),TouchableOpacity=view('button');export const TextInput=({value,onChangeText,placeholder,multiline,style:s,accessibilityLabel,editable})=>React.createElement(multiline?'textarea':'input',{value,onChange:e=>onChangeText?.(e.target.value),placeholder,'aria-label':accessibilityLabel,disabled:editable===false,style:style(s)});export const StyleSheet={create:x=>x};export const ActivityIndicator=()=>React.createElement('span',null,'Loading');export const RefreshControl=()=>null;const node=x=>typeof x==='function'?React.createElement(x):x;export const FlatList=({data=[],renderItem,ListEmptyComponent})=>React.createElement('div',null,data.length?data.map((item,index)=>React.createElement(React.Fragment,{key:item.id||index},renderItem({item,index}))):node(ListEmptyComponent));export const SectionList=({sections=[],renderItem,renderSectionHeader,ListEmptyComponent})=>React.createElement('div',null,...sections.map((section,i)=>React.createElement('div',{key:i},renderSectionHeader({section}),...section.data.map((item,j)=>React.createElement(React.Fragment,{key:item.id||j},renderItem({item,index:j}))))),sections.every(s=>!s.data.length)?node(ListEmptyComponent):null);export const AdaptiveModal=({visible,children})=>visible?React.createElement('div',{role:'dialog'},children):null;export const Linking={openURL:()=>{}};export const Alert={alert:(title,message,buttons=[])=>window.dispatchEvent(new CustomEvent('native-alert',{detail:{title,message,buttons}}))};export const Switch=({value,onValueChange,accessibilityLabel,disabled})=>React.createElement('input',{type:'checkbox',checked:value,onChange:e=>onValueChange(e.target.checked),'aria-label':accessibilityLabel,disabled});export const Platform={OS:'web'};`,
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
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import WorkPreferences from'/mobile/src/screens/ManualPayrollScreen.tsx';function App(){const[actor,setActor]=useState('worker'),[dialog,setDialog]=useState(null);const{setLang}=useLang();useEffect(()=>{const handler=e=>setDialog(e.detail);window.addEventListener('native-alert',handler);return()=>window.removeEventListener('native-alert',handler)},[]);return <><nav>{['worker','cover','manager'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main><WorkPreferences/></main>{dialog&&<aside role="dialog"><h2>{dialog.title}</h2><p>{dialog.message}</p>{dialog.buttons.map((b,i)=><button key={i} onClick={()=>{setDialog(null);b.onPress?.()}}>{b.text}</button>)}</aside>}</>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
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
    port: 5208,
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
  await page.goto("http://127.0.0.1:5208/.manual-payroll-qa/index.html");
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
  await button("Prepare draft").waitFor();
  await main.getByLabel("Period start (YYYY-MM-DD)").fill("2026-11-01");
  await main.getByLabel("Period end (YYYY-MM-DD)").fill("2026-11-07");
  await button("Prepare draft").click();
  assert.equal(runs.length, 0);
  await confirm("Cancel");
  await button("Prepare draft").click();
  await confirm("Confirm");
  await main.getByText("Payroll details", { exact: true }).waitFor();
  assert.equal(runs[0].status, "draft");
  passed++;
  await main
    .getByLabel("Payroll notes", { exact: true })
    .fill("Reviewed hours {amount}");
  await button("Save draft notes").click();
  await main.getByText("Draft notes saved.", { exact: true }).waitFor();
  assert.equal(runs[0].notes, "Reviewed hours {amount}");
  passed++;
  await main.getByRole("button", { name: /Pat Worker/ }).click();
  await main.getByLabel("Pay date", { exact: true }).fill("2026-11-07");
  await main.getByLabel("Confirm calculation scope", { exact: true }).check();
  await button("Calculate and save for review").click();
  await main
    .getByText(
      "Enter every required amount, including zero where appropriate.",
      { exact: true },
    )
    .waitFor();
  assert.equal(records.filter((r) => r.path.endsWith("/calculate")).length, 0);
  passed++;
  for (const name of [
    "CPP already deducted this year",
    "CPP2 already deducted this year",
    "EI already deducted this year",
    "Pensionable earnings already paid this year",
    "Additional income tax",
  ])
    await main.getByLabel(name, { exact: true }).fill("0");
  await button("Calculate and save for review").click();
  await confirm("Confirm");
  await main.getByText("Saved calculation", { exact: true }).waitFor();
  assert.equal(
    records.find((r) => r.path.endsWith("/calculate")).data.input
      .standardCaseConfirmed,
    true,
  );
  assert.equal(items[0].calculation_snapshot.net, "160.00");
  passed++;
  await main
    .getByLabel("Independent payroll review reference", { exact: true })
    .fill("independent-review-001");
  await main
    .getByLabel("Confirm independent payroll review", { exact: true })
    .check();
  await button("Approve reviewed payroll").click();
  await confirm("Confirm");
  await button("Record external payment").waitFor();
  await button("Export reviewed pay statement").click();
  await main
    .getByText("Pay statement sharing closed.", { exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.qaShares), 1);
  passed++;
  assert.equal(runs[0].status, "approved");
  assert.equal(
    records.some((r) => r.path.endsWith("/record-payment")),
    false,
  );
  passed++;
  await main
    .getByLabel("Bank payment reference (no account numbers)", { exact: true })
    .fill("bank-confirmed-001");
  await main
    .getByLabel("Confirm external bank payment", { exact: true })
    .check();
  await button("Record external payment").click();
  await confirm("Confirm");
  await main.getByText(/Connection interrupted after recording/).waitFor();
  assert.equal(await button("Record external payment").count(), 0);
  await button("Refresh").click();
  await main
    .getByText(/External payment recorded: bank-confirmed-001/)
    .waitFor();
  assert.equal(
    records.filter((r) => r.path.endsWith("/record-payment")).length,
    1,
  );
  assert.equal(
    records.find((r) => r.path.endsWith("/record-payment")).data.amount,
    "160.00",
  );
  passed++;
  await page.getByRole("button", { name: "Actor worker", exact: true }).click();
  await main
    .getByText("Payroll manager access required.", { exact: true })
    .waitFor();
  assert.equal(await main.getByText(/bank-confirmed-001/).count(), 0);
  passed++;
  worldwide = true;
  await page
    .getByRole("button", { name: "Actor manager", exact: true })
    .click();
  await button("Prepare draft").waitFor();
  await main.getByLabel("Period start (YYYY-MM-DD)").fill("2026-11-08");
  await main.getByLabel("Period end (YYYY-MM-DD)").fill("2026-11-14");
  await button("Prepare draft").click();
  await confirm("Confirm");
  await main.getByRole("button", { name: /Pat Worker/ }).click();
  await main.getByLabel("Pay date", { exact: true }).fill("2026-11-14");
  await main.getByLabel("Taxable wages", { exact: true }).fill("200");
  await main
    .getByLabel("Input review reference", { exact: true })
    .fill("japan-input-001");
  await main
    .getByLabel("Independently reviewed amount", { exact: true })
    .fill("50");
  await main.getByLabel("Prior YTD contribution", { exact: true }).fill("100");
  await main.getByLabel("Confirm calculation scope", { exact: true }).check();
  await button("Calculate and save for review").click();
  await confirm("Confirm");
  await main.getByText("Local tax (tax): 50 JPY", { exact: true }).waitFor();
  const last = records.filter((r) => r.path.endsWith("/calculate")).at(-1).data;
  assert.deepEqual(last.input.manualAmounts, { tax: 50 });
  assert.deepEqual(last.input.ytd, { pension: 100 });
  assert.equal(last.rulesRevision, 2);
  passed++;
  const before = records.filter((r) => r.method !== "GET").length;
  await page.evaluate(() => (window.qaOffline = true));
  await button("Delete draft").click();
  await confirm("Confirm");
  await main.getByText(/Payroll requires a connection/).waitFor();
  assert.equal(records.filter((r) => r.method !== "GET").length, before);
  passed++;
  await page.evaluate(() => (window.qaOffline = false));
  await button("Refresh").click();
  await button("Delete draft").waitFor();
  await button("Delete draft").click();
  await confirm("Confirm");
  await main.getByText("No payroll runs.", { exact: true }).waitFor();
  assert.equal(runs.length, 0);
  passed++;
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main.getByText("Paie et paiements manuels", { exact: true }).waitFor();
  passed++;
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Actual ManualPayrollScreen/LanguageContext with native-to-DOM adapters and synthetic HTTP state: manager-only access, draft confirmation/notes, required YTD, calculation, independent approval, ambiguous payment reconciliation, actor switch, worldwide inputs, offline refusal, draft deletion, PDF export and French rendering. Not deployed API, tax certification or physical native acceptance.",
    }),
  );
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => api.close(r));
  await rm(dir, { recursive: true, force: true });
}

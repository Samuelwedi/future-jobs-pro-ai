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
const dir = path.resolve(".work-preferences-qa"),
  records = [];
await mkdir(dir, { recursive: true });
let availability = [],
  swaps = [];
const swapId = "11111111-1111-4111-8111-111111111111";
const api = httpServer(async (req, res) => {
  let raw = "";
  for await (const part of req) raw += part;
  const data = raw ? JSON.parse(raw) : undefined;
  const actor = req.headers["x-test-actor"] || "worker";
  records.push({ method: req.method, path: req.url, data, actor });
  const people = [
    { id: "worker", name: "Pat Worker" },
    { id: "cover", name: "Lee Cover" },
    { id: "manager", name: "Morgan Manager" },
  ];
  const shift = {
    id: "shift",
    name: "Delivery route",
    date: "2026-12-01",
    start_time: "09:00:00",
    end_time: "17:00:00",
  };
  let out = { success: true };
  if (req.url === "/operations/work-options")
    out = {
      actorId: actor,
      manager: actor === "manager",
      timezone: "America/Edmonton",
      people,
      shifts: actor === "worker" ? [shift] : [],
    };
  else if (req.url === "/operations/availability" && req.method === "GET")
    out = availability;
  else if (req.url === "/operations/availability" && req.method === "POST")
    availability.push({
      id: "absence",
      user_id: actor,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
    });
  else if (
    req.url === "/operations/availability/absence" &&
    req.method === "DELETE"
  )
    availability = [];
  else if (req.url === "/operations/swaps" && req.method === "GET")
    out = swaps.filter(
      (s) => actor === "manager" || [s.from_user, s.to_user].includes(actor),
    );
  else if (req.url === "/operations/swaps" && req.method === "POST")
    swaps.push({
      id: swapId,
      shift_id: data.shiftId,
      from_user: actor,
      to_user: data.toUser,
      status: "pending",
      shift_name: shift.name,
      shift_date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
    });
  else if (req.url.endsWith("/respond")) swaps[0].status = data.status;
  else if (req.url.endsWith("/approve")) swaps[0].status = "approved";
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(out));
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
await writeFile(
  path.join(dir, "native.jsx"),
  `import React from 'react';const style=x=>Array.isArray(x)?Object.assign({},...x.filter(Boolean)):x;const view=tag=>({children,style:s,onPress,disabled,accessibilityLabel,...p})=>React.createElement(tag,{style:style(s),onClick:onPress,disabled,'aria-label':accessibilityLabel},children);export const View=view('div'),Text=view('span'),ScrollView=view('div'),TouchableOpacity=view('button');export const TextInput=({value,onChangeText,placeholder,multiline,style:s,accessibilityLabel,editable})=>React.createElement(multiline?'textarea':'input',{value,onChange:e=>onChangeText?.(e.target.value),placeholder,'aria-label':accessibilityLabel,disabled:editable===false,style:style(s)});export const StyleSheet={create:x=>x};export const ActivityIndicator=()=>React.createElement('span',null,'Loading');export const RefreshControl=()=>null;const node=x=>typeof x==='function'?React.createElement(x):x;export const FlatList=({data=[],renderItem,ListEmptyComponent})=>React.createElement('div',null,data.length?data.map((item,index)=>React.createElement(React.Fragment,{key:item.id||index},renderItem({item,index}))):node(ListEmptyComponent));export const SectionList=({sections=[],renderItem,renderSectionHeader,ListEmptyComponent})=>React.createElement('div',null,...sections.map((section,i)=>React.createElement('div',{key:i},renderSectionHeader({section}),...section.data.map((item,j)=>React.createElement(React.Fragment,{key:item.id||j},renderItem({item,index:j}))))),sections.every(s=>!s.data.length)?node(ListEmptyComponent):null);export const AdaptiveModal=({visible,children})=>visible?React.createElement('div',{role:'dialog'},children):null;export const Linking={openURL:()=>{}};export const Alert={alert:(title,message,buttons=[])=>window.dispatchEvent(new CustomEvent('native-alert',{detail:{title,message,buttons}}))};export const Platform={OS:'web'};`,
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
  `import React from'react';export const MaterialIcons=({name})=>React.createElement('span',null,name);export const useSafeAreaInsets=()=>({top:0,bottom:0});export const getLocales=()=>[{languageTag:'en-CA'}];export const getDocumentAsync=async()=>({canceled:true});export const cacheDirectory='';export const isAvailableAsync=async()=>false;export const shareAsync=async()=>{};export const EncodingType={UTF8:'utf8'};export const writeAsStringAsync=async()=>{};`,
);
await writeFile(
  path.join(dir, "api.js"),
  `const request=async(method,path,body)=>{const r=await fetch('/fixture-api'+path,{method,headers:{'Content-Type':'application/json','x-test-actor':window.qaActor||'worker'},body:body===undefined?undefined:JSON.stringify(body)});return r.json()};export const api={get:p=>request('GET',p),post:(p,b)=>request('POST',p,b),put:(p,b)=>request('PUT',p,b),patch:(p,b)=>request('PATCH',p,b),delete:p=>request('DELETE',p)};export const API_URL='/fixture-api';`,
);
await writeFile(
  path.join(dir, "offline.js"),
  `export const checkOnlineStatus=async()=>!window.qaOffline;`,
);
await writeFile(
  path.join(dir, "app.jsx"),
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import WorkPreferences from'/mobile/src/screens/WorkPreferencesScreen.tsx';function App(){const[actor,setActor]=useState('worker'),[dialog,setDialog]=useState(null);const{setLang}=useLang();useEffect(()=>{const handler=e=>setDialog(e.detail);window.addEventListener('native-alert',handler);return()=>window.removeEventListener('native-alert',handler)},[]);return <><nav>{['worker','cover','manager'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main><WorkPreferences/></main>{dialog&&<aside role="dialog"><h2>{dialog.title}</h2><p>{dialog.message}</p>{dialog.buttons.map((b,i)=><button key={i} onClick={()=>{setDialog(null);b.onPress?.()}}>{b.text}</button>)}</aside>}</>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
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
      resolveId(source) {
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
    port: 5207,
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
  await page.goto("http://127.0.0.1:5207/.work-preferences-qa/index.html");
  const main = page.locator("main"),
    button = (name) => main.getByRole("button", { name, exact: true });
  const confirm = async (name) =>
    page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
  await button("Save unavailability").waitFor();
  await main
    .getByLabel("From (ISO date/time with timezone)")
    .fill("2026-12-02T08:00:00-07:00");
  await main
    .getByLabel("Until (ISO date/time with timezone)")
    .fill("2026-12-02T17:00:00-07:00");
  await button("Save unavailability").click();
  assert.equal(availability.length, 0);
  await confirm("Cancel");
  await button("Save unavailability").click();
  await confirm("Save");
  await button("Remove unavailability").waitFor();
  assert.equal(availability[0].starts_at, "2026-12-02T15:00:00.000Z");
  assert.deepEqual(
    Object.keys(records.find((r) => r.method === "POST").data).sort(),
    ["endsAt", "startsAt"],
  );
  passed++;
  await button("Remove unavailability").click();
  await confirm("Remove");
  await main
    .getByText("No unavailability recorded.", { exact: true })
    .waitFor();
  passed++;
  await main.getByRole("button", { name: /Delivery route/ }).click();
  await button("Lee Cover").click();
  await button("Request cover").click();
  await confirm("Request cover");
  await main.getByText(/Pat Worker → Lee Cover/).waitFor();
  assert.equal(swaps[0].status, "pending");
  assert.equal(await button("Accept").count(), 0);
  passed++;
  await page.getByRole("button", { name: "Actor cover", exact: true }).click();
  await button("Accept").waitFor();
  await button("Accept").click();
  await main.getByText(/Awaiting manager approval/).waitFor();
  assert.equal(await button("Approve replacement").count(), 0);
  assert.equal(swaps[0].status, "accepted");
  passed++;
  await page
    .getByRole("button", { name: "Actor manager", exact: true })
    .click();
  await button("Approve replacement").click();
  await confirm("Approve");
  await main.getByText("Replacement approved.", { exact: true }).waitFor();
  assert.equal(
    records.find((r) => r.path.endsWith("/approve")).data.requestKey,
    "mobile-cover-approve:" + swapId,
  );
  passed++;
  await page.getByRole("button", { name: "Actor worker", exact: true }).click();
  await button("Save unavailability").waitFor();
  await main
    .getByLabel("From (ISO date/time with timezone)")
    .fill("2026-12-03T08:00:00-07:00");
  await main
    .getByLabel("Until (ISO date/time with timezone)")
    .fill("2026-12-03T09:00:00-07:00");
  const writes = records.filter((r) => r.method !== "GET").length;
  await page.evaluate(() => (window.qaOffline = true));
  await button("Save unavailability").click();
  await confirm("Save");
  await main.getByText(/Reconnect before making changes/).waitFor();
  assert.equal(records.filter((r) => r.method !== "GET").length, writes);
  passed++;
  await page.evaluate(() => (window.qaOffline = false));
  await button("Refresh").click();
  await button("Save unavailability").waitFor();
  await page.getByRole("button", { name: "Language es", exact: true }).click();
  await main
    .getByText("Disponibilidad y reemplazos", { exact: true })
    .waitFor();
  passed++;
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Real WorkPreferencesScreen and LanguageContext through explicit native-to-DOM adapters and synthetic HTTP records. Confirmation, UTC payload, removal, worker request, recipient response, manager approval, offline write prevention and Spanish rendering. Not physical-device or deployed API acceptance.",
    }),
  );
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => api.close(r));
  await rm(dir, { recursive: true, force: true });
}

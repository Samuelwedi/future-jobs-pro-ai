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
const dir = path.resolve(".work-locale-qa"),
  records = [];
await mkdir(dir, { recursive: true });
const api = httpServer(async (req, res) => {
  let body = "";
  for await (const part of req) body += part;
  const data = body ? JSON.parse(body) : undefined;
  records.push({ method: req.method, path: req.url, data });
  let out = { success: true };
  const project = {
    id: "project",
    name: "Projects",
    client_name: "Client {count}",
    address: "1 Test Street",
    status: "active",
  };
  const shift = {
    id: "shift",
    name: "Night Shift",
    project_id: "project",
    project_name: "Projects",
    date: "2026-10-31",
    start_time: "09:00",
    end_time: "17:00",
    assigned_user_ids: ["owner"],
  };
  if (req.url.startsWith("/projects")) out = { projects: [project] };
  else if (req.url.startsWith("/team/members"))
    out = {
      members: [
        {
          id: "owner",
          first_name: "Calendar",
          last_name: "Tasks",
          role: "boss",
        },
      ],
    };
  else if (req.url.startsWith("/schedule/"))
    out = req.method === "GET" ? { shifts: [shift] } : { success: true };
  else if (req.url.startsWith("/time-entries"))
    out = {
      timezone: "America/Edmonton",
      entries: [
        {
          id: "entry",
          project_name: "Projects",
          project_address: "1 Test Street",
          clock_in: "2026-10-31T15:00:00Z",
          clock_out: "2026-10-31T16:00:00Z",
          work_date: "2026-10-31",
          hours: "1.00",
          regularHours: "1.00",
          overtimeHours: "0.00",
          break_minutes: 0,
          alerts: [],
        },
      ],
    };
  else if (
    req.url.startsWith("/users/company") ||
    req.url.startsWith("/kiosk/users")
  )
    out = {
      users: [{ id: "owner", first_name: "Calendar", last_name: "Tasks" }],
    };
  else if (req.url === "/tasks")
    out = {
      tasks: [
        {
          id: "task",
          description: "Projects",
          status: "pending",
          assigned_to: "owner",
          assigned_name: "Calendar Tasks",
        },
      ],
    };
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(out));
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
await writeFile(
  path.join(dir, "native.jsx"),
  `import React from 'react';const style=x=>Array.isArray(x)?Object.assign({},...x.filter(Boolean)):x;const view=tag=>({children,style:s,onPress,disabled,accessibilityLabel,...p})=>React.createElement(tag,{style:style(s),onClick:onPress,disabled,'aria-label':accessibilityLabel},children);export const View=view('div'),Text=view('span'),ScrollView=view('div'),TouchableOpacity=view('button');export const TextInput=({value,onChangeText,placeholder,multiline,style:s})=>React.createElement(multiline?'textarea':'input',{value,onChange:e=>onChangeText?.(e.target.value),placeholder,style:style(s)});export const StyleSheet={create:x=>x};export const ActivityIndicator=()=>React.createElement('span',null,'Loading');export const RefreshControl=()=>null;const node=x=>typeof x==='function'?React.createElement(x):x;export const FlatList=({data=[],renderItem,ListEmptyComponent})=>React.createElement('div',null,data.length?data.map((item,index)=>React.createElement(React.Fragment,{key:item.id||index},renderItem({item,index}))):node(ListEmptyComponent));export const SectionList=({sections=[],renderItem,renderSectionHeader,ListEmptyComponent})=>React.createElement('div',null,...sections.map((section,i)=>React.createElement('div',{key:i},renderSectionHeader({section}),...section.data.map((item,j)=>React.createElement(React.Fragment,{key:item.id||j},renderItem({item,index:j}))))),sections.every(s=>!s.data.length)?node(ListEmptyComponent):null);export const AdaptiveModal=({visible,children})=>visible?React.createElement('div',{role:'dialog'},children):null;export const Linking={openURL:()=>{}};export const Alert={alert:(title,message)=>window.dispatchEvent(new CustomEvent('native-alert',{detail:{title,message}}))};export const Platform={OS:'web'};`,
);
await writeFile(
  path.join(dir, "nav.jsx"),
  `import React from 'react';const emit=(route,params)=>window.dispatchEvent(new CustomEvent('navigation',{detail:{route,params}}));export const useNavigation=()=>({navigate:emit,goBack:()=>emit('back')});export const useFocusEffect=callback=>React.useEffect(callback,[callback]);export const useRoute=()=>({params:{date:'2026-10-31',shift:{id:'shift',name:'Night Shift',project_id:'project',project_name:'Projects',date:'2026-10-31',start_time:'09:00',end_time:'17:00',assigned_user_ids:['owner']}}});`,
);
await writeFile(
  path.join(dir, "auth.js"),
  `export const useAuth=()=>({user:{id:'owner',companyId:'company',firstName:'Calendar',lastName:'Tasks',role:'boss'}});`,
);
await writeFile(
  path.join(dir, "storage.js"),
  `export default {getItem:async k=>localStorage.getItem(k),setItem:async(k,v)=>localStorage.setItem(k,v)};`,
);
await writeFile(
  path.join(dir, "expo.jsx"),
  `import React from'react';export const MaterialIcons=({name})=>React.createElement('span',null,name);export const getLocales=()=>[{languageTag:'en-CA'}];export const getDocumentAsync=async()=>({canceled:true});export const cacheDirectory='';export const isAvailableAsync=async()=>false;export const shareAsync=async()=>{};export const EncodingType={UTF8:'utf8'};export const writeAsStringAsync=async()=>{};`,
);
await writeFile(
  path.join(dir, "api.js"),
  `const request=async(method,path,body)=>{const r=await fetch('/fixture-api'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return r.json()};export const api={get:p=>request('GET',p),post:(p,b)=>request('POST',p,b),put:(p,b)=>request('PUT',p,b),patch:(p,b)=>request('PATCH',p,b),delete:p=>request('DELETE',p)};export const API_URL='/fixture-api';`,
);
await writeFile(
  path.join(dir, "offline.js"),
  `export const checkOnlineStatus=async()=>true;`,
);
await writeFile(
  path.join(dir, "app.jsx"),
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import Projects from'/mobile/src/screens/ProjectsScreen.tsx';import Schedule from'/mobile/src/screens/ScheduleScreen.tsx';import Timesheet from'/mobile/src/screens/TimesheetScreen.tsx';import Tasks from'/mobile/src/screens/TasksScreen.tsx';import Shift from'/mobile/src/screens/CreateShiftScreen.tsx';function App(){const[screen,setScreen]=useState('Projects'),[notice,setNotice]=useState('');const{lang,setLang}=useLang();useEffect(()=>{const handler=e=>setNotice(JSON.stringify(e.detail));window.addEventListener('navigation',handler);window.addEventListener('native-alert',handler);return()=>{window.removeEventListener('navigation',handler);window.removeEventListener('native-alert',handler)}},[]);const Component={Projects,Schedule,Timesheet,Tasks,Shift}[screen];return <><nav>{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}{['Projects','Schedule','Timesheet','Tasks','Shift'].map(s=><button onClick={()=>setScreen(s)}>Screen {s}</button>)}</nav><output aria-label="language">{lang}</output><output aria-label="test event">{notice}</output><main><Component key={screen}/></main></>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
);
await writeFile(
  path.join(dir, "index.html"),
  '<div id="root"></div><script type="module" src="./app.jsx"></script>',
);
const maps = {
  "react-native": "native.jsx",
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
    port: 5206,
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
  await page.clock.setFixedTime(new Date("2026-10-31T16:00:00Z"));
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => console.log("UI_ERROR", e.message));
  await page.goto("http://127.0.0.1:5206/.work-locale-qa/index.html");
  const main = page.locator("main");
  await main.getByText("Projects", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Language es", exact: true }).click();
  await main.getByText("Proyectos", { exact: true }).waitFor();
  assert.equal(await main.getByText("Projects", { exact: true }).count(), 1);
  passed++;
  await main.getByRole("button", { name: "edit", exact: true }).click();
  await main.getByText("Editar proyecto", { exact: true }).waitFor();
  assert.equal(
    await main
      .getByPlaceholder("Nombre del proyecto", { exact: true })
      .inputValue(),
    "Projects",
  );
  await main.getByText("Guardar", { exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(
    records.find((r) => r.method === "PUT" && r.path === "/projects/project")
      .data.name,
    "Projects",
  );
  passed++;
  await page
    .getByRole("button", { name: "Screen Schedule", exact: true })
    .click();
  await main.getByText("Mi horario", { exact: true }).waitFor();
  await main.getByText("Semana", { exact: true }).click();
  await main.getByText("Night Shift", { exact: true }).waitFor();
  await main.getByText("Night Shift", { exact: true }).click();
  await main.getByText("Detalles del turno", { exact: true }).waitFor();
  await main
    .getByText("Ir a Inicio para registrar entrada", { exact: true })
    .click();
  await page.getByLabel("test event").filter({ hasText: "Home" }).waitFor();
  passed++;
  await page
    .getByRole("button", { name: "Screen Timesheet", exact: true })
    .click();
  await main.getByText("Hoja de horas", { exact: true }).waitFor();
  await main.getByText("Horas regulares", { exact: true }).waitFor();
  assert.equal(await main.getByText("Projects", { exact: true }).count(), 1);
  passed++;
  await page.getByRole("button", { name: "Screen Tasks", exact: true }).click();
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main.getByText("Tableau de travail", { exact: true }).waitFor();
  await main.getByText("Projects", { exact: true }).click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("main span")).some(
      (x) => x.textContent === "En cours",
    ),
  );
  assert.equal(
    records.find((r) => r.method === "PATCH" && r.path === "/tasks/task").data
      .status,
    "in_progress",
  );
  passed++;
  await page.getByRole("button", { name: "Screen Shift", exact: true }).click();
  await main.getByText("Modifier le service", { exact: true }).waitFor();
  await main.getByText("Enregistrer le service", { exact: true }).click();
  await page.getByLabel("test event").filter({ hasText: "back" }).waitFor();
  const saved = records.find(
    (r) => r.method === "PUT" && r.path === "/schedule/shifts/shift",
  );
  assert.equal(saved.data.date, "2026-10-31");
  assert.equal(saved.data.name, "Night Shift");
  assert.deepEqual(saved.data.employeeIds, ["owner"]);
  passed++;
  await page.reload();
  await main.getByText("Projets", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("language").innerText(), "fr");
  assert.equal(await main.getByText("Projects", { exact: true }).count(), 1);
  passed++;
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Real React/LanguageContext/work-screen code rendered through explicit native-to-DOM test adapters with synthetic local HTTP records. Language changes, persistence, labels, dates, navigation IDs and unchanged API payloads; not physical/native device acceptance.",
    }),
  );
} finally {
  await browser.close();
  await vite.close();
  await new Promise((r) => api.close(r));
  await rm(dir, { recursive: true, force: true });
}

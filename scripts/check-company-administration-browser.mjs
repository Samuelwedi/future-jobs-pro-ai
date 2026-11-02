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
const dir = path.resolve(".admin-qa"),
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
const actorIds = {
    worker: uid(11),
    manager: uid(13),
    owner: uid(12),
    foreign: uid(14),
  },
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
  `CREATE TABLE companies(id uuid PRIMARY KEY,name text,timezone text);CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,role text,is_active boolean DEFAULT true,first_name text,last_name text,full_name text,email text UNIQUE,date_of_birth date,sin text,password_hash text,must_change_password boolean DEFAULT false,updated_at timestamptz DEFAULT NOW(),created_at timestamptz DEFAULT NOW(),profile_pic text);CREATE TABLE compensation_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,hourly_rate numeric(10,2),effective_date date,created_by uuid,created_at timestamptz DEFAULT NOW());CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,status text);CREATE TABLE payrolls(id uuid PRIMARY KEY,company_id uuid,created_at timestamptz);CREATE TABLE payroll_items(payroll_id uuid,final_pay numeric);CREATE TABLE invoices(id uuid PRIMARY KEY,company_id uuid,currency text);CREATE TABLE payments(invoice_id uuid,amount numeric,payment_date date);CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,clock_in timestamptz,total_wage numeric);CREATE TABLE company_admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),actor_id uuid REFERENCES users(id),employee_id uuid REFERENCES users(id),action text,details jsonb,created_at timestamptz DEFAULT NOW());`,
);
for (const n of [1, 2])
  await query("INSERT INTO companies VALUES($1,$2,'America/Edmonton')", [
    uid(n),
    "Fixture " + n,
  ]);
for (const [n, c, role, active] of [
  [11, 1, "employee", true],
  [12, 1, "owner", true],
  [13, 1, "manager", true],
  [14, 2, "owner", true],
  [15, 1, "owner", false],
  [16, 1, "manager", true],
  [18, 1, "admin", true],
])
  await query(
    "INSERT INTO users(id,company_id,role,is_active,first_name,last_name,full_name,email,date_of_birth,sin,password_hash) VALUES($1,$2,$3,$4,'Pat','Fixture','Pat Fixture',$5,'1990-01-02','123456789','NEVER_EXPOSE_PASSWORD_HASH')",
    [uid(n), uid(c), role, active, "fixture" + n + "@example.test"],
  );
await query(
  "INSERT INTO compensation_history(user_id,hourly_rate,effective_date,created_by) VALUES($1,20,'2026-01-01',$2)",
  [uid(11), uid(12)],
);
for (const [n, currency, amount] of [
  [31, "CAD", 100],
  [32, "USD", 200],
]) {
  await query("INSERT INTO invoices VALUES($1,$2,$3)", [
    uid(n),
    uid(1),
    currency,
  ]);
  await query(
    "INSERT INTO payments VALUES($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date)",
    [uid(n), amount],
  );
}
await query(
  "UPDATE users SET first_name='Pat '||right(id::text,2),full_name='Pat '||right(id::text,2)||' Fixture'",
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
  ["/company-admin", "/api/company-admin"],
  require("./dist/routes/companyAdminRoutes").default,
);
app.use(["/users", "/api/users"], require("./dist/routes/userRoutes").default);
app.get("/api/attachments", (_req, res) =>
  res.json({ success: true, attachments: [] }),
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
  `const ids=${JSON.stringify(actorIds)};export const useAuth=()=>({user:{id:ids[window.qaActor||'worker'],companyId:'00000000-0000-4000-a000-000000000001',role:window.qaActor==='owner'||window.qaActor==='foreign'?'owner':window.qaActor==='manager'?'manager':'employee'}});`,
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
  `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{LanguageProvider,useLang}from'/mobile/src/context/LanguageContext.tsx';import Admin from'/mobile/src/screens/CompanyAdministrationScreen.tsx';import WebAdmin from'/web/src/pages/AdminDashboard.tsx';import WebTeam from'/web/src/pages/Team.tsx';import{MemoryRouter}from'react-router-dom';function App(){const[screen,setScreen]=useState('Native'),[actor,setActor]=useState('worker'),[dialog,setDialog]=useState(null);const{setLang}=useLang();useEffect(()=>{const fn=e=>setDialog(e.detail);window.addEventListener('native-alert',fn);return()=>window.removeEventListener('native-alert',fn)},[]);return <><nav>{['Native','Web','Team'].map(s=><button onClick={()=>{localStorage.setItem('token',window.qaTokens.owner);setScreen(s)}}>Screen {s}</button>)}{['worker','manager','owner','foreign'].map(a=><button onClick={()=>{window.qaActor=a;setActor(a)}}>Actor {a}</button>)}{['en','es','fr'].map(l=><button onClick={()=>setLang(l)}>Language {l}</button>)}</nav><main>{screen==='Native'?<Admin/>:<MemoryRouter>{screen==='Team'?<WebTeam/>:<WebAdmin/>}</MemoryRouter>}</main>{dialog&&<aside role="dialog"><h2>{dialog.title}</h2><p>{dialog.message}</p>{dialog.buttons.map((b,i)=><button key={i} onClick={()=>{setDialog(null);b.onPress?.()}}>{b.text}</button>)}</aside>}</>;}createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);`,
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
      "react-router-dom": path.resolve("web/node_modules/react-router-dom"),
      react: path.join(runtime, "react"),
      "react-dom": path.join(runtime, "react-dom"),
    },
  },
  esbuild: { jsx: "transform" },
  optimizeDeps: { include: ["react", "react-dom/client"] },
  server: {
    host: "127.0.0.1",
    port: 5219,
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
  await page.goto("http://127.0.0.1:5219/.admin-qa/index.html");
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
  await button("Manage employee Pat 11 Fixture").click();
  assert.equal(
    await button("Manage employee Pat 16 Fixture").isDisabled(),
    true,
  );
  assert.equal(await button("Manager role").isDisabled(), true);
  assert.equal(await main.getByText("123456789", { exact: true }).count(), 0);
  passed++;
  await field("First name").fill("Native changed");
  await button("Save employee changes").click();
  await confirm();
  await main
    .getByText(
      "Employee changes saved. Refresh active sessions when roles or passwords change.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (await query("SELECT first_name FROM users WHERE id=$1", [uid(11)])).rows[0]
      .first_name,
    "Native changed",
  );
  passed++;
  await button("Manage employee Native changed Fixture").click();
  await button("Compensation").click();
  await field("Hourly rate").fill("30.50");
  await field("Effective date (YYYY-MM-DD)").fill("2026-12-01");
  await button("Save employee changes").click();
  await confirm();
  await main
    .getByText(
      "Employee changes saved. Refresh active sessions when roles or passwords change.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (await query("SELECT COUNT(*)::int n FROM compensation_history")).rows[0].n,
    2,
  );
  passed++;
  await button("Manage employee Native changed Fixture").click();
  await field("First name").fill("Stale overwrite");
  await query(
    "UPDATE users SET first_name='Concurrent edit',full_name='Concurrent edit Fixture',updated_at=NOW() WHERE id=$1",
    [uid(11)],
  );
  await button("Save employee changes").click();
  await confirm();
  await main
    .getByText("The employee record changed. Refresh before saving.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await query("SELECT first_name FROM users WHERE id=$1", [uid(11)])).rows[0]
      .first_name,
    "Concurrent edit",
  );
  passed++;
  await button("Refresh administration").click();
  await button("Manage employee Concurrent edit Fixture").click();
  await button("Tax information").click();
  await field("New SIN (optional)").fill("987654321");
  await field("Date of birth (YYYY-MM-DD)").fill("1992-03-04");
  await button("Save employee changes").click();
  await confirm();
  await main
    .getByText(
      "Employee changes saved. Refresh active sessions when roles or passwords change.",
      { exact: true },
    )
    .waitFor();
  assert.ok(
    await main.getByText("Tax identifier: ••••••321", { exact: true }).count(),
  );
  assert.equal(await field("New SIN (optional)").count(), 0);
  passed++;
  await page.getByRole("button", { name: "Actor owner", exact: true }).click();
  await button("Manage employee Concurrent edit Fixture").click();
  assert.equal(await button("Manager role").isDisabled(), false);
  await button("Security").click();
  await field("Temporary password").fill("Synthetic-browser-password-123");
  await button("Save employee changes").click();
  await confirm();
  await main
    .getByText(
      "Employee changes saved. Refresh active sessions when roles or passwords change.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (
      await query("SELECT must_change_password FROM users WHERE id=$1", [
        uid(11),
      ])
    ).rows[0].must_change_password,
    true,
  );
  assert.equal(await field("Temporary password").count(), 0);
  passed++;
  await button("Read administration audit").click();
  await main.getByText(/Temporary password reset/).waitFor();
  assert.ok(records.some((r) => r.path.startsWith("/company-admin/audit")));
  passed++;
  await page.evaluate(() => (window.qaOffline = true));
  const before = records.length;
  await button("Manage employee Concurrent edit Fixture").click();
  await button("Save employee changes").click();
  await confirm();
  await main
    .getByText("Reconnect before changing company administration.", {
      exact: true,
    })
    .waitFor();
  assert.equal(records.length, before);
  passed++;
  await page.evaluate(() => (window.qaOffline = false));
  await button("Refresh administration").click();
  await page.getByRole("button", { name: "Language fr", exact: true }).click();
  await main
    .getByText("Administration de l’entreprise", { exact: true })
    .waitFor();
  passed++;
  await page.getByRole("button", { name: "Language en", exact: true }).click();
  await page
    .getByRole("button", { name: "Actor foreign", exact: true })
    .click();
  await main
    .getByText("Administration account could not be verified.", { exact: true })
    .waitFor();
  assert.equal(
    await main.getByText("Concurrent edit Fixture", { exact: true }).count(),
    0,
  );
  passed++;
  await page.getByRole("button", { name: "Actor owner", exact: true }).click();
  await page.getByRole("button", { name: "Screen Web", exact: true }).click();
  await main
    .getByText("Recorded payments by currency", { exact: true })
    .waitFor();
  assert.ok(
    (await main.getByText("Unavailable", { exact: true }).count()) >= 2,
  );
  passed++;
  const card = main
    .locator(".MuiCard-root")
    .filter({ hasText: "fixture11@example.test" });
  await card
    .getByRole("button", { name: "Edit employee", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name", { exact: true }).fill("Web updated");
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/company-admin/employees/" + uid(11) + "/profile") &&
      r.request().method() === "PATCH",
  );
  await dialog
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  assert.equal((await response).status(), 200);
  await dialog
    .getByText("Manage Web updated Fixture", { exact: true })
    .waitFor();
  assert.equal(
    (await query("SELECT first_name FROM users WHERE id=$1", [uid(11)])).rows[0]
      .first_name,
    "Web updated",
  );
  passed++;
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Screen Team", exact: true }).click();
  const teamRow = main
    .getByRole("row")
    .filter({ hasText: "fixture11@example.test" });
  await teamRow
    .getByRole("button", { name: "Edit employee tax information", exact: true })
    .click();
  const taxDialog = page.getByRole("dialog");
  await taxDialog
    .getByLabel("New SIN (9 digits)", { exact: true })
    .fill("112233445");
  const taxResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/company-admin/employees/" + uid(11) + "/tax") &&
      r.request().method() === "PATCH",
  );
  await taxDialog.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal((await taxResponse).status(), 200);
  await taxDialog.waitFor({ state: "hidden" });
  assert.equal(
    (await query("SELECT sin FROM users WHERE id=$1", [uid(11)])).rows[0].sin,
    "112233445",
  );
  passed++;
  console.log(
    JSON.stringify({
      passed,
      scope:
        "Actual native company administration with DOM/Alert adapters, real JWT/Express/PGlite transactions/version/audit/password hashing. The real MUI web editor additionally saves a versioned profile and renders mixed-currency totals. No real email, payment, ownership transfer or production/device action.",
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

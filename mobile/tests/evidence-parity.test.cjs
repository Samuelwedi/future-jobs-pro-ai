const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
const load = (file) => {
  const context = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src", file + ".ts"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  return context.exports;
};
test("native evidence and shared viewer display copy has Spanish/French text with matching placeholders", () => {
  const { screenCopy } = load("services/screenTranslations"),
    keys = new Set();
  function add(n) {
    if (!n) return;
    if (ts.isStringLiteral(n)) keys.add(n.text);
    if (ts.isConditionalExpression(n)) {
      add(n.whenTrue);
      add(n.whenFalse);
    }
  }
  for (const file of ["screens/EvidenceScreen.tsx","components/MediaAttachment.tsx","services/evidenceFiles.ts"]) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function walk(n) {
      if (
        ts.isCallExpression(n) &&
        ["t", "field", "button", "toggle", "Error"].includes(n.expression.getText(source))
      )
        add(n.arguments[0]);
      if (
        ts.isVariableDeclaration(n) &&
        ["yearEndCompanyFields", "yearEndBoxLabels", "statusLabels"].includes(
          n.name.getText(source),
        ) &&
        n.initializer &&
        ts.isObjectLiteralExpression(n.initializer)
      )
        for (const p of n.initializer.properties)
          if (ts.isPropertyAssignment(p)) add(p.initializer);
      ts.forEachChild(n, walk);
    }
    walk(source);
  }
  for (const key of keys) {
    assert.ok(screenCopy[key], key);
    for (const value of screenCopy[key]) {
      assert.ok(value);
      const tokens = (s) =>
        [...s.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(tokens(value), tokens(key));
    }
  }
  assert.ok(keys.size > 15);
});
const fixtureId='00000000-0000-4000-a000-000000000031',actor='actor-fixture',company='company-fixture',bytes=Buffer.from('504b0304000000000000','hex');
const packageBody=()=>({actorId:actor,companyId:company,timeEntryId:fixtureId,mimeType:'application/zip',size:bytes.length,base64:bytes.toString('base64'),zipSha256:'a'.repeat(64),canonicalHash:'b'.repeat(64)});
function helper(state={}){const file={cacheDirectory:'file:///fixture/',EncodingType:{Base64:'base64'},writeAsStringAsync:async(_file,body,options)=>{state.writes=(state.writes||0)+1;state.size=Buffer.from(body,'base64').length;state.encoding=options.encoding;if(state.failWrite)throw Error('fixture write failed');},downloadAsync:async(url,_file,options)=>{state.url=url;state.authorization=options.headers.Authorization;return{status:state.status||200,headers:{'content-type':state.type||'application/pdf'}};},getInfoAsync:async()=>({exists:true,size:state.corrupt?99:state.size||100}),deleteAsync:async()=>{state.deleted=(state.deleted||0)+1;}},ctx={exports:{},Date,require:name=>name.includes('expo-file-system')?file:name==='expo-sharing'?{isAvailableAsync:async()=>true,shareAsync:async()=>{state.shared=(state.shared||0)+1;}}:{api:{getToken:async()=>state.noToken?null:'synthetic-evidence-token',post:async(url)=>{state.url=url;state.posted=true;return state.body||packageBody();}},API_URL:'https://fixture.example.test/api'}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/evidenceFiles.ts'),'utf8'),{compilerOptions:{module:1,target:9}}).outputText,ctx);return ctx.exports;}
test('package envelope rejects another actor/company/entry, invalid ZIP data, size and hash fields',()=>{const h=helper();assert.equal(h.evidencePackageResponse(packageBody(),fixtureId,actor,company).size,bytes.length);for(const extra of [{actorId:'foreign'},{companyId:'foreign'},{timeEntryId:'foreign'},{mimeType:'text/html'},{base64:'not-a-zip'},{size:21*1024*1024},{zipSha256:'invalid'},{canonicalHash:''}])assert.throws(()=>h.evidencePackageResponse({...packageBody(),...extra},fixtureId,actor,company));});
test('ZIP export uses authenticated online API and private base64 file cleanup on success or failure',async()=>{for(const extra of [{},{corrupt:true},{failWrite:true},{staleAfterPost:true},{staleAfterWrite:true}]){const state={...extra},h=helper(state),current=()=>!((state.staleAfterPost&&state.posted)||(state.staleAfterWrite&&state.writes)),op=h.shareEvidencePackage(fixtureId,{},actor,company,current);if(extra.corrupt||extra.failWrite)await assert.rejects(op);else await op;assert.match(state.url,/^\/evidence-bundles\/time-entry\/.*\/download\?encoding=base64$/);assert.equal(state.shared||0,Object.keys(extra).length===0?1:0);assert.equal(state.deleted||0,state.writes||0);if(state.writes)assert.equal(state.encoding,'base64');}});
test('direct artifact export fixes API paths/MIME and rejects error bodies or stale accounts',async()=>{for(const extra of [{},{type:'text/html'},{status:401},{noToken:true},{stale:true}]){const state={...extra},h=helper(state),op=h.shareEvidenceArtifact(fixtureId,'pdf',()=>!extra.stale);if(extra.type||extra.status||extra.noToken)await assert.rejects(op);else await op;assert.equal(state.shared||0,Object.keys(extra).length===0?1:0);if(state.url){assert.match(state.url,/^https:\/\/fixture\.example\.test\/api\/evidence-bundles\/time-entry\/.*\/time-entry-pdf$/);assert.equal(state.authorization,'Bearer synthetic-evidence-token');assert.equal(state.deleted,1);}}});

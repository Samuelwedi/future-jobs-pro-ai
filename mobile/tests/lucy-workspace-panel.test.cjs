const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function setup(language='en'){
 let user={id:'user-a',companyId:'company-a',role:'manager'},focused=true,foreground=true,index=0;
 const hooks=[],controllers=[],calls=[];
 const state={preferences:[],jobs:[],modes:{ai_research:false,record_search:true,explicit:true},mode:'record_search',enabled:true,ready:true,loading:false,busy:false,error:'',prompt:'',choices:{}};
 class Controller {constructor(client,sharing,inScope){this.inScope=inScope;controllers.push(this);}snapshot=()=>state;subscribe=()=>()=>{};open(){}close(){calls.push(['close']);}setMode(mode){calls.push(['mode',mode]);}setPrompt(prompt){calls.push(['prompt',prompt]);}create(){calls.push(['create']);}shareReport(...args){calls.push(['share',...args]);}refresh(){calls.push(['refresh']);}cancel(id){calls.push(['cancel',id]);}}
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:()=>[foreground,next=>{foreground=next;}],useRef:value=>{const slot=index++;return hooks[slot]??(hooks[slot]={current:value});},useMemo:(create,deps)=>{const slot=index++,prior=hooks[slot];if(!prior||JSON.stringify(prior.deps)!==JSON.stringify(deps))hooks[slot]={deps,value:create()};return hooks[slot].value;},useEffect:()=>{},useSyncExternalStore:(_subscribe,snapshot)=>snapshot()};
 const native={AppState:{currentState:'active'},StyleSheet:{create:value=>value},...Object.fromEntries(['ActivityIndicator','ScrollView','Text','TextInput','TouchableOpacity','View'].map(name=>[name,name]))};
 const imports={react,'react-native':native,'@react-navigation/native':{useIsFocused:()=>focused},'./AdaptiveModal':{AdaptiveModal:'AdaptiveModal'},'../context/AuthContext':{useAuth:()=>({user})},'../context/LanguageContext':{useLang:()=>({lang:language,t:value=>value})},'../services/api':{api:{}},'../services/lucyWorkspace':{LucyWorkspaceController:Controller,preferenceOptions:{}},'../services/lucyReportSharing':{nativeLucyReportSharing:{}},'./LucySourceEvidence':{__esModule:true,default:'LucySourceEvidence'}};
 const context={exports:{},require:name=>{assert.ok(imports[name],name);return imports[name];}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/LucyWorkspacePanel.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
 return {state,calls,controllers,render:(visible=true)=>{index=0;return context.exports.default({visible,onClose:()=>calls.push(['dismiss'])});},user:next=>{user=next;},focus:next=>{focused=next;},foreground:next=>{foreground=next;}};
}
const buttons=tree=>nodes(tree).filter(node=>node.type==='TouchableOpacity');
const job={id:'report-1',mode:'record_search',status:'completed',prompt:'Saved query',createdAt:'2026-11-08T12:00:00Z',result:{text:'Saved result'}};
test('mode controls reflect capabilities, preserve disabled states, and send real handlers with the 200-character limit',()=>{
 const h=setup(),tree=h.render();const radios=buttons(tree).filter(node=>node.props.accessibilityRole==='radio');
 assert.equal(radios.length,2);assert.equal(radios[0].props.accessibilityState.checked,true);assert.equal(radios[0].props.disabled,false);assert.equal(radios[1].props.disabled,true);
 radios[0].props.onPress();assert.deepEqual(h.calls.at(-1),['mode','record_search']);
 const input=nodes(tree).find(node=>node.type==='TextInput');assert.equal(input.props.maxLength,200);input.props.onChangeText('Handover');assert.deepEqual(h.calls.at(-1),['prompt','Handover']);
 h.state.prompt='x'.repeat(201);assert.ok(text(h.render()).includes('Your draft has been kept'));assert.equal(buttons(h.render()).find(node=>text(node)==='Start record search').props.disabled,true);
 h.state.mode='ai_research';h.state.modes={ai_research:true,record_search:false,explicit:false};const legacy=h.render();assert.equal(buttons(legacy).filter(node=>node.props.accessibilityRole==='radio').length,1);assert.equal(nodes(legacy).find(node=>node.type==='TextInput').props.maxLength,4000);
});
test('EN/ES/FR expose an explicit localized partial share button with a disclosure, and never share on render',()=>{
 const expected={en:['Share partial report (.txt)','The report includes your query','Partial search:'],es:['Compartir informe parcial (.txt)','El informe incluye tu consulta','Búsqueda parcial:'],fr:['Partager le rapport partiel (.txt)','Le rapport inclut votre requête','Recherche partielle :']};
 for(const [language,labels] of Object.entries(expected)){
  const h=setup(language);const value={...job,status:'partial'};h.state.jobs=[value];let tree=h.render();assert.equal(h.calls.length,0);for(const label of labels)assert.ok(text(tree).includes(label),label);
  const button=buttons(tree).find(node=>text(node)===labels[0]);assert.equal(button.props.accessibilityRole,'button');assert.equal(button.props.disabled,false);button.props.onPress();assert.equal(h.calls[0][0],'share');assert.equal(h.calls[0][1],value);assert.equal(h.calls[0][2],language);assert.equal(h.calls[0][3],labels[0]);
  h.state.busy=true;assert.equal(buttons(h.render()).find(node=>text(node)===labels[0]).props.disabled,true);h.state.busy=false;h.state.loading=true;assert.equal(buttons(h.render()).find(node=>text(node)===labels[0]).props.disabled,true);
 }
});
test('only completed and partial record jobs show a report button; partial AI is explained rather than exported',()=>{
 const h=setup();for(const status of ['queued','running','failed','cancelled']){h.state.jobs=[{...job,status}];assert.ok(!buttons(h.render()).some(node=>text(node).startsWith('Share')));}
 h.state.jobs=[{...job,status:'partial',mode:'ai_research'}];assert.ok(!buttons(h.render()).some(node=>text(node).startsWith('Share')));assert.ok(text(h.render()).includes('A completed result is required'));
 h.state.jobs=[job];assert.ok(buttons(h.render()).some(node=>text(node)==='Share report (.txt)'));
});
test('render-time scope guards invalidate old handlers before effects on account/company/role/visibility/focus changes',()=>{
 for(const change of [h=>h.user({id:'user-b',companyId:'company-a',role:'manager'}),h=>h.user({id:'user-a',companyId:'company-b',role:'manager'}),h=>h.user({id:'user-a',companyId:'company-a',role:'worker'}),h=>h.user(undefined),h=>h.focus(false),h=>h.foreground(false)]){
  const h=setup();h.render();const old=h.controllers[0];assert.equal(old.inScope(),true);change(h);h.render();assert.equal(old.inScope(),false);
 }
 const h=setup();h.render();const old=h.controllers[0];h.render(false);assert.equal(old.inScope(),false);
});
test('Close invalidates the controller synchronously before dismissing the modal',()=>{
 const h=setup();buttons(h.render()).find(node=>text(node)==='Close').props.onPress();assert.deepEqual(h.calls,[['close'],['dismiss']]);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function setup(language='en'){
 let user={id:'user-a',companyId:'company-a',role:'manager'},focused=true,foreground=true,index=0;
 const hooks=[],controllers=[],calls=[];
 const state={preferences:[],jobs:[],modes:{ai_research:false,record_search:true,explicit:true},mode:'record_search',enabled:true,ready:true,loading:false,busy:false,error:'',prompt:'',briefing:{from:'',to:'',taskStatus:'open'},choices:{}};
 class Controller {constructor(client,sharing,inScope){this.inScope=inScope;controllers.push(this);}snapshot=()=>state;subscribe=()=>()=>{};open(){}close(){calls.push(['close']);}setMode(mode){calls.push(['mode',mode]);}setPrompt(prompt){calls.push(['prompt',prompt]);}setBriefing(options){calls.push(['briefing',options]);}create(){calls.push(['create']);}shareReport(...args){calls.push(['share',...args]);}refresh(){calls.push(['refresh']);}cancel(id){calls.push(['cancel',id]);}}
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:()=>[foreground,next=>{foreground=next;}],useRef:value=>{const slot=index++;return hooks[slot]??(hooks[slot]={current:value});},useMemo:(create,deps)=>{const slot=index++,prior=hooks[slot];if(!prior||JSON.stringify(prior.deps)!==JSON.stringify(deps))hooks[slot]={deps,value:create()};return hooks[slot].value;},useEffect:()=>{},useSyncExternalStore:(_subscribe,snapshot)=>snapshot()};
 const native={AppState:{currentState:'active'},StyleSheet:{create:value=>value},...Object.fromEntries(['ActivityIndicator','ScrollView','Text','TextInput','TouchableOpacity','View'].map(name=>[name,name]))};
 const reportContext={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/utils/lucyWorkReport.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,reportContext);
 const imports={'../utils/lucyWorkReport':reportContext.exports,react,'react-native':native,'@react-navigation/native':{useIsFocused:()=>focused},'./AdaptiveModal':{AdaptiveModal:'AdaptiveModal'},'../context/AuthContext':{useAuth:()=>({user})},'../context/LanguageContext':{useLang:()=>({lang:language,t:value=>value})},'../services/api':{api:{}},'../services/lucyWorkspace':{LucyWorkspaceController:Controller,preferenceOptions:{}},'../services/lucyReportSharing':{nativeLucyReportSharing:{}},'./LucySourceEvidence':{__esModule:true,default:'LucySourceEvidence'}};
 const context={exports:{},require:name=>{assert.ok(imports[name],name);return imports[name];}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/LucyWorkspacePanel.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
 return {state,calls,controllers,render:(visible=true)=>{index=0;return context.exports.default({visible,onClose:()=>calls.push(['dismiss'])});},user:next=>{user=next;},focus:next=>{focused=next;},foreground:next=>{foreground=next;}};
}
const buttons=tree=>nodes(tree).filter(node=>node.type==='TouchableOpacity');
const job={id:'report-1',mode:'record_search',status:'completed',prompt:'Saved query',createdAt:'2026-11-08T12:00:00Z',result:{text:'Saved result'}};
test('mode controls reflect capabilities, preserve disabled states, and send real handlers with the 200-character limit',()=>{
 const h=setup(),tree=h.render();const radios=buttons(tree).filter(node=>node.props.accessibilityRole==='radio');
 assert.equal(radios.length,3);assert.equal(radios[0].props.accessibilityState.checked,true);assert.equal(radios[0].props.disabled,false);assert.equal(radios[1].props.disabled,true);assert.equal(radios[2].props.disabled,true);
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

test('EN/ES/FR briefing controls expose dates, five explicit task statuses, inclusive preview, validation and real handlers',()=>{
 const labels={en:['Work briefing (no AI model)','Create work briefing','at most 31 days','all dates','Open (pending or in progress)','Stored shifts from'],es:['Resumen de trabajo (sin modelo de IA)','Crear resumen de trabajo','máximo de 31 días','todas las fechas','Abiertas (pendientes o en curso)','Turnos guardados desde'],fr:['Bilan de travail (sans modèle d’IA)','Créer le bilan de travail','31 jours maximum','toutes les dates','Ouvertes (en attente ou en cours)','Quarts enregistrés à partir']};
 for(const [language,expected] of Object.entries(labels)){
  const h=setup(language);h.state.mode='work_briefing';h.state.modes.work_briefing=true;h.state.prompt='Retained keywords';let tree=h.render();
  for(const label of [expected[0],expected[1],expected[3],expected[4],expected[5]])assert.ok(text(tree).includes(label),label);
  assert.equal(buttons(tree).find(node=>text(node)===expected[1]).props.disabled,true);assert.equal(h.calls.length,0);assert.ok(!text(tree).includes('Retained keywords'));
  const dates=nodes(tree).filter(node=>node.type==='TextInput');assert.equal(dates.length,2);for(const input of dates)assert.equal(input.props.maxLength,10);
  dates[0].props.onChangeText('2026-11-01');assert.equal(h.calls.at(-1)[0],'briefing');assert.equal(h.calls.at(-1)[1].from,'2026-11-01');dates[1].props.onChangeText('2026-11-30');assert.equal(h.calls.at(-1)[1].to,'2026-11-30');
  const statuses=buttons(tree).filter(node=>node.props.accessibilityRole==='radio').slice(3);assert.equal(statuses.length,5);assert.equal(statuses[0].props.accessibilityState.checked,true);statuses[2].props.onPress();assert.equal(h.calls.at(-1)[1].taskStatus,'in_progress');
  h.state.briefing={from:'2026-02-30',to:'2026-03-01',taskStatus:'open'};tree=h.render();assert.ok(text(tree).includes(expected[2]));assert.equal(buttons(tree).find(node=>text(node)===expected[1]).props.disabled,true);
  h.state.briefing={from:'2024-02-01',to:'2024-03-02',taskStatus:'open'};tree=h.render();assert.ok(text(tree).includes('2024-02-01'));assert.ok(text(tree).includes('2024-03-02'));const start=buttons(tree).find(node=>text(node)===expected[1]);assert.equal(start.props.disabled,false);start.props.onPress();assert.equal(h.calls.at(-1)[0],'create');
  h.state.busy=true;tree=h.render();assert.ok(nodes(tree).filter(node=>node.type==='TextInput').every(node=>node.props.editable===false));assert.ok(buttons(tree).filter(node=>node.props.accessibilityRole==='radio').every(node=>node.props.disabled));assert.equal(buttons(tree).find(node=>text(node)===expected[1]).props.disabled,true);
 }
});
test('briefing partial results use distinct localized labels and explicit shares; unknown modes have no actions or AI mislabel',()=>{
 for(const [language,partial,unavailable] of [['en','Partial briefing:','Unavailable work mode'],['es','Resumen parcial:','Modo de trabajo no disponible'],['fr','Bilan partiel :','Mode de travail indisponible']]){
  const h=setup(language);h.state.jobs=[{...job,mode:'work_briefing',status:'partial'}];let tree=h.render();assert.ok(text(tree).includes(partial));assert.equal(h.calls.length,0);assert.equal(buttons(tree).filter(node=>/Share partial|Compartir informe parcial|Partager le rapport partiel/.test(text(node))).length,1);
  for(const status of ['queued','running','completed','partial']){
   h.state.jobs=[{...job,mode:'future_mode',status}];tree=h.render();assert.ok(text(tree).includes(unavailable));assert.ok(!buttons(tree).some(node=>/Share|Compartir|Partager|^Cancel$/.test(text(node))));assert.ok(!text(tree).includes('This AI task is partial'));
  }
 }
});

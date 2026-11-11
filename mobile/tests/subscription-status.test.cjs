const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/screens/SubscriptionScreen.tsx'),'utf8');
const capabilities={success:true,google:true,apple:true,canPurchase:true,canManageBilling:true,complimentary:false,googleAccountId:'account'};
const inactive={success:true,subscription:{tier:'trial',status:'inactive',provider:null,currentPeriodEnd:null}};
const active={success:true,subscription:{tier:'team_10',status:'active',provider:'apple',currentPeriodEnd:'2099-01-01'}};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 let hooks=[],index=0,tree,focus,cleanup,effects=[],effectCleanups=[],epoch=0,read=async endpoint=>endpoint==='status'?inactive:capabilities;
 const calls=[],alerts=[];let purchases=0,restores=0,managed=0,finished=0,iapCallbacks,verify=async()=>active;const product={id:'product',displayPrice:'$10',platform:'ios'};
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'Fragment',useState(initial){const slot=index++;if(!(slot in hooks))hooks[slot]=typeof initial==='function'?initial():initial;return [hooks[slot],value=>hooks[slot]=typeof value==='function'?value(hooks[slot]):value];},useRef(initial){const slot=index++;return hooks[slot]??(hooks[slot]={current:initial});},useCallback:fn=>fn,useMemo:fn=>fn(),useEffect:fn=>{effects.push(fn);}};
 const api={post:async()=>verify(),captureSessionGuard(){const captured=epoch;return ()=>captured===epoch;},get:async url=>{calls.push(url);return read(url.split('/').pop());},readSubscription:async(endpoint,owner,current)=>{calls.push('/subscriptions/'+endpoint);assert.equal(current(),true);return read(endpoint);}};
 const iap={connected:true,subscriptions:[product],availablePurchases:[],fetchProducts:async()=>{},getAvailablePurchases:async()=>{restores++;},requestPurchase:async()=>{purchases++;}};
 const context={exports:{},console,globalThis:{Promise},require:name=>{
  if(name==='react')return {default:React,...React};
  if(name==='react-native')return {ActivityIndicator:'ActivityIndicator',Alert:{alert:(...a)=>alerts.push(a)},Platform:{OS:'ios'},Linking:{openURL:async()=>{managed++;}},RefreshControl:'RefreshControl',ScrollView:'ScrollView',StyleSheet:{create:x=>x},Text:'Text',TouchableOpacity:'TouchableOpacity',View:'View'};
  if(name==='expo-linear-gradient')return {LinearGradient:'LinearGradient'};
  if(name==='@expo/vector-icons')return {Ionicons:'Ionicons',MaterialIcons:'MaterialIcons'};
  if(name==='expo-iap')return {useIAP:options=>{iapCallbacks=options;return iap;},ErrorCode:{UserCancelled:'cancelled'},finishTransaction:async()=>{finished++;}};
  if(name==='@react-navigation/native')return {useNavigation:()=>({goBack(){},navigate(){}}),useFocusEffect:fn=>{focus=fn;}};
  if(name==='../services/api')return {api,API_URL:'https://fixture.invalid/api'};
  if(name==='../context/AuthContext')return {useAuth:()=>({user:{id:'owner',companyId:'company',role:'boss'}})};
  if(name==='../context/LanguageContext')return {useLang:()=>({t:s=>s,lang:'en'})};
  if(name==='../config/subscriptionProducts')return {FALLBACK_PLAN_COPY:{team_10:{name:'Team 10',audience:'Team',icon:'people'}},STORE_PRODUCT_IDS:{team_10:'product'},ANDROID_STORE_PRODUCT_IDS:{team_10:'product'},planKeyForProduct:()=> 'team_10'};
  throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,context);
 function render(){index=0;effects=[];tree=context.exports.default();if(typeof tree.type==='function')tree=tree.type(tree.props);return tree;}
 function nodes(node=tree){if(node==null||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n??null));return [node,...nodes(node.props?.children ?? null),...nodes(node.props?.refreshControl ?? null)];}
 function text(node=tree){if(node==null||typeof node==='boolean')return '';if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(n=>text(n??null)).join(' ');return text(node.props?.children ?? null);}
 render();
 return {calls,alerts,api,iap,render,text,nodes,get iapCallbacks(){return iapCallbacks;},set verify(fn){verify=fn;},get finished(){return finished;},get managed(){return managed;},get purchases(){return purchases;},get restores(){return restores;},mountLifecycle(){const lifecycle=effects.find(fn=>fn.toString().includes('screenAlive.current'));if(lifecycle)effectCleanups.push(lifecycle());},unmount(){for(const cleanup of effectCleanups)cleanup?.();},set read(fn){read=fn;},replaceSession(){epoch++;},refresh(){nodes().find(n=>n.type==='RefreshControl').props.onRefresh();},focus(){cleanup=focus?.();},blur(){cleanup?.();}};
}

test('failed entitlement read is unavailable rather than ended and has an independent status retry',async()=>{
 const f=setup();f.read=async endpoint=>{if(endpoint==='status')throw Error('offline');return capabilities;};f.focus();await settle();f.render();
 assert.doesNotMatch(f.text(),/Your trial or subscription has ended/);
 assert.match(f.text(),/Plan status unavailable/);
 assert.match(f.text(),/Retry subscription status/);
 assert.doesNotMatch(f.text(),/Select a company plan|Contact your boss about company access/);
 const retry=f.nodes().find(n=>n.type==='TouchableOpacity'&&f.text(n).includes('Retry subscription status'));
 assert.ok(retry);f.read=async endpoint=>endpoint==='status'?inactive:capabilities;retry.props.onPress();await settle();f.render();
 assert.match(f.text(),/Your trial or subscription has ended/);
 assert.doesNotMatch(f.text(),/Subscription status could not be confirmed/);
 assert.equal(f.calls.filter(url=>url.endsWith('/status')).length,2);
});

function restoreButton(f){return f.nodes().find(n=>n.type==='TouchableOpacity'&&f.text(n).includes('Restore previous purchase'));}
function purchaseButton(f){return f.nodes().find(n=>n.type==='TouchableOpacity'&&/Choose \{plan\}|Purchases unavailable|Current plan/.test(f.text(n)));}

test('status-only failure blocks new purchases but retains authorized restore; capability failure revokes cached permission',async()=>{
 const f=setup();f.read=async endpoint=>{if(endpoint==='status')throw Error('offline');return capabilities;};f.focus();await settle();f.render();
 assert.equal(purchaseButton(f).props.disabled,true);purchaseButton(f).props.onPress();assert.equal(f.purchases,0);
 assert.equal(restoreButton(f).props.disabled,false);restoreButton(f).props.onPress();await settle();assert.equal(f.restores,1);
 f.read=async endpoint=>{if(endpoint==='capabilities')throw Error('offline');return active;};f.refresh();await settle();f.render();
 assert.match(f.text(),/Status: Active/);assert.match(f.text(),/Billing permissions could not be confirmed/);
 assert.doesNotMatch(f.text(),/Contact your boss about company access/);assert.equal(restoreButton(f).props.disabled,true);
 restoreButton(f).props.onPress();assert.equal(f.restores,1);assert.equal(purchaseButton(f),undefined);
});

test('failed, missing, unknown and malformed status responses never establish inactive entitlement',async()=>{
 for(const response of [null,{}, {success:false,subscription:inactive.subscription},{success:true},{success:true,subscription:{}},
  {success:true,subscription:{tier:'trial',status:'future_status',provider:null}},{success:true,subscription:{tier:'team_10',status:'active'}},{success:true,subscription:{tier:'team_10',status:'active',provider:'unknown'}},{success:true,subscription:{tier:'trial',status:3}},
  {success:true,subscription:{tier:5,status:'inactive'}},{success:true,subscription:{tier:'trial',status:'active',currentPeriodEnd:'invalid'}}]){
  const f=setup();f.read=async endpoint=>endpoint==='status'?response:capabilities;f.focus();await settle();f.render();
  assert.match(f.text(),/Plan status unavailable/);assert.doesNotMatch(f.text(),/Your trial or subscription has ended/);
  assert.equal(purchaseButton(f).props.disabled,true);purchaseButton(f).props.onPress();assert.equal(f.purchases,0);
 }
});

test('malformed capabilities never authorize purchase or restore and can recover through status retry',async()=>{
 const f=setup();f.read=async endpoint=>endpoint==='status'?inactive:{...capabilities,canPurchase:'true'};f.focus();await settle();f.render();
 assert.match(f.text(),/Billing permissions could not be confirmed/);assert.equal(restoreButton(f).props.disabled,true);assert.equal(purchaseButton(f),undefined);
 f.read=async endpoint=>endpoint==='status'?inactive:capabilities;f.refresh();await settle();f.render();assert.equal(purchaseButton(f).props.disabled,false);assert.equal(restoreButton(f).props.disabled,false);
});

test('late success and failure cannot replace a newer successful refresh',async()=>{
 for(const kind of ['success','failure']){
  const f=setup(),old=deferred();f.read=async()=>old.promise;f.focus();
  f.read=async endpoint=>endpoint==='status'?active:capabilities;f.refresh();await settle();f.render();assert.match(f.text(),/Status: Active/);
  if(kind==='success')old.resolve(inactive);else old.reject(Error('old offline'));await settle();f.render();
  assert.match(f.text(),/Status: Active/);assert.doesNotMatch(f.text(),/Your trial or subscription has ended|could not be confirmed/);
 }
});

test('session replacement, blur and unmount fence pending reads without updates or stale purchase actions',async()=>{
 for(const mode of ['session','blur','unmount']){
  const f=setup(),wait=deferred();f.mountLifecycle();f.read=async()=>wait.promise;f.focus();
  if(mode==='session')f.replaceSession();else if(mode==='blur')f.blur();else f.unmount();
  wait.resolve(active);await settle();f.render();assert.doesNotMatch(f.text(),/Status: Active|Your trial or subscription has ended/);
  if(mode==='blur'){f.read=async endpoint=>endpoint==='status'?inactive:capabilities;f.focus();await settle();f.render();assert.match(f.text(),/Your trial or subscription has ended/);}
  if(mode==='session'){const before=f.calls.length;f.refresh();await settle();assert.equal(f.calls.length,before);}
 }
});

test('refresh synchronously blocks retained purchase and restore callbacks before React rerenders',async()=>{
 const f=setup();f.focus();await settle();f.render();const oldPurchase=purchaseButton(f),oldRestore=restoreButton(f),wait=deferred();
 f.read=async endpoint=>endpoint==='status'?wait.promise:capabilities;f.refresh();oldPurchase.props.onPress();oldRestore.props.onPress();assert.equal(f.purchases,0);assert.equal(f.restores,0);
 wait.resolve(active);await settle();oldPurchase.props.onPress();oldRestore.props.onPress();assert.equal(f.purchases,0);assert.equal(f.restores,0);
});

test('verified current inactive subscriptions can still purchase and worker permissions remain read-only',async()=>{
 const f=setup();f.focus();await settle();f.render();purchaseButton(f).props.onPress();await settle();assert.equal(f.purchases,1);
 const worker=setup();worker.read=async endpoint=>endpoint==='status'?inactive:{...capabilities,canPurchase:false,canManageBilling:false};worker.focus();await settle();worker.render();
 assert.match(worker.text(),/Contact your boss about company access/);assert.equal(purchaseButton(worker),undefined);assert.equal(restoreButton(worker).props.disabled,true);
});

test('retained purchase and restore callbacks cannot reuse replaced billing permissions',async()=>{
 for(const kind of ['revoked','failed']){
  const f=setup();f.focus();await settle();f.render();const oldPurchase=purchaseButton(f),oldRestore=restoreButton(f);
  f.read=async endpoint=>{if(endpoint==='status')return inactive;if(kind==='failed')throw Error('permissions offline');return {...capabilities,canPurchase:false,canManageBilling:false};};
  f.refresh();await settle();oldPurchase.props.onPress();oldRestore.props.onPress();assert.equal(f.purchases,0);assert.equal(f.restores,0);
 }
});

test('retained manage callback cannot open an old billing provider after permissions refresh',async()=>{
 const f=setup();f.read=async endpoint=>endpoint==='status'?active:capabilities;f.focus();await settle();f.render();
 const manage=f.nodes().find(n=>n.type==='TouchableOpacity'&&f.text(n).includes('Manage existing subscription'));
 f.read=async endpoint=>endpoint==='status'?active:{...capabilities,canPurchase:false,canManageBilling:false};f.refresh();await settle();await manage.props.onPress();assert.equal(f.managed,0);
});

test('verification refresh supersedes older reads without finishing unverified transactions',async()=>{
 const f=setup(),old=deferred();f.read=async()=>old.promise;f.focus();
 f.read=async endpoint=>endpoint==='status'?active:capabilities;await f.iapCallbacks.onPurchaseSuccess({productId:'product'});await settle();f.render();
 assert.equal(f.finished,1);assert.match(f.text(),/Status: Active/);old.resolve(inactive);await settle();f.render();assert.match(f.text(),/Status: Active/);
 f.verify=async()=>({success:false});await f.iapCallbacks.onPurchaseSuccess({productId:'product'});assert.equal(f.finished,1);
});

test('verified transaction keeps finish behavior after blur while UI reads remain fenced after unmount or session change',async()=>{
 for(const kind of ['blur','unmount','session']){
  const f=setup(),wait=deferred();f.mountLifecycle();f.focus();await settle();f.render();f.verify=async()=>wait.promise;
  const pending=f.iapCallbacks.onPurchaseSuccess({productId:'product'});if(kind==='blur')f.blur();else if(kind==='unmount')f.unmount();else f.replaceSession();
  const before=f.calls.length;wait.resolve(active);await pending;await settle();assert.equal(f.finished,1);assert.equal(f.calls.length,before);
  if(kind!=='blur')assert.equal(f.alerts.length,0);
 }
});

// Contract evidence: stripeService.getSubscriptionStatus always emits provider/null and tier/plan;
// complimentaryAccess emits plan=tester/provider=complimentary; authRoutes creates trialing/internal.
// Apple statusFromAppleStatus emits active/expired/billing_retry/grace_period/revoked; Google emits
// active/expired. Stripe persists its subscription status (active, trialing, canceled, incomplete,
// incomplete_expired, past_due, unpaid, paused). No manual provider emitter exists in current source.
test('current backend trial, complimentary, Apple, Google and Stripe status shapes remain readable',async()=>{
 const fixtures=[{plan:'tester',status:'active',provider:'complimentary',currentPeriodEnd:null},
  {tier:'trial',status:'trialing',provider:'internal',currentPeriodEnd:'2099-01-01'},
  {tier:'trial',status:'inactive',provider:null,currentPeriodEnd:null},
  ...['active','expired','billing_retry','grace_period','revoked'].map(status=>({plan:'team_10',status,provider:'apple',currentPeriodEnd:'2099-01-01'})),
  ...['active','expired'].map(status=>({plan:'team_10',status,provider:'google',currentPeriodEnd:'2099-01-01'})),
  ...['active','trialing','canceled','incomplete','incomplete_expired','past_due','unpaid','paused'].map(status=>({tier:'team_10',status,provider:'stripe',currentPeriodEnd:'2099-01-01'}))];
 for(const subscription of fixtures){const f=setup();f.read=async endpoint=>endpoint==='status'?{success:true,subscription}:capabilities;f.focus();await settle();f.render();assert.doesNotMatch(f.text(),/Plan status unavailable|Subscription status could not be confirmed/,JSON.stringify(subscription));}
});

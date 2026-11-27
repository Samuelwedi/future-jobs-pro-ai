const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=ts.createSourceFile('VoiceNoteScreen.tsx',readFileSync(path.join(__dirname,'../src/screens/VoiceNoteScreen.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let block;
function visit(node){
  if(ts.isIfStatement(node)&&node.expression.getText(source)==='result'&&ts.isBlock(node.thenStatement))block=node.thenStatement;
  ts.forEachChild(node,visit);
}
visit(source);assert.ok(block);
const code=ts.transpileModule('render = function(){'+block.getText(source)+'}',{
  fileName:'fixture.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}
}).outputText;
const base={transcript:'The valve was not replaced.',voiceNoteId:'synthetic',clientSummary:'Bad historical summary',structuredData:{actions:['replaced'],parts:['valve']}};
function render(result){
  const c={result,Platform:{OS:'ios'},React:{createElement:(kind,props,...children)=>({kind,props,children})},
    t:text=>text, styles:{},goBack(){},setResult(){},...Object.fromEntries(['KeyboardAvoidingView','ScrollView','Text','View','TranscriptEditor','TouchableOpacity'].map(n=>[n,n]))};
  vm.runInNewContext(code,c);const tree=c.render();
  function flatten(node){
    if(typeof node==='string')return node;
    if(!node)return '';
    if(Array.isArray(node))return node.map(flatten).join(' ');
    if(node.kind==='TranscriptEditor')return node.props.transcript;
    return flatten(node.children);
  }
  return flatten(tree);
}
test('old or explicitly unavailable derived details do not replace the original transcript',()=>{
  for(const status of [undefined,'unavailable','future-unknown']){
    const result=render({...base,structuredData:{...base.structuredData,extractionStatus:status}});
    assert.match(result,/AI details are unavailable/);
    assert.match(result,/valve was not replaced/);
    assert.doesNotMatch(result,/Bad historical summary|• replaced/);
  }
});
test('known AI draft still shows cues and details, not a verified work label',()=>{
  const result=render({...base,clientSummary:'Model text',structuredData:{...base.structuredData,extractionStatus:'model_draft'}});
  assert.match(result,/AI draft summary/);
  assert.match(result,/AI draft actions. Review before use/);
  assert.match(result,/AI draft parts and equipment/);
  assert.match(result,/Model text/);
});
test('audio only and edited cannot render stale AI-derived details',()=>{
  for(const status of ['skipped','edited']){
    const result=render({...base,transcriptionStatus:status,structuredData:{...base.structuredData,extractionStatus:'model_draft'}});
    assert.doesNotMatch(result,/Bad historical summary|• replaced/);
    assert.match(result,status==='skipped'?/No transcript or AI summary/:/Transcript edited/);
  }
});

import React,{useEffect,useMemo,useState} from 'react';
import {Box,Button,Chip,IconButton,MenuItem,Select,Typography} from '@mui/material';
import {Backspace,ContentCopy,History,RestartAlt} from '@mui/icons-material';
import {formatFeet,fraction,parseMeasure} from '../services/workerTools';

type Props={onTape:(line:string)=>void};
type Unit='ft'|'in'|'yd'|'m'|'cm'|'mm';
const unitFactor:Record<Unit,number>={ft:.3048,in:.0254,yd:.9144,m:1,cm:.01,mm:.001};
const keyRows=[
 [{l:'Conv',a:'convert',tone:'mode'},{l:'Store',a:'store',tone:'mode'},{l:'Recall',a:'recall',tone:'mode'},{l:'M+',a:'mplus',tone:'mode'},{l:'⌫',a:'back',tone:'danger'}],
 [{l:'Length',a:'dim:length',tone:'trade'},{l:'Width',a:'dim:width',tone:'trade'},{l:'Height',a:'dim:height',tone:'trade'},{l:'Circle',a:'circle',tone:'trade'},{l:'Arc',a:'arc',tone:'trade'}],
 [{l:'m',a:'unit:m',tone:'unit'},{l:'cm',a:'unit:cm',tone:'unit'},{l:'mm',a:'unit:mm',tone:'unit'},{l:'Bd Ft',a:'board',tone:'unit'},{l:'%',a:'percent',tone:'operator'}],
 [{l:'yd',a:'unit:yd',tone:'unit'},{l:'ft',a:'unit:ft',tone:'unit'},{l:'in',a:'unit:in',tone:'unit'},{l:'7',a:'digit:7'},{l:'8',a:'digit:8'},{l:'9',a:'digit:9'},{l:'÷',a:'op:/',tone:'operator'}],
 [{l:'√',a:'sqrt',tone:'function'},{l:'x²',a:'square',tone:'function'},{l:'1/x',a:'inverse',tone:'function'},{l:'4',a:'digit:4'},{l:'5',a:'digit:5'},{l:'6',a:'digit:6'},{l:'×',a:'op:*',tone:'operator'}],
 [{l:'π',a:'pi',tone:'function'},{l:'+/-',a:'sign',tone:'function'},{l:'C',a:'clear',tone:'danger'},{l:'1',a:'digit:1'},{l:'2',a:'digit:2'},{l:'3',a:'digit:3'},{l:'−',a:'op:-',tone:'operator'}],
 [{l:'AC',a:'allclear',tone:'danger'},{l:'Tape',a:'tape',tone:'mode'},{l:'00',a:'digit:00'},{l:'0',a:'digit:0'},{l:'.',a:'dot'},{l:'=',a:'equals',tone:'equals'},{l:'+',a:'op:+',tone:'operator'}]
];
const fmt=(v:number)=>Number.isFinite(v)?Number(v.toFixed(8)).toLocaleString(undefined,{maximumFractionDigits:8}):'Error';

export default function ConstructionCalculator({onTape}:Props){
 const [entry,setEntry]=useState('0'),[acc,setAcc]=useState<number|null>(null),[pending,setPending]=useState(''),[memory,setMemory]=useState(0),[unit,setUnit]=useState<Unit>('ft'),[target,setTarget]=useState<Unit>('m'),[mode,setMode]=useState('READY');
 const [dims,setDims]=useState<Record<string,number>>({}),[history,setHistory]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('workerTools:consoleTape')||'[]')}catch{return []}});
 useEffect(()=>localStorage.setItem('workerTools:consoleTape',JSON.stringify(history.slice(0,100))),[history]);
 const value=Number(entry.replace(/,/g,''))||0;
 const dimensionSummary=useMemo(()=>Object.entries(dims).map(([k,v])=>`${k[0].toUpperCase()}: ${fmt(v)} ${unit}`).join('  ·  '),[dims,unit]);
 const record=(label:string,result:number)=>{const line=`${label} = ${fmt(result)}`;setHistory(h=>[line,...h].slice(0,100));onTape(`Field calculator: ${line}`)};
 const setResult=(v:number,label:string)=>{setEntry(fmt(v));setMode(label);record(label,v)};
 const calculate=(operator=pending)=>{if(acc===null||!operator)return value;const out=operator==='+'?acc+value:operator==='-'?acc-value:operator==='*'?acc*value:operator==='/'?(value===0?NaN:acc/value):value;setAcc(null);setPending('');return out};
 const press=(action:string)=>{
  const [kind,arg]=action.split(':');
  if(kind==='digit'){setEntry(e=>e==='0'?arg:e+arg);setMode('ENTRY');return}
  if(action==='dot'){setEntry(e=>e.includes('.')?e:e+'.');return}
  if(action==='back'){setEntry(e=>e.length>1?e.slice(0,-1):'0');return}
  if(action==='clear'){setEntry('0');setMode('CLEARED');return}
  if(action==='allclear'){setEntry('0');setAcc(null);setPending('');setDims({});setMode('ALL CLEAR');return}
  if(action==='sign'){setEntry(e=>e.startsWith('-')?e.slice(1):e==='0'?e:'-'+e);return}
  if(kind==='op'){const base=acc===null?value:calculate();setAcc(base);setPending(arg);setEntry('0');setMode(`${fmt(base)} ${arg}`);return}
  if(action==='equals'){setResult(calculate(),`${acc===null?'Result':`${fmt(acc)} ${pending} ${fmt(value)}`}`);return}
  if(action==='sqrt'){setResult(value<0?NaN:Math.sqrt(value),`√ ${fmt(value)}`);return}
  if(action==='square'){setResult(value*value,`${fmt(value)}²`);return}
  if(action==='inverse'){setResult(value===0?NaN:1/value,`1 / ${fmt(value)}`);return}
  if(action==='pi'){setEntry(String(Math.PI));setMode('PI');return}
  if(action==='percent'){setEntry(String(value/100));setMode('PERCENT');return}
  if(action==='store'){setMemory(value);setMode('STORED');return}
  if(action==='recall'){setEntry(String(memory));setMode('RECALL');return}
  if(action==='mplus'){setMemory(m=>m+value);setMode('MEMORY +');return}
  if(kind==='unit'){const next=arg as Unit;const converted=value*unitFactor[unit]/unitFactor[next];setUnit(next);setEntry(fmt(converted));setMode(`${unit.toUpperCase()} → ${next.toUpperCase()}`);return}
  if(action==='convert'){const converted=value*unitFactor[unit]/unitFactor[target];setResult(converted,`${fmt(value)} ${unit} → ${target}`);return}
  if(kind==='dim'){setDims(d=>({...d,[arg]:value}));setEntry('0');setMode(`${arg.toUpperCase()} SAVED`);return}
  if(action==='circle'){setResult(Math.PI*value*value/4,`Circle area (diameter ${fmt(value)})`);return}
  if(action==='arc'){setResult(Math.PI*value,`Circumference (diameter ${fmt(value)})`);return}
  if(action==='board'){const boardFeet=(dims.length||0)*(dims.width||0)*value/144;setResult(boardFeet,'Board feet (height as thickness)');return}
  if(action==='tape'){record('Displayed value',value);setMode('SAVED TO TAPE')}
 };
 const parsed=(()=>{try{const metres=parseMeasure(`${entry} ${unit}`);return `${formatFeet(metres,16)}  ·  ${fraction(metres/.0254,16)} in  ·  ${metres.toFixed(4)} m`}catch{return ''}})();
 return <Box sx={{maxWidth:760,mx:'auto',p:{xs:1.2,sm:2},borderRadius:5,background:'linear-gradient(160deg,#192737,#071019 62%)',border:'1px solid #33485d',boxShadow:'0 24px 65px rgba(0,0,0,.45)'}}>
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',px:1,pb:1}}><Box><Typography fontWeight={950} letterSpacing={1.2}>FUTURE JOBS</Typography><Typography variant="caption" color="#67E8F9">FIELD CALCULATOR PRO</Typography></Box><Box sx={{display:'flex',gap:.7}}><Chip size="small" label={`M ${fmt(memory)}`}/><Chip size="small" color="info" label={mode}/></Box></Box>
  <Box sx={{p:{xs:2,sm:2.5},mb:2,borderRadius:3,bgcolor:'#bfd2bb',color:'#122018',boxShadow:'inset 0 3px 12px rgba(0,0,0,.3)',minHeight:126}}>
   <Typography variant="caption" sx={{opacity:.7,fontFamily:'monospace'}}>{dimensionSummary||'ENTER A VALUE OR SAVE LENGTH / WIDTH / HEIGHT'}</Typography>
   <Typography sx={{fontFamily:'monospace',fontSize:{xs:'2.1rem',sm:'3.25rem'},fontWeight:900,textAlign:'right',lineHeight:1.2,overflowWrap:'anywhere'}}>{entry} <Box component="span" sx={{fontSize:'.4em'}}>{unit}</Box></Typography>
   <Typography sx={{fontFamily:'monospace',fontSize:{xs:'.68rem',sm:'.82rem'},textAlign:'right',opacity:.75}}>{parsed}</Typography>
  </Box>
  <Box sx={{display:'flex',gap:1,alignItems:'center',mb:1.5,px:.5}}><Typography variant="caption">CONVERT TO</Typography><Select size="small" value={target} onChange={e=>setTarget(e.target.value as Unit)} sx={{minWidth:90}}>{Object.keys(unitFactor).map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</Select><Box sx={{flex:1}}/><IconButton aria-label="Copy display" onClick={()=>navigator.clipboard.writeText(`${entry} ${unit}`)}><ContentCopy/></IconButton><IconButton aria-label="Clear history" onClick={()=>setHistory([])}><RestartAlt/></IconButton></Box>
  <Box sx={{display:'flex',flexDirection:'column',gap:.8}}>{keyRows.map((row,ri)=><Box key={ri} sx={{display:'grid',gridTemplateColumns:`repeat(${row.length},minmax(0,1fr))`,gap:.8}}>{row.map(k=><Button key={k.a} onClick={()=>press(k.a)} aria-label={k.l} sx={{minWidth:0,minHeight:{xs:48,sm:58},px:.3,borderRadius:2,fontWeight:950,fontSize:{xs:'.72rem',sm:'.9rem'},color:k.tone==='equals'?'#031118':k.tone==='danger'?'#ffd5d5':'#f5fbff',background:k.tone==='equals'?'linear-gradient(180deg,#67E8F9,#22B8D5)':k.tone==='operator'?'linear-gradient(180deg,#41657e,#294558)':k.tone==='unit'?'linear-gradient(180deg,#7a6241,#59462e)':k.tone==='trade'?'linear-gradient(180deg,#365d67,#24434b)':k.tone==='danger'?'linear-gradient(180deg,#7a3f45,#542d32)':'linear-gradient(180deg,#3a4653,#252e37)',boxShadow:'inset 0 1px rgba(255,255,255,.18),0 3px 0 #05090d','&:hover':{filter:'brightness(1.18)',backgroundColor:'unset'}}}>{k.l}</Button>)}</Box>)}</Box>
  <Box sx={{mt:2,p:1.5,borderRadius:2,bgcolor:'rgba(0,0,0,.25)',maxHeight:130,overflow:'auto'}}><Box sx={{display:'flex',gap:1,alignItems:'center',mb:.5}}><History fontSize="small"/><Typography variant="caption" fontWeight={900}>PAPERLESS TAPE</Typography></Box>{history.length?history.slice(0,8).map((x,i)=><Typography key={i} sx={{fontFamily:'monospace',fontSize:'.74rem',opacity:i?0.68:1}}>{x}</Typography>):<Typography variant="caption" color="text.secondary">Calculations will appear here.</Typography>}</Box>
 </Box>
}

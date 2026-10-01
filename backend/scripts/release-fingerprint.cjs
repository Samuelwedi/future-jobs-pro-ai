const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const skip=new Set(['node_modules','.git','.expo','dist','build','.runtime','local-runtime','local-backups','production-backups','release-output','uploads','.gradle']);
const hash=crypto.createHash('sha256');
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
 if(skip.has(ent.name)||ent.name.startsWith('.env')||/\.(log|dump|zip)$/.test(ent.name))continue;
 const f=path.join(dir,ent.name);if(ent.isDirectory())walk(f);else if(ent.isFile()){hash.update(path.relative(root,f).replaceAll('\\','/'));hash.update(fs.readFileSync(f));}
}}
for(const item of ['backend','web','mobile','scripts'])walk(path.join(root,item));
for(const item of ['Dockerfile','railway.json','.dockerignore','.railwayignore'])hash.update(fs.readFileSync(path.join(root,item)));
const sha256=hash.digest('hex'),file=path.join(root,'release-output/validation.json');
if(process.argv[2]==='record'){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({sha256,validatedAt:new Date().toISOString()},null,2));console.log('Validated source fingerprint recorded');}
else if(process.argv[2]==='verify'){let previous;try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}if(previous?.sha256!==sha256)throw Error('Run -Stage Validate: source changed or validation is missing');console.log('Source matches validated release');}
else throw Error('Use record or verify');

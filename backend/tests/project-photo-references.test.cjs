const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mkdtempSync, writeFileSync, rmSync } = fs;
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');
process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
process.env.JWT_SECRET = 'isolated-project-photo-references';
process.env.CLOUDINARY_CLOUD_NAME = 'isolated-fixture';
require('ts-node/register/transpile-only');
const uuid = n => '6cb2f513-8d6b-4ff7-8a02-' + n.toString(16).padStart(12, '0');
const [company, foreignCompany, manager, employee, outsider, source, target, otherProject, archived, foreign, a, b, c, shift, foreignPhoto, video, inactive] = Array.from({length:17}, (_,i)=>uuid(i+1));
const capture = '2026-11-21T15:10:00.000Z';
const storage = (project, object) => `https://res.cloudinary.com/isolated-fixture/image/upload/v1/future-jobs-pro-ai/projects/${project}/2026-11/photos/${object}.png`;
const original = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Wut8AAAAASUVORK5CYII=', 'base64');
const nativeFetch = global.fetch;
let db, server, endpoint, storageReads, mutex = Promise.resolve(), beforeReturn;
const migration = fs.readFileSync(path.join(__dirname,'../migrations/20261128_project_photo_references.sql'),'utf8');
const { pool } = require('../src/config/database');
async function query(sql, args) {
  const result = await db.query(sql,args);
  return {...result, rowCount:result.rows.length || result.affectedRows || 0};
}
before(async () => {
  db = new PGlite(); storageReads = [];
  await db.exec(`
    SET TIME ZONE 'UTC';
    CREATE TABLE companies(id uuid PRIMARY KEY,name text);
    CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,is_active boolean,first_name text,last_name text);
    CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,name text,archived_at timestamptz,address text);
    CREATE TABLE time_entries(id uuid PRIMARY KEY,user_id uuid,project_id uuid,clock_in timestamptz);
    CREATE TABLE photos(id uuid PRIMARY KEY,company_id uuid,user_id uuid,project_id uuid,time_entry_id uuid,
      s3_key text,taken_at timestamptz,metadata jsonb,verification_hash text,file_type text);
    CREATE TABLE voice_notes(id uuid PRIMARY KEY,company_id uuid,project_id uuid,time_entry_id uuid,taken_at timestamptz,created_at timestamptz,audio_url text,transcript text,duration_seconds integer);
    CREATE TABLE attachments(id uuid,file_name text,file_url text,file_type text,file_size integer,created_at timestamptz,time_entry_id uuid,company_id uuid);
    CREATE TABLE gps_tracking(time_entry_id uuid,latitude real,longitude real,timestamp timestamptz,accuracy real,speed real);
    INSERT INTO companies VALUES ('${company}','Alder Yard Co'),('${foreignCompany}','Decoy');
    INSERT INTO users VALUES ('${manager}','${company}','manager',TRUE,'Mara','Manager'),('${employee}','${company}','employee',TRUE,'Avery','Worker'),('${outsider}','${foreignCompany}','manager',TRUE,'Decoy','User'),('${inactive}','${company}','manager',FALSE,'Inactive','User');
    INSERT INTO projects VALUES ('${source}','${company}','Intake',NULL,NULL),('${target}','${company}','East Service Gate',NULL,NULL),
      ('${otherProject}','${company}','Alder Yard Operations',NULL,NULL),('${archived}','${company}','Archived',now(),NULL),
      ('${foreign}','${foreignCompany}','East Service Gate',NULL,NULL);
    INSERT INTO time_entries VALUES ('${shift}','${employee}','${source}','2026-11-21T15:00:00Z');
    INSERT INTO photos VALUES
      ('${a}','${company}','${employee}','${otherProject}',NULL,'${storage(otherProject,'A')}','2026-11-21T00:55:00Z','{}','hash-a','image'),
      ('${b}','${company}','${employee}','${source}','${shift}','${storage(source,'B')}','${capture}','{"caption":"East Service Gate"}','hash-b','image'),
      ('${c}','${company}','${employee}','${otherProject}',NULL,'${storage(otherProject,'C')}','2026-11-22T07:00:00Z','{}','hash-c','image'),
      ('${foreignPhoto}','${foreignCompany}','${outsider}','${foreign}',NULL,'${storage(foreign,'decoy')}','${capture}','{}','hash-decoy','image'),
      ('${video}','${company}','${employee}','${source}',NULL,'https://example.invalid/video.mp4','${capture}','{}','hash-video','video');
  `);
  await db.exec(migration);
  await db.exec('ALTER TABLE photos ADD COLUMN future_column text');
  await db.exec(migration); // A later additive photo column must not corrupt the resolver view.
  pool.query = query;
  pool.connect = async () => {
    const prior = mutex; let release;
    mutex = new Promise(resolve => {release = resolve;});
    await prior;
    return {query,release};
  };
  global.fetch = async (input, options) => {
    const url = String(input);
    if (!url.startsWith('https://')) return nativeFetch(input, options);
    storageReads.push([url, options?.redirect]);
    if (![storage(source,'B'),storage(otherProject,'A'),storage(otherProject,'C')].includes(url)) throw new Error('unexpected cloud request');
    if (beforeReturn) await beforeReturn();
    return new Response(original, { headers:{'Content-Type':'image/png'} });
  };
  const app = express(); app.use(express.json());
  app.use('/api/photos', require('../src/routes/photoRoutes').default);
  app.use('/api/media', require('../src/routes/mediaRoutes').default);
  app.use('/api/evidence', require('../src/routes/evidenceBundleRoutes').default);
  server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  endpoint = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => {
  global.fetch=nativeFetch;
  if(server) await new Promise(resolve=>server.close(resolve));
  if(db) await db.close();
  await pool.end();
});
const album = (p=target,actor=manager) => req(`/photos/project/${p}`,{actor});
function req(path, {method='GET', actor=manager, expected=actor, tenant=actor===outsider?foreignCompany:company, body}={}) {
  const headers = {'Authorization':'Bearer '+jwt.sign({id:actor,role:'boss',companyId:company},process.env.JWT_SECRET),'X-Project-Actor':expected,'X-Project-Company':tenant,'Content-Type':'application/json'};
  return nativeFetch(endpoint+path,{method,headers,body:body?JSON.stringify(body):undefined});
}
const file = (p=target,photo=b, opts={}) => req(`/photos/project/${p}/photo/${photo}/reference`,{method:'PUT',body:{sourceProjectId:source},...opts});
const download = (p, photoIds, opts={}) => req(`/photos/project/${p}/export`,{method:'POST',body:{photoIds},...opts});
async function zipContents(response, visit) {
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/zip');
  const dir = mkdtempSync(path.join(tmpdir(),'photo-reference-'));
  try {
    const name=path.join(dir,'final.zip'); writeFileSync(name,Buffer.from(await response.arrayBuffer()));
    execFileSync('unzip',['-tq',name]);
    const files = execFileSync('unzip',['-Z1',name],{encoding:'utf8'}).trim().split('\n');
    visit(files, entry=>execFileSync('unzip',['-p',name,entry]));
  } finally { rmSync(dir,{recursive:true,force:true}); }
}

test('reference-only destination becomes discoverable and visible exactly once without changing the original',async()=>{
  assert.ok(!(await (await req('/media/projects')).json()).projects.some(x=>x.project_id===target));
  assert.deepEqual((await (await album()).json()).photos,[]);
  assert.equal((await download(target,[b])).status,404);
  const before = (await query('SELECT * FROM photos WHERE id=$1',[b])).rows[0];
  const copies = await Promise.all([file(),file(),file()]);
  assert.ok(copies.every(r=>r.status===200));
  const receipts = await Promise.all(copies.map(r=>r.json()));
  assert.deepEqual(receipts[0],receipts[1]); assert.deepEqual(receipts[0],receipts[2]);
  assert.equal(receipts[0].reference.source_project_id,source);
  assert.equal((await query('SELECT * FROM project_photo_references')).rowCount,1);
  assert.deepEqual((await query('SELECT * FROM photos WHERE id=$1',[b])).rows[0],before);
  const discovery=(await (await req('/media/projects')).json()).projects;
  assert.equal(discovery.filter(x=>x.project_id===target).length,1);
  assert.ok(!discovery.some(x=>x.project_id===foreign));
  assert.deepEqual((await (await req(`/media/project/${target}/months`)).json()).months,['2026-11']);
  const detail=await req(`/media/project/${target}/month/2026-11`);
  assert.equal(detail.headers.get('cache-control'),'private, no-store');
  const media=(await detail.json()).media;
  assert.deepEqual(media.map(x=>x.id),[b]); assert.equal(media[0].source_project_id,source);
  assert.equal(media[0].taken_at,capture); assert.equal(media[0].verification_hash,'hash-b');
  const mobile=(await (await album()).json()).photos;
  assert.deepEqual(mobile.map(x=>x.id),[b]);
  assert.equal(mobile[0].project_id,source); assert.equal(mobile[0].album_project_id,target);
  assert.deepEqual((await (await album(source)).json()).photos.map(x=>x.id).sort(),[b,video].sort());
});

test('skips no requested out-of-scope or unavailable photo and makes no storage request for forbidden selection',async()=>{
  const before = storageReads.length;
  for (const [response,status] of [
    [await file(target,b,{actor:employee}),403], [await file(target,b,{actor:inactive}),401],
    [await file(target,b,{expected:employee}),403], [await file(foreign,b),404],
    [await file(target,foreignPhoto),404], [await file(archived,b),404],
    [await file(target,video),404], [await file(source,b),409],
    [await file(target,b,{body:{sourceProjectId:otherProject}}),409], [await file(target,b,{body:{}}),400],
    [await req(`/photos/project/${source}/reference-targets`,{actor:employee}),403],
    [await download(target,[b,a]),404], [await download(target,[b],{actor:outsider}),404],
    [await download(target,[b],{actor:employee}),403], [await download(target,['not-a-uuid']),400],
  ]) assert.equal(response.status,status);
  assert.deepEqual((await (await album(target,outsider)).json()).photos,[]);
  assert.equal((await req(`/media/project/${target}/months`,{actor:outsider})).status,404);
  assert.equal(storageReads.length,before);
  const destinations=await (await req(`/photos/project/${source}/reference-targets`)).json();
  assert.deepEqual(destinations.projects.map(p=>p.id).sort(),[target,otherProject].sort());
});

test('destination ZIP has original bytes exactly once, source capture and copy provenance; shift ZIP still matches',async()=>{
  const prior = storageReads.length;
  const relevant = (await (await album()).json()).photos.filter(photo => photo.taken_at >= '2026-11-21T07:00:00.000Z' && photo.taken_at < '2026-11-22T07:00:00.000Z');
  assert.deepEqual(relevant.map(x=>x.id),[b]);
  await zipContents(await download(target,[b,b]),(files,read)=>{
    assert.deepEqual(files,[`photos/${b}.png`,'manifest.json']);
    const manifest=JSON.parse(read('manifest.json')); assert.equal(manifest.project.id,target);
    const [item]=manifest.photos; assert.equal(item.id,b); assert.equal(item.filedReference.actorId,manager);
    assert.ok(Date.parse(item.filedReference.filedAt)>Date.parse(capture));
    assert.deepEqual(item.originalCapture,{projectId:source,projectName:'Intake',actorId:employee,capturedAt:capture,storedVerificationHash:'hash-b'});
    assert.deepEqual(read(item.file),original);
    assert.equal(item.artifactSha256,createHash('sha256').update(original).digest('hex'));
  });
  assert.deepEqual(storageReads.slice(prior),[[storage(source,'B'),'error']]);
  await zipContents(await req(`/evidence/time-entry/${shift}/download`,{method:'POST',body:{
    photoIds:[b],includeTimeEntryPdf:false,includeGpsVideo:false,includeVoiceVideos:false,
  }}),(files,read)=>{
    const manifest=JSON.parse(read('manifest.json'));
    assert.deepEqual(manifest.photos.map(x=>[x.id,x.taken_at,x.verification_hash]),[[b,capture,'hash-b']]);
    assert.equal(manifest.timeEntry.project_id,source);
    assert.deepEqual(files.filter(x=>x.startsWith('photos/')),[`photos/001-${b}.png`]);
    assert.deepEqual(read(`photos/001-${b}.png`),original);
  });
});
test('Calgary day selection excludes preceding and exclusive end-boundary images in a project with direct uploads',async()=>{
  const start='2026-11-21T07:00:00.000Z', end='2026-11-22T07:00:00.000Z';
  const readDay=async()=> {
    const rows=(await (await album(otherProject)).json()).photos;
    return { full:rows.map(x=>x.id).sort(), day:rows.filter(p=>p.taken_at>=start&&p.taken_at<end).map(p=>p.id) };
  };
  assert.deepEqual(await readDay(),{full:[a,c].sort(),day:[]});
  assert.equal((await file(otherProject)).status,200);
  const after=await readDay();
  assert.deepEqual(after,{full:[a,b,c].sort(),day:[b]});
  await zipContents(await download(otherProject,after.day),(files,read)=>{
    assert.deepEqual(files,[`photos/${b}.png`,'manifest.json']);
    assert.equal(JSON.parse(read('manifest.json')).project.id,otherProject);
  });
});
test('a forged cross-company relationship and stale source-company relationship remain invisible',async()=>{
  await query('INSERT INTO project_photo_references(company_id,photo_id,source_project_id,project_id,copied_by) VALUES($1,$2,$3,$4,$5)',[company,foreignPhoto,foreign,target,manager]);
  assert.deepEqual((await (await album()).json()).photos.map(x=>x.id),[b]);
  assert.equal((await download(target,[foreignPhoto])).status,404);
  await query('UPDATE projects SET company_id=$1 WHERE id=$2',[foreignCompany,source]);
  try {
    assert.deepEqual((await (await album()).json()).photos,[]);
    assert.equal((await download(target,[b])).status,404);
  } finally { await query('UPDATE projects SET company_id=$1 WHERE id=$2',[company,source]); }
});
test('storage URL outside the original project and revoked access after fetch cannot yield a ZIP',async()=>{
  const before=storageReads.length;
  await query('UPDATE photos SET s3_key=$1 WHERE id=$2',[storage(otherProject,'B'),b]);
  let response=await download(target,[b]); assert.equal(response.status,503);
  assert.equal(storageReads.length,before); assert.equal(response.headers.get('content-disposition'),null);
  await query('UPDATE photos SET s3_key=$1 WHERE id=$2',[storage(source,'B'),b]);
  beforeReturn=()=>query('UPDATE users SET is_active=FALSE WHERE id=$1',[manager]);
  try {
    response=await download(target,[b]); assert.equal(response.status,409);
    assert.equal(response.headers.get('content-disposition'),null);
  } finally {beforeReturn=null; await query('UPDATE users SET is_active=TRUE WHERE id=$1',[manager]);}
});

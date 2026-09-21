import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.SIAREM_TEST_URL||'http://127.0.0.1:5174';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('These tests create local fixtures. Use a loopback server.');
const run=crypto.randomUUID();
const uid=(n)=>`qa-${run}-${n}`;
async function request(user,body,extra={}){const headers={'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':uid(user),'oai-authenticated-user-email':`${user}@example.test`}:{}),...extra};const r=await fetch(base+'/api/crm',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const raw=await r.text();let parsed;try{parsed=JSON.parse(raw)}catch{throw new Error(`${body?.action||'GET'} ${r.status}: ${raw}`)}return {status:r.status,body:parsed}}
test('server: authentication, tenant isolation, team membership, conflict handling and persistence',async()=>{
 assert.equal((await request(null)).status,401);
 assert.equal((await request(null,{action:'onboard',name:'Forbidden'})).status,401);
 const a=await request('a',{action:'onboard',name:`QA-${run}-A`});const b=await request('b',{action:'onboard',name:`QA-${run}-B`});assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal((await request('a',{action:'deleteDemo',revision:0},{Origin:'https://foreign.test'})).status,403);
 let response=await request('a',{action:'save',kind:'companies',record:{id:'secret-a',name:'Visible only to A',contact:'',email:'',phone:'',contactDays:45},revision:0});assert.equal(response.status,200);
 const bdata=(await request('b')).body;assert.equal(bdata.state.companies.some(c=>c.id==='secret-a'),false);
 response=await request('b',{action:'save',kind:'opportunities',record:{id:'cross',companyId:'secret-a',title:'Cross tenant',amount:1,stage:'Cualificación',closeDate:'2026-12-31',createdAt:'2026-09-21',nextStep:'',nextDate:''},revision:bdata.revision});assert.equal(response.status,400);
 response=await request('a',{action:'deleteDemo',revision:0});assert.equal(response.status,409);
 const token=(await request('a',{action:'invite'})).body.token;assert.ok(token);
 const joined=await request('colleague',{action:'join',token});assert.equal(joined.status,200);assert.equal(joined.body.state.companies.some(c=>c.id==='secret-a'),true);assert.equal(joined.body.role,'member');
 assert.equal((await request('colleague',{action:'invite'})).status,403);assert.equal((await request('other',{action:'join',token})).status,400);
 response=await request('colleague',{action:'save',kind:'companies',record:{id:'colleague-c',name:'Created by colleague',contact:'',email:'',phone:'',contactDays:30},revision:joined.body.revision});assert.equal(response.status,200);
 const persisted=(await request('a')).body;assert.equal(persisted.state.companies.some(c=>c.id==='colleague-c'),true);
 const [write1,write2]=await Promise.all(['one','two'].map(n=>request('a',{action:'save',kind:'companies',record:{id:n,name:n,contact:'',email:'',phone:'',contactDays:30},revision:persisted.revision})));
 assert.deepEqual([write1.status,write2.status].sort(),[200,409]);
 const latest=(await request('a')).body;assert.equal(latest.revision,persisted.revision+1);assert.equal(latest.state.companies.filter(c=>['one','two'].includes(c.id)).length,1);
 const exportResponse=await fetch(base+'/api/export?view=Empresas&q=Visible',{headers:{'oai-authenticated-user-id':uid('a'),'oai-authenticated-user-email':'a@example.test'}});assert.equal(exportResponse.status,200);assert.match(exportResponse.headers.get('content-disposition'),/attachment/);const csv=await exportResponse.text();assert.match(csv,/Visible only to A/);assert.doesNotMatch(csv,/Prueba Peña/);assert.equal((await fetch(base+'/api/export?view=Empresas')).status,401);
 const deleted=await request('a',{action:'deleteDemo',revision:latest.revision});assert.equal(deleted.status,200);assert.equal(deleted.body.state.companies.some(c=>c.demo),false);assert.equal(deleted.body.state.companies.some(c=>c.id==='secret-a'),true);
 console.log('Verified: anonymous rejection; cross-tenant read/write isolation; shared team; single-use invitations; owner permissions; stale revisions; concurrent writes; durable read-back; scoped demo cleanup.');
});

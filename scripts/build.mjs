import {PGlite} from '@electric-sql/pglite';
import {parse} from 'csv-parse/sync';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite({parsers:{1082:v=>v,1700:v=>v,20:v=>v}});
const schema=await fs.readFile('sql/01_schema.sql','utf8');
const views=await fs.readFile('sql/02_views.sql','utf8');
const csv={};
for(const name of ['portfolio','fx']) csv[name]=parse(await fs.readFile('data/'+name+'.csv','utf8'),{columns:true,skip_empty_lines:true});
async function reload(){
 await db.exec(schema);
 await db.exec('BEGIN; TRUNCATE raw.portfolio,raw.fx;');
 try{
  for(const name of ['portfolio','fx']){
   const rows=csv[name],keys=Object.keys(rows[0]);
   for(let i=0;i<rows.length;i+=250){
    const chunk=rows.slice(i,i+250),params=chunk.flatMap(r=>keys.map(k=>r[k]));
    const values=chunk.map((r,j)=>'('+keys.map((_,k)=>'$'+(j*keys.length+k+1)).join(',')+')');
    await db.query('INSERT INTO raw.'+name+' VALUES '+values.join(','),params);
   }
  }
  await db.exec('COMMIT');
 }catch(e){await db.exec('ROLLBACK');throw e;}
 await db.exec(views);
}
async function quality(){return (await db.query('SELECT * FROM reporting.v_quality ORDER BY check_name')).rows}
async function gate(){assert((await quality()).every(r=>Number(r.failures)===0),'Quality gate failed')}
async function metrics(){return (await db.query('SELECT * FROM reporting.v_metrics_change ORDER BY report_date')).rows}
await reload();await gate();const first=await metrics();
await reload();await gate();assert.deepEqual(await metrics(),first,'Idempotent reload changed result');
await db.exec(views);assert.deepEqual(await metrics(),first,'Repeated views changed result');
const breakdowns=(await db.query('SELECT * FROM reporting.v_breakdowns ORDER BY report_date,dimension,category')).rows;
const qa=await quality(),tests=['idempotent_reload','idempotent_views','source_quality_gates'];
// Isolated exact-boundary fixture, rolled back before exporting source results.
await db.exec('BEGIN; TRUNCATE raw.portfolio,raw.fx;');
for(const [id,dpd,restructured,writtenoff,group] of [
 ['a',30,0,0,'A'],['b',31,0,0,'B'],['c',90,0,0,'C'],['d',91,0,0,'D'],
 ['e',0,1,0,'E'],['f',999,1,1,'F']]){
 await db.query("INSERT INTO raw.portfolio VALUES ('2026-09-01',$1,'b',$5,'s','p','KZT','2020-01-01','2030-01-01',100,$2,$3,$4)",[id,dpd,restructured,writtenoff,group]);
}
let fixture=(await db.query('SELECT loan_id,is_par30,is_par90,is_npl,provision_rate FROM reporting.v_loans ORDER BY loan_id')).rows;
assert.equal(fixture.length,5);assert.equal(fixture[0].is_par30,false);
assert.equal(fixture[1].is_par30,true);assert.equal(fixture[2].is_par90,false);
assert.equal(fixture[3].is_par90,true);assert.equal(fixture[4].is_npl,true);
assert.equal(Number(fixture[4].provision_rate),.5);
tests.push('DPD30_31_90_91','restructured_zeroDPD_isNPL_and_50pct','writtenoff_excluded');
await db.exec('ROLLBACK');
// Aggregating groups before top10 must differ from taking10 biggest loans.
await db.exec('BEGIN; TRUNCATE raw.portfolio,raw.fx;');
for(let i=0;i<12;i++)await db.query("INSERT INTO raw.portfolio VALUES ('2026-09-01',$1,'b',$2,'s','p','KZT','2020-01-01','2030-01-01',$3,0,0,0)",['x'+i,i<2?'shared':'g'+i,i<2?60:100]);
let concentration=(await metrics())[0];
assert.equal(Number(concentration.portfolio_kzt),1120);assert.equal(Number(concentration.top10_kzt),1020);
tests.push('top10_groups_not_loans');
await db.exec('ROLLBACK');
for(const scenario of ['missing_fx','conflicting_loan','conflicting_fx']){
 await db.exec('BEGIN');
 if(scenario==='missing_fx')await db.exec("DELETE FROM raw.fx WHERE date=DATE '2026-10-01'");
 if(scenario==='conflicting_loan')await db.exec('INSERT INTO raw.portfolio SELECT report_date,loan_id,borrower_id,group_id,sector,program,currency,issue_date,maturity_date,principal_outstanding+1,days_past_due,restructured,written_off FROM raw.portfolio LIMIT 1');
 if(scenario==='conflicting_fx')await db.exec('INSERT INTO raw.fx SELECT date,currency,rate_kzt+1 FROM raw.fx LIMIT 1');
 let rejected=false;try{await gate()}catch{rejected=true}assert(rejected,scenario+' should block export');
 tests.push(scenario+'_blocks_export');await db.exec('ROLLBACK');
}
await gate();assert.deepEqual(await metrics(),first);
await fs.mkdir('outputs',{recursive:true});
await fs.mkdir('dashboard/vendor',{recursive:true});
const result={metrics:first,breakdowns,quality:qa};
await fs.writeFile('outputs/sql_results.json',JSON.stringify(result,null,2)+'\n');
await fs.writeFile('outputs/verification.json',JSON.stringify({engine:(await db.query('SELECT version()')).rows[0],tests,source_quality:qa,postgres16_docker_tested:false,note:'Docker CLI sockets unavailable; all views and fixtures ran in actual PostgreSQL through PGlite. Native postgres16 run script also provided, not claimed executed.'},null,2)+'\n');
for(const [pkg,path]of [['vega','build/vega.min.js'],['vega-lite','build/vega-lite.min.js'],['vega-embed','build/vega-embed.min.js']]){
 await fs.copyFile('node_modules/'+pkg+'/'+path,'dashboard/vendor/'+pkg+'.min.js');
 // Preserve upstream licensing in distributed JS assets.
 for(const license of ['LICENSE','LICENSE.txt','LICENSE.md']){try{await fs.copyFile('node_modules/'+pkg+'/'+license,'dashboard/vendor/'+pkg+'.LICENSE');break}catch{}}
}
const numRows=first.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,k==='report_date'?v:Number(v)])));
const sliceRows=breakdowns.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,['report_date','dimension','category'].includes(k)?v:Number(v)])));
const schemaVL='https://vega.github.io/schema/vega-lite/v5.json';
const config={font:'Arial',axis:{labelFontSize:12,titleFontSize:12},view:{stroke:null}};
const trendRows=numRows.flatMap(r=>['par30','par90','npl','top10_share'].map(k=>({date:r.report_date,metric:{par30:'PAR30',par90:'PAR90',npl:'NPL',top10_share:'Top10 групп'}[k],share:r[k]})));
const trend={$schema:schemaVL,description:'Две даты, доли взвешены по остатку KZT',data:{values:trendRows},width:'container',height:240,mark:{type:'line',point:true,strokeWidth:3},encoding:{x:{field:'date',type:'ordinal',title:'Дата среза',axis:{labelAngle:0}},y:{field:'share',type:'quantitative',title:'Доля портфеля',axis:{format:'.0%'}},color:{field:'metric',title:null},tooltip:[{field:'metric',title:'Метрика'},{field:'date',title:'Дата'},{field:'share',title:'Доля',format:'.2%'}]},config};
await fs.writeFile('dashboard/trends.vl.json',JSON.stringify(trend,null,2));
for(const dim of ['sector','program']){
 const spec={$schema:schemaVL,data:{values:sliceRows.filter(r=>r.dimension===dim)},width:'container',height:230,mark:{type:'bar'},encoding:{y:{field:'category',type:'nominal',title:null,sort:'-x'},x:{field:'portfolio_kzt',type:'quantitative',title:'Остаток, KZT',axis:{format:'.2s'}},color:{field:'report_date',title:'Дата',scale:{range:['#a6bfd1','#10636b']}},yOffset:{field:'report_date'},tooltip:[{field:'category',title:'Сегмент'},{field:'report_date',title:'Дата'},{field:'portfolio_kzt',title:'KZT',format:',.2f'},{field:'par30',title:'PAR30',format:'.2%'},{field:'par90',title:'PAR90',format:'.2%'},{field:'npl',title:'NPL',format:'.2%'},{field:'provisions_kzt',title:'Провизии KZT',format:',.2f'}]},config};
 await fs.writeFile('dashboard/'+dim+'.vl.json',JSON.stringify(spec,null,2));
}
await fs.writeFile('dashboard/data.json',JSON.stringify(result,null,2));
await db.close();console.log(JSON.stringify({engine:'PGlite PostgreSQL',checks:tests.length,metrics:first}));


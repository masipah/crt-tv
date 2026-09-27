import test from 'node:test';
import assert from 'node:assert/strict';
import {createMuniFeed,normalizePredictions,STOPS} from '../muni.mjs';
import {upcomingDepartures,formatWait} from '../public/muni/display.mjs';
const row=(id,route='7',minutes=3)=>({stop:{code:id},route:{id:route},serverTimestamp:100000,values:[{minutes,timestamp:100000+minutes*60000,direction:{name:'Transit Center'}}]});
const html='<script data-drupal-selector="drupal-settings-json">'+JSON.stringify({umo:{base:'https://webservices.umoiq.com/api/pub/v1/agencies/sfmta-cis',key:'public-test-key'}})+'</script>';
test('platform matching, all reported routes, source clock and invalid predictions',()=>{
  const valid=row('17757');
  const result=normalizePredictions([valid,row('17757','FBUS',5),{...valid,values:[...valid.values,...valid.values,{minutes:-1},{minutes:2,direction:{name:'x'},timestamp:null}]}],'17757',500000);
  assert.equal(result.find(s=>s.route==='7'&&s.destination==='Transit Center').arrivals[0],680000);
  assert.equal(result.find(s=>s.route==='7'&&s.destination==='Transit Center').arrivals.length,1);
  assert.ok(result.some(s=>s.route==='FBUS'));
  assert.throws(()=>normalizePredictions([row('14954')],'17757',500000));
  assert.throws(()=>normalizePredictions({error:'bad'},'17757',500000));
  const bad={...valid,values:[{minutes:1,timestamp:'bad',direction:{name:'x'}},{minutes:null,direction:{name:'x'}},{minutes:1,timestamp:10,direction:{name:'x'}},{minutes:4}]};
  assert.deepEqual(normalizePredictions([bad],'17757',500000),[]);
});
test('feed coalesces viewers, isolates stop failures, distinguishes empty data and expires arrivals',async()=>{
  let time=500000,calls=0,broken='',empty=false;
  const fetchImpl=async url=>{calls++;if(url==='https://www.sfmta.com/find-a-stop')return {ok:true,text:async()=>html};
    const id=new URL(url).pathname.split('/').at(-2);if(id===broken)throw Error('private upstream URL');
    return {ok:true,json:async()=>empty?[]:[row(id)]};};
  const feed=createMuniFeed({fetchImpl,now:()=>time});
  const [a,b]=await Promise.all([feed(),feed()]);assert.deepEqual(a,b);assert.equal(calls,5);assert.equal(a.stops.length,4);assert.ok(a.stops.every(s=>!s.stale));assert.doesNotMatch(JSON.stringify(a),/public-test-key/);
  await feed();assert.equal(calls,5);
  time+=16000;broken=STOPS[0].id;const partial=await feed();assert.equal(partial.stops[0].stale,true);assert.deepEqual(partial.stops[0].services,[]);assert.equal(partial.stops[1].stale,false);
  time+=16000;broken='';empty=true;const blank=await feed();assert.ok(blank.stops.every(s=>!s.stale&&!s.services.length));
});
test('untrusted configuration never becomes an arbitrary fetch target',async()=>{
  let calls=0;
  const feed=createMuniFeed({fetchImpl:async()=>{calls++;return {ok:true,text:async()=>html.replace('https://webservices.umoiq.com/api/pub/v1/agencies/sfmta-cis','http://localhost')};}});
  assert.ok((await feed()).stops.every(s=>s.stale));assert.equal(calls,1);
});
test('one screen merges both directions by time, excludes stale stops and expires departures',()=>{
  const stop={id:'1',fetchedAt:0,services:[{route:'7',destination:'Town',arrivals:[10000,20000,40000],ids:{10000:'trip-a'}}]};
  const other={id:'2',fetchedAt:0,services:[{route:'F',destination:'Wharf',arrivals:[5000,15000,30000]}]};
  const departures=upcomingDepartures([stop,other],0);
  assert.equal(departures.length,5);assert.deepEqual(departures.map(a=>a.arrivalAt),[5000,10000,15000,20000,30000]);
  assert.deepEqual(departures.map(a=>a.route),['F','7','F','7','F']);
  assert.equal(departures[1].key,'1:7:Town:trip-a');
  assert.deepEqual(upcomingDepartures([stop,other],0,{unavailable:true}),[]);
  assert.equal(upcomingDepartures([{...stop,stale:true},other],0).length,3);
  assert.deepEqual(upcomingDepartures([stop],50000),[]);
  assert.equal(upcomingDepartures([stop,other],6000)[0].arrivalAt,10000);
  assert.equal(formatWait(61000,2000),'まもなく');assert.equal(formatWait(62000,2000),'あと1分');
  assert.deepEqual(STOPS.map(s=>s.direction),['INBOUND','OUTBOUND','INBOUND','OUTBOUND']);
});

test('cached countdowns remove arrivals that have already passed',async()=>{
  let time=500000,calls=0;
  const feed=createMuniFeed({now:()=>time,fetchImpl:async url=>{
    calls++;if(url==='https://www.sfmta.com/find-a-stop')return {ok:true,text:async()=>html};
    const id=new URL(url).pathname.split('/').at(-2);
    return {ok:true,json:async()=>[row(id,'7',0.1)]};
  }});
  assert.equal((await feed()).stops[0].services.length,1);
  time+=7000;
  const after=await feed();assert.equal(calls,5);assert.equal(after.stops[0].stale,false);assert.deepEqual(after.stops[0].services,[]);
});

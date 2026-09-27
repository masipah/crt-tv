import test from 'node:test';
import assert from 'node:assert/strict';
import { createMuniFeed, normalizeVehicles } from '../muni.mjs';
const car = {id:'1051',route:{id:'F'},predictable:true,lat:37.77,lon:-122.42,secsSinceReport:5,vehicleType:'Historic Street Car_VC1',dir:{id:'F_1_var0'},heading:360};
test('only valid, recent F-line vehicles are shown',()=>{
  const rows=[car,{...car,route:{id:'J'}},{...car,predictable:false},{...car,secsSinceReport:301},{...car,lat:null},{...car,lat:0},{...car,vehicleType:'Ghost'},{...car,secsSinceReport:-1}];
  const result=normalizeVehicles(rows,1000000);
  assert.equal(result.length,1);assert.equal(result[0].direction,'Wharf');assert.equal(result[0].reportedAt,995000);assert.equal(result[0].heading,0);
  assert.throws(()=>normalizeVehicles({error:'upstream error'},1000000));
});
test('feed shares requests, respects polling interval and distinguishes outage from empty service',async()=>{
  let time=1000000,calls=0,fail=false,rows=[car];
  const fetchImpl=async()=>{calls++;if(fail)throw Error('private upstream URL');return {ok:true,text:async()=>'<script type="application/json" data-drupal-selector="drupal-settings-json">'+JSON.stringify({gtfsRtUmoiq:{baseUrl:'https://webservices.umoiq.com/api/pub/v1',agency:'sfmta-cis',key:'public-test-key'}})+'</script>',json:async()=>rows};};
  const feed=createMuniFeed({fetchImpl,now:()=>time});
  const [a,b]=await Promise.all([feed(),feed()]);assert.equal(calls,2);assert.deepEqual(a,b);assert.equal(a.stale,false);
  await feed();assert.equal(calls,2);assert.doesNotMatch(JSON.stringify(a),/public-test-key/);
  time+=16000;fail=true;const stale=await feed();assert.equal(stale.stale,true);assert.equal(stale.vehicles.length,1);
  time+=301000;const expired=await feed();assert.equal(expired.vehicles.length,0);assert.equal(expired.stale,true);
  fail=false;rows=[];time+=16000;const empty=await feed();assert.equal(empty.stale,false);assert.deepEqual(empty.vehicles,[]);
});
test('invalid feed configuration cannot turn the proxy into an arbitrary URL fetcher',async()=>{
  let calls=0;
  const feed=createMuniFeed({fetchImpl:async()=>{calls++;return {ok:true,text:async()=>'<script data-drupal-selector="drupal-settings-json">'+JSON.stringify({gtfsRtUmoiq:{baseUrl:'http://127.0.0.1',agency:'sfmta-cis',key:'x'}})+'</script>'};}});
  assert.equal((await feed()).stale,true);assert.equal(calls,1);
});

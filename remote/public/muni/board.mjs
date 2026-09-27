import { upcomingDepartures, formatWait, japaneseDestination, serviceLabel } from './display.mjs?v=4';
const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search), clamp = (n,a,b) => Math.min(b,Math.max(a,n));
const [fx,fy] = (q.get('crtFit') || '1').split('x').map(Number);
const [sx,sy] = (q.get('crtShift') || '0,0').split(',').map(Number);
function fit() {
  const x=clamp(fx||1,.5,1), y=clamp(fy||fx||1,.5,1);
  $('screen').style.transform=`translate(${(innerWidth-innerWidth*x)/2+clamp(sx||0,-100,100)}px,${(innerHeight-innerHeight*y)/2+clamp(sy||0,-100,100)}px) scale(${innerWidth*x/720},${innerHeight*y/480})`;
}
addEventListener('resize',fit);fit();
const clock = new Intl.DateTimeFormat('ja-JP',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
let snapshot, received=0, failed=false;
const rows=new Map();
let showingMessage=true, orderTimer;
function message(title,note='') {
  const box=document.createElement('div');box.className='message';box.textContent=title;
  if(note){const small=document.createElement('small');small.textContent=note;box.append(small);}
  $('departures').replaceChildren(box);rows.clear();showingMessage=true;
}
function render() {
  if(!snapshot)return;
  const elapsed=performance.now()-received, now=snapshot.serverTime+elapsed;
  const unavailable=failed||elapsed>45000;
  const missing=unavailable?snapshot.stops.length:snapshot.stops.filter(s=>s.stale||now-s.fetchedAt>45000).length;
  const arrivals=upcomingDepartures(snapshot.stops,now,{unavailable});
  $('stop-heading').textContent=missing?'一部未取得':'停留所';
  if(!arrivals.length){message(missing?'情報を取得できません':'到着予測はありません',missing?'再接続しています':'まもなく再更新します');return;}
  const wasEmpty=showingMessage;
  if(showingMessage){$('departures').replaceChildren();showingMessage=false;}
  for(const el of $('departures').querySelectorAll('.placeholder'))el.remove();
  const keys=new Set(arrivals.map(a=>a.key));
  for(const [key,row] of rows){
    if(keys.has(key))continue;
    rows.delete(key);row.style.transform='translateY(-84px)';row.style.opacity='0';
    row.setAttribute('aria-hidden','true');setTimeout(()=>row.remove(),700);
  }
  arrivals.forEach((arrival,index)=>{
    let row=rows.get(arrival.key);
    const entering=!row;
    if(entering){
      row=document.createElement('div');row.className='row';row.dataset.trip=arrival.key;
      row.style.transition='none';row.style.transform=`translateY(${wasEmpty?index*84:420}px)`;
      row.style.opacity=wasEmpty?'1':'0';
      const label=serviceLabel(arrival.route), service=document.createElement('div');service.className=`service ${label.kind}`;
      const name=document.createElement('span');name.className='name';name.textContent=label.name;
      const number=document.createElement('span');number.className='number';number.textContent=label.number;service.append(name,number);
      const time=document.createElement('div');time.className='time';
      const at=document.createElement('span');at.className='at';const wait=document.createElement('small');time.append(at,wait);
      const destination=document.createElement('div');const translated=japaneseDestination(arrival.destination);
      destination.className='destination'+(translated===arrival.destination?' latin':'');destination.textContent=translated;
      const stop=document.createElement('div');stop.className='stop';
      stop.textContent=arrival.stop.name.startsWith('Haight')?'ヘイト・ゴフ':'マーケット';
      const direction=document.createElement('small');direction.textContent=(arrival.stop.name.startsWith('Market')?'ゴフ・':'')+(arrival.stop.direction==='INBOUND'?'都心方面':'郊外方面');stop.append(direction);
      row.append(service,time,destination,stop);rows.set(arrival.key,row);$('departures').append(row);
    }
    row.querySelector('.at').textContent=clock.format(new Date(arrival.arrivalAt));
    row.querySelector('.time small').textContent=formatWait(arrival.arrivalAt,now);
    if(entering){
      // Commit the off-screen position, then glide into the vacated bottom row.
      void row.offsetHeight;row.style.transition='';
    }
    row.style.transform=`translateY(${index*84}px)`;row.style.opacity='1';

  });
  // Reordering an attached element can cancel its CSS transition. Preserve nodes
  // during the slide, then align reading order once movement has finished.
  const targetKeys=arrivals.map(a=>a.key);
  const domKeys=Array.from($('departures').querySelectorAll('.row:not([aria-hidden])')).map(r=>r.dataset.trip);
  if(targetKeys.join('|')!==domKeys.join('|')){
    clearTimeout(orderTimer);orderTimer=setTimeout(()=>{for(const key of targetKeys){const row=rows.get(key);if(row)$('departures').append(row);}},700);
  }
  for(let i=arrivals.length;i<5;i++){const empty=document.createElement('div');empty.className='placeholder';empty.style.transform=`translateY(${i*84}px)`;empty.textContent='—';$('departures').append(empty);}

}
async function poll() {
  try {
    const response=await fetch('/api/muni',{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error();
    const next=await response.json();if(!Array.isArray(next.stops)||!next.stops.length||!Number.isFinite(next.serverTime))throw Error();
    snapshot=next;received=performance.now();failed=false;
  } catch {failed=true;if(!snapshot)message('情報を取得できません','再接続しています');}
  render();setTimeout(poll,15000);
}
setInterval(render,1000);render();poll();

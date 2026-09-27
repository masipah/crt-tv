const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const [fx, fy] = (q.get('crtFit') || '1').split('x').map(Number);
const [sx, sy] = (q.get('crtShift') || '0,0').split(',').map(Number);
const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
function fit() {
  const x=clamp(fx||1,.5,1), y=clamp(fy||fx||1,.5,1);
  $('screen').style.transform=`translate(${(innerWidth-innerWidth*x)/2+clamp(sx||0,-100,100)}px,${(innerHeight-innerHeight*y)/2+clamp(sy||0,-100,100)}px) scale(${innerWidth*x/720},${innerHeight*y/480})`;
}
addEventListener('resize',fit); fit();
const localBounds=[-122.436,37.765,-122.414,37.7745];
const fullBounds=[-122.438,37.760,-122.390,37.811];
let data, full=false, vehicles=new Map(), received=0, serverClock=0, snapshot=null, failed=false;
const views=[$('map')].map(canvas=>({canvas,ctx:canvas.getContext('2d'),base:document.createElement('canvas')}));
function project(bounds,w,h) {
  const [west,south,east,north]=bounds, cos=Math.cos(37.78*Math.PI/180);
  const scale=Math.min(w/((east-west)*cos),h/(north-south));
  return ([lon,lat])=>[w/2+(lon-(west+east)/2)*cos*scale,h/2-(lat-(south+north)/2)*scale];
}
function path(ctx,points,p) {ctx.beginPath();points.forEach((point,i)=>{const [x,y]=p(point);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});}
function label(ctx,text,x,y,size=12,color='#263936') {ctx.font=`bold ${size}px Arial`;ctx.lineWidth=3;ctx.strokeStyle='#e4e7d8';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);}
function base(view) {
  const w=view.canvas.width/2,h=view.canvas.height/2,bounds=full?fullBounds:localBounds;
  view.base.width=view.canvas.width;view.base.height=view.canvas.height;
  const c=view.base.getContext('2d');c.scale(2,2);view.p=project(bounds,w,h);view.w=w;view.h=h;
  const p=view.p;c.fillStyle='#d6ddc3';c.fillRect(0,0,w,h);
  // Quiet block texture, with real city street centerlines drawn on top.
  c.fillStyle='#cbd5b8';for(let y=0;y<h;y+=5)for(let x=(y%10);x<w;x+=10)c.fillRect(x,y,1,1);
  const visible=[];
  for(const road of data.roads) {
    const points=road.points.map(p);
    if(!points.some(([x,y])=>x>-30&&x<w+30&&y>-30&&y<h+30))continue;
    if(full && road.kind>4)continue;
    visible.push({...road,xy:points});
    path(c,road.points,p);c.strokeStyle='#a5af9d';c.lineWidth=full?2:road.name==='MARKET ST'?14:road.kind<=3?8:5;c.stroke();
    c.strokeStyle='#f7f2dc';c.lineWidth=full?1:road.name==='MARKET ST'?11:road.kind<=3?6:3;c.stroke();
  }
  for(const line of data.route){path(c,line,p);c.lineJoin='round';c.lineCap='round';c.strokeStyle='#65471e';c.lineWidth=full?9:11;c.stroke();c.strokeStyle='#bb3e43';c.lineWidth=full?5:7;c.stroke();}
  {
    const names=new Set(), boxes=[];
    const focus=data.stops.map(stop=>p(stop.point));
    visible.sort((a,b)=>a.kind-b.kind);
    for(const road of visible) {
      if(names.has(road.name)||road.xy.length<2||/HWY|I-[0-9]|RAMP|TUNL/.test(road.name))continue;
      if(!['MARKET ST','MISSION ST','VALENCIA ST','GOUGH ST','DOLORES ST','HAIGHT ST','GUERRERO ST','OAK ST','PAGE ST','DUBOCE AVE','SOUTH VAN NESS AVE','CHURCH ST','14TH ST','16TH ST','VAN NESS AVE','BROADWAY','BAY ST','THE EMBARCADERO','CALIFORNIA ST','GEARY ST'].includes(road.name))continue;
      const first=road.xy[0],last=road.xy.at(-1),x=(first[0]+last[0])/2,y=(first[1]+last[1])/2;
      if(x<38||x>w-50||y<45||y>h-35||Math.hypot(last[0]-first[0],last[1]-first[1])<28)continue;
      if(focus.some(([a,b])=>Math.abs(x-a)<150&&Math.abs(y-b)<45))continue;
      const text=road.name.replace(/\bST$/,'').replace(/\bAVE$/,'').trim();
      c.font='bold 16px Arial'; const width=c.measureText(text).width;
      if(boxes.some(b=>Math.abs(x-b.x)<(width+b.width)/2+8&&Math.abs(y-b.y)<37))continue;
      names.add(road.name);boxes.push({x,y,width});
      c.textAlign='center';label(c,text,x,y,16,'#506250');
    }
    c.textAlign='left';
  }
  const stops=data.stops.filter(s=>s.id!=='15672');
  for(const stop of stops){
    const [x,y]=p(stop.point);c.beginPath();c.arc(x,y,10,0,Math.PI*2);c.fillStyle='#ffe65e';c.fill();c.strokeStyle='#6b421d';c.lineWidth=3;c.stroke();
    const name=(full?'':'MARKET & ')+(stop.id==='15668'?'DOLORES':'GOUGH');
    c.font='bold 21px Arial';const width=c.measureText(name).width+20;
    const bx=full ? (stop.id==='15668'?x-width-18:x+18) : x-width/2;
    const left=clamp(bx,5,w-width-5),by=clamp(stop.id==='15668'?y+17:y-48,5,h-37);
    c.beginPath();c.moveTo(x,y);c.lineTo(clamp(x,left,left+width),by+16);c.strokeStyle='#6b421d';c.lineWidth=2;c.stroke();
    c.fillStyle='#fff1a4';c.fillRect(left,by,width,33);c.strokeStyle='#80602d';c.lineWidth=2;c.strokeRect(left,by,width,33);c.fillStyle='#3b2b22';c.fillText(name,left+10,by+24);
  }
  if(full){
    c.textAlign='left';
    for(const [name,point,dx,dy] of [['CASTRO',[-122.435,37.7626],-185,-43],['FISHERMAN’S WHARF',[-122.414,37.808],-310,9],['FERRY BUILDING',[-122.393,37.794],18,0]]){
      const [x,y]=p(point);label(c,name,clamp(x+dx,8,w-c.measureText(name).width-8),clamp(y+dy,22,h-10),19,'#1b3a46');
    }
  }

}
function car(view,v,time) {
  const age=(Date.now()-received)+serverClock-v.reportedAt;
  if(age>300000)return;
  const progress=clamp((time-v.start)/15000,0,1), point=[v.from[0]+(v.to[0]-v.from[0])*progress,v.from[1]+(v.to[1]-v.from[1])*progress];
  const [x,y]=view.p(point);if(x<0||x>view.w||y<0||y>view.h)return;
  const c=view.ctx;c.save();c.globalAlpha=age>120000||failed||snapshot?.stale?0.5:1;
  c.translate(x,y);c.scale(1.6,1.6);c.rotate((v.heading||0)*Math.PI/180);
  c.fillStyle='#163953';c.fillRect(-5,-9,10,18);c.strokeStyle='#fffbe0';c.lineWidth=1.5;c.strokeRect(-5,-9,10,18);
  c.fillStyle=v.direction==='Wharf'?'#36c4dc':'#ef9168';c.fillRect(-3,-7,6,13);c.fillStyle='#15365b';c.fillRect(-2,-5,4,3);c.fillRect(-2,0,4,3);
  c.beginPath();c.moveTo(0,-13);c.lineTo(-3,-9);c.lineTo(3,-9);c.closePath();c.fillStyle='#fffbe0';c.fill();c.restore();
  // Large streetcar symbols are the readout; omit tiny fleet numbers on an 8-inch CRT.
}
let lastFrame=0;
function animate(time) {
  if(time-lastFrame<33){requestAnimationFrame(animate);return;}
  lastFrame=time;
  if(data)for(const view of views){view.ctx.setTransform(1,0,0,1,0,0);view.ctx.drawImage(view.base,0,0);view.ctx.scale(2,2);view.ctx.save();view.ctx.beginPath();view.ctx.rect(0,0,view.w,view.h);view.ctx.clip();for(const v of vehicles.values())car(view,v,time);view.ctx.restore();}
  requestAnimationFrame(animate);
}
function updateText() {
  if(!snapshot)return;
  const age=snapshot.fetchedAt===null?Infinity:(Date.now()-received)+serverClock-snapshot.fetchedAt;
  const stale=failed||snapshot.stale||age>45000;
  const count=[...vehicles.values()].filter(v=>Date.now()-received+serverClock-v.reportedAt<=300000).length;
  $('status').textContent=stale?'Muni feed delayed':count?`${count} streetcars · LIVE`:'No streetcars reporting';
  $('lamp').classList.toggle('live',!stale);
  $('age').textContent=Number.isFinite(age)?`${Math.max(0,Math.floor(age/1000))}s ago`:'Feed unavailable';
}
async function poll() {
  try {
    const response=await fetch('/api/muni',{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!response.ok)throw Error();
    const next=await response.json();if(!Array.isArray(next.vehicles))throw Error();
    const time=performance.now(), updated=new Map();
    for(const v of next.vehicles){const previous=vehicles.get(v.id),to=[v.lon,v.lat];
      if(previous&&v.reportedAt<=previous.reportedAt+1000){updated.set(v.id,previous);continue;}
      const f=previous?clamp((time-previous.start)/15000,0,1):1;
      const from=previous?previous.from.map((n,i)=>n+(previous.to[i]-n)*f):to;
      // Teleports after a long gap snap to the report rather than inventing a trip.
      const nearby=previous&&Math.hypot((from[0]-to[0])*.79,from[1]-to[1])<.008;
      updated.set(v.id,{...v,to,from:nearby?from:to,start:time});
    }
    vehicles=updated;snapshot=next;received=Date.now();serverClock=next.serverTime;failed=false;
    $('accessible').textContent=next.vehicles.map(v=>`F streetcar ${v.id}, toward ${v.direction}`).join('. ');
  } catch {failed=true;if(!snapshot){$('status').textContent='Muni feed unavailable · retrying';$('age').textContent='';}}
  updateText();setTimeout(poll,15000);
}

try {const response=await fetch('/muni/map.json');if(!response.ok)throw Error();data=await response.json();views.forEach(v=>base(v));
setInterval(()=>{full=!full;$('maptitle').textContent=full?'FULL F-LINE':'NEIGHBORHOOD';views.forEach(v=>base(v));},20000);requestAnimationFrame(animate);poll();}
catch {$('status').textContent='Map unavailable · reload to retry';}
updateText();setInterval(updateText,1000);

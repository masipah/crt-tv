import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {promises as fs} from 'node:fs';
import {once} from 'node:events';
import vm from 'node:vm';
import {mpvSet} from '../control.mjs';
test('mpv property writes wait for acknowledgement and reject player errors',async()=>{
 const dir=await fs.mkdtemp('/tmp/crt-ipc-'),socket=dir+'/s';
 let accept=false,commands=[];
 const server=net.createServer(client=>client.once('data',chunk=>{
  const request=JSON.parse(chunk.toString());commands.push(request.command);
  setTimeout(()=>client.end(JSON.stringify({request_id:1,error:accept?'success':'property unavailable'})+'\n'),20);
 }));
 server.listen(socket);await once(server,'listening');
 try{
  assert.equal(await mpvSet('time-pos',10,socket),false);
  accept=true;assert.equal(await mpvSet('time-pos',10,socket),true);
  assert.deepEqual(commands,[['set_property','time-pos',10],['set_property','time-pos',10]]);
 }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
test('all browser channels share bounded CRT geometry parsing',async()=>{
 const context=vm.createContext({URLSearchParams});
 vm.runInContext(await fs.readFile(new URL('../../scripts/kiosk-ext/display-fit.js',import.meta.url),'utf8'),context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.crtDisplayFit('?crtFit=0.943x1&crtShift=6,0'))),{fitX:.943,fitY:1,shiftX:6,shiftY:0});
 assert.deepEqual(JSON.parse(JSON.stringify(context.crtDisplayFit('?crtFit=garbage&crtShift=999,-999'))),{fitX:1,fitY:1,shiftX:100,shiftY:-100});
});

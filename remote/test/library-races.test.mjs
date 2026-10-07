import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';

test('overlapping same-name uploads preserve both files; concurrent edits preserve valid metadata', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'crt-library-races-'));
  process.env.MEDIA_DIR=dir;process.env.CRT_REMOTE_PORT='0';
  const {server}=await import('../server.mjs');
  if(!server.listening)await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  function startUpload(value) {
    let resolve;const result=new Promise(r=>resolve=r);
    const request=http.request(`${base}/api/upload?name=same.mp4`,{method:'PUT'},response=>{
      let body='';response.on('data',chunk=>body+=chunk);
      response.on('end',()=>resolve({status:response.statusCode,...JSON.parse(body)}));
    });
    request.write(value);return {request,result};
  }
  try {
    const first=startUpload('FIRST'),second=startUpload('SECOND');
    first.request.end();second.request.end();
    const results=await Promise.all([first.result,second.result]);
    assert.deepEqual(results.map(r=>r.status),[200,200]);
    assert.equal(new Set(results.map(r=>r.name)).size,2);
    assert.deepEqual(new Set(await Promise.all(results.map(r=>fs.readFile(path.join(dir,'videos',r.name),'utf8')))),new Set(['FIRST','SECOND']));
    const edits=await Promise.all(Array.from({length:8},()=>fetch(`${base}/api/order`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dir:'videos',names:results.map(r=>r.name)})})));
    assert.ok(edits.every(r=>r.status===200));
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'.order.json'),'utf8')).videos,results.map(r=>r.name));
    assert.equal((await fs.readFile(path.join(dir,'.playorder.m3u'),'utf8')).trim().split('\n').length,2);
  } finally {await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});

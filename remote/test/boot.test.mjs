import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const script = readFileSync(new URL('../public/boot/start.mjs', import.meta.url),'utf8');

function fixture(hostname='127.0.0.1') {
  let tick, ready=false, status=202, calls=0, cleared=false;
  vm.runInNewContext(script, {
    location:{hostname}, AbortSignal,
    crtFinishSplash:(visible,hold)=>{assert.equal(visible,true);assert.equal(hold,true);return ready;},
    setInterval:fn=>{tick=fn;return 1;}, clearInterval:()=>{cleared=true;},
    fetch:async url=>{assert.equal(url,'/api/boot/channel');calls++;return {status};},
  });
  return {tick:async()=>{if(!cleared)await tick?.();}, calls:()=>calls, cleared:()=>cleared,
    ready:()=>{ready=true;}, success:()=>{status=200;}};
}

test('Channel waits for the complete ident, retries readiness, and starts only once',async()=>{
  const f=fixture();await f.tick();assert.equal(f.calls(),0);
  f.ready();await f.tick();assert.equal(f.calls(),1);assert.equal(f.cleared(),false);
  f.success();await f.tick();assert.equal(f.calls(),2);assert.equal(f.cleared(),true);
  await f.tick();assert.equal(f.calls(),2);
});
test('a LAN browser viewing the opening cannot start the boot channel',async()=>{
  const f=fixture('10.0.0.101');f.ready();await f.tick();assert.equal(f.calls(),0);
});

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile as callbackExec} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(callbackExec);

test('Channel boots wait for the native player; manual Weather bypasses the loader',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crt-boot-launch-'));
  try {
    const bin=path.join(dir,'bin');await fs.mkdir(bin);
    for(const cmd of ['curl','sudo','chromium'])await fs.writeFile(path.join(bin,cmd),'#!/bin/sh\nexit 0\n',{mode:0o755});
    await fs.writeFile(path.join(bin,'xinit'),'#!/bin/sh\nprintf "%s\\n" "$URL"\n',{mode:0o755});
    await fs.writeFile(path.join(bin,'sleep'),'#!/bin/sh\nprintf "native loader waits: %s\\n" "$1"\n',{mode:0o755});
    const launcher=readFileSync(new URL('../../scripts/kiosk.sh',import.meta.url),'utf8')
      .replaceAll('/run/crt-tv/kiosk.env',path.join(dir,'kiosk.env'));
    await fs.writeFile(path.join(dir,'launcher'),launcher);
    const env={...process.env,PATH:`${bin}:${process.env.PATH}`,CRT_BOOT_MODE:'channel',CRT_REMOTE_PORT:'8090',CRT_VIDEO_DELAY_SECONDS:'0',CRT_SPLASH_MIN_SECONDS:'12'};
    const start=async overrides=>(await exec('bash',[path.join(dir,'launcher')],{env:{...env,...overrides}})).stdout;
    const boot=await start();assert.match(boot,/native loader waits: infinity/);assert.doesNotMatch(boot,/boot.html|crtSplashMin|8080/);
    await fs.writeFile(path.join(dir,'kiosk.env'),'manual override');
    const manual=await start({KIOSK_URL:'http://127.0.0.1:8080/'});
    assert.match(manual,/8080/);assert.doesNotMatch(manual,/boot.html|crtSplashMin/);
    await fs.rm(path.join(dir,'kiosk.env'));
    const weather=await start({CRT_BOOT_MODE:'weather'});
    assert.match(weather,/8080/);assert.match(weather,/crtSplashMin=12/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

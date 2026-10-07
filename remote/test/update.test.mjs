import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile as callbackExec} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(callbackExec);
test('updating Channel preserves player mode and updating Off keeps the display off',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crt-update-'));
 try {
  await fs.writeFile(path.join(dir,'systemctl'),'#!/bin/sh\nprintf "%s\\n" "$*"\n',{mode:0o755});
  const run=mode=>exec('bash',[new URL('../../setup/restart-display.sh',import.meta.url).pathname,mode],{env:{...process.env,PATH:`${dir}:${process.env.PATH}`}});
  assert.equal((await run('player')).stdout.trim(),'restart crt-player.service');
  assert.equal((await run('off')).stdout,'');
  assert.equal((await run('kiosk')).stdout.trim(),'restart weather-kiosk.service');
  assert.match((await run('boot')).stdout,/restart crt-autostart.service/);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});

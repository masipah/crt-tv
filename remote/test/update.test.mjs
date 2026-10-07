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
test('historical migrations run once and failed migrations remain retryable',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crt-migrations-'));
 try {
  await fs.mkdir(path.join(dir,'migrations'));
  const source=(await fs.readFile(new URL('../../setup/migrate.sh',import.meta.url),'utf8'))
    .replace('[[ $EUID -eq 0 ]]','true').replace('state=/var/lib/crt-tv/migrations',`state=${dir}/state`);
  await fs.writeFile(path.join(dir,'migrate.sh'),source);
  await fs.writeFile(path.join(dir,'migrations/001-success.sh'),`printf 'ran\\n' >> '${dir}/runs'\n`);
  const run=()=>exec('bash',[path.join(dir,'migrate.sh')]);
  await run();await run();assert.equal(await fs.readFile(path.join(dir,'runs'),'utf8'),'ran\n');
  await fs.writeFile(path.join(dir,'migrations/002-failure.sh'),'exit 1\n');
  await assert.rejects(run());await assert.rejects(fs.access(path.join(dir,'state/002-failure')));
  await fs.writeFile(path.join(dir,'migrations/002-failure.sh'),'exit 0\n');await run();await fs.access(path.join(dir,'state/002-failure'));
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});

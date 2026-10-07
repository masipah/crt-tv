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
test('app-only updates select the active display without invoking package or weather setup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crt-app-update-'));
 try{
  await fs.mkdir(path.join(dir,'setup'));await fs.mkdir(path.join(dir,'bin'));
  await fs.writeFile(path.join(dir,'env'),'');
  const source=(await fs.readFile(new URL('../../setup/update.sh',import.meta.url),'utf8'))
    .replace('[[ $EUID -eq 0 ]]','true').replace('/etc/crt-tv/crt-tv.env',dir+'/env');
  await fs.writeFile(path.join(dir,'setup/update.sh'),source);
  await fs.writeFile(path.join(dir,'setup/deploy.sh'),'printf "deploy %s\\n" "$1"\n');
  await fs.writeFile(path.join(dir,'bin/id'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  await fs.writeFile(path.join(dir,'bin/systemctl'),'#!/bin/sh\n[ "$3" = "$CRT_TEST_ACTIVE" ]\n',{mode:0o755});
  for(const command of ['apt-get','npm','git'])await fs.writeFile(path.join(dir,'bin',command),'#!/bin/sh\nexit 99\n',{mode:0o755});
  const run=unit=>exec('bash',[path.join(dir,'setup/update.sh')],{env:{...process.env,PATH:`${dir}/bin:${process.env.PATH}`,CRT_TEST_ACTIVE:unit}});
  assert.equal((await run('crt-player.service')).stdout.trim(),'deploy player');
  assert.equal((await run('weather-kiosk.service')).stdout.trim(),'deploy kiosk');
  assert.equal((await run('none')).stdout.trim(),'deploy off');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('deployment preserves config and rolls back the complete runtime after failed readiness',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crt-deploy-'));
 const root=path.join(dir,'root'),bin=path.join(dir,'bin');
 try{
  for(const name of ['var/backups','usr/local/lib/crt-tv','usr/local/bin','etc/crt-tv','etc/systemd/system','etc/sudoers.d','etc/tmpfiles.d','srv/media/videos'])await fs.mkdir(path.join(root,name),{recursive:true});
  await fs.mkdir(bin);
  await fs.writeFile(path.join(root,'usr/local/lib/crt-tv/legacy.mjs'),'old runtime');
  await fs.writeFile(path.join(root,'usr/local/bin/tv'),'old command');
  await fs.writeFile(path.join(root,'etc/crt-tv/crt-tv.env'),'CRT_REMOTE_PORT=8091\n# local config\n');
  await fs.writeFile(path.join(root,'etc/systemd/system/crt-remote.service'),'old unit');
  await fs.writeFile(path.join(root,'srv/media/videos/keep.mp4'),'keep media');
  const repo=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
  const source=(await fs.readFile(new URL('../../setup/deploy.sh',import.meta.url),'utf8'))
    .replace('[[ $EUID -eq 0 ]]','true')
    .replace('REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)',`REPO_DIR='${repo}'`)
    .replaceAll('/var/backups/','${CRT_TEST_ROOT}/var/backups/')
    .replaceAll('/usr/local/','${CRT_TEST_ROOT}/usr/local/')
    .replaceAll('/etc/','${CRT_TEST_ROOT}/etc/')
    .replaceAll('/srv/','${CRT_TEST_ROOT}/srv/')
    .replace('${file#/}','${file#"$CRT_TEST_ROOT/"}')
    .replaceAll('-C /','-C "$CRT_TEST_ROOT"');
  await fs.writeFile(path.join(dir,'deploy.sh'),source);
  await fs.writeFile(path.join(bin,'install'),`#!/usr/bin/env node\nconst {execFileSync}=require('node:child_process');let args=process.argv.slice(2);args=args.filter((value,i)=>!['-o','-g'].includes(value)&&!['-o','-g'].includes(args[i-1]));execFileSync('/usr/bin/install',args,{stdio:'inherit'});\n`,{mode:0o755});
  await fs.writeFile(path.join(bin,'systemctl'),'#!/bin/sh\nprintf "%s\\n" "$*" >> "$CRT_TEST_LOG"\n',{mode:0o755});
  for(const command of ['systemd-tmpfiles','visudo','sleep'])await fs.writeFile(path.join(bin,command),'#!/bin/sh\nexit 0\n',{mode:0o755});
  await fs.writeFile(path.join(bin,'curl'),'#!/bin/sh\n[ "$CRT_TEST_READY" = 1 ]\n',{mode:0o755});
  const run=ready=>exec('bash',[path.join(dir,'deploy.sh'),'player'],{env:{...process.env,PATH:`${bin}:${process.env.PATH}`,CRT_TEST_ROOT:root,CRT_TEST_LOG:path.join(dir,'commands'),CRT_TEST_READY:ready}});
  await assert.rejects(run('0'),error=>{assert.match(error.stderr,/previous runtime restored/);return true;});
  assert.deepEqual(await fs.readdir(path.join(root,'usr/local/lib/crt-tv')),['legacy.mjs']);
  assert.equal(await fs.readFile(path.join(root,'usr/local/bin/tv'),'utf8'),'old command');
  assert.equal(await fs.readFile(path.join(root,'etc/systemd/system/crt-remote.service'),'utf8'),'old unit');
  await assert.rejects(fs.access(path.join(root,'etc/systemd/system/weather-kiosk.service')));
  await run('1');
  await fs.access(path.join(root,'usr/local/lib/crt-tv/remote/control.mjs'));
  assert.equal((await fs.lstat(path.join(root,'usr/local/lib/crt-tv/remote/public/display-fit.mjs'))).isFile(),true);
  assert.equal(await fs.readFile(path.join(root,'etc/crt-tv/crt-tv.env'),'utf8'),'CRT_REMOTE_PORT=8091\n# local config\n');
  assert.equal(await fs.readFile(path.join(root,'srv/media/videos/keep.mp4'),'utf8'),'keep media');
  const commands=await fs.readFile(path.join(dir,'commands'),'utf8');
  assert.match(commands,/restart crt-player.service/);assert.doesNotMatch(commands,/ws4kp|enable/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

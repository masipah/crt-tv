import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import vm from 'node:vm';

import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const generated = mkdtempSync(path.join(tmpdir(), 'crt-splash-'));
after(() => rmSync(generated, {recursive: true, force: true}));
execFileSync('python3', [fileURLToPath(new URL('../../tools/build-splash-frames.py', import.meta.url)), generated]);
const frames = readFileSync(path.join(generated, 'kiosk-ext/splash-frames.js'), 'utf8');

function fixture(search='?crtSplashMin=0', port='8080', pathname='/') {
  let removed=0,rectangles=0,now=0,id=0;
  const timers=new Map(), paints=[];
  const canvas={style:{},remove:()=>{removed++;},getContext:()=>({fillRect:()=>{rectangles++;},fillText:()=>{}})};
  const window={};window.top=window;
  const context=vm.createContext({window,location:{port,pathname,search},URLSearchParams,performance:{now:()=>now},
    document:{createElement:()=>canvas,documentElement:{appendChild:()=>{}}},
    requestAnimationFrame:fn=>paints.push(fn),
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:n=>timers.delete(n)});
  vm.runInContext(frames, context);
  vm.runInContext(readFileSync(new URL('../../scripts/kiosk-ext/splash.js', import.meta.url), 'utf8'), context);
  const advance=()=>{const [key,timer]=[...timers][0];now+=timer.ms;timers.delete(key);timer.fn();};
  return {context,timers,paints,advance,removed:()=>removed,rectangles:()=>rectangles,setTime:t=>{now=t;},
    paint:()=>{while(paints.length)paints.shift()();}};
}
test('the logo stays lit through repeated seamless cycles until readiness',()=>{
  const f=fixture();assert.equal(f.context.crtSplashFrames.length,96);
  for(const [ansi, seconds] of f.context.crtSplashFrames) {
    assert.ok(ansi.includes('█'));assert.ok(!ansi.includes('\x1b[2J'));
    assert.equal(seconds,0.04);
  }
  for(let i=0;i<300;i++)f.advance();
  assert.ok(f.rectangles()>1000);assert.equal(f.removed(),0);
  assert.equal(f.context.crtFinishSplash(),false);
  f.paint();assert.equal(f.removed(),1);
  assert.equal(f.context.crtFinishSplash(),true);
});
test('twelve-second minimum continues animating instead of parking',()=>{
  const f=fixture('?crtSplashMin=12');
  f.setTime(11999);assert.equal(f.context.crtFinishSplash(),false);
  assert.equal(f.paints.length,0);assert.equal(f.timers.size,1);
  f.setTime(12000);assert.equal(f.context.crtFinishSplash(),false);
  assert.equal(f.timers.size,1);f.paint();assert.equal(f.removed(),1);
});
test('lost weather readiness cancels a queued cut and keeps animating',()=>{
  const f=fixture();f.context.crtFinishSplash();
  f.context.crtFinishSplash(false);f.paint();assert.equal(f.removed(),0);
  assert.equal(f.timers.size,1);
  f.context.crtFinishSplash();f.paint();assert.equal(f.removed(),1);
});
test('slow loading never auto-dismisses the ident',()=>{
  const f=fixture('?crtSplashMin=12');
  for(let i=0;i<1000;i++)f.advance();
  assert.equal(f.removed(),0);assert.equal(f.timers.size,1);
});

test('manual Weather switches never create the station opening',()=>{
  const f=fixture('?kiosk=true&crtWeatherIntro=1&crtFit=0.943x1');
  assert.equal(f.rectangles(),0);
  assert.equal(f.timers.size,0);
  assert.equal(f.context.crtFinishSplash,undefined);
});

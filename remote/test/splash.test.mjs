import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(search='') {
  let removed=0,rectangles=0,now=0,id=0;
  const timers=new Map();
  const canvas={style:{},remove:()=>{removed++;},getContext:()=>({fillRect:()=>{rectangles++;},fillText:()=>{}})};
  const window={};window.top=window;
  const context=vm.createContext({window,location:{port:'8080',search},URLSearchParams,performance:{now:()=>now},
    document:{createElement:()=>canvas,documentElement:{appendChild:()=>{}}},
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:n=>timers.delete(n)});
  for(const name of ['splash-frames.js','splash.js'])vm.runInContext(readFileSync(new URL(`../../scripts/kiosk-ext/${name}`,import.meta.url),'utf8'),context);
  return {context,timers,removed:()=>removed,rectangles:()=>rectangles,setTime:t=>{now=t;}};
}
test('browser continuation renders every original splash frame and stops cleanly',()=>{
  const f=fixture();assert.ok(f.context.crtSplashFrames.length>50);
  for(let i=0;i<f.context.crtSplashFrames.length;i++){
    const [key,timer]=[...f.timers][0];assert.ok(timer.ms>0);f.timers.delete(key);timer.fn();
  }
  assert.ok(f.rectangles()>1000);assert.equal(f.context.crtFinishSplash(),true);
  assert.equal(f.removed(),1);assert.equal(f.timers.size,0);
});
test('ready weather cannot remove the boot ident before twelve seconds',()=>{
  const f=fixture('?crtSplashMin=12');
  assert.equal(f.context.crtFinishSplash(),false);assert.equal(f.removed(),0);
  f.setTime(11999);assert.equal(f.context.crtFinishSplash(),false);
  f.setTime(12000);assert.equal(f.context.crtFinishSplash(),true);
  assert.equal(f.removed(),1);assert.equal(f.timers.size,0);
  assert.equal(f.context.crtFinishSplash(),true);assert.equal(f.removed(),1);
});
test('slow loading never auto-dismisses the ident at the old sixty-second deadline',()=>{
  const f=fixture('?crtSplashMin=12');let time=0;
  while(time<90000){const [key,timer]=[...f.timers][0];time+=timer.ms;f.setTime(time);f.timers.delete(key);timer.fn();}
  assert.equal(f.removed(),0);assert.equal(f.timers.size,1);
  assert.equal(f.context.crtFinishSplash(),true);assert.equal(f.removed(),1);
});

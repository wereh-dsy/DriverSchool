// Isolated test of the production desktop entry and its real UI; no development HTTP dependency.
const {app}=require('electron');
const {writeFileSync}=require('node:fs');const {resolve,join}=require('node:path');
const root=resolve(__dirname,'..'),out=join(root,'artifacts/tank500-refinement-2026-11-06');
app.setPath('userData',join(root,'.tmp-tank-production-visible-profile'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const deadline=setTimeout(()=>{console.error('Tank production startup timeout');app.exit(1)},90000);
app.on('browser-window-created',(_event,win)=>{
 const errors=[];win.webContents.setBackgroundThrottling(false);
 win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
 win.webContents.once('did-finish-load',async()=>{
  try{
   const result=await win.webContents.executeJavaScript(`(async()=>{
    const wait=async(test,limit=45000)=>{const begin=performance.now();while(!test()){if(performance.now()-begin>limit)throw Error('Tank UI timeout: '+document.body.innerText.slice(-600));await new Promise(r=>setTimeout(r,40));}};
    const delay=ms=>new Promise(r=>setTimeout(r,ms));
    const tap=async(code)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));await delay(80);window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));await delay(1000);};
    await wait(()=>performance.getEntriesByName('loading:menuSceneReady').length>0);
    document.querySelector('[data-action="vehicles"]').click();
    const picker=document.querySelector('[data-vehicle-picker]');picker.value='tank-500-hi4-t';picker.dispatchEvent(new Event('change',{bubbles:true}));
    await delay(500);document.querySelector('[data-action="confirm-vehicle"]').click();document.querySelector('[data-action="start"]').click();
    await wait(()=>document.querySelector('#app').dataset.uiPhase==='driving'&&document.querySelector('[data-screen="loading"]').hidden);
    await delay(1500);document.activeElement?.blur();
    await tap('Digit0');const doorOpen=document.body.innerText.includes('主驾驶门正在打开');
    await tap('Digit0');const doorClose=document.body.innerText.includes('主驾驶门正在关闭');
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit9',bubbles:true}));await delay(700);window.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit9',bubbles:true}));
    await tap('Tab');await wait(()=>document.body.innerText.includes('已下车'),5000);const exit=true;
    await tap('Tab');await wait(()=>document.body.innerText.includes('已上车'),5000);const entry=true;
    const hybridPanel=[...document.querySelectorAll('summary')].some(s=>s.textContent.includes('Hi4-T')&&!s.parentElement.hidden);
    if(!doorOpen||!doorClose||!exit||!entry||!hybridPanel)throw Error('Access UI failed: '+JSON.stringify({doorOpen,doorClose,exit,entry,hybridPanel}));
    return {vehicle:picker.value,doorOpen,doorClose,windowCommand:true,exit,entry,hybridPanel,origin:location.origin};
   })()`);
   await new Promise(r=>setTimeout(r,400));writeFileSync(join(out,'actual-driving.png'),(await win.webContents.capturePage()).toPNG());
   writeFileSync(join(out,'startup-results.json'),JSON.stringify({result,errors},null,2));
   if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({result,errors},null,2));clearTimeout(deadline);app.exit(0);
  }catch(error){writeFileSync(join(out,'production-startup-error.png'),(await win.webContents.capturePage()).toPNG());writeFileSync(join(out,'production-startup-error.json'),JSON.stringify({error:String(error),errors},null,2));console.error(error);clearTimeout(deadline);app.exit(1);}
 });
});
require('../.desktop/main.cjs');

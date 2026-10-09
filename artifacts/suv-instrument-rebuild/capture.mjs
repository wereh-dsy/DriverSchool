import { createRequire } from 'node:module';
const require = createRequire('C:/Users/dsy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch({headless:true,channel:"msedge"});
try {
 const page = await browser.newPage({viewport:{width:1320,height:1400}}), errors=[];
 page.on('pageerror', e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:5174/artifacts/suv-instrument-rebuild/preview.html');
 await page.waitForFunction(()=>window.ready);
 for(const name of ['idle','driving','cruise','low-fuel','parking-brake','lights','trip','menu','parking','mode','warnings','off']){
  await page.evaluate(n=>window.showState(n),name);
  await page.locator('#face').screenshot({path:`artifacts/suv-instrument-rebuild/${name}.png`});
  if(['idle','driving','low-fuel','menu'].includes(name))await page.locator('#driver').screenshot({path:`artifacts/suv-instrument-rebuild/driver-${name}.png`});
 }
 const blocked = await page.evaluate(()=>window.checkReadouts());if(blocked.length)throw new Error(JSON.stringify(blocked));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('12 instrument states rendered; 4 DriverEye views captured; no browser errors.');
}finally{await browser.close()}

// Offline renderer for the owned Tank geometry fixture; no user browser is controlled.
const {app,BrowserWindow}=require('electron');const {build}=require('esbuild');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');const {resolve,join}=require('node:path');
const root=resolve(__dirname,'..'),out=join(root,'artifacts/tank500-refinement-2026-11-06'),temp=join(root,'.tmp-tank-render');mkdirSync(temp,{recursive:true});app.setPath('userData',join(temp,'profile'));
const html=readFileSync(join(out,'preview.html'),'utf8'),source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const bundle=build({stdin:{contents:source.replaceAll("from '/src/","from './src/"),resolveDir:root,loader:'ts'},bundle:true,platform:'browser',format:'iife',outfile:join(temp,'preview.js')});
writeFileSync(join(temp,'index.html'),html.replace(/<script type="module">[\s\S]*?<\/script>/,'<script src="preview.js"></script>'));
const deadline=setTimeout(()=>{console.error('Tank render timeout');app.exit(1)},90000);
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}}),errors=[];
win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
try{await bundle;await win.loadFile(join(temp,'index.html'));const results=[];
for(const [view,night,open,glass]of [['front',false,false,0],['side',false,false,0],['rear',false,false,0],['cabin',false,false,0],['driver',false,false,0],['driver',true,false,0],['front',false,true,.5],['cluster',false,false,0]]){
const r=await win.webContents.executeJavaScript(`window.captureTank(${JSON.stringify(view)},${night},${open},${glass})`);const name=view+(night?'-night':'')+(open?'-door-open':'');writeFileSync(join(out,name+'.png'),Buffer.from(r.png.split(',')[1],'base64'));
if(view==='cluster'){writeFileSync(join(out,'instrument-pixels.png'),Buffer.from(r.instrument.split(',')[1],'base64'));writeFileSync(join(out,'center-pixels.png'),Buffer.from(r.center.split(',')[1],'base64'));}results.push({name,...r.stats});}
writeFileSync(join(out,'render-results.json'),JSON.stringify({results,errors},null,2));if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({results,errors},null,2));clearTimeout(deadline);app.exit(0);
}catch(error){console.error(error,errors);clearTimeout(deadline);app.exit(1)}});

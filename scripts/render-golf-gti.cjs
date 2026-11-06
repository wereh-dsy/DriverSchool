// Automated offline render smoke, following render-vehicle-exteriors.cjs; no user browser control.
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {resolve,join}=require('node:path');
const root=resolve(__dirname,'..'),output=process.argv.find(a=>a.startsWith('--output-dir='))?.slice(13),out=output?resolve(root,output):join(root,'artifacts/golf-gti-2026-11-04'),temp=join(root,'.tmp-golf-render');
mkdirSync(temp,{recursive:true});app.setPath('userData',join(temp,'profile'));
const html=readFileSync(join(out,'preview.html'),'utf8'),source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const compilation=build({stdin:{contents:source.replaceAll("from '/src/","from './src/")+`
window.captureGolf=(selected,dark=false,opened=false,glass=0)=>{view=selected;night=dark;open=opened;windowOpen=glass;
telemetry.ambientDaylight=dark?.015:1;hemi.intensity=dark?.07:2.1;sun.intensity=dark?0:3;scene.background.set(dark?'#080b12':'#aab5bd');
lighting.setMode('low');render();return {png:document.querySelector('#render-export').src,dial:document.querySelector('#dial').src,stats:JSON.parse(document.querySelector('#stats').textContent)}};`,resolveDir:root,loader:'ts'},bundle:true,platform:'browser',format:'iife',outfile:join(temp,'preview.js')});
writeFileSync(join(temp,'index.html'),html.replace(/<script type="module">[\s\S]*?<\/script>/,'<script src="preview.js"></script>'));
const deadline=setTimeout(()=>{console.error('Golf rendering timeout');app.exit(1)},120000);
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
try {await compilation;await win.loadFile(join(temp,'index.html'));const results=[];
const silhouettes=process.argv.includes('--silhouettes')?[['side',false,false,0],['frontElevation',false,false,0]]:[];
for(const [view,night,open,glass] of [['normal',false,false,0],['cluster',false,false,0],['overview',false,false,0],['oblique',false,false,0],['console',false,false,0],['front',false,false,0],['rear',false,false,0],['front',false,true,.5],['normal',true,false,0],...silhouettes]) {
const result=await win.webContents.executeJavaScript(`window.captureGolf(${JSON.stringify(view)},${night},${open},${glass})`);
const name=view+(night?'-night':'')+(open?'-door-open':'');writeFileSync(join(out,name+'.png'),Buffer.from(result.png.split(',')[1],'base64'));
if(view==='cluster')writeFileSync(join(out,'instrument-pixels.png'),Buffer.from(result.dial.split(',')[1],'base64'));
results.push({name,...result.stats});}
writeFileSync(join(out,'render-results.json'),JSON.stringify({results,errors},null,2));if(errors.length)throw Error(errors.join('\n'));
console.log(JSON.stringify({renders:results.length,errors,results},null,2));clearTimeout(deadline);app.exit(0);
}catch(e){console.error(e);clearTimeout(deadline);app.exit(1)}});

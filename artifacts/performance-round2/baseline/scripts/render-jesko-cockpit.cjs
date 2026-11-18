const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const {mkdirSync,writeFileSync}=require('node:fs');
const {resolve,join}=require('node:path');
const root=resolve(__dirname,'..'),phase=process.argv.includes('--before')?'before':'after';
const tmp=join(root,'.tmp-jesko-cockpit-preview'),out=join(root,'artifacts/jesko-cockpit',phase);
mkdirSync(tmp,{recursive:true});mkdirSync(out,{recursive:true});app.setPath('userData',join(tmp,'profile'));
const compilation=build({entryPoints:[join(__dirname,'jesko-cockpit-preview.ts')],bundle:true,platform:'browser',format:'iife',outfile:join(tmp,'preview.js')});
writeFileSync(join(tmp,'index.html'),'<html><body><script src="preview.js"></script></body></html>');
const deadline=setTimeout(()=>app.exit(1),60000);
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1280,height:720,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  try{
    await compilation;await win.loadFile(join(tmp,'index.html'));const results=[];
    for(const view of ['day','night','console','consoleNight','narrow','detail','detailNight','steer','warnings','off','startup','exterior','doorOpen','windowOpen']){
      const {png,...metrics}=await win.webContents.executeJavaScript(`window.captureJeskoCockpit(${JSON.stringify(view)})`);
      writeFileSync(join(out,view+'.png'),Buffer.from(png.split(',')[1],'base64'));results.push({view,...metrics});
    }
    const visibility=await win.webContents.executeJavaScript('window.checkJeskoCockpit()');
    console.log(JSON.stringify(visibility));
    writeFileSync(join(out,'render-results.json'),JSON.stringify({results,errors,visibility},null,2)+'\n');
    if(visibility.failures.length)throw Error(visibility.failures.join('; '));
    if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify(results));clearTimeout(deadline);app.exit(0);
  }catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}
});

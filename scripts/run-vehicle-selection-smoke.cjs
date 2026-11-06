// Owned renderer integration test, using the real StartupApplication and public UI controller.
const {app,BrowserWindow}=require('electron');const {mkdirSync,writeFileSync}=require('node:fs');const {resolve,join}=require('node:path');
const root=resolve(__dirname,'..'),out=join(root,'artifacts/golf-gti-2026-11-05'),url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)??'http://127.0.0.1:5180/artifacts/golf-gti-2026-11-05/menu-smoke.html';
mkdirSync(out,{recursive:true});app.setPath('userData',join(root,'.tmp-selection-smoke'));app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const deadline=setTimeout(()=>{console.error('Vehicle selection smoke timeout');app.exit(1)},150000);
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}}),errors=[];
  win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
  try{
    await win.loadURL(url);const selection=await win.webContents.executeJavaScript('window.runSelectionSmoke()');
    writeFileSync(join(out,'tank-selection.png'),(await win.webContents.capturePage()).toPNG());console.log('Tank selection:',JSON.stringify(selection));
    const drive=await win.webContents.executeJavaScript('window.runDriveSmoke()');
    writeFileSync(join(out,'tank-driving.png'),(await win.webContents.capturePage()).toPNG());
    writeFileSync(join(out,'selection-smoke.json'),JSON.stringify({selection,drive,errors},null,2));
    if(errors.length)throw Error(errors.join('\n'));console.log('Tank actual driving startup:',JSON.stringify(drive));clearTimeout(deadline);app.exit(0);
  }catch(error){writeFileSync(join(out,'selection-smoke-error.json'),JSON.stringify({error:String(error),errors},null,2));console.error(error);clearTimeout(deadline);app.exit(1)}
});

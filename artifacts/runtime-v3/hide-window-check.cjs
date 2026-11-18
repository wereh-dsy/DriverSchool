const {app,BrowserWindow}=require('electron');
app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:400,height:300});window.show();const hidden=!window.isVisible();window.destroy();app.exit(hidden?0:1);});

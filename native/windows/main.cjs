const {app,BrowserWindow,shell,dialog}=require('electron');
const path=require('path');
const APP_URL=process.env.TCW_APP_URL||'https://YOUR-HR-DOMAIN.example';

function appOrigin(){
 const url=new URL(APP_URL);
 if(!['http:','https:'].includes(url.protocol))throw new Error('TCW_APP_URL must use http:// or https://');
 return url.origin;
}
function isInternal(url,origin){try{return new URL(url).origin===origin}catch{return false}}
function openExternal(url){try{const protocol=new URL(url).protocol;if(['http:','https:','mailto:','tel:'].includes(protocol))shell.openExternal(url).catch(()=>{})}catch{}}

function createWindow(){
 const origin=appOrigin();
 const win=new BrowserWindow({
  width:1440,height:900,minWidth:420,minHeight:600,
  title:'TCW HR Software',icon:path.join(__dirname,'tcw.ico'),
  backgroundColor:'#f7fafd',autoHideMenuBar:true,
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:true}
 });
 win.webContents.setWindowOpenHandler(({url})=>{
  if(isInternal(url,origin))win.loadURL(url); else openExternal(url);
  return{action:'deny'};
 });
 win.webContents.on('will-navigate',(event,url)=>{
  if(isInternal(url,origin))return;
  event.preventDefault();openExternal(url);
 });
 win.loadURL(APP_URL).catch(error=>{
  dialog.showErrorBox('TCW HR Software','Unable to open the HR server. Check TCW_APP_URL and your network connection.\n\n'+error.message);
 });
}

app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})}).catch(error=>{dialog.showErrorBox('TCW HR Software',error.message);app.quit()});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

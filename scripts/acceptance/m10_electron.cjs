/* Real Electron + real WebSocket acceptance; external dependencies supplied by
 * m10_backend.py. PLAYWRIGHT_MODULE may point to an existing playwright-core.
 * Run after the normal automated gates. No desktop screenshots are taken. */
const {_electron}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),work=process.env.M10_WORKDIR;
if(!work)throw Error('M10_WORKDIR must name an isolated acceptance directory');
const port=Number(process.env.M10_PORT || 8765);
const previous=process.env.M10_STAGE==='parity' && fs.existsSync(path.join(work,'rendered.json'))?JSON.parse(fs.readFileSync(path.join(work,'rendered.json'))):{};
const evidence={checks:previous.checks||[],errors:[],screens:previous.screens||[],previousHarnessErrors:previous.errors||[]};
const pass=(name,details={})=>{evidence.checks.push({name,result:'PASS',...details});console.log('PASS',name,JSON.stringify(details));fs.writeFileSync(path.join(work,'rendered.json'),JSON.stringify(evidence,null,2))};
const control=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+(port+14)+'/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return r.json()};
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;delete env.NODE_ENV;if(process.env.M10_DEV_URL)env.VITE_DEV_SERVER_URL=process.env.M10_DEV_URL;
 const app=await _electron.launch({executablePath:path.join(root,'frontend/node_modules/electron/dist/electron'),args:[path.join(root,'frontend/dist-electron/main.cjs'),'--user-data-dir='+path.join(work,'profile'),'--remote-debugging-port=9340'],env});
 await app.context().addInitScript(targetPort=>{
  const NativeSocket=window.WebSocket;
  window.WebSocket=class extends NativeSocket{constructor(url,protocols){super(String(url).replace('127.0.0.1:8765','127.0.0.1:'+targetPort),protocols)}};
 },port);
 let p=await app.firstWindow();await p.reload();p.on('pageerror',e=>evidence.errors.push(e.message));
 const latest=()=>p.locator('.answers-panel .answer-card').last();
 const complete=async(card)=>{await card.locator('.status-completed').waitFor({timeout:10000})};
 const desk=async()=>{await p.getByRole('button',{name:'Desk',exact:true}).click()};
 const settings=async()=>{await p.getByRole('button',{name:'Settings',exact:true}).first().click()};
 try{
  await p.waitForFunction(()=>document.querySelector('.cockpit-session-bar')?.innerText.includes('Control enabled'));
  if(!['parity','layout'].includes(process.env.M10_STAGE)){
  await p.getByRole('button',{name:'Answer recent speech',exact:true}).waitFor();
  await p.getByRole('button',{name:'Answer recent speech',exact:true}).click();
  await latest().locator('.answer-body strong').waitFor();assert.equal(await latest().locator('.answer-status').textContent(),'running');
  pass('visible incremental Markdown before delayed terminal');await complete(latest());assert.equal(await latest().locator('table').count(),1);assert.equal(await latest().locator('code').count(),1);
  pass('real controller to rendered Markdown/table/code');
  await latest().getByText('Request details',{exact:true}).click();await latest().getByText('Retrieval: no_documents',{exact:true}).waitFor();await latest().getByText('Request details',{exact:true}).click();
  await latest().getByRole('button',{name:'Keep',exact:true}).click();await p.locator('.kept-panel .answer-card').waitFor();
  await control('seed',{text:'Different synthetic finalized speech arrived after the first answer.'});
  await p.locator('.kept-panel .answer-card').getByRole('button',{name:'Run again',exact:true}).click();await complete(latest());pass('kept answer and server-frozen rerun after later speech');
  for(const mode of ['partial_error','empty','pre_error']){
   await control('scenario',{generation:mode});const before=await p.locator('.answer-card').count();
   await p.getByRole('button',{name:'Answer recent speech',exact:true}).click();await p.waitForFunction(n=>document.querySelectorAll('.answer-card').length>n,before);
   await latest().locator(mode==='empty'?'.status-empty':'.status-failed').waitFor();
   if(mode==='partial_error')assert.equal(await latest().locator('.answer-body strong').count(),1);
   if(mode==='empty')assert.equal(await latest().locator('.answer-body').count(),0);
   pass(mode+' preserves truthful terminal/text');
  }
  await control('scenario',{generation:'success'});await p.getByRole('button',{name:'Answer recent speech',exact:true}).click();await latest().locator('.answer-body strong').waitFor();await p.getByRole('button',{name:'Stop answer',exact:true}).click();await latest().locator('.status-cancelled').waitFor();pass('partial cancellation retained');
  }
  if(process.env.M10_STAGE!=='layout'){
  // Actual production Settings handlers, real SQLite/file readers and benchmark orchestration.
  await settings();await p.getByRole('textbox',{name:'Harness Instruction',exact:true}).fill('M10 unsaved harness instruction');
  await p.getByRole('textbox',{name:'Test Prompt',exact:true}).fill('M10 synthetic benchmark question');
  await p.getByRole('button',{name:'Create',exact:true}).click();
  await p.getByRole('textbox',{name:'Paths (comma-separated)',exact:true}).fill(path.join(work,'fixtures'));
  await p.getByRole('button',{name:'Ingest',exact:true}).click();await p.getByText(/RAG ingest: \+[04] new/).waitFor();
  await p.getByRole('button',{name:'Refresh list',exact:true}).click();for(const file of ['a.txt','b.md','c.docx','d.pdf'])await p.getByText(path.join(work,'fixtures',file),{exact:true}).waitFor();
  await p.getByText(path.join(work,'fixtures','a.txt'),{exact:true}).waitFor();
  await p.getByRole('checkbox',{name:(await control('stats')).defaultModel,exact:true}).check();
  await p.getByRole('spinbutton',{name:'Repeats per model (1-10)',exact:true}).fill('1');
  await p.getByRole('button',{name:'Run benchmark',exact:true}).click();await p.getByTitle(/Synthetic benchmark answer/).first().waitFor();
  await desk();await settings();assert.equal(await p.getByRole('textbox',{name:'Harness Instruction',exact:true}).inputValue(),'M10 unsaved harness instruction');
  pass('Settings navigation, four RAG formats, benchmark orchestration');
  const keys=await p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
  await p.reload();await p.waitForFunction(()=>document.querySelector('.cockpit-session-bar')?.innerText.includes('Control enabled'));await settings();
  const restored=await p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
  for(const key of ['benchmark-tests.v1','benchmark-history.v1','benchmark-images.v1'])assert.equal(restored[key],keys[key]);
  await p.getByText(path.join(work,'fixtures','a.txt'),{exact:true}).waitFor();pass('profile key values and SQLite metadata survive reload',{keys:Object.keys(keys)});
  await desk();
  }
  // RAG is now real populated local SQLite, with deterministic synthetic embeddings.
  await p.getByRole('button',{name:'Answer recent speech',exact:true}).click();await complete(latest());await latest().getByText('Request details',{exact:true}).click();await latest().getByText('Retrieval: used',{exact:true}).waitFor();await latest().getByText('Request details',{exact:true}).click();pass('actual retrieved evidence reaches rendered answer details');
  // Responsive/native/zoom acceptance after all source implementation and automated checks.
  const raw=await p.locator('.raw-panel').elementHandle();
  for(const [w,h] of [[1680,1000],[1440,900],[1000,720]]){
   await p.setViewportSize({width:w,height:h});await p.waitForTimeout(200);
   const measure=await p.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.cockpit-grid')).gridTemplateColumns.split(' ').length,footer:document.querySelector('.cockpit-action-bar').getBoundingClientRect().bottom<=innerHeight+2}));
   assert.equal(measure.width,w);assert.equal(measure.height,h);assert.equal(measure.overflow,false);assert.equal(measure.columns,w<1260?2:4);assert.equal(measure.footer,true);
   const name='desk-'+w+'x'+h+'.png';await p.screenshot({path:path.join(work,name)});evidence.screens.push(name);pass('Electron renderer viewport '+w+'x'+h,{...measure,nativeWindowMayBeCompositorClamped:true});
  }
  await p.setViewportSize({width:1440,height:900});await p.getByRole('button',{name:'Sound',exact:true}).click();await p.screenshot({path:path.join(work,'sound-desktop.png')});await p.keyboard.press('Escape');await p.setViewportSize({width:1000,height:720});
  await p.getByRole('button',{name:'Sound',exact:true}).click();await p.getByRole('dialog').waitFor();await p.screenshot({path:path.join(work,'sound-compact.png')});await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog').count(),0);
  await p.setViewportSize({width:1440,height:900});
  const separator=p.getByRole('separator',{name:'Resize raw transcript panel',exact:true});
  const tracks=()=>p.evaluate(()=>localStorage.getItem('cockpit-layout.v1'));let prior=await tracks();await separator.focus();await p.keyboard.press('ArrowRight');assert.notEqual(await tracks(),prior);prior=await tracks();const box=await separator.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+60);await p.mouse.down();await p.mouse.move(box.x+box.width/2+26,box.y+60,{steps:6});await p.mouse.up();assert.notEqual(await tracks(),prior);pass('real keyboard and pointer divider resize');
  const row=p.locator('.raw-segment').first();await row.scrollIntoViewIfNeeded();const node=await row.elementHandle();const rect=await row.boundingBox();await p.mouse.move(rect.x+8,rect.y+8);await p.mouse.down();await p.mouse.move(rect.x+140,rect.y+8,{steps:8});await p.mouse.up();await p.keyboard.press('Shift+ArrowRight');assert.ok(await p.evaluate(()=>getSelection().toString().length>0));await control('seed',{text:'Additional synthetic speech must not replace the selected source node.'});assert.equal(await node.evaluate(n=>n===document.querySelector('.raw-segment')),true);pass('pointer/keyboard source selection survives incoming speech');
  await p.getByRole('button',{name:'Make question',exact:true}).click();const editor=p.getByRole('textbox',{name:'Question to answer',exact:true});await editor.waitFor();const source=await editor.inputValue();await editor.fill('M10 edited synthetic wording');await p.getByRole('button',{name:'Reset to source',exact:true}).click();assert.equal(await editor.inputValue(),source);await p.getByRole('button',{name:'Clear target',exact:true}).click();const calls=(await control('stats')).calls;await p.getByRole('button',{name:'Pin this moment',exact:true}).click();await p.getByText(/Pinned moments/).waitFor();assert.equal((await control('stats')).calls,calls);pass('editable source target reset/clear and pin makes no generation call');
  const cdp=await app.context().newCDPSession(p);await cdp.send('Emulation.clearDeviceMetricsOverride');await p.setViewportSize({width:900,height:800});
  await p.getByRole('button',{name:'Focus answers',exact:true}).click();assert.ok((await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds())).width<=910);await p.waitForTimeout(200);assert.equal(await p.locator('.raw-panel').isVisible(),false);assert.equal(await p.locator('.cockpit-audio-header').isVisible(),true);await p.screenshot({path:path.join(work,'focus.png')});await p.getByRole('button',{name:'Return to Desk',exact:true}).click();assert.equal(await raw.evaluate(n=>n===document.querySelector('.raw-panel')),true);pass('native Focus retains same DOM, cards and meter');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  for(const zoom of [1.25,1.5]){await app.evaluate(({BrowserWindow},z)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z),zoom);await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:path.join(work,'zoom-'+zoom+'.png')});pass('native text zoom '+zoom)}
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await p.getByRole('button',{name:'Focus answers',exact:true}).click();await p.setViewportSize({width:960,height:800});await p.screenshot({path:path.join(work,'focus-960x800.png')});assert.equal(await p.locator('.raw-panel').isVisible(),false);await p.getByRole('button',{name:'Return to Desk',exact:true}).click();await cdp.send('Emulation.clearDeviceMetricsOverride');
  pass('Focus renderer 960x800');
  const sec=await app.evaluate(({BrowserWindow,globalShortcut})=>{const w=BrowserWindow.getAllWindows()[0],prefs=w.webContents.getLastWebPreferences();return {contextIsolation:prefs.contextIsolation,nodeIntegration:prefs.nodeIntegration,devtools:w.webContents.isDevToolsOpened(),escape:globalShortcut.isRegistered('Escape')}});assert.equal(sec.contextIsolation,true);assert.equal(sec.nodeIntegration,false);assert.equal(sec.devtools,false);assert.equal(sec.escape,false);pass('production security and no global Escape',sec);
  assert.equal(evidence.errors.length,0);pass('no renderer exceptions');
 }catch(error){evidence.errors.push(error.stack);fs.writeFileSync(path.join(work,'rendered.json'),JSON.stringify(evidence,null,2));await p.screenshot({path:path.join(work,'failure.png')});throw error}
 finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

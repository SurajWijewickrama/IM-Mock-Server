const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=require('path'),{webcrypto}=require('crypto');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function all(el){return [el,...el.children.flatMap(all)];}
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.classList={toggle(){}};this.events={};this.attributes={};}
 set innerHTML(s){this.html=s;this.children=[];} get innerHTML(){return this.html;}
 appendChild(el){this.children.push(el);return el;}
 querySelector(selector){return all(this).find(el=>el.className===selector.slice(1)) || new Element('button');}
 querySelectorAll(selector){return all(this).filter(el=>el.tag==='details'&&el.id&&(!selector.includes('[open]')||el.open));}
 addEventListener(n,f){this.events[n]=f;} setAttribute(k,v){this.attributes[k]=v;}
 focus(){doc.activeElement=this;}
}
const elements={},requests=[];
const doc={getElementById:id=>Object.values(elements).flatMap(all).find(el=>el.id===id) || (elements[id]??=new Element('div')),createElement:t=>new Element(t)};
let responseData=null,failNext=false,holdGet=null;
const context=vm.createContext({document:doc,crypto:webcrypto,AbortController,EventSource:class{addEventListener(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},fetch:async(url,opt={})=>{
 requests.push({url,...opt});
 if(opt.method==='GET'&&holdGet) await holdGet;
 if(failNext){failNext=false;return{ok:false,status:403};}
 return {ok:true,status:200,json:async()=>responseData};
},console});
const run=s=>vm.runInContext(s,context),json=s=>JSON.parse(run('JSON.stringify('+s+')'));
vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/remote-controls.js'),'utf8'),context);
vm.runInContext(script,context);
const scenes=json('SCENES');
assert.equal(new Set(scenes.map(s=>s.id)).size,21);
assert.deepEqual(scenes.slice(-3).map(s=>[s.id,s.name]),[[33,'SinharajaSanctuary'],[34,'Nightfall_Main'],[35,'JustOneBiscuit']]);
run('state={test:{name:"Test headset",lastSeen:Date.now(),scene:{id:0,segments:3,stop:true}}};render()');
assert.equal(all(elements.users).filter(el=>el.className?.startsWith('s-btn')).length,21);
const payload=()=>JSON.parse(requests.at(-1).body);
function nightfall(){
 run('state.test={name:"Quest 2",lastSeen:Date.now(),scene:{id:34,segments:3,stop:true},nightfall:{status:{bootId:"local-boot",ready:true,updatedAt:Date.now(),stopped:true,selectionEnabled:false,car:"Test car",beat:"Arrival",hand:"Right",distance:0}}};render()');
 responseData={bootId:'fresh-server-boot',ready:true,updatedAt:Date.now()};
}
(async()=>{
 assert.equal(requests.length,0,'rendering must not issue remote commands');
 run('applyPut({path:"/old",data:{name:"Quest 2",lastSeen:Date.now()-86400000,scene:{id:0}}});render()');
 assert.equal(run('isOnline("old")'),false);
 run('applyPatch({path:"/old/scene",data:{id:24}});render()');
 assert.equal(run('isOnline("old")'),false,'scene writes must not revive old headset');
 let before=requests.length;
 await run('setUserScene("old",SCENES[1])');await run('setUserStop("old",true)');await run('setUserSegments("old",2)');
 await run('saveBall("old",{hand:"auto",diameterMeters:.065,curlRange:.12})');await run('stopNightfall("old")');
 assert.equal(requests.length,before,'offline controls must never write');
 const archived=elements.users.children[1];assert.equal(archived.tag,'details');
 assert.ok(all(archived).filter(x=>x.className?.startsWith('s-btn')).every(x=>x.disabled));
 run('applyPatch({path:"/old",data:{lastSeen:Date.now()}})');assert.equal(run('isOnline("old")'),true);
 run('delete state.old;render()');
 for(const scene of scenes){
  const button=all(elements.users).find(el=>el.title===`${scene.name} · ID ${scene.id}`);
  await button.events.click();
  const req=requests.at(-1),body=payload().scene;
  assert.equal(req.method,'PATCH');assert.ok(req.url.endsWith('/users/test.json'));
  assert.equal(body.id,scene.id);assert.equal(body.name,scene.name);assert.equal(body.segments,3);assert.equal(body.stop,false);
  assert.equal(all(elements.users).filter(el=>el.attributes['aria-pressed']==='true').length,1);
 }
 before=requests.length;
 await run('setUserScene("test",{id:33,name:"Scene_SkyFerry"})');await run('setUserSegments("test",99)');
 assert.equal(requests.length,before,'unknown scenes and invalid segments must not write');
 await run('renameUser("test","  Chair 2  ")');assert.equal(JSON.parse(requests.at(-1).body),'Chair 2');
 assert.ok(requests.at(-1).url.endsWith('/label.json'));
 run('applyPatch({path:"/test",data:{name:"Quest 3S",lastSeen:Date.now()}})');assert.equal(run('displayName(state.test)'),'Chair 2');
 await run('renameUser("test","")');assert.equal(requests.at(-1).method,'DELETE');assert.equal(run('displayName(state.test)'),'Quest 3S');
 run('applyPatch({path:"/test",data:{"nightfall/control/selectionEnabled":true,"scene/stop":null}})');
 assert.equal(run('state.test.nightfall.control.selectionEnabled'),true);assert.equal(run('state.test.scene.stop'),undefined);
 run('applyPatch({path:"/test",data:JSON.parse(\'{"__proto__/polluted":true}\')})');assert.equal(run('({}).polluted'),undefined);
 nightfall();
 assert.match(run('nightfallFeedback({updatedAt:Date.now(),inputValid:false,inputStatus:"left_input_not_tracked",commandId:"r",commandResult:"waiting_for_tracking"},{commandId:"r"})'),/waiting for tracking/);
 assert.match(run('nightfallFeedback({updatedAt:Date.now(),commandId:"r",commandResult:"expired"},{commandId:"r"})'),/expired/);
 assert.match(run('nightfallFeedback({updatedAt:Date.now(),inputValid:true,commandId:"r",commandResult:"resumed"},{commandId:"r"})'),/accepted/);
 assert.match(run('nightfallFeedback({updatedAt:Date.now(),stopped:true,commandId:"r",commandResult:"resumed"},{commandId:"r"})'),/paused again/);
 const panel=doc.getElementById('remote-test-ball-panel');panel.open=true;
 const diameter=doc.getElementById('remote-test-diameter');diameter.value='7.2';diameter.events.input();diameter.focus();run('render()');
 assert.equal(doc.getElementById('remote-test-ball-panel').open,true,'stream refresh retains expanded panel');
 assert.equal(Number(doc.getElementById('remote-test-diameter').value),7.2,'stream refresh retains draft');
 assert.equal(doc.activeElement.id,'remote-test-diameter');
 before=requests.length;await run('setNightfall("test",{activeHand:"invalid"})');assert.equal(requests.length,before);
 await run('setNightfall("test",{selectionEnabled:true})');
 assert.deepEqual(payload(),{'nightfall/control/selectionEnabled':true});
 assert.equal(run('state.test.nightfall.status.selectionEnabled'),false,'permission is not a headset acknowledgement');
 await run('setNightfall("test",{activeHand:"left",wristSteeringEnabled:true})');
 assert.equal(payload()['stressBall/control/hand'],'left');assert.equal(payload()['nightfall/control/wristSteeringEnabled'],true);assert.equal(payload()['stressBall/control/schemaVersion'],1);
 await run('commandNightfall("test","resume")');
 let body=payload();assert.equal(body['nightfall/control/bootId'],'fresh-server-boot');
 assert.equal(body['nightfall/control/command'],'resume');assert.equal(body['scene/stop'],false);assert.equal(body['stressBall/control/hand'],'left');
 assert.ok(body['nightfall/control/expiresAt']>Date.now()&&body['nightfall/control/expiresAt']<=Date.now()+15000);
 assert.equal(run('state.test.nightfall.status.stopped'),true,'sent resume must not fabricate running status');
 const commandId=body['nightfall/control/commandId'];await run('commandNightfall("test","reset")');
 assert.notEqual(payload()['nightfall/control/commandId'],commandId);assert.equal(payload()['nightfall/control/selectionEnabled'],false);
 before=requests.length;responseData={bootId:'stale',ready:true,updatedAt:Date.now()-60000};
 await run('commandNightfall("test","resume")');assert.equal(requests.length,before+1,'stale session may read but must not write');
 nightfall();
 let release;holdGet=new Promise(r=>release=r);
 const resume=run('commandNightfall("test","resume")');await new Promise(setImmediate);
 const queued=run('setNightfall("test",{selectionEnabled:true})');
 const stop=run('stopNightfall("test")');release();holdGet=null;await Promise.all([resume,queued,stop]);
 assert.deepEqual(payload(),{'scene/stop':true,'nightfall/control/stop':true,'nightfall/control/selectionEnabled':false});
 assert.equal(run('state.test.nightfall.control.stop'),true,'STOP cancels pending resume and selection');
 await run('commandNightfall("test","finish")');
 assert.equal(payload()['nightfall/control/command'],'finish');assert.equal(payload()['nightfall/control/stop'],false,'finish must pass Unity’s command latch');assert.equal(payload()['scene/stop'],true);assert.equal(payload()['nightfall/control/selectionEnabled'],false);
 await run('saveBall("test",{hand:"left",diameterMeters:.08,curlRange:.2,showConnectionNotice:true})');
 body=payload()['stressBall/control'];assert.equal(body.schemaVersion,1);assert.equal(body.hand,'left');assert.ok(body.revision);
 before=requests.length;await run('saveBall("test",{hand:"left",diameterMeters:2,curlRange:.2})');await run('sendInput("test")');
 assert.equal(requests.length,before,'invalid size and Nightfall remote drive pulse are blocked');
 run('state.test.stressBall.status={scene:"JustOneBiscuit",updatedAt:Date.now()}');
 assert.equal(run('isNightfall(state.test)'),false,'fresh actual scene takes precedence over old request');
 await run('sendInput("test")');assert.deepEqual(payload(),{triggerAt:{'.sv':'timestamp'}});
 run('state.test.scene.stop=false');responseData={bootId:'app-boot',sceneName:'JustOneBiscuit',capturedAt:Date.now(),sequence:42,stopped:false};
 const values='{visualCalm:.5,motionScale:.9,musicGain:.8,vfxGain:.7,focusStrength:.2,musicVariant:0,effectVariant:0}';
 await run(`previewPresentation("test",${values})`);body=payload().adaptive;
 assert.equal(body.bootId,'app-boot');assert.equal(body.expectedScene,'JustOneBiscuit');assert.equal(body.inputSequence,42);assert.equal(body.sceneId,-1);
 assert.equal(body.expiresAt-body.issuedAt,5000);assert.equal(body.sequence,1);
 await run(`previewPresentation("test",${values},false)`);assert.equal(payload().adaptive.active,false);assert.equal(payload().adaptive.sequence,2);
 before=requests.length;responseData.capturedAt=Date.now()-60000;await run(`previewPresentation("test",${values})`);
 assert.equal(requests.length,before+1,'stale telemetry never sends presentation');
 nightfall();failNext=true;before=requests.length;await run('setNightfall("test",{muted:true})');
 assert.equal(requests.length,before+1);assert.equal(run('state.test.nightfall.control?.muted'),undefined);
 assert.match(elements.toast.textContent,/403/,'network failures are visible');
 nightfall();
 before=requests.length;await run('commandNightfall("test","start")');assert.equal(requests.length,before+1,'older APK cannot receive a start write');
 responseData.controlVersion=2;run('state.test.nightfall.status.controlVersion=2');
 await run('setNightfall("test",{selectedCar:1})');assert.equal(payload()['nightfall/control/selectedCar'],1);
 before=requests.length;await run('setNightfall("test",{selectedCar:9})');assert.equal(requests.length,before);
 await run('commandNightfall("test","start")');assert.equal(payload()['nightfall/control/selectedCar'],1);assert.equal(payload()['nightfall/control/command'],'start');assert.equal(payload()['scene/stop'],false);
 await run('commandNightfall("test","recenter")');assert.equal(payload()['nightfall/control/command'],'recenter');assert.equal(payload()['scene/stop'],true,'recenter must stop travel');
 assert.match(run('nightfallFeedback({updatedAt:Date.now(),stopped:true,inputPause:true},{})'),/Relax, then squeeze/);
 assert.match(run('nightfallFeedback({updatedAt:Date.now(),stopped:true,inputPause:true},{stop:true})'),/STOP is active/);
 run('render()');assert.equal(all(elements.users).some(el=>el.textContent==='Allow car selection (staff permission)'),false);
 assert.ok(all(elements.users).some(el=>el.textContent==='Start selected car'));
 // UID is an inventory lookup; commands must still use the current /users key.
 run('state={oldInstall:{deviceUid:"0123456789ABCDEF",deviceUidSource:"android_id",name:"Old headset",lastSeen:Date.now()-60000,batteryPercentage:90},newInstall:{deviceUid:"0123456789abcdef",deviceUidSource:"android_id",name:"Quest 3",lastSeen:Date.now(),batteryPercentage:73,scene:{id:0}},legacyA:{name:"Older APK",lastSeen:Date.now()},legacyB:{deviceUid:"",deviceUidSource:"unavailable",lastSeen:Date.now()}};render()');
 assert.equal(run('deviceRecords().length'),3,'old and current installation group by original UID; unknown UIDs stay separate');
 assert.equal(run('deviceRecords().find(r=>r.uid).id'),'newInstall');
 assert.equal(run('canControl("oldInstall")'),false);assert.equal(run('canControl("newInstall")'),true);
 assert.ok(all(elements.users).some(el=>el.className==='u-identity'&&el.innerHTML?.includes('0123456789abcdef')),'original UID is visible');
 assert.ok(all(elements.users).some(el=>el.textContent==='Battery 73%'),'battery belongs to latest installation');
 assert.ok(all(elements.users).some(el=>el.textContent?.includes('Other records for this UID: oldInstall')));
 before=requests.length;await run('setUserScene("oldInstall",SCENES[1])');assert.equal(requests.length,before);
 await run('setUserScene("newInstall",SCENES[1])');assert.ok(requests.at(-1).url.endsWith('/users/newInstall.json'));
 assert.equal(run('state.newInstall.deviceUid'),'0123456789abcdef');assert.equal(run('state.newInstall.batteryPercentage'),73,'commands do not overwrite device reports');
 doc.getElementById('deviceSearch').value='0123456789ABCDEF';run('render()');
 assert.equal(elements.users.children.length,1,'UID search finds one device card');
 doc.getElementById('deviceSearch').value='oldInstall';run('render()');assert.equal(elements.users.children.length,1,'old Firebase key resolves to current device card');
 doc.getElementById('deviceSearch').value='not-present';run('render()');assert.equal(elements.users.children.length,0);assert.equal(elements.empty.textContent,'No headsets match your search.');
 doc.getElementById('deviceSearch').value='';
 assert.equal(run('batteryInfo({lastSeen:Date.now(),batteryPercentage:0}).text'),'Battery 0% · low');
 assert.equal(run('batteryInfo({lastSeen:Date.now(),batteryPercentage:100}).text'),'Battery 100%');
 for(const value of ['-1','undefined','null','"73"','NaN','Infinity','101','23.5'])
  assert.equal(run(`batteryInfo({lastSeen:Date.now(),batteryPercentage:${value}}).text`),'Battery unavailable','invalid/missing battery must not appear as zero: '+value);
 assert.match(run('batteryInfo({lastSeen:Date.now()-60000,batteryPercentage:73}).text'),/last reported \(stale\)/);
 run('applyPatch({path:"/newInstall",data:{batteryPercentage:19,lastSeen:Date.now()}});render()');
 assert.ok(all(elements.users).some(el=>el.textContent==='Battery 19% · low'),'heartbeat updates battery display');
 run('applyPatch({path:"/oldInstall",data:{lastSeen:Date.now()}});render()');
 assert.equal(run('deviceRecords().find(r=>r.uid).conflict'),true);
 assert.equal(run('canControl("oldInstall") || canControl("newInstall")'),false,'simultaneous UID records cannot receive controls');
 assert.ok(all(elements.users).some(el=>el.textContent?.startsWith('Multiple active records report this UID.')));
 const conflictCard=elements.users.children.find(el=>all(el).some(child=>child.textContent?.startsWith('Multiple active records')));
 assert.ok(all(conflictCard).filter(el=>['button','input','select'].includes(el.tag)).every(el=>el.disabled),'all device command controls disable for ambiguous UID');
 before=requests.length;
 await run('setUserScene("newInstall",SCENES[2])');await run('saveBall("oldInstall",{hand:"auto",diameterMeters:.065,curlRange:.12})');await run('stopNightfall("newInstall")');
 assert.equal(requests.length,before,'conflict guard applies to every command path');
 run('applyPatch({path:"/oldInstall",data:{lastSeen:Date.now()-60000}});render()');
 assert.equal(run('canControl("newInstall")'),true,'controls recover when duplicate heartbeat expires');
 run('state.newInstall.nightfall={status:{ready:true,bootId:"local",updatedAt:Date.now()}};state.newInstall.scene={id:34};render()');
 responseData={ready:true,bootId:'fresh',updatedAt:Date.now()};
 let finishRead;holdGet=new Promise(r=>finishRead=r);
 const waitingResume=run('commandNightfall("newInstall","resume")');await new Promise(setImmediate);
 run('applyPatch({path:"/oldInstall",data:{lastSeen:Date.now()}})');
 before=requests.length;finishRead();holdGet=null;await waitingResume;
 assert.equal(requests.length,before,'UID conflict appearing during status fetch blocks the pending command write');
 run('state={a:{deviceUid:"",lastSeen:Date.now()},b:{deviceUid:"",lastSeen:Date.now()},c:{deviceUid:"<script>",lastSeen:Date.now()},d:{deviceUid:"0123456789abcdef",deviceUidSource:"unavailable",lastSeen:Date.now()},e:{deviceUid:"0000000000000000",lastSeen:Date.now()}};render()');
 assert.equal(run('deviceRecords().length'),5,'empty, invalid and unavailable identities never merge');
 assert.ok(run('Object.keys(state).every(canControl)'),'legacy clients remain controllable');
 console.log('PASS: 21 scene mappings; online/offline guards; names; multipath stream updates; retained form drafts/focus; Nightfall fresh-session commands, Stop ordering and reported status; stress-ball validation; input pulses; presentation leases; request errors; original UID display/search/grouping; current-record routing; duplicate UID guards and in-flight command blocking; battery freshness/unknown/low states; legacy compatibility. No live Firebase requests sent.');
})().catch(e=>{console.error(e);process.exitCode=1});

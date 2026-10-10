/* Firebase contracts: Unity SceneSelector, NightfallFirebaseControl,
   StressBallRemoteControl, RemoteFirebaseTriggerSource, AdaptiveFirebaseClient. */
const remoteDrafts = new Map(), remoteQueues = new Map(), remoteEpochs = new Map();
const adaptiveSessions = new Map();
function freshStatus(s, field = 'updatedAt', age = 12000) {
  return !!s && Number.isFinite(s[field]) && s[field] <= Date.now()+2000 && Date.now()-s[field] < age;
}
function reportedScene(u) {
  if (freshStatus(u?.stressBall?.status)) return u.stressBall.status.scene;
  if (freshStatus(u?.telemetry, 'capturedAt')) return u.telemetry.sceneName;
  if (freshStatus(u?.nightfall?.status)) return 'Nightfall_Main';
  return null;
}
function isNightfall(u) { const scene=reportedScene(u); return scene ? scene === 'Nightfall_Main' : u?.scene?.id === 34; }
function nightfallReady(id) {
  const s=state[id]?.nightfall?.status;
  return isOnline(id) && isNightfall(state[id]) && freshStatus(s) && s.ready === true && !!s.bootId;
}
function remoteId() { return crypto.randomUUID(); }
async function remoteRequest(id, path, method='GET', body) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch(base+'/users/'+encodeURIComponent(id)+path+'.json', {
      method, signal:controller.signal, headers:{'Content-Type':'application/json'},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
    if (!response.ok) throw Error('Firebase request failed ('+response.status+').');
    return method === 'GET' ? await response.json() : null;
  } finally { clearTimeout(timer); }
}
// Per-headset ordering prevents a delayed settings write from undoing Stop.
function remoteAction(id, action, stop=false) {
  if (stop) remoteEpochs.set(id,(remoteEpochs.get(id)||0)+1);
  const epoch=remoteEpochs.get(id)||0;
  const current=()=>epoch===(remoteEpochs.get(id)||0);
  const previous=remoteQueues.get(id)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    if (!current() || !requireOnline(id)) return;
    await action(current);
  }).catch(e=>{render();toast(e.message || 'Remote command failed.',true);});
  remoteQueues.set(id,task);
  task.finally(()=>{if(remoteQueues.get(id)===task) remoteQueues.delete(id);});
  return task;
}
async function patchRemote(id, paths, current=()=>true) {
  if (!current() || !requireOnline(id)) return false;
  await remoteRequest(id,'','PATCH',paths);
  applyPatch({path:'/'+id,data:paths});render();return true;
}
async function liveNightfall(id) {
  if (!nightfallReady(id)) throw Error('Open Nightfall on this headset and wait for fresh session status.');
  const status=await remoteRequest(id,'/nightfall/status');
  if (!freshStatus(status) || !status.ready || !status.bootId) throw Error('Nightfall status is stale. Put on the headset and hold its active controller.');
  return status;
}
function setNightfall(id, values) {
  const allowed=['selectionEnabled','activeHand','mode','muted'];
  if (Object.keys(values).some(k=>!allowed.includes(k)) ||
      ('selectionEnabled' in values && typeof values.selectionEnabled!=='boolean') ||
      ('muted' in values && typeof values.muted!=='boolean') ||
      ('activeHand' in values && !['left','right'].includes(values.activeHand)) ||
      ('mode' in values && !['showcase','procedure'].includes(values.mode))) {
    toast('Unsupported Nightfall setting.',true);return Promise.resolve();
  }
  return remoteAction(id,async current=>{
    await liveNightfall(id);
    const paths=Object.fromEntries(Object.entries(values).map(([k,v])=>['nightfall/control/'+k,v]));
    if(await patchRemote(id,paths,current)) toast('Nightfall setting sent. Check the reported status below.');
  });
}
function stopNightfall(id) {
  return remoteAction(id,async current=>{
    if(await patchRemote(id,{'scene/stop':true,'nightfall/control/stop':true,'nightfall/control/selectionEnabled':false},current)) toast('STOP sent. Resume remains a separate staff action.');
  },true);
}
function commandNightfall(id, command) {
  if (!['resume','reset','finish'].includes(command)) return Promise.resolve();
  return remoteAction(id,async current=>{
    const status=await liveNightfall(id);
    const paths={
      'nightfall/control/bootId':status.bootId,'nightfall/control/commandId':remoteId(),
      'nightfall/control/command':command,'nightfall/control/expiresAt':Date.now()+15000
    };
    if(command==='resume'||command==='reset') {
      paths['scene/stop']=false;paths['nightfall/control/stop']=false;paths['nightfall/control/mode']='showcase';
    }
    // Unity ignores every one-shot while control.stop is true. Finish itself
    // stops the session, so clear that transport latch while retaining scene Stop.
    if(command==='finish') {paths['nightfall/control/stop']=false;paths['scene/stop']=true;}
    if(command!=='resume') paths['nightfall/control/selectionEnabled']=false;
    if(await patchRemote(id,paths,current)) toast(command==='resume'?'Resume sent. Hold the active controller; a fresh trigger press starts the drive.':command==='reset'?'Reset sent. Enable car selection again when ready.':'Finish sent.');
  });
}
function saveBall(id, values) {
  const diameter=Number(values.diameterMeters),curl=Number(values.curlRange);
  if(!['auto','left','right'].includes(values.hand)||!Number.isFinite(diameter)||diameter<.04||diameter>.10||!Number.isFinite(curl)||curl<.06||curl>.30) {
    toast('Choose a hand, diameter 4–10 cm and response range 0.06–0.30.',true);return Promise.resolve();
  }
  return remoteAction(id,async current=>{
    const settings={schemaVersion:1,hand:values.hand,diameterMeters:diameter,curlRange:curl,showConnectionNotice:!!values.showConnectionNotice,revision:remoteId()};
    if(await patchRemote(id,{'stressBall/control':settings},current)) {remoteDrafts.delete(id+':ball');render();toast('Stress-ball settings sent; waiting for the headset to apply them.');}
  });
}
function sendInput(id) {
  return remoteAction(id,async current=>{
    if(isNightfall(state[id])) throw Error('Nightfall uses the wearer’s controller or ball for car selection and driving.');
    if(await patchRemote(id,{triggerAt:{'.sv':'timestamp'}},current)) toast('One input pulse sent to the current scene.');
  });
}
function previewPresentation(id, values, active=true) {
  const limits={visualCalm:[0,1],motionScale:[.75,1],musicGain:[.65,1],vfxGain:[.55,1],focusStrength:[0,.3],musicVariant:[0,1],effectVariant:[0,1]};
  for(const [key,[min,max]] of Object.entries(limits)) {
    if(!Number.isFinite(Number(values[key]))||Number(values[key])<min||Number(values[key])>max) {toast('Presentation values are outside the app’s supported range.',true);return Promise.resolve();}
  }
  if(!Number.isInteger(Number(values.musicVariant))||!Number.isInteger(Number(values.effectVariant))) {toast('Choose a supported presentation variant.',true);return Promise.resolve();}
  return remoteAction(id,async current=>{
    const t=await remoteRequest(id,'/telemetry');
    if(!freshStatus(t,'capturedAt',6000)||!t.bootId||!t.sceneName||!Number.isInteger(t.sequence)||t.sequence<1) throw Error('Waiting for fresh app telemetry.');
    if(active && (t.stopped || stopOf(state[id]) || (isNightfall(state[id]) && state[id]?.nightfall?.status?.stopped))) throw Error('Resume the scene before previewing presentation settings.');
    let session=adaptiveSessions.get(id);
    if(!session||session.bootId!==t.bootId) {session={bootId:t.bootId,sessionId:remoteId(),sequence:0};adaptiveSessions.set(id,session);}
    const now=Date.now(), command={version:1,bootId:t.bootId,sessionId:session.sessionId,sequence:++session.sequence,inputSequence:t.sequence,expectedScene:t.sceneName,sceneId:-1,issuedAt:now,expiresAt:now+5000,active,source:'staff-dashboard',mode:'manual',reason:active?'staff_preview':'staff_release',stage:0};
    for(const key of Object.keys(limits)) command[key]=Number(values[key]);
    if(await patchRemote(id,{adaptive:command},current)) toast(active?'Presentation preview sent for 5 seconds.':'Default presentation requested.');
  });
}
function remoteElement(tag,text,className) {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function remoteButton(parent,text,enabled,callback,danger=false) {
  const b=remoteElement('button',text,'seg-btn'+(danger?' stop-btn':''));b.type='button';b.disabled=!enabled;b.addEventListener('click',callback);parent.appendChild(b);return b;
}
function remoteField(parent,id,key,label,value,options,onChange,disabled=false) {
  const wrap=remoteElement('label',label), input=document.createElement(options?'select':'input');
  input.id='remote-'+id+'-'+key;wrap.htmlFor=input.id;
  if(options) for(const [v,text] of options) {const o=remoteElement('option',text);o.value=v;input.appendChild(o);}
  else input.type=typeof value==='boolean'?'checkbox':'number';
  if(input.type==='checkbox') input.checked=value;else input.value=String(value);
  input.disabled=disabled;
  input.addEventListener(options||input.type==='checkbox'?'change':'input',()=>onChange(input.type==='checkbox'?input.checked:input.value));
  wrap.appendChild(input);parent.appendChild(wrap);return input;
}
function draftFor(id,kind,defaults) {const key=id+':'+kind;if(!remoteDrafts.has(key))remoteDrafts.set(key,{...defaults});return remoteDrafts.get(key);}
function appendRemoteControls(parent,id) {
  const u=state[id], online=isOnline(id);
  if(isNightfall(u) || u.scene?.id===34) {
    const panel=remoteElement('section',undefined,'remote-panel'),s=u.nightfall?.status,c=u.nightfall?.control||{},ready=nightfallReady(id);
    panel.appendChild(remoteElement('h2','Nightfall · Car gallery & drive'));
    panel.appendChild(remoteElement('p','1. Enable car selection. 2. Hold the active controller and Resume showcase. 3. Point at a car/name and tap trigger; press again in the cabin to drive.'));
    panel.appendChild(remoteElement('output',ready?`${s.car}\n${s.beat} · ${s.stopped?'PAUSED':s.travelling?'Driving':'Parked'} · ${fmt(s.distance)} m\nSelection ${s.selectionEnabled?'enabled':'disabled'} on headset · ${s.hand} controller`:'Waiting for live Nightfall status. Open Nightfall on this headset.'));
    remoteButton(panel,'STOP',online,()=>stopNightfall(id),true);
    remoteField(panel,id,'selection','Allow car selection (staff permission)',!!c.selectionEnabled,null,v=>setNightfall(id,{selectionEnabled:v}),!ready);
    remoteField(panel,id,'hand','Active controller',c.activeHand||'right',[['right','Right'],['left','Left']],v=>setNightfall(id,{activeHand:v}),!ready);
    remoteField(panel,id,'mode','Mode',c.mode||'showcase',[['showcase','Showcase'],['procedure','Procedure · parked']],v=>setNightfall(id,{mode:v}),!ready);
    remoteField(panel,id,'mute','Mute Nightfall audio',!!c.muted,null,v=>setNightfall(id,{muted:v}),!ready);
    remoteButton(panel,'Resume showcase',ready,()=>commandNightfall(id,'resume'));
    remoteButton(panel,'Reset to gallery',ready,()=>commandNightfall(id,'reset'));
    remoteButton(panel,'Finish session',ready,()=>commandNightfall(id,'finish'));
    panel.appendChild(remoteElement('p','Changing controller or losing tracking pauses the session. Resume does not start the car. Cabin: trigger drive; A/X engine; B/Y Stop; grip window; stick click door; stick left/right lighting; up/down D/P. Car controls stay in VR.'));
    parent.appendChild(panel);
  }
  const ball=remoteElement('details',undefined,'remote-panel');ball.id='remote-'+id+'-ball-panel';
  ball.appendChild(remoteElement('summary','Stress-ball settings & input'));
  const bs=u.stressBall?.status,bc=u.stressBall?.control||{};
  ball.appendChild(remoteElement('output',freshStatus(bs)?`${bs.source} · ${bs.ready?'Input ready':'Waiting for input'} · ${bs.hand} hand\nTracking ${bs.tracking?'available':'unavailable'} · strength ${fmt(bs.strength)}\n${bc.revision && bs.appliedRevision===bc.revision?'Saved settings applied':bc.revision?'Waiting for settings acknowledgement':'Headset defaults active'}`:'No fresh input status. These controls require a compatible app build.'));
  const draft=draftFor(id,'ball',{hand:bc.hand||'auto',diameterMeters:bc.diameterMeters??.065,curlRange:bc.curlRange??.12,showConnectionNotice:!!bc.showConnectionNotice});
  remoteField(ball,id,'ball-hand','Ball hand',draft.hand,[['auto','Automatic'],['left','Left'],['right','Right']],v=>draft.hand=v,!online);
  const diameter=remoteField(ball,id,'diameter','Ball diameter (cm)',Number((Number(draft.diameterMeters)*100).toFixed(2)),null,v=>draft.diameterMeters=v===''?NaN:Number(v)/100,!online);diameter.min=4;diameter.max=10;diameter.step=.1;
  const curl=remoteField(ball,id,'curl','Finger response range',draft.curlRange,null,v=>draft.curlRange=v===''?NaN:Number(v),!online);curl.min=.06;curl.max=.30;curl.step=.01;
  remoteField(ball,id,'notice','Show connection notice in headset',draft.showConnectionNotice,null,v=>draft.showConnectionNotice=v,!online);
  remoteButton(ball,'Save ball settings',online,()=>saveBall(id,draft));
  remoteButton(ball,'Use defaults',online,()=>saveBall(id,{hand:'auto',diameterMeters:.065,curlRange:.12,showConnectionNotice:false}));
  remoteButton(ball,'Send one input pulse',online&&!isNightfall(u),()=>sendInput(id));
  ball.appendChild(remoteElement('p','Settings are sent only when saved. A remote pulse activates the current scene’s supported interaction; passive scenes may ignore it. Nightfall selection and driving use the wearer’s controller or ball.'));
  parent.appendChild(ball);
  const advanced=remoteElement('details',undefined,'remote-panel');advanced.id='remote-'+id+'-presentation-panel';advanced.appendChild(remoteElement('summary','Presentation preview · advanced'));
  const t=u.telemetry,available=online&&freshStatus(t,'capturedAt',6000)&&!!t.bootId;
  advanced.appendChild(remoteElement('output',available?'App acknowledgement: '+(t.adaptiveAck||'idle'):'Waiting for fresh presentation telemetry.'));
  const pv=draftFor(id,'presentation',{visualCalm:0,motionScale:1,musicGain:1,vfxGain:1,focusStrength:0,musicVariant:0,effectVariant:0});
  for(const [key,label,min,max,step] of [['visualCalm','Visual calm',0,1,.1],['motionScale','Scene animation scale',.75,1,.05],['musicGain','Loop audio gain',.65,1,.05],['vfxGain','Particle intensity',.55,1,.05],['focusStrength','World focus strength',0,.3,.05]]) {
    const f=remoteField(advanced,id,key,label,pv[key],null,v=>pv[key]=v===''?NaN:Number(v),!available);f.min=min;f.max=max;f.step=step;
  }
  remoteField(advanced,id,'musicVariant','Music bed',pv.musicVariant,[['0','Warm'],['1','Soft']],v=>pv.musicVariant=Number(v),!available);
  remoteField(advanced,id,'effectVariant','Soft cue',pv.effectVariant,[['0','Off'],['1','On']],v=>pv.effectVariant=Number(v),!available);
  remoteButton(advanced,'Preview for 5 seconds',available,()=>previewPresentation(id,pv));
  remoteButton(advanced,'Restore presentation',available,()=>previewPresentation(id,pv,false));
  advanced.appendChild(remoteElement('p','Changes expire automatically after 5 seconds. Scene changes and Stop cancel the effect. This adjusts supported presentation elements; it does not steer the car or move the tracked camera.'));
  parent.appendChild(advanced);
}

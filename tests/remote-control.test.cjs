const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.classList={toggle(){}};this.events={};this.attributes={};}
 set innerHTML(s){this.html=s;this.children=[];} get innerHTML(){return this.html;}
 appendChild(el){this.children.push(el);return el;} querySelector(){return new Element('button');}
 addEventListener(n,f){this.events[n]=f;} setAttribute(k,v){this.attributes[k]=v;}
}
const elements={},requests=[];
const context=vm.createContext({document:{getElementById:id=>elements[id]??=new Element('div'),createElement:t=>new Element(t)},EventSource:class{addEventListener(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},fetch:async(url,opt)=>{requests.push({url,...opt});return{ok:true,status:200}},console});
vm.runInContext(script,context);
const scenes=JSON.parse(vm.runInContext('JSON.stringify(SCENES)',context));
assert.equal(new Set(scenes.map(s=>s.id)).size,19);
vm.runInContext('state={test:{name:"Test headset",lastSeen:Date.now(),scene:{id:0,segments:3,stop:true}}};render()',context);
function all(el){return [el,...el.children.flatMap(all)];}
let buttons=all(elements.users).filter(el=>el.className?.startsWith('s-btn'));
assert.equal(buttons.length,19);
(async()=>{
 vm.runInContext('applyPut({path:"/old",data:{name:"Quest 2",lastSeen:Date.now()-86400000,scene:{id:0}}});render()',context);
 assert.equal(vm.runInContext('isOnline("old")',context),false,'snapshot must not revive old headset');
 vm.runInContext('applyPatch({path:"/old/scene",data:{id:24}});render()',context);
 assert.equal(vm.runInContext('isOnline("old")',context),false,'scene writes must not revive old headset');
 const before=requests.length;
 await vm.runInContext('setUserScene("old",SCENES[1])',context);
 await vm.runInContext('setUserStop("old",true)',context);
 await vm.runInContext('setUserSegments("old",2)',context);
 assert.equal(requests.length,before,'offline controls must never write');
 assert.ok(!elements.users.children[0].className.includes(' off'),'active headset comes before archived devices');
 const archived=elements.users.children[1];
 assert.equal(archived.tag,'details');
 assert.ok(all(archived).filter(x=>x.className?.startsWith('s-btn')).every(x=>x.disabled));
 vm.runInContext('applyPatch({path:"/old",data:{lastSeen:Date.now()}})',context);
 assert.equal(vm.runInContext('isOnline("old")',context),true,'real heartbeat enables headset');
 vm.runInContext('delete state.old;render()',context);

 for(const scene of scenes){
  const button=all(elements.users).find(el=>el.title===`${scene.name} · ID ${scene.id}`);
  await button.events.click();
  const req=requests.at(-1),body=JSON.parse(req.body);
  assert.equal(req.method,'PUT');assert.ok(req.url.endsWith('/users/test/scene.json'));
  assert.equal(body.id,scene.id);assert.equal(body.name,scene.name);assert.equal(body.segments,3);assert.equal(body.stop,false);
  assert.equal(all(elements.users).filter(el=>el.attributes['aria-pressed']==='true').length,1);
 }
 // renaming: stored under /label (never the headset-owned /name), survives a headset re-registering, and can be reset
 await vm.runInContext('renameUser("test","  Chair 2  ")',context);
 let r=requests.at(-1);
 assert.equal(r.method,'PUT');assert.ok(r.url.endsWith('/users/test/label.json'));assert.equal(JSON.parse(r.body),'Chair 2');
 assert.equal(vm.runInContext('displayName(state.test)',context),'Chair 2');
 vm.runInContext('applyPatch({path:"/test",data:{name:"Quest 3S",lastSeen:Date.now()}})',context);
 assert.equal(vm.runInContext('displayName(state.test)',context),'Chair 2','headset re-registering its model name must not undo the rename');
 await vm.runInContext('renameUser("test","")',context);
 r=requests.at(-1);
 assert.equal(r.method,'DELETE');assert.ok(r.url.endsWith('/users/test/label.json'));
 assert.equal(vm.runInContext('displayName(state.test)',context),'Quest 3S');
 console.log('PASS: rename writes /label only, survives headset re-registration, and resets to the model name.');
 console.log('PASS: stale snapshots/scene writes stay offline, offline commands blocked, active devices first; all 19 buttons send correct Firebase ID/name, retain segments, clear stop and update active selection. No live Firebase requests sent.');
})().catch(e=>{console.error(e);process.exitCode=1});

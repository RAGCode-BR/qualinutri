import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const $=s=>document.querySelector(s);
const nf2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtKg=n=>Math.abs(n)>=1000?(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})+' t':Math.round(n).toLocaleString('pt-BR')+' kg';
const fmtM=n=>nf2.format(n);
const pct=n=>Math.round(n*100)+'%';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const EPS=1e-4;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Dados ---------- */
const defaultTruck = { L: 7, W: 2.45, H: 2.5, cap: 10000 };
function truckView(vehicle) {
  const { L, cap } = vehicle;
  return {
    ...vehicle, cab: 2.1, deck: 1.25, wheels: [-1.2, L * .62, L * .8],
    supF: -1.2, supR: L * .71, limF: cap * .4, limR: cap * .85,
    fl: 'Dianteira estimada', rl: 'Traseira estimada', body: 'aberta', bodyNome: 'Carroceria',
  };
}

let T = truckView(defaultTruck);
let items = [], nextId = 1, selected = null, heat = false, view = '3d';
let revision = null;
const origin = window.location.origin;

/* ---------- Three ---------- */
const canvas = $('#c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  window.parent.postMessage({ type: 'qualinutri:unavailable' }, origin);
  throw error;
}
renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
const scene=new THREE.Scene();
scene.background=new THREE.Color('#141920');
scene.fog=new THREE.Fog('#141920',45,120);
const camera=new THREE.PerspectiveCamera(40,1,0.1,400);
camera.position.set(10,9,14);

scene.add(new THREE.HemisphereLight('#d6deea','#2a2c31',0.75));
const sun=new THREE.DirectionalLight('#fff3dc',0.95);
sun.position.set(-12,20,10); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.bias=-0.0006;
scene.add(sun);
const fill=new THREE.DirectionalLight('#9fb7d6',0.25); fill.position.set(14,8,-10); scene.add(fill);

// chão com textura de asfalto
(function(){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d');
  g.fillStyle='#2a2f37'; g.fillRect(0,0,256,256);
  for(let i=0;i<5000;i++){const v=36+Math.random()*22|0;g.fillStyle=`rgba(${v},${v+3},${v+8},.55)`;g.fillRect(Math.random()*256,Math.random()*256,1.5,1.5);}
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(60,60); tex.encoding=THREE.sRGBEncoding;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({map:tex,roughness:.95}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
})();

const M={
  wood:new THREE.MeshStandardMaterial({color:'#9b7550',roughness:.9}),
  woodDark:new THREE.MeshStandardMaterial({color:'#6e5236',roughness:.9}),
  floor:new THREE.MeshStandardMaterial({color:'#4d3b2b',roughness:.85}),
  steel:new THREE.MeshStandardMaterial({color:'#c9d0d8',roughness:.45,metalness:.35}),
  frame:new THREE.MeshStandardMaterial({color:'#6b7684',roughness:.5,metalness:.4}),
  cab:new THREE.MeshStandardMaterial({color:'#d9a21b',roughness:.45,metalness:.15}),
  dark:new THREE.MeshStandardMaterial({color:'#1c2027',roughness:.8}),
  tire:new THREE.MeshStandardMaterial({color:'#15171b',roughness:.95}),
  rim:new THREE.MeshStandardMaterial({color:'#9aa2ad',roughness:.35,metalness:.6}),
  glass:new THREE.MeshStandardMaterial({color:'#1d2c3a',roughness:.08,metalness:.3}),
  lamp:new THREE.MeshStandardMaterial({color:'#fff4cc',emissive:'#ffe8a0',emissiveIntensity:.9}),
  tail:new THREE.MeshStandardMaterial({color:'#7a1a16',emissive:'#ff3a2a',emissiveIntensity:.6}),
  wall:new THREE.MeshStandardMaterial({color:'#a9bdd1',transparent:true,opacity:.09,depthWrite:false,side:THREE.DoubleSide}),
  wallRefri:new THREE.MeshStandardMaterial({color:'#f2f5f8',transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}),
  tarp:new THREE.MeshStandardMaterial({color:'#3f6c8f',transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide}),
  tarpSolid:new THREE.MeshStandardMaterial({color:'#3a6383',roughness:.9}),
  board:new THREE.MeshStandardMaterial({color:'#8a6a45',roughness:.85}),
  door:new THREE.MeshStandardMaterial({color:'#dfe4ea',roughness:.5,metalness:.2}),
  concrete:new THREE.MeshStandardMaterial({color:'#5d636c',roughness:.95}),
  plate:new THREE.MeshStandardMaterial({color:'#7d858f',roughness:.4,metalness:.6}),
  yellow:new THREE.MeshStandardMaterial({color:'#e2ad16',roughness:.6}),
  rubber:new THREE.MeshStandardMaterial({color:'#111',roughness:.9}),
  edge:new THREE.LineBasicMaterial({color:'#000000',transparent:true,opacity:.28}),
  topLine:new THREE.LineBasicMaterial({color:'#f2b705',transparent:true,opacity:.55})
};
const SHARED=new Set(Object.values(M));

function box(parent,w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function disposeTree(o){o.traverse(n=>{if(n.geometry)n.geometry.dispose();if(n.material&&!SHARED.has(n.material)){if(n.material.map)n.material.map.dispose();n.material.dispose();}});}

const rig=new THREE.Group(); scene.add(rig);
let truckGroup=null, dockGroup=null, wheels=[];

function buildTruck(){
  if(truckGroup){rig.remove(truckGroup);disposeTree(truckGroup);}
  wheels=[];
  const g=new THREE.Group(); truckGroup=g; rig.add(g);
  const {L,W,H,deck,cab}=T, ox=-L/2;
  // assoalho e saia
  box(g,L,0.1,W,ox+L/2,deck-0.05,0,M.floor);
  box(g,L,0.24,W-0.12,ox+L/2,deck-0.22,0,M.dark);
  // longarinas
  const cx0=ox-0.2-cab, railLen=(ox+L)-(cx0+0.3);
  box(g,railLen,0.26,0.14,cx0+0.3+railLen/2,0.82,0.45,M.dark);
  box(g,railLen,0.26,0.14,cx0+0.3+railLen/2,0.82,-0.45,M.dark);
  const n=Math.max(3,Math.round(L/1.4)), B=T.body;
  if(B==='aberta'){
    const bh=0.6;
    for(const s of [-1,1])box(g,L,bh,0.05,ox+L/2,deck+bh/2,s*(W/2+0.025),M.board);
    box(g,0.06,bh*1.7,W+0.1,ox+0.03,deck+bh*0.85,0,M.board);
    box(g,0.05,bh,W,ox+L+0.06,deck-bh/2+0.02,0,M.board);
    for(let i=0;i<=n;i++){const x=ox+L*i/n;for(const s of [-1,1])box(g,0.07,bh+0.1,0.07,x,deck+(bh+0.1)/2,s*(W/2+0.06),M.frame);}
  }else{
    const refri=B==='refri', sider=B==='sider', th=refri?0.1:0.04, off=refri?0.05:0;
    const wm=refri?M.wallRefri:sider?M.tarp:M.wall;
    box(g,th,H,W+2*off,ox-off+th/2-0.02,deck+H/2,0,refri?M.wallRefri:M.wall).castShadow=false;
    box(g,L,H,th,ox+L/2,deck+H/2,-(W/2+off),wm).castShadow=false;
    if(sider){box(g,0.38,H,0.09,ox+0.25,deck+H/2,W/2+0.05,M.tarpSolid);}
    else box(g,L,H,th,ox+L/2,deck+H/2,W/2+off,wm).castShadow=false;
    for(let i=0;i<=n;i++){const x=ox+L*i/n;for(const s of [-1,1])box(g,0.07,H,0.07,x,deck+H/2,s*(W/2+off),M.frame);}
    for(const s of [-1,1])box(g,L,0.07,0.07,ox+L/2,deck+H,s*(W/2+off),M.frame);
    box(g,0.07,0.07,W,ox,deck+H,0,M.frame);
    box(g,0.07,0.07,W,ox+L,deck+H,0,M.frame);
    if(refri){box(g,0.26,0.85,1.5,ox-0.16,deck+H-0.55,0,M.steel);box(g,0.27,0.5,1.2,ox-0.165,deck+H-0.55,0,M.dark);}
    for(const s of [-1,1])box(g,W/2,H,0.04,ox+L-W/4,deck+H/2,s*(W/2+off+0.07),refri?M.wallRefri:M.door);
  }
  // linha de altura máxima
  const top=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L,0.001,W)),M.topLine);
  top.position.set(ox+L/2,deck+H,0); g.add(top);
  // para-choque traseiro e lanternas
  box(g,0.12,0.16,W,ox+L+0.06,deck-0.42,0,M.dark);
  for(const s of [-1,1])box(g,0.05,0.12,0.28,ox+L+0.1,deck-0.42,s*(W/2-0.25),M.tail);
  // cabine
  const cabH=deck+H*0.72-0.55, cy0=0.55;
  box(g,cab,cabH,W,cx0+cab/2,cy0+cabH/2,0,M.cab);
  box(g,cab*0.55,0.32,W*0.9,cx0+cab*0.62,cy0+cabH+0.16,0,M.cab);
  box(g,0.04,cabH*0.36,W*0.86,cx0-0.01,cy0+cabH*0.72,0,M.glass);
  for(const s of [-1,1])box(g,cab*0.42,cabH*0.3,0.03,cx0+cab*0.28,cy0+cabH*0.72,s*(W/2+0.005),M.glass);
  box(g,0.04,cabH*0.28,W*0.56,cx0-0.01,cy0+cabH*0.28,0,M.dark);
  for(const s of [-1,1])box(g,0.05,0.14,0.32,cx0-0.02,cy0+0.3,s*(W/2-0.32),M.lamp);
  box(g,0.22,0.26,W+0.06,cx0-0.06,cy0,0,M.dark);
  for(const s of [-1,1])box(g,0.08,0.3,0.06,cx0+0.15,cy0+cabH*0.62,s*(W/2+0.12),M.dark);
  // pés de apoio da carreta
  if(T.trailer){for(const s of [-1,1])box(g,0.12,deck-0.25,0.12,ox+2.8,(deck-0.25)/2+0.02,s*0.8,M.frame);}
  // rodas
  for(const wx of T.wheels){
    const dual=wx>0, tw=dual?0.52:0.32;
    for(const s of [-1,1]){
      const wg=new THREE.Group(); wg.position.set(ox+wx,0.5,s*(W/2-tw/2+0.04)); g.add(wg);
      const tire=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,tw,28),M.tire); tire.rotation.x=Math.PI/2; tire.castShadow=true; wg.add(tire);
      const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,tw+0.02,18),M.rim); rim.rotation.x=Math.PI/2; wg.add(rim);
      const hub=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.5,tw+0.04),M.dark); wg.add(hub);
      wheels.push(wg);
    }
    box(g,0.12,0.12,W-0.3,ox+wx,0.5,0,M.dark);
  }
}

const DOCK={gap:0.55,depth:7.5,half:6.5};
function buildDock(){
  if(dockGroup){scene.remove(dockGroup);disposeTree(dockGroup);}
  const g=new THREE.Group(); dockGroup=g; scene.add(g);
  const {L,W,deck}=T, x0=L/2+DOCK.gap;
  box(g,DOCK.depth,deck,DOCK.half*2,x0+DOCK.depth/2,deck/2,0,M.concrete);
  box(g,0.08,0.03,DOCK.half*2,x0+0.04,deck+0.015,0,M.yellow);
  for(const s of [-1,1])box(g,0.14,0.35,0.5,x0-0.07,deck-0.35,s*(W/2-0.25),M.rubber);
  box(g,DOCK.gap+0.05,0.04,W*0.86,L/2+DOCK.gap/2,deck-0.02,0,M.plate);
  // pintura no piso da doca
  const c=document.createElement('canvas'); c.width=512; c.height=128; const x=c.getContext('2d');
  x.fillStyle='rgba(0,0,0,0)'; x.fillRect(0,0,512,128);
  x.font='700 92px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillStyle='rgba(226,173,22,.85)'; x.textAlign='center'; x.textBaseline='middle';
  x.fillText('DOCA 03',256,68);
  const tex=new THREE.CanvasTexture(c); tex.encoding=THREE.sRGBEncoding;
  const p=new THREE.Mesh(new THREE.PlaneGeometry(4,1),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
  p.rotation.x=-Math.PI/2; p.rotation.z=Math.PI/2; p.position.set(x0+DOCK.depth-0.8,deck+0.006,0); g.add(p);
  // faixas da baia
  const bayLen=L+T.cab+5;
  for(const s of [-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(bayLen,0.14),M.yellow);m.rotation.x=-Math.PI/2;m.position.set(L/2-bayLen/2,0.006,s*(W/2+1.15));m.receiveShadow=true;g.add(m);}
  const span=L/2+DOCK.depth+10;
  sun.shadow.camera.left=-span; sun.shadow.camera.right=span; sun.shadow.camera.top=span; sun.shadow.camera.bottom=-span;
  sun.shadow.camera.near=1; sun.shadow.camera.far=80; sun.shadow.camera.updateProjectionMatrix();
}

/* ---------- Itens ---------- */
function makeItem(over){
  return { id: nextId++, ...over, loaded: false, x: 0, z: 0, y: 0, gx: 0, gz: 0, dockLift: 0 };
}
function buildItemMesh(it){
  const g=new THREE.Group(); g.userData.itemId=it.id;
  const w=it.w, d=it.d; let base=0;
  if(it.pallet){
    base=0.144;
    for(const f of [-0.5,0,0.5]){box(g,w,0.022,0.1,0,0.011,f*(d-0.1),M.woodDark);box(g,w,0.1,0.1,0,0.072,f*(d-0.1),M.wood);}
    const n=Math.max(3,Math.round(w/0.24));
    for(let i=0;i<n;i++){box(g,0.1,0.022,d,-w/2+0.05+i*(w-0.1)/(n-1),0.133,0,M.wood);}
  }
  const ch=Math.max(0.05,it.h-base);
  const mat=new THREE.MeshStandardMaterial({color:it.color,roughness:.82});
  const geo=new THREE.BoxGeometry(w*(it.pallet?0.97:0.995),ch,d*(it.pallet?0.97:0.995));
  const cargo=new THREE.Mesh(geo,mat); cargo.position.y=base+ch/2; cargo.castShadow=true; cargo.receiveShadow=true; g.add(cargo);
  const ed=new THREE.LineSegments(new THREE.EdgesGeometry(geo),M.edge); ed.position.copy(cargo.position); g.add(ed);
  if(it.pallet&&ch>0.5){ // fita de arquear
    const sm=new THREE.MeshStandardMaterial({color:'#20242b',roughness:.6});
    const s1=new THREE.Mesh(new THREE.BoxGeometry(0.035,ch+0.004,d*0.975),sm); s1.position.set(w*0.2,base+ch/2,0); g.add(s1);
    const s2=s1.clone(); s2.position.x=-w*0.2; g.add(s2);
  }
  it.mesh=g; it.cargoMat=mat;
  return g;
}
function disposeItem(it){if(it.mesh){if(it.mesh.parent)it.mesh.parent.remove(it.mesh);disposeTree(it.mesh);it.mesh=null;it.cargoMat=null;}}
function placeMesh(it){
  if(!it.mesh)buildItemMesh(it);
  const m=it.mesh, lift=(drag&&drag.set.has(it)&&drag.moved)?0.05:0;
  if(it.loaded){if(m.parent!==rig)rig.add(m);m.position.set(it.x-T.L/2+it.w/2,T.deck+it.y+lift,it.z+it.d/2);}
  else{if(m.parent!==scene)scene.add(m);m.position.set(it.gx+it.w/2,T.deck+(it.dockLift||0)+lift,it.gz+it.d/2);}
}

/* ---------- Física simples ---------- */
function ovXZ(x,z,w,d,b){return x<b.x+b.w-EPS&&x+w>b.x+EPS&&z<b.z+b.d-EPS&&z+d>b.z+EPS;}
function areaXZ(x,z,w,d,b){const ox=Math.max(0,Math.min(x+w,b.x+b.w)-Math.max(x,b.x)),oz=Math.max(0,Math.min(z+d,b.z+b.d)-Math.max(z,b.z));return ox*oz;}
function restY(x,z,w,d,list){let y=0;for(const o of list)if(ovXZ(x,z,w,d,o))y=Math.max(y,o.y+o.h);return y;}
function support(x,z,w,d,y,list){let a=0,all=true;for(const o of list){if(Math.abs(o.y+o.h-y)<0.01){const ar=areaXZ(x,z,w,d,o);if(ar>EPS){a+=ar;if(!o.stack)all=false;}}}return{frac:a/(w*d),allStack:all};}
function settle(ex){
  const L=items.filter(i=>i.loaded&&!(ex&&ex.has(i))).sort((a,b)=>(a.y-b.y)||(a.id-b.id));
  const done=[];
  for(const it of L){it.y=restY(it.x,it.z,it.w,it.d,done);done.push(it);}
}
function findSpot(it,placed){
  const {L,W,H}=T, hw=W/2;
  const cands=[{x:0,z:-hw}];
  for(const p of placed){cands.push({x:p.x+p.w,z:p.z},{x:p.x,z:p.z+p.d},{x:p.x+p.w,z:-hw},{x:p.x,z:p.z});}
  let best=null,bs=Infinity;
  const ors=it.w===it.d?[[it.w,it.d]]:[[it.w,it.d],[it.d,it.w]];
  for(const c of cands)for(const [w,d] of ors){
    if(c.x<-EPS||c.z<-hw-EPS||c.x+w>L+EPS||c.z+d>hw+EPS)continue;
    const y=restY(c.x,c.z,w,d,placed);
    if(y+it.h>H+EPS)continue;
    if(y>EPS){const s=support(c.x,c.z,w,d,y,placed);if(s.frac<0.75||!s.allStack)continue;}
    const sc=Math.round(c.x*100)+y*10+(c.z+hw);
    if(sc<bs){bs=sc;best={x:c.x,z:c.z,y,w,d};}
  }
  return best;
}
function applySpot(it,s){
  const rot=Math.abs(s.w-it.w)>EPS;
  it.x=s.x;it.z=s.z;it.y=s.y;
  if(rot){it.w=s.w;it.d=s.d;if(it.mesh)disposeItem(it);}
  it.loaded=true;it.dockLift=0;
}
function layoutLane(){
  const x0=T.L/2+DOCK.gap+0.35, zmax=DOCK.half-0.3;
  let x=x0,z=-zmax,row=0;
  for(const it of items){
    if(it.loaded)continue;
    if(z+it.d>zmax&&z>-zmax+EPS){z=-zmax;x+=row+0.3;row=0;}
    it.gx=x;it.gz=z;it.dockLift=0;z+=it.d+0.25;row=Math.max(row,it.w);
  }
}
function groupBy(list, getKey) {
  const groups = new Map();
  for (const item of list) {
    const key = getKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function autoArrange() {
  const placed = [];
  const groups = groupBy(items, item => item.stop);
  let offset = 0;
  for (const group of [...groups.values()].reverse()) {
    const previousLength = T.L;
    const sameStop = [];
    T.L -= offset;
    try {
      for (const item of group.sort((a, b) => b.kg - a.kg)) {
        const spot = findSpot(item, sameStop);
        item.loaded = Boolean(spot);
        if (!spot) continue;
        applySpot(item, spot);
        sameStop.push(item);
      }
    } finally {
      T.L = previousLength;
    }
    for (const item of sameStop) {
      item.x += offset;
      placed.push(item);
    }
    offset = Math.max(offset, ...placed.map(item => item.x + item.w));
  }
  layoutLane();
  refresh();
}

/* ---------- Análise ---------- */
function analyze(){
  const L=items.filter(i=>i.loaded);
  const kg=L.reduce((s,i)=>s+i.kg,0);
  const vol=L.reduce((s,i)=>s+i.w*i.d*i.h,0)/(T.L*T.W*T.H);
  const floor=L.filter(i=>i.y<EPS).reduce((s,i)=>s+i.w*i.d,0)/(T.L*T.W);
  const xcg=kg?L.reduce((s,i)=>s+i.kg*(i.x+i.w/2),0)/kg:null;
  const share=kg?(xcg-T.supF)/(T.supR-T.supF):0;
  const rear=kg*share, front=kg-rear;
  const bad=new Set(),warn=new Set(),issues=[];
  let tall=0,unst=0,crush=0;
  for(const it of L){
    if(it.y+it.h>T.H+EPS){bad.add(it);tall++;}
    if(it.y>EPS){
      const s=support(it.x,it.z,it.w,it.d,it.y,L.filter(o=>o!==it));
      if(!s.allStack){bad.add(it);crush++;}
      else if(s.frac<0.75){warn.add(it);unst++;}
    }
  }
  if(kg>T.cap)issues.push({l:'bad',t:'Peso acima da capacidade',s:`${fmtKg(kg-T.cap)} além do limite de ${fmtKg(T.cap)}`});
  if(kg&&front>T.limF)issues.push({l:'warn',t:`${T.fl} sobrecarregado`,s:`${fmtKg(front)} para um limite de ${fmtKg(T.limF)}. Puxe carga para trás.`});
  if(kg&&rear>T.limR)issues.push({l:'warn',t:`${T.rl} sobrecarregado${T.rl.endsWith('s')?'s':''}`,s:`${fmtKg(rear)} para um limite de ${fmtKg(T.limR)}. Traga carga para a frente.`});
  if(kg&&share>0.9&&rear<=T.limR)issues.push({l:'warn',t:'Dianteira leve',s:'Centro de gravidade muito atrás. O caminhão perde direção.'});
  if(tall)issues.push({l:'bad',t:`${tall} volume${tall>1?'s passam':' passa'} da altura do baú`,s:`Altura útil: ${fmtM(T.H)} m`});
  if(crush)issues.push({l:'bad',t:`${crush} volume${crush>1?'s':''} sobre carga não empilhável`,s:'Vai amassar a carga de baixo.'});
  if(unst)issues.push({l:'warn',t:`${unst} volume${unst>1?'s':''} com pouco apoio`,s:'Menos de 75% da base apoiada.'});
  const dock=items.length-L.length;
  if(dock)issues.push({l:'info',t:`${dock} volume${dock>1?'s':''} aguardando na doca`,s:'Arraste para dentro do baú.'});
  const axOk=kg>0&&front<=T.limF&&rear<=T.limR&&share>=0&&share<=0.9;
  const cleanLoad=!tall&&!crush&&!unst;
  return { kg, vol, floor, xcg, front, rear, bad, warn, issues, dock, axOk };

}

/* ---------- UI ---------- */
const HEAT_A=new THREE.Color('#4f8fb8'),HEAT_B=new THREE.Color('#e2553f');
function refresh(){
  const a=analyze();
  // peso
  $('#kgTxt').textContent=fmtKg(a.kg);
  const kr=a.kg/T.cap;
  $('#kgBar').style.width=Math.min(100,kr*100)+'%';
  $('#kgBar').style.backgroundColor=kr>1?'':kr>0.85?'var(--ok)':kr>0.5?'#c9b13a':'#7d8796';
  $('#kgBarWrap').classList.toggle('over',kr>1);
  $('#kgSub').textContent=`${pct(kr)} de ${fmtKg(T.cap)} · ${T.nome} ${T.bodyNome.toLowerCase()} ${fmtM(T.L)} × ${fmtM(T.W)} × ${fmtM(T.H)} m`;
  $('#volTxt').textContent=pct(a.vol);
  $('#floorTxt').textContent=pct(Math.min(1,a.floor));
  $('#dockTxt').textContent=a.dock;
  // trilho do CG
  const lo=Math.min(T.supF,0)-0.3, hi=Math.max(T.L,T.supR)+0.3, P=x=>((x-lo)/(hi-lo)*100)+'%';
  const bed=$('#tBed'); bed.style.left=P(0); bed.style.width=(T.L/(hi-lo)*100)+'%';
  const z0=T.supF+0.45*(T.supR-T.supF), z1=T.supF+0.75*(T.supR-T.supF);
  const zone=$('#tZone'); zone.style.left=P(z0); zone.style.width=((z1-z0)/(hi-lo)*100)+'%';
  $('#tSupF').style.left=P(T.supF); $('#tSupR').style.left=P(T.supR);
  $('#tCapF').style.left=P(T.supF); $('#tCapF').textContent='diant.';
  $('#tCapR').style.left=P(T.supR); $('#tCapR').textContent='tras.';
  const dot=$('#tDot'); dot.hidden=!a.kg; if(a.kg){dot.style.left=P(a.xcg);dot.classList.toggle('bad',!a.axOk);}
  $('#axFLabel').textContent=T.fl; $('#axRLabel').textContent=T.rl;
  const fr=a.front/T.limF, rr=a.rear/T.limR;
  $('#axFBar').style.width=clamp(fr,0,1)*100+'%'; $('#axFBar').style.backgroundColor=fr>1?'var(--bad)':fr>0.9?'var(--warn)':'var(--ok)';
  $('#axRBar').style.width=clamp(rr,0,1)*100+'%'; $('#axRBar').style.backgroundColor=rr>1?'var(--bad)':rr>0.9?'var(--warn)':'var(--ok)';
  $('#axFTxt').textContent=fmtKg(Math.max(0,a.front)); $('#axRTxt').textContent=fmtKg(Math.max(0,a.rear));
  // alertas
  const ul=$('#issues'); ul.innerHTML='';
  const list=a.issues.length?a.issues:[{l:a.kg?'ok':'info',t:a.kg?'Volumes posicionados':'Carroceria vazia',s:a.kg?'Confira a ordem de descarga.':'Arraste os pedidos da doca ou use Auto-organizar.'}];
  for(const i of list){const li=document.createElement('li');li.className=i.l;li.innerHTML='<div></div>';li.firstChild.textContent=i.t;const sm=document.createElement('small');sm.textContent=i.s;li.firstChild.appendChild(sm);ul.appendChild(li);}
  // cores
  const maxKg=Math.max(1,...items.map(i=>i.kg/(i.w*i.d)));
  for(const it of items){
    placeMesh(it);
    const m=it.cargoMat; if(!m)continue;
    if(heat)m.color.copy(HEAT_A).lerp(HEAT_B,Math.min(1,(it.kg/(it.w*it.d))/maxKg)); else m.color.set(it.color);
    let e=null; if(a.bad.has(it))e='#ff2d20'; else if(a.warn.has(it))e='#ff8a00'; if(it===selected)e='#f2b705';
    if(e){m.emissive.set(e);m.emissiveIntensity=it===selected?0.42:0.38;}else m.emissive.set('#000000');
  }
  renderSel();
  publish();
}

function renderSel() {
  const panel = $('#sel');
  panel.hidden = !selected;
  if (!selected) return;
  $('#selName').textContent = selected.nome;
  $('#selPos').textContent = selected.loaded ? 'Na carroceria' : 'Na doca';
}

$('#selRot').onclick = rotateSel;

function rotateSel(){
  const it=selected; if(!it)return;
  const cx=it.x+it.w/2, cz=it.z+it.d/2;
  [it.w,it.d]=[it.d,it.w];
  if(it.loaded){it.x=clamp(cx-it.w/2,0,Math.max(0,T.L-it.w));it.z=clamp(cz-it.d/2,-T.W/2,Math.max(-T.W/2,T.W/2-it.d));}
  disposeItem(it); settle(); layoutLane(); refresh();
}
let orbit=null, camTween=null;
function viewPose(v){
  const L=T.L, a=camera.aspect<1?1.55:1, d=Math.max(11,L*1.15+4)*a, cx=1.5;
  const tgt=new THREE.Vector3(cx,T.deck+0.6,0);
  if(v==='top')return{p:new THREE.Vector3(cx,d*1.25,0.01),t:new THREE.Vector3(cx,T.deck,0)};
  if(v==='side')return{p:new THREE.Vector3(cx,T.deck+1.8,d*0.95),t:tgt};
  if(v==='rear')return{p:new THREE.Vector3(L/2+DOCK.depth+3,T.deck+3.4,0),t:new THREE.Vector3(0,T.deck+0.8,0)};
  return{p:new THREE.Vector3(cx+d*0.45,d*0.55,d*0.78),t:tgt};
}
function setView(v,instant){
  view=v;
  document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===v));
  const to=viewPose(v);
  if(instant||reduceMotion||!orbit){camera.position.copy(to.p);if(orbit){orbit.target.copy(to.t);orbit.update();}return;}
  camTween={t:0,fp:camera.position.clone(),ft:orbit.target.clone(),tp:to.p,tt:to.t};
}
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>setView(b.dataset.view));

/* ---------- Interação ---------- */
const ray=new THREE.Raycaster(); ray.params.Line.threshold=0.01;
const ndc=new THREE.Vector2();
const floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-T.deck);
let drag=null, downEmpty=null;
function setRay(e){const r=canvas.getBoundingClientRect();ndc.x=((e.clientX-r.left)/r.width)*2-1;ndc.y=-((e.clientY-r.top)/r.height)*2+1;ray.setFromCamera(ndc,camera);}
function pickItem(){
  const objs=items.map(i=>i.mesh).filter(Boolean);
  const hits=ray.intersectObjects(objs,true);
  for(const h of hits){let o=h.object;while(o&&o.userData.itemId===undefined)o=o.parent;if(o)return items.find(i=>i.id===o.userData.itemId)||null;}
  return null;
}
function floorHit(){const p=new THREE.Vector3();return ray.ray.intersectPlane(floorPlane,p)?p:null;}
function ridersOf(it){
  const out=[],st=[it],seen=new Set([it]);
  while(st.length){const c=st.pop();for(const o of items){if(!o.loaded||seen.has(o))continue;if(Math.abs(o.y-(c.y+c.h))<0.01&&ovXZ(o.x,o.z,o.w,o.d,c)){seen.add(o);out.push(o);st.push(o);}}}
  return out;
}
function makeGroupCtx(it){
  const riders=it.loaded?ridersOf(it):[];
  const grp=[it,...riders];
  const rel=grp.map(g=>({it:g,dx:it.loaded?g.x-it.x:0,dz:it.loaded?g.z-it.z:0,dy:it.loaded?g.y-it.y:0}));
  const ctx={it,grp,rel,set:new Set(grp),moved:false};
  ctx.minX=Math.min(...rel.map(r=>r.dx));ctx.maxX=Math.max(...rel.map(r=>r.dx+r.it.w));
  ctx.minZ=Math.min(...rel.map(r=>r.dz));ctx.maxZ=Math.max(...rel.map(r=>r.dz+r.it.d));
  return ctx;
}
function snapAxis(ctx,v,axis){
  const lo=axis==='x'?ctx.minX:ctx.minZ, hi=axis==='x'?ctx.maxX:ctx.maxZ;
  const wLo=axis==='x'?0:-T.W/2, wHi=axis==='x'?T.L:T.W/2;
  const c=[wLo-lo,wHi-hi];
  for(const o of items){if(!o.loaded||ctx.set.has(o))continue;const a=axis==='x'?o.x:o.z,s=axis==='x'?o.w:o.d;c.push(a+s-lo,a-hi,a-lo,a+s-hi);}
  let best=null,bd=0.12;for(const x of c){const dd=Math.abs(x-v);if(dd<bd){bd=dd;best=x;}}
  return best!==null?best:Math.round(v/0.05)*0.05;
}
function moveGroupTo(ctx,nx,nz){
  if(ctx.maxX-ctx.minX>T.L+EPS||ctx.maxZ-ctx.minZ>T.W+EPS)return;
  nx=clamp(nx,-ctx.minX,Math.max(-ctx.minX,T.L-ctx.maxX));
  nz=clamp(nz,-T.W/2-ctx.minZ,Math.max(-T.W/2-ctx.minZ,T.W/2-ctx.maxZ));
  for(const r of ctx.rel){r.it.loaded=true;r.it.x=nx+r.dx;r.it.z=nz+r.dz;r.it.dockLift=0;}
  settle(ctx.set);
  const others=items.filter(i=>i.loaded&&!ctx.set.has(i));
  let y=0;for(const r of ctx.rel)y=Math.max(y,restY(r.it.x,r.it.z,r.it.w,r.it.d,others)-r.dy);
  for(const r of ctx.rel)r.it.y=y+r.dy;
}

canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  setRay(e);
  const it=pickItem();
  if(it){
    if(orbit)orbit.enabled=false;
    drag=makeGroupCtx(it); drag.sx=e.clientX; drag.sy=e.clientY; drag.pid=e.pointerId;
    const p=floorHit();
    if(it.loaded&&p){const bx=p.x-rig.position.x+T.L/2;drag.ox=it.x-bx;drag.oz=it.z-p.z;}
    else{drag.ox=-it.w/2;drag.oz=-it.d/2;}
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  }else downEmpty={x:e.clientX,y:e.clientY};
});
canvas.addEventListener('pointermove',e=>{
  setRay(e);
  if(!drag){if(e.pointerType==='mouse')canvas.style.cursor=pickItem()?'grab':'';return;}
  if(!drag.moved){if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<5)return;drag.moved=true;selected=drag.it;canvas.style.cursor='grabbing';}
  const p=floorHit(); if(!p)return;
  const bx=p.x-rig.position.x+T.L/2, bz=p.z;
  const inside=bx>-0.4&&bx<T.L+0.35&&bz>-T.W/2-0.6&&bz<T.W/2+0.6;
  if(inside){
    let nx=snapAxis(drag,bx+drag.ox,'x'), nz=snapAxis(drag,bz+drag.oz,'z');
    moveGroupTo(drag,nx,nz);
  }else{
    for(const r of drag.rel){r.it.loaded=false;r.it.gx=p.x-drag.it.w/2+r.dx;r.it.gz=p.z-drag.it.d/2+r.dz;r.it.dockLift=r.dy;}
    settle(drag.set);
  }
  refresh();
});
function endDrag(e){
  if(drag){
    const d=drag; drag=null;
    if(orbit)orbit.enabled=true;
    canvas.style.cursor='';
    try{canvas.releasePointerCapture(d.pid);}catch(_){}
    if(!d.moved){selected=selected===d.it?null:d.it;refresh();return;}
    if(!d.it.loaded){d.grp.forEach(g=>{g.loaded=false;});layoutLane();}
    settle(); refresh();
    return;
  }
  if(downEmpty&&e&&Math.hypot(e.clientX-downEmpty.x,e.clientY-downEmpty.y)<5){selected=null;refresh();}
  downEmpty=null;
}
canvas.addEventListener('pointerup',endDrag);
canvas.addEventListener('pointercancel',endDrag);

orbit=new OrbitControls(camera,canvas);
orbit.enableDamping=true; orbit.dampingFactor=0.08;
orbit.maxPolarAngle=Math.PI*0.48; orbit.minDistance=4; orbit.maxDistance=70;
orbit.addEventListener('start',()=>{camTween=null;});

window.addEventListener('keydown',e=>{
  if(e.target.closest&&e.target.closest('input,textarea,select'))return;
  const k=e.key;
  if(k==='Escape'){selected=null;refresh();return;}
  if(!selected)return;
  if(k==='r'||k==='R'){rotateSel();e.preventDefault();}
  else if(k.startsWith('Arrow')&&selected.loaded){
    e.preventDefault();
    const ctx=makeGroupCtx(selected), st=0.05;
    const dx=k==='ArrowLeft'?-st:k==='ArrowRight'?st:0, dz=k==='ArrowUp'?-st:k==='ArrowDown'?st:0;
    moveGroupTo(ctx,selected.x+dx,selected.z+dz); settle(); refresh();
  }
});

/* ---------- Toolbar ---------- */
$('#heatBtn').onclick=e=>{heat=!heat;e.currentTarget.setAttribute('aria-pressed',heat);refresh();};
$('#autoBtn').onclick = () => { autoArrange(); publish(); };
$('#clearBtn').onclick = () => {
  for (const item of items) item.loaded = false;
  layoutLane();
  refresh();
  publish();
};
$('#hudToggle').onclick = event => {
  const hud = $('#hud');
  hud.classList.toggle('expanded');
  event.currentTarget.textContent = hud.classList.contains('expanded') ? 'Ocultar distribuição e alertas' : 'Ver distribuição e alertas';
};
$('#panelToggle').onclick = () => $('#panel').classList.toggle('open');

function publish() {
  if (!revision || drag) return;
  window.parent.postMessage({
    type: 'qualinutri:layout', revision,
    boxes: items.filter(item => item.loaded).map(({ key, x, y, z, w, d }) => ({ key, x, y, z, w, d })),
  }, origin);
}

window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== origin || event.data?.type !== 'qualinutri:manifest') return;
  const { vehicle, boxes, positions, id } = event.data;
  if (revision === id) return;
  revision = id;
  items.forEach(disposeItem);
  selected = null;
  T = truckView(vehicle);
  floorPlane.constant = -T.deck;
  buildTruck();
  buildDock();
  $('#vehBtnName').textContent = vehicle.nome;
  items = boxes.map(box => makeItem(box));
  const placed = new Map(positions.map(position => [position.key, position]));
  for (const item of items) {
    const position = placed.get(item.key);
    if (position) applySpot(item, position);
  }
  const list = $('#orders');
  list.replaceChildren();
  for (const group of groupBy(items, item => item.quoteId).values()) {
    const row = document.createElement('li');
    row.textContent = group[0].label + ' · ' + group.reduce((sum, item) => sum + item.bags, 0) + ' sacas';
    list.appendChild(row);
  }
  layoutLane();
  refresh();
  setView('3d', true);
  publish();
});

/* ---------- Loop ---------- */
const tag=$('#tag'), tmpV=new THREE.Vector3();
function updateTag(){
  const it=selected;
  if(!it||!it.mesh){tag.hidden=true;return;}
  it.mesh.getWorldPosition(tmpV); tmpV.y+=it.h;
  tmpV.project(camera);
  if(tmpV.z>1){tag.hidden=true;return;}
  const r=canvas.getBoundingClientRect();
  tag.hidden=false;
  tag.textContent=`${it.nome} · ${fmtKg(it.kg)}`;
  tag.style.left=(r.left+(tmpV.x+1)/2*r.width)+'px';
  tag.style.top=(r.top+(1-tmpV.y)/2*r.height)+'px';
}
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);
let previousFrame = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - previousFrame) / 1000);
  previousFrame = now;
  if(camTween){
    camTween.t=Math.min(1,camTween.t+dt/0.7); const k=camTween.t<.5?2*camTween.t*camTween.t:1-Math.pow(-2*camTween.t+2,2)/2;
    camera.position.lerpVectors(camTween.fp,camTween.tp,k); orbit.target.lerpVectors(camTween.ft,camTween.tt,k);
    if(camTween.t>=1)camTween=null;
  }
  orbit.update(); updateTag(); renderer.render(scene,camera);
}

/* ---------- Início ---------- */
buildTruck();
buildDock();
resize();
setView('3d', true);
window.parent.postMessage({ type: 'qualinutri:ready' }, origin);
requestAnimationFrame(loop);

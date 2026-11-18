import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type CharacterId = 'raccoon' | 'toucan' | 'capybara' | 'suri';
export const CHARACTERS = [
  {id:'raccoon', name:'Mapache', label:'EL EXPLORADOR', description:'Curioso por naturaleza. Siempre listo para el próximo cruce.', color:'#efb768'},
  {id:'toucan', name:'Tucán', label:'ESPÍRITU TROPICAL', description:'Un pico inconfundible y toda la energía de la selva.', color:'#ffb641'},
  {id:'capybara', name:'Capibara', label:'CALMA SALVAJE', description:'Paso tranquilo, mirada atenta. La aventura va a su ritmo.', color:'#e5bd91'},
  {id:'suri', name:'Suri', label:'MODO GAMER', description:'Auriculares puestos. Actitud de sobra. Listo para jugar.', color:'#b5ed46'},
] as const;
export function isCharacterId(value: unknown): value is CharacterId {return CHARACTERS.some(c=>c.id===value);}
export interface CharacterRig {root:T.Group; body:T.Group; head:T.Group; eyes:T.Group[]; limbs:T.Group[]; knees:T.Group[]; tail:T.Group; id:CharacterId; lastAnimationTime:number|null;}
const materials = new Map<number,T.MeshStandardMaterial>();
function mat(color:number){let m=materials.get(color); if(!m){m=new T.MeshStandardMaterial({color,roughness:.72,metalness:0});materials.set(color,m);}return m;}
const sphereGeo=new T.SphereGeometry(1,32,24);
function mesh(parent:T.Object3D,geo:T.BufferGeometry,color:number,x:number,y:number,z:number){const o=new T.Mesh(geo,mat(color));o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function ell(parent:T.Object3D,color:number,p:number[],s:number[]){const o=mesh(parent,sphereGeo,color,p[0],p[1],p[2]);o.scale.set(s[0],s[1],s[2]);return o;}
function box(parent:T.Object3D,color:number,p:number[],s:number[],r=.08){return mesh(parent,new RoundedBoxGeometry(s[0],s[1],s[2],3,r),color,p[0],p[1],p[2]);}
function group(parent:T.Object3D,x=0,y=0,z=0){const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;}
function line(parent:T.Object3D,color:number,points:number[][],r=.02){return mesh(parent,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p as [number,number,number]))),28,r,8,false),color,0,0,0);}
function eye(parent:T.Object3D,x:number,y:number,z:number,size:number,eyes:T.Group[],iris=0x3a2114){
 const g=group(parent,x,y,z);eyes.push(g);
 ell(g,0xfff5de,[0,0,0],[size,size*1.18,size*.5]);
 const dark=ell(g,iris,[.012,-.015,size*.40],[size*.77,size*.89,size*.35]);(dark.material as T.MeshStandardMaterial).roughness=.3;
 ell(g,0x101715,[.015,-.01,size*.62],[size*.53,size*.67,size*.15]);
 ell(g,0xffffff,[-size*.22,size*.39,size*.78],[size*.22,size*.23,size*.08]);
 ell(g,0xffffff,[size*.28,-size*.37,size*.75],[size*.09,size*.09,size*.05]);return g;
}
function foot(parent:T.Object3D,x:number,y:number,z:number,color:number,rig:CharacterRig,shoe=false){
 const g=group(parent,x,y,z);g.userData.motionRole='leg';g.userData.side=Math.sign(x);rig.limbs.push(g);
 ell(g,color,[0,-.08,0],[.18,.18,.2]);
 const knee=group(g,0,-.18,0);rig.knees.push(knee);knee.userData.side=Math.sign(x);
 ell(knee,color,[0,-.075,0],[.16,.16,.18]);
 if(shoe){box(knee,0xece9d3,[0,-.19,.13],[.44,.16,.65]);box(knee,0x20342a,[0,-.09,.1],[.4,.23,.6]);
 for(let i=0;i<3;i++)line(knee,0xe4e7d5,[[-.12,.01,.12+i*.09],[.12,.01,.12+i*.09]],.018);
 }else{ell(knee,color,[0,-.16,.12],[.23,.14,.32]);for(let i=-1;i<=1;i++)ell(knee,0x46392b,[i*.09,-.14,.38],[.027,.04,.055]);}return g;
}
function raccoon(r:CharacterRig){
 const b=r.body,h=r.head;
 ell(b,0x777a71,[0,1.05,0],[.61,.76,.47]);ell(b,0xcac6ad,[0,1.02,.39],[.4,.51,.13]);
 h.position.set(0,1.95,.05);ell(h,0x979c90,[0,0,0],[.78,.64,.55]);
 for(const s of [-1,1]){
 ell(h,0x4d544d,[s*.57,.47,-.05],[.26,.31,.19]);ell(h,0xc6c5b2,[s*.58,.49,.08],[.16,.21,.065]);ell(h,0x6c756b,[s*.59,.49,.10],[.09,.14,.03]);
 for(let i=0;i<3;i++){const tuft=ell(h,0xcacbb8,[s*(.56+i*.065),-.21+i*.09,.18],[.23,.11,.23]);tuft.rotation.z=s*(-.2+i*.22);}
 const mask=ell(h,0x282f2d,[s*.34,.01,.43],[.35,.23,.11]);mask.rotation.z=s*.15;
 eye(h,s*.29,.045,.532,.145,r.eyes,0x51432c);
 const brow=ell(h,0x596258,[s*.30,.29,.40],[.21,.065,.11]);brow.rotation.z=s*.13;
 ell(h,0xe3dcc2,[s*.15,-.21,.54],[.26,.2,.24]);
 const arm=group(b,s*.55,1.3,0);arm.userData.motionRole='arm';arm.userData.side=s;r.limbs.push(arm);const a=ell(arm,0x6e786e,[s*.07,-.22,.08],[.19,.38,.21]);a.rotation.z=s*.16;ell(arm,0x303932,[s*.11,-.47,.1],[.18,.15,.18]);
 }
 ell(h,0x252c27,[0,-.17,.77],[.14,.10,.1]);line(h,0x3d443b,[[0,-.24,.746],[0,-.31,.72],[-.1,-.34,.69]],.015);
 // Layered forehead fur and the characteristic dark bridge.
 ell(h,0x363f39,[0,.08,.51],[.105,.28,.07]);
 for(let i=-1;i<=1;i++)ell(h,0xaeb2a2,[i*.09,.53,.07],[.10,.17,.2]);
 foot(b,-.29,.47,0,0x39413a,r);foot(b,.29,.47,0,0x39413a,r);
 // Continuous striped tail: each ring follows the same curved centerline.
 r.tail.position.set(.2,.7,-.32);
 const curve=new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(.53,.08,-.35),new T.Vector3(.94,.37,-.6),new T.Vector3(1.05,.8,-.61),new T.Vector3(.94,1.1,-.48)]);
 for(let i=0;i<9;i++){
 const pts=[];for(let j=0;j<=8;j++)pts.push(curve.getPoint((i+j/8)/9));
 mesh(r.tail,new T.TubeGeometry(new T.CatmullRomCurve3(pts),12,.22*(1-i*.045),12,false),i%2?0x333d34:0x8f9486,0,0,0);
 }ell(r.tail,0x3b453a,[.94,1.1,-.48],[.13,.15,.13]);
 // Small adventure scarf.
 const scarf=mesh(b,new T.TorusGeometry(.42,.1,10,36),0xc76a36,0,1.54,.02);scarf.rotation.x=Math.PI/2;
 box(b,0xe28742,[.22,1.27,.46],[.18,.43,.09],.04).rotation.z=-.2;
}
function toucan(r:CharacterRig){
 const b=r.body,h=r.head;
 ell(b,0x172e36,[0,1.05,-.04],[.56,.73,.51]);ell(b,0xfff0bc,[0,1.35,.39],[.40,.50,.15]);ell(b,0xf4a42c,[0,.83,.40],[.25,.18,.12]);
 h.position.set(0,1.94,0);ell(h,0x172c31,[0,0,0],[.53,.53,.51]);
 for(const s of [-1,1]){
 ell(h,0x39acac,[s*.38,.075,.31],[.17,.19,.14]);eye(h,s*.34,.10,.42,.096,r.eyes,0x314635);
 const w=group(b,s*.46,1.37,-.05);w.userData.motionRole='wing';w.userData.side=s;r.limbs.push(w);ell(w,0x203c44,[s*.04,-.25,0],[.19,.50,.32]).rotation.z=s*.14;
 for(let i=0;i<3;i++){const f=ell(w,0x29474d,[s*.10,-.35-i*.085,-.13+i*.12],[.09,.26,.1]);f.rotation.x=-.23;}
 const leg=group(b,s*.23,.42,0);leg.userData.motionRole='leg';leg.userData.side=s;r.limbs.push(leg);ell(leg,0x738995,[0,-.065,0],[.07,.12,.075]);
 const knee=group(leg,0,-.14,0);r.knees.push(knee);knee.userData.side=s;ell(knee,0x738995,[0,-.07,0],[.065,.11,.07]);
 for(let i=-1;i<=1;i++)line(knee,0x78939c,[[0,-.15,0],[i*.11,-.17,.19],[i*.15,-.16,.29]],.045);
 }
 // Sculpted bill with tapered sections, flat mouth edge, warm upper surface.
 const positions:number[]=[],colors:number[]=[],indices:number[]=[];
 const sections=[[.34,.31,.03,.22],[.58,.40,.08,.36],[.96,.35,.09,.33],[1.30,.24,.035,.23],[1.52,.05,-.02,.07],[1.55,.003,-.035,.001]];
 for(let i=0;i<sections.length;i++){const [z,w,y,hh]=sections[i];for(let j=0;j<24;j++){
 const a=j/24*Math.PI*2;positions.push(Math.cos(a)*w,y+Math.sin(a)*hh,z);
 const c=new T.Color(i>=4?0x2b3022:(Math.sin(a)<-.1?0xe37d19:(i<2?0xffd545:0xf9ad1d)));colors.push(c.r,c.g,c.b);
 if(i<sections.length-1){const n=i*24+j,nn=i*24+(j+1)%24;indices.push(n,nn,n+24,nn,nn+24,n+24);}
 }}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
 const bill=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.42}));bill.castShadow=true;h.add(bill);
 line(h,0x6d4520,[[0,-.12,1.54],[-.23,-.14,1.20],[-.34,-.17,.78],[-.3,-.13,.4]],.012);
 ell(h,0x47412a,[-.205,.15,.63],[.028,.024,.012]);ell(h,0x47412a,[.205,.15,.63],[.028,.024,.012]);
 r.tail.position.set(0,.70,-.38);for(let i=-1;i<=1;i++){const f=ell(r.tail,0x1a303a,[i*.14,-.04,-.42],[.13,.13,.53]);f.rotation.x=-.2;ell(r.tail,0xddd9be,[i*.14,-.13,-.81],[.11,.08,.13]);}
}
function capybara(r:CharacterRig){
 const b=r.body,h=r.head;
 ell(b,0x9f7044,[0,.95,-.11],[.70,.64,.91]);ell(b,0xb78554,[0,1.05,.30],[.62,.61,.6]);
 h.position.set(0,1.57,.48);box(h,0xb98958,[0,0,.09],[1.08,.84,1.05],.30);
 box(h,0xc69965,[0,-.16,.52],[1.02,.56,.68],.23);
 for(const s of [-1,1]){
 ell(h,0x96663e,[s*.40,.4,-.17],[.18,.21,.15]);ell(h,0xc69b75,[s*.405,.41,-.035],[.105,.13,.035]);
 eye(h,s*.435,.105,.415,.092,r.eyes,0x291f13);ell(h,0xa27042,[s*.44,.22,.34],[.13,.07,.1]);
 ell(h,0x725035,[s*.27,-.045,.848],[.065,.042,.02]);
 line(h,0x835938,[[s*.39,-.31,.72],[s*.20,-.33,.84],[0,-.33,.85]],.013);
 for(let i=0;i<3;i++)ell(h,0x987045,[s*(.26+i*.07),-.16-(i%2)*.065,.84-i*.02],[.013,.014,.008]);
 for(const z of [-.65,.51]){
 const leg=group(b,s*.49,.6,z);leg.userData.motionRole='leg';leg.userData.side=s;r.limbs.push(leg);
 ell(leg,0x9c6c41,[0,-.10,0],[.21,.22,.23]);
 const knee=group(leg,0,-.23,0);r.knees.push(knee);knee.userData.side=s;knee.userData.front=z>0;
 ell(knee,0x9c6c41,[0,-.075,0],[.19,.17,.21]);ell(knee,0x8d5e3a,[0,-.22,.10],[.24,.12,.32]);
 for(let i=-1;i<=1;i++)line(knee,0x62492e,[[i*.10,-.21,.31],[i*.10,-.24,.39]],.017);
 }
 }
 // Short layered fur along the nape.
 for(let i=0;i<7;i++){const tuft=ell(b,i%2?0xae7b49:0xa67345,[(i-3)*.09,1.51,-.2],[.055,.10,.17]);tuft.rotation.x=-.3;}
}
function suri(r:CharacterRig){
 const b=r.body,h=r.head,green=0x91cf12,dark=0x253c30;
 ell(b,dark,[0,1.03,0],[.55,.67,.4]);box(b,0x2d4734,[0,1.04,.17],[.94,1.02,.48],.19);
 // Hood behind the head.
 ell(b,0x1f352b,[0,1.7,-.20],[.59,.43,.36]);
 const collar=mesh(b,new T.TorusGeometry(.35,.09,10,32),0x41513a,0,1.55,.07);collar.rotation.x=Math.PI/2;
 h.position.set(0,2.04,.05);ell(h,green,[0,0,0],[.68,.59,.54]);ell(h,0x9edb1e,[0,-.17,.31],[.60,.38,.42]);
 // The tall chameleon crest from the supplied reference.
 const crest=ell(h,0x79b212,[0,.46,-.21],[.24,.44,.3]);crest.rotation.x=-.25;
 for(let i=0;i<8;i++){
 const a=i*.69;ell(h,0x659c11,[Math.sin(a)*.15,.43+Math.cos(a)*.26,-.005-Math.sin(a)*.025],[.06,.07,.024]);
 }
 for(const s of [-1,1]){
 ell(h,0x74b40b,[s*.42,.045,.35],[.27,.30,.20]);eye(h,s*.36,.015,.53,.195,r.eyes,0x303a17);
 const brow=ell(h,0x416d14,[s*.36,.28,.51],[.26,.065,.07]);brow.rotation.z=s*.26;
 ell(h,0x58880c,[s*.20,-.18,.691],[.025,.04,.015]);
 for(let i=0;i<3;i++)ell(h,0x7eb30c,[s*(.49-i*.06),-.28-i*.07,.51+i*.04],[.021,.025,.012]);
 const arm=group(b,s*.49,1.33,.01);arm.userData.motionRole='arm';arm.userData.side=s;r.limbs.push(arm);ell(arm,0x304a36,[s*.09,-.22,.03],[.19,.34,.2]).rotation.z=s*.2;
 box(arm,0x1c3127,[s*.11,-.43,.1],[.3,.13,.32],.04);ell(arm,green,[s*.11,-.48,.16],[.15,.15,.16]);
 for(let f=0;f<3;f++)ell(arm,0x97d81c,[s*(.04+f*.065),-.49,.27],[.048,.085,.055]);
 foot(b,s*.27,.49,0,0x24402e,r,true);
 // Cushioned headphones, with an inset lime ring.
 ell(h,0x172e25,[s*.66,.06,-.05],[.14,.31,.28]);ell(h,0x4e653f,[s*.76,.06,-.05],[.07,.25,.23]);ell(h,0x85b823,[s*.81,.06,-.05],[.032,.18,.16]);
 }
 line(h,0x455e40,[[-.65,.16,-.12],[-.53,.51,-.2],[0,.65,-.24],[.53,.51,-.2],[.65,.16,-.12]],.07);
 line(h,0x425323,[[.7,-.08,.01],[.70,-.25,.30],[.42,-.31,.55]],.032);ell(h,0xd9b967,[.39,-.31,.56],[.085,.044,.045]);
 line(h,0x47700d,[[-.31,-.33,.613],[0,-.395,.677],[.28,-.31,.644]],.018);
 // Zipper, ribbed hem, drawstrings and two stitched pockets.
 box(b,0x9da685,[0,1.02,.421],[.026,.85,.028],.01);box(b,0xc8d1a7,[.03,1.35,.44],[.064,.094,.03],.01);
 for(const s of [-1,1]){
 line(b,0x889777,[[s*.19,1.52,.30],[s*.20,1.30,.44],[s*.19,1.16,.444]],.018);
 box(b,0x203728,[s*.26,.85,.415],[.32,.25,.045],.055);
 line(b,0x60764b,[[s*.40,.91,.445],[s*.17,.94,.45]],.012);
 }
 for(let i=-4;i<=4;i++)box(b,0x45583e,[i*.09,.60,.39],[.018,.12,.02],.007);
 // Small original angular chest badge.
 line(b,0xb8e677,[[.20,1.27,.44],[.30,1.38,.445],[.39,1.34,.43],[.29,1.21,.444]],.021);
 r.tail.position.set(.17,.8,-.25);
 const pts=[[0,0,0],[.55,-.09,-.42],[1,.15,-.6],[1.17,.64,-.6],[1.08,1.0,-.59],[.78,1.12,-.59],[.58,.91,-.59],[.62,.71,-.59],[.79,.67,-.59]];
 const curve=new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p as [number,number,number])));
 for(let i=0;i<20;i++){const a=curve.getPoint(i/20),c=curve.getPoint((i+1)/20);const sg=new T.CatmullRomCurve3([a,curve.getPoint((i+.5)/20),c]);mesh(r.tail,new T.TubeGeometry(sg,5,.19*(1-i*.034),12,false),i<13?0x80bd0b:0x94d719,0,0,0);}
 for(let i=2;i<14;i+=2){const p=curve.getPoint(i/20);ell(r.tail,0x5e9b0a,[p.x,p.y,p.z+.16],[.06,.09,.017]);}
}
export function createCharacter(id:CharacterId):CharacterRig{
 const root=new T.Group(),body=group(root),head=group(body),tail=group(body);
 const rig:CharacterRig={root,body,head,tail,eyes:[],limbs:[],knees:[],id,lastAnimationTime:null};
 ({raccoon,toucan,capybara,suri})[id](rig);return rig;
}
// The hop keeps its original travel time and distance; only its visible pose changes.
export interface CharacterMotion { stepProgress?: number | null; }
export function hopLift(progress:number):number {
 const p=T.MathUtils.clamp(progress,0,1);
 // Flat velocity at both ends avoids a hard take-off or impact.
 return Math.sin(p*Math.PI)**2;
}
export function resetCharacterPose(r:CharacterRig):void {
 r.lastAnimationTime=null;
 r.body.position.y=0;r.body.scale.set(1,1,1);r.body.rotation.set(0,0,0);
 r.head.rotation.set(0,0,0);r.tail.rotation.set(0,0,0);
 r.limbs.forEach(limb=>limb.rotation.set(0,0,0));r.knees.forEach(knee=>knee.rotation.set(0,0,0));r.eyes.forEach(eye=>eye.scale.y=1);
}
export function animateCharacter(r:CharacterRig,time:number,motion:CharacterMotion={}) {
 const t=time*.001;
 const dt=r.lastAnimationTime===null?1/60:T.MathUtils.clamp((time-r.lastAnimationTime)*.001,0,.05);
 r.lastAnimationTime=time;
 const blend=1-Math.exp(-(motion.stepProgress!=null?48:15)*dt),follow=1-Math.exp(-24*dt);
 const approach=(current:number,target:number,alpha=blend)=>T.MathUtils.lerp(current,target,alpha);
 const moving=motion.stepProgress!=null;
 const p=T.MathUtils.clamp(motion.stepProgress??0,0,1);
 const lift=moving?hopLift(p):0;
 const pulse=(start:number,end:number)=>p>start&&p<end?Math.sin((p-start)/(end-start)*Math.PI)**2:0;
 const preparation=moving?pulse(0,.34):0;
 const landing=moving?pulse(.68,1):0;
 const stride=moving?Math.sin(p*Math.PI*2)*Math.sin(p*Math.PI):0;
 const weight=r.id==='capybara'?.85:1;
 const crouch=Math.max(preparation,landing);
 const tuck=moving?pulse(.20,.84):0;
 const stretch=(.045*lift-.115*preparation-.14*landing)*weight;
 const height=1+stretch;
 r.body.scale.y=approach(r.body.scale.y,height);
 // Keep the volume balanced so this reads as weight, not a rubber toy.
 const width=1/Math.sqrt(height);
 r.body.scale.x=approach(r.body.scale.x,width);r.body.scale.z=approach(r.body.scale.z,width);
 r.body.position.y=approach(r.body.position.y,Math.sin(t*2.2)*.012-crouch*.07*weight);
 r.body.rotation.x=approach(r.body.rotation.x,(lift*.14-stride*.11)*weight);
 r.body.rotation.z=approach(r.body.rotation.z,stride*.055*weight);
 r.head.rotation.x=approach(r.head.rotation.x,-lift*.11+landing*.12,follow);
 r.head.rotation.z=approach(r.head.rotation.z,Math.sin(t*.85)*.018-stride*.035,follow);
 r.head.rotation.y=approach(r.head.rotation.y,Math.sin(t*.55)*.04,follow);
 const blink=t%4.7;const open=blink<.16?Math.max(.08,Math.abs(blink-.08)/.08):1;
 r.eyes.forEach(eye=>eye.scale.y=open);
 r.tail.rotation.y=approach(r.tail.rotation.y,Math.sin(t*1.8)*.09-stride*.24,follow);
 r.tail.rotation.x=approach(r.tail.rotation.x,-lift*.21+landing*.16,follow);
 r.limbs.forEach(limb=>{
  const side=limb.userData.side??1,role=limb.userData.motionRole;
  const idle=Math.sin(t*1.7+side)*.014;
  let swing=0,spread=0;
  if(role==='wing'){
   swing=-lift*.28+stride*side*.30;spread=side*lift*.62;
  }else if(role==='arm'){
   swing=-stride*side*.68-lift*.23;spread=side*lift*.13;
  }else{
   // Capybara uses diagonal pairs; the two-legged characters tuck their feet slightly.
   const pair=r.id==='capybara'?side*(limb.position.z>0?1:-1):side;
   swing=stride*pair*.60*weight-tuck*.42-crouch*.22;
  }
  limb.rotation.x=approach(limb.rotation.x,idle+swing);
  limb.rotation.z=approach(limb.rotation.z,spread);
 });
 // A separate lower-leg pivot folds the knees instead of swinging a solid leg.
 r.knees.forEach(knee=>{
  const front=knee.userData.front===false?.85:1;
  const bend=(crouch*.66+tuck*.95)*front;
  knee.rotation.x=approach(knee.rotation.x,bend);
 });
}
export function disposeCharacter(r:CharacterRig){r.root.traverse(o=>{if(o instanceof T.Mesh&&o.geometry!==sphereGeo)o.geometry.dispose();});}

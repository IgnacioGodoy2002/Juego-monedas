const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict');
const base='../node_modules/phaser/src/physics/matter-js/lib/';
const Bodies=require(base+'factory/Bodies'),Body=require(base+'body/Body'),Composite=require(base+'body/Composite'),Engine=require(base+'core/Engine');
function load(file,dependencies={},globals={}){const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(js,{exports:m.exports,module:m,require:n=>dependencies[n]||{},console,Math,Date,Map,Set,...globals});return m.exports;}
const geometry=load('src/gameobjects/PairGeometry.ts');
const componentPath=require.resolve('phaser/src/gameobjects/components');
require.cache[componentPath]={exports:{AlphaSingle:require('phaser/src/gameobjects/components/AlphaSingle'),Visible:require('phaser/src/gameobjects/components/Visible')}};
const BaseCamera=require('phaser/src/cameras/2d/BaseCamera');
const board={PLAY_AREA_WIDTH:720,PLAY_AREA_HEIGHT:800,PLAY_AREA_TOP_OFFSET:542,CANVAS_WIDTH:720,CANVAS_HEIGHT:1412,HEADER_HEIGHT:90,LAUNCHER_HEIGHT:220};
let engine;
class Fruit{
 constructor(world,x,y,tier){this.fruitType=tier;this.active=true;this.lifetime=0;this.body=Bodies.circle(x,y,[29,38,46,57][tier]||29);this.body.gameObject=this;Composite.add(engine.world,this.body)}
 get x(){return this.body.position.x}get y(){return this.body.position.y}
 setPosition(x,y){Body.setPosition(this.body,{x,y});return this}setStatic(v){Body.setStatic(this.body,v);return this}setSensor(v){this.body.isSensor=v;return this}setIgnoreGravity(v){this.ignoreGravity=v;return this}setVelocityY(y){Body.setVelocity(this.body,{x:0,y});return this}
}
let safeAreaTop=0;
const tiers={Chispa:0,Destello:1,Fragmento:2,Nucleo:3,Supernova:11};
const Main=load('src/scenes/MainScene.ts',{'../util/SafeArea':{getSafeAreaInsetTop:()=>safeAreaTop},'../gameobjects/PairGeometry':geometry,'../config/boardLayout':board,'../gameobjects/Fruit':{Fruit,OrbTier:tiers,COIN_TIER_FILES:['a','b','c','d']}},{Phaser:{Scene:class{}}}).MainScene;
function round(){engine=Engine.create();const s=new Main(),children=[],timers=[];s.matter={world:engine.world};s.add={graphics:()=>({})};s.fruits={add:c=>children.push(c),getChildren:()=>children};s.scene={isActive:()=>true};s.gameManager={isGameOver:()=>false};s.registry={get:()=>0};s.events={emit:()=>{}};s.time={delayedCall:(ms,cb)=>{const t={ms,cb};timers.push(t);return t}};s.previewFruit=0;s.previewMate=1;s.highestFruit=0;s.pickNextTier=()=>0;s.spawnActiveFruit();return {s,children,timers};}
// Real MainScene methods: wall kicks, quarter-turn order, and drop against a stack.
for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
 const {s,children,timers}=round();s.pairAngle=angle;s.movePairTo(-1000);assert(s.validPair(s.pairX,s.pairY,s.pairAngle));s.movePairTo(2000);assert(s.validPair(s.pairX,s.pairY,s.pairAngle));s.rotatePair();assert(s.validPair(s.pairX,s.pairY,s.pairAngle));s.fallPair(1200);assert.equal(s.activeFruit,null);assert.equal(s.pairMate,null);assert.equal(timers.length,1);assert.equal(timers[0].ms,190);for(const c of children){assert.equal(c.body.isStatic,false);assert.equal(c.body.isSensor,false);assert(c.y+c.body.circleRadius<=1342.01)}
 const floor=Bodies.rectangle(360,1358,720,32,{isStatic:true});Composite.add(engine.world,[floor,Bodies.rectangle(-16,900,32,1400,{isStatic:true}),Bodies.rectangle(736,900,32,1400,{isStatic:true})]);for(let i=0;i<180;i++)Engine.update(engine,1000/60);for(const c of children){assert(Number.isFinite(c.x));assert(c.y<1360)}
 timers[0].cb();assert.equal(children.length,4);assert(s.activeFruit&&s.pairMate);assert.notEqual(s.previewFruit,s.previewMate);
}
{
 const {s,children}=round();const obstacle=new Fruit(engine.world,360,1050,3);obstacle.setStatic(true);children.push(obstacle);s.movePairTo(360);s.fallPair(1200);assert(children[0].y<1050);assert(children[1].y<1050);for(const c of children.slice(0,2))assert(Math.hypot(c.x-obstacle.x,c.y-obstacle.y)>=c.body.circleRadius+obstacle.body.circleRadius-1);
}
// Stationary mouse/touch must not steer or recenter any new pair.
{
 const {s,timers}=round();s.scale={height:900};s.registry={get:()=>1};s.cameras={main:{getWorldPoint:(x,y)=>({x,y})}};
 s.movePairTo(360);const pointer={x:360,y:500,isDown:true};let start=s.pairX;
 s.updateActiveFruitFromPointer(pointer);for(let i=0;i<60;i++)s.updateActiveFruitFromPointer(pointer);assert.equal(s.pairX,start);
 pointer.x+=20;s.updateActiveFruitFromPointer(pointer);assert(Math.abs(s.pairX-start-20)<.001);
 s.fallPair(1200);timers[0].cb();start=s.pairX;for(let i=0;i<60;i++)s.updateActiveFruitFromPointer(pointer);assert.equal(s.pairX,start);
}
// Falling speed stays fixed even with a high score or old acceleration keys.
{
 const {s}=round();let score=0;const distances=[];
 s.elapsedTime=0;s.fruits.children={entries:[]};s.keys=new Map([['PAIR_FAST',{isDown:true}],['PAIR_DROP',{isDown:true}]]);
 s.input={activePointer:{isDown:false},keyboard:{checkDown:()=>false}};s.scale={width:720,height:900};s.cameras={main:{zoom:1,width:720,height:900,scrollX:0,scrollY:0}};s.registry={get:key=>key==='score'?score:1};s.fallPair=d=>distances.push(d);
 s.update(0,16);score=9000;s.update(16,16);assert.equal(distances.length,2);assert(Math.abs(distances[0]-6.72)<.001);assert.equal(distances[0],distances[1]);
}
// Random entry spans the usable width and never overlaps a side wall.
for(const width of [520,720,860]){
 let previous=null;const samples=[];let seed=789;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<300;i++){const x=geometry.randomPairSpawnX(width,[29,57],previous,random);assert(geometry.fitsPair(geometry.pairCircles(x,500,0,[29,57]),[],width,1342));if(previous!==null)assert(Math.abs(previous-x)>20);samples.push(x);previous=x;}
 assert(Math.min(...samples)<width*.35&&Math.max(...samples)>width*.65);
 const a=geometry.randomPairSpawnX(width,[29,57],null,()=>.5),b=geometry.randomPairSpawnX(width,[29,57],a,()=>.5);assert.notEqual(a,b);
}

// Widths, aspect ratios, and DPRs keep the full jar in the visible canvas.
for(const [w,h] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[1440,900],[1920,1080]]){
 const cssWidth=w>=900?Math.min(w*.65,720):Math.min(w,720),cssHeight=h-78;
 const worldWidth=Math.round(Math.max(520,Math.min(860,Math.min(w,720)/Math.max(360,h-78)*1362)));
 for(const safeTop of [0,24,44])for(const dpr of [1,2]){
  safeAreaTop=safeTop;
  board.PLAY_AREA_WIDTH=board.CANVAS_WIDTH=worldWidth;
  const s=new Main();s.scale={width:cssWidth,height:cssHeight};s.registry={get:()=>dpr};
  const cam=new BaseCamera(0,0,cssWidth*dpr,cssHeight*dpr);
  s.cameras={main:cam};s.updateCameraFit();
  // Actual Phaser transform: zoom has a centered origin, not a top-left one.
  cam.matrix.applyITRS(cam.width/2,cam.height/2,0,cam.zoom,cam.zoom);
  cam.matrix.translate(-cam.width/2,-cam.height/2);
  const project=(x,y)=>cam.matrix.transformPoint(x-cam.scrollX,y-cam.scrollY);
  const left=project(0,310).x/dpr,right=project(worldWidth,310).x/dpr,bottom=project(worldWidth/2,1412).y/dpr;
  assert(left>=-0.01&&right<=cssWidth+.01);assert(bottom<=cssHeight+.01);
  const rim=project(worldWidth/2,310).y/dpr,head=project(worldWidth/2,105).y/dpr;
  assert(head>=80+safeTop);assert(rim<cssHeight*.45,'Jar starts too low');
  const worldPoint=cam.getWorldPoint(project(200,900).x,project(200,900).y);
  assert(Math.abs(worldPoint.x-200)<.001&&Math.abs(worldPoint.y-900)<.001,'Pointer mapping drift');

 }

 for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2])for(const x of [-9999,0,worldWidth/2,9999]){const cx=geometry.clampPairX(x,angle,[29,57],worldWidth);assert(geometry.fitsPair(geometry.pairCircles(cx,500,angle,[29,57]),[],worldWidth,1342));}
}
console.log('PASS: randomized spawns, stationary-pointer protection, pair movement/rotation, wall limits, automatic landing, stack collision, Matter release, next-pair scheduling, and real Phaser camera framing/pointer mapping at 7 viewport sizes (DPR 1/2, safe areas 0/24/44).');

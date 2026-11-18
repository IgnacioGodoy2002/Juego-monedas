export type Circle = {x:number;y:number;r:number};
export function pairCircles(x:number,y:number,angle:number,radii:number[]):Circle[]{
 const distance=radii[0]+radii[1]+5;return radii.map((r,i)=>({x:x+Math.cos(angle)*distance*(i?0.5:-0.5),y:y+Math.sin(angle)*distance*(i?0.5:-0.5),r}));
}
export function clampPairX(x:number,angle:number,radii:number[],width:number):number {
 const shape=pairCircles(0,0,angle,radii);const left=Math.min(...shape.map(c=>c.x-c.r)),right=Math.max(...shape.map(c=>c.x+c.r));return Math.max(4-left,Math.min(width-4-right,x));
}
export function fitsPair(circles:Circle[],obstacles:Circle[],width:number,floor:number):boolean {
 return circles.every(c=>c.x-c.r>=0&&c.x+c.r<=width&&c.y+c.r<=floor&&obstacles.every(o=>Math.hypot(c.x-o.x,c.y-o.y)>=c.r+o.r-1));
}

// Random entry with enough room for both coins. Avoid consecutive launches
// in the same neighborhood so an idle pointer cannot hold a fixed column.
export function randomPairSpawnX(width:number,radii:number[],previous:number|null,random:()=>number=Math.random):number {
 const inset=width*.1;
 const min=clampPairX(-1e6,0,radii,width)+inset,max=clampPairX(1e6,0,radii,width)-inset,range=max-min;
 let x=min+random()*range;
 for(let attempt=0;previous!==null&&Math.abs(x-previous)<range*.16&&attempt<8;attempt++)x=min+random()*range;
 if(previous!==null&&Math.abs(x-previous)<range*.16)x=Math.abs(previous-min)>Math.abs(previous-max)?min:max;
 return x;
}

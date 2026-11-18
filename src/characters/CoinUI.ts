import {CharacterStage, CHARACTERS, CharacterId} from './CharacterStage';
import {selectedCharacter, saveCharacter} from './CharacterStage';
const portraitCache:Record<string,string>={};
const characterName=(id:CharacterId)=>CHARACTERS.find(c=>c.id===id)!.name;
const characterFallback=(id:CharacterId)=>`<span class="coin-character-fallback">${characterName(id)}</span>`;
export function characterMenu(play:()=>void, ranking:()=>void):()=>void {
 const root=document.createElement('section');root.className='coin-menu';root.setAttribute('aria-label','Elegí tu personaje');
 root.innerHTML=`<div class="coin-menu-shell"><span class="coin-eyebrow">MODO PAREJAS</span><h1>COIN <strong>KINGDOM</strong></h1><p class="coin-subtitle">Dos monedas. Una buena jugada.</p><div class="coin-showcase"><div class="coin-stage"></div><b class="coin-character-name"></b></div><div class="coin-character-cards"></div><button class="coin-play">Jugar ▶</button><p class="coin-rule">Mové la pareja, girala y uní monedas iguales.<br>Seguí sumando hasta que se llene el frasco.</p><div class="coin-menu-actions"><button class="coin-help">Cómo jugar</button><button class="coin-ranking">Ranking</button></div></div>`;
 document.querySelector('.game-wrapper')!.appendChild(root);
 let stage:CharacterStage|null=null;try{stage=new CharacterStage(root.querySelector('.coin-stage')!,selectedCharacter())}catch{root.querySelector('.coin-stage')!.innerHTML=characterFallback(selectedCharacter())}
 if(stage){Object.assign(portraitCache,stage.thumbnails())}
 const cards=root.querySelector('.coin-character-cards')!;
 for(const c of [...CHARACTERS].sort((a,b)=>['raccoon','capybara','toucan','suri'].indexOf(a.id)-['raccoon','capybara','toucan','suri'].indexOf(b.id))){const b=document.createElement('button');b.dataset.character=c.id;b.innerHTML=`<span class="coin-card-portrait">${portraitCache[c.id]?`<img src="${portraitCache[c.id]}" alt="">`:`<b>${c.name[0]}</b>`}</span><span>${c.name}</span>`;b.onclick=()=>select(c.id);cards.appendChild(b)}
 function select(id:CharacterId){saveCharacter(id);stage?.select(id);if(!stage)root.querySelector('.coin-stage')!.innerHTML=characterFallback(id);root.querySelector('.coin-character-name')!.textContent=CHARACTERS.find(c=>c.id===id)!.name;cards.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.character===id)))}
 select(selectedCharacter());(root.querySelector('.coin-play') as HTMLButtonElement).onclick=play;(root.querySelector('.coin-ranking') as HTMLButtonElement).onclick=ranking;
 (root.querySelector('.coin-help') as HTMLButtonElement).onclick=()=>{const d=document.createElement('div');d.className='coin-help-dialog';d.innerHTML='<div><h2>Una pareja por turno</h2><p>Cada pareja aparece en un lugar aleatorio y cae a velocidad fija. Mové la pareja a los lados y girala para decidir dónde queda cada moneda.</p><p><b>Celular:</b> arrastrá hacia los lados en el frasco. Tocá ↻ para girar.</p><p><b>Teclado:</b> ← → o A / D para mover, ↑ o R para girar.</p><p>Iguales se fusionan y dan puntos. Tres monedas GG juntas explotan y liberan espacio: la partida puede seguir sin un nivel final.</p><button>¡Entendido!</button></div>';root.appendChild(d);(d.querySelector('button') as HTMLButtonElement).onclick=()=>d.remove()};
 return()=>{stage?.destroy();root.remove()};
}
export class CoinGameUI {
 private root:HTMLElement;private stage:CharacterStage|null=null;private host:HTMLElement;
 constructor(rotate:()=>void){
  this.root=document.createElement('div');this.root.className='coin-game-ui';
  this.root.innerHTML=`<div class="coin-launcher"></div><div class="coin-next"><small>SIGUIENTE PAREJA</small><div></div></div><div class="coin-controls"><button data-action="rotate" aria-label="Girar pareja">↻<small>Girar</small></button></div>`;
  document.querySelector('.game-wrapper')!.appendChild(this.root);this.host=this.root.querySelector('.coin-launcher')!;
  try{this.stage=new CharacterStage(this.host,selectedCharacter(),true)}catch{this.host.innerHTML=characterFallback(selectedCharacter())}
  this.root.querySelector('button')!.addEventListener('pointerdown',e=>{e.preventDefault();rotate()});
 }
 preview(files:string[]){this.root.querySelector('.coin-next div')!.innerHTML=files.map(f=>`<img src="assets/coins/${f}" alt="Próxima moneda">`).join('')}
 position(x:number,y:number,scale:number){const w=250*scale,h=250*scale;this.host.style.cssText=`left:${x-w/2}px;top:${y-h/2}px;width:${w}px;height:${h}px`}
 aim(value:number){this.stage?.setAim(value)}
 toss(){this.stage?.shoot();this.host.animate([{transform:'translateY(0)'},{transform:'translateY(-7px)'},{transform:'translateY(0)'}],{duration:300})}
 setEnabled(enabled:boolean){this.root.querySelectorAll('button').forEach(b=>b.disabled=!enabled);this.root.classList.toggle('is-paused',!enabled)}
 destroy(){this.stage?.destroy();this.root.remove()}
}

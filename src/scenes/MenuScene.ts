import { characterMenu } from '../characters/CoinUI';
import { loadBgm, getOrCreateBgm, playBgmIfNeeded } from '../managers/Bgm';

// The character menu is the only menu. No legacy canvas buttons or jar
// are constructed behind it, including on resize or return from a game.
export class MenuScene extends Phaser.Scene {
    constructor() { super({ key: 'MenuScene' }); }
    preload(): void { loadBgm(this); }
    create(): void {
        const bgm=getOrCreateBgm(this);
        document.body.dataset.coinScreen='menu';
        const dispose=characterMenu(
            ()=>{playBgmIfNeeded(bgm);this.scene.start('MainScene')},
            ()=>this.scene.start('RankingScene')
        );
        this.events.once('shutdown',()=>{dispose();delete document.body.dataset.coinScreen;});
    }
}

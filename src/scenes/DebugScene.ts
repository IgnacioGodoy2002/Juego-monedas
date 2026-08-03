export class DebugScene extends Phaser.Scene {
    private isVisible: boolean;
    private debugTextGroup: Phaser.GameObjects.Group;
    private debugTexts: {};
    private y: number;
    private back: Phaser.GameObjects.Graphics;
    private debugControlsText: Phaser.GameObjects.Text;
    private debugControlsTextBack: Phaser.GameObjects.Graphics;

    private lastControlsInfoVisibility: boolean;
    private lastOutlinesVisibility: boolean;

    constructor() {
        super({
            key: 'DebugScene',
        });
    }

    create(): void {
        var mainScene: Phaser.Scene = this.scene.get('MainScene');
        this.debugTexts = {};
        this.y = 100;
        this.back = this.add.graphics();
        this.back.fillStyle(0x000000, 0.5);
        this.back.fillRect(0, 100, (game.config.width as number) / 1.5, 100);
        this.debugTextGroup = this.add.group();
        const instructionsText = new Phaser.GameObjects.Text(
            this,
            0,
            this.y,
            '',
            {}
        );
        instructionsText.setText('Presioná Q para ver los controles');
        this.y += 32;
        this.debugTextGroup.add(instructionsText, true);
        this.addKey('highscore');
        this.addKey('xspeed');
        this.addKey('yspeed');
        this.addKey('x');
        this.addKey('y');
        this.addKey('moveLeftHeld');
        this.addKey('moveRightHeld');
        this.addKey('heldDelta');
        this.addKey('mergeDisabled');
        this.addKey('heldNextFruit');
        const controls = [
            'R - Elimina todos los orbes de la escena',
            'F - Cambia el próximo orbe',
            'G - Congela el próximo orbe',
            'M - Activa/desactiva la fusión',
            'D - Activa/desactiva la vista de debug',
            'Q - Activa/desactiva esta lista',
            'W - Activa/desactiva los contornos',
            'E - Activa/desactiva el HUD',
        ];
        this.debugControlsTextBack = this.add.graphics();
        this.debugControlsTextBack.fillStyle(0x000000, 0.5);
        this.debugControlsTextBack.fillRect(
            100,
            200,
            (game.config.width as number) / 1.5,
            controls.length * 16,
        );
        this.debugControlsText = this.add.text(
            100,
            200,
            controls.join('\n'),
        );
        this.toggleControlsViewVisibility(false);
        mainScene.events.on('debug', (key, value) => {
            this.setText(key, value);
        });
        mainScene.events.on('debugToggle', () => {
            this.toggleVisibility();
        });
        mainScene.events.on('debugControlsViewToggle', () => {
            const newVisibility = !this.debugControlsText.visible;
            this.toggleControlsViewVisibility(newVisibility);
            this.lastControlsInfoVisibility = newVisibility;
        });
        mainScene.events.on('debugOutlinesToggle', () => {
            const isDebugVisibleSet = this.registry.get('debugVisible');
            this.toggleOutlinesVisibility(!isDebugVisibleSet);
            this.lastOutlinesVisibility = !isDebugVisibleSet;
        });
        this.events.on('shutdown', () => {
            mainScene.events.removeAllListeners('debug');
            mainScene.events.removeAllListeners('debugToggle');
        });
        this.isVisible = true;
        this.registry.set('debugVisible', true);
        this.lastControlsInfoVisibility = false;
        this.lastOutlinesVisibility = true;
    }

    addKey(key: string): void {
        this.debugTexts[key] = new Phaser.GameObjects.Text(
            this,
            0,
            this.y,
            '',
            {}
        );
        this.debugTextGroup.add(this.debugTexts[key], true);
        // TODO: Allow caller to set initial values
        this.setText(key, 'None');
        this.debugTexts[key].setScrollFactor(0);
        this.y += 32;
        this.back.clear();
        this.back.fillStyle(0x000000, 0.5);
        this.back.fillRect(
            0,
            100,
            (game.config.width as number) / 1.5,
            this.y - 100
        );
    }

    setText(key: string, text: string): void {
        this.debugTexts[key].setText(key + ': ' + text);
    }

    toggleVisibility(): void {
        this.isVisible = !this.isVisible;
        this.debugTextGroup.toggleVisible();
        this.back.setVisible(this.isVisible);
        if (!this.isVisible) {
            this.toggleControlsViewVisibility(false);
            this.toggleOutlinesVisibility(false);
        } else {
            this.toggleControlsViewVisibility(this.lastControlsInfoVisibility);
            this.toggleOutlinesVisibility(this.lastOutlinesVisibility);
        }
    }

    toggleControlsViewVisibility(visible: boolean): void {
        this.debugControlsText.setVisible(visible);
        this.debugControlsTextBack.setVisible(visible);
    }

    toggleOutlinesVisibility(visible: boolean): void {
        // 'debugVisible' in registry controls whether the debug outlines are drawn or not, see Fruit class
        this.registry.set('debugVisible', visible);
    }
}

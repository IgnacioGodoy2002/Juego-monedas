import { getManualBounds } from '../util/Bounds';

export class Player extends Phaser.GameObjects.Sprite {
    private keys: Map<string, Phaser.Input.Keyboard.Key>;
    private xSpeed: number = 0;

    private leftHeld: boolean = false;
    private rightHeld: boolean = false;
    private heldDelta: number = 1000;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        keys: Map<string, Phaser.Input.Keyboard.Key>
    ) {
        super(scene, x, y, 'player');
        this.setSize(48, 30);
        this.setDisplaySize(48, 30);
        this.scene.add.existing(this);
        this.keys = keys;
    }

    update(time: number, delta: number): void {
        this.scene.events.emit('updateScore');
        this.scene.events.emit('debug', 'xspeed', this.xSpeed.toString());
        this.scene.events.emit('debug', 'x', this.x.toString());
        this.scene.events.emit('debug', 'y', this.y.toString());
        this.x += this.xSpeed;
        this.xSpeed *= 0.2;
        const spaceKey = this.keys.get('SPACE');
        if (spaceKey && this.scene.input.keyboard.checkDown(spaceKey, 1000)) {
            this.scene.events.emit('dropFruit', this.x);
        }
        const playerBounds = getManualBounds(this);
        const leftKey = this.keys.get('LEFT');
        if (this.leftHeld || leftKey) {
            if (
                ((this.leftHeld && this.heldDelta <= 0) ||
                    this.scene.input.keyboard.checkDown(leftKey, 1000)) &&
                this.x - playerBounds.width / 2 <= 0
            ) {
                this.x = this.scene.cameras.main.width - playerBounds.width / 2;
                if (this.leftHeld) {
                    this.heldDelta = 1000;
                    this.scene.events.emit(
                        'debug',
                        'heldDelta',
                        this.heldDelta.toString()
                    );
                }
            }
            if (this.leftHeld || leftKey.isDown) {
                this.moveLeft();
            }
        }
        const rightKey = this.keys.get('RIGHT');
        if (this.rightHeld || rightKey) {
            if (
                ((this.rightHeld && this.heldDelta <= 0) ||
                    this.scene.input.keyboard.checkDown(rightKey, 1000)) &&
                this.x + playerBounds.width / 2 >= this.scene.cameras.main.width
            ) {
                this.x = playerBounds.width / 2;
                if (this.rightHeld) {
                    this.heldDelta = 1000;
                    this.scene.events.emit(
                        'debug',
                        'heldDelta',
                        this.heldDelta.toString()
                    );
                }
            }
            if (this.rightHeld || rightKey.isDown) {
                this.moveRight();
            }
        }
        if (
            (this.leftHeld || this.rightHeld) &&
            this.heldDelta > 0 &&
            (this.x - playerBounds.width / 2 <= 0 ||
                this.x + playerBounds.width / 2 >=
                    this.scene.cameras.main.width)
        ) {
            this.heldDelta -= delta;
            this.scene.events.emit(
                'debug',
                'heldDelta',
                this.heldDelta.toString()
            );
        }

        if (this.x - playerBounds.width / 2 < 0) {
            this.x = playerBounds.width / 2;
        } else if (
            this.x + playerBounds.width / 2 >
            this.scene.cameras.main.width
        ) {
            this.x = this.scene.cameras.main.width - playerBounds.width / 2;
        }
    }

    moveLeft() {
        this.xSpeed = -5;
        this.flipX = true;
    }

    moveLeftStart() {
        this.leftHeld = true;
        this.heldDelta = 1000;
        this.scene.events.emit('debug', 'heldDelta', this.heldDelta.toString());
    }

    moveLeftStop() {
        this.leftHeld = false;
    }

    moveRight() {
        this.xSpeed = 5;
        this.flipX = false;
    }

    moveRightStart() {
        this.rightHeld = true;
        this.heldDelta = 1000;
        this.scene.events.emit('debug', 'heldDelta', this.heldDelta.toString());
    }

    moveRightStop() {
        this.rightHeld = false;
    }
}

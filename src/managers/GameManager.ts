import { Scene } from 'phaser';

export class GameManager {
    private scene: Scene;
    private highScore: number = 0;
    private gameOver: boolean;
    private didWin: boolean;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public init(highscore: number) {
        this.highScore = highscore;
        this.gameOver = false;
        this.didWin = false;
        this.scene.registry.set('beatHighscore', false);
        this.scene.registry.set('score', 0);
        this.scene.registry.set('highscore', this.highScore);
    }

    public getHighScore(): number {
        return this.highScore;
    }

    public updateHighScore(): void {
        var score: number = this.scene.registry.get('score');
        if (score > this.highScore) {
            this.highScore = score;
            this.scene.registry.set('beatHighscore', true);
            this.scene.registry.set('highscore', this.highScore);
            this.scene.events.emit(
                'debug',
                'highscore',
                this.highScore.toString()
            );
        }
    }

    public isGameOver(): boolean {
        return this.gameOver;
    }

    public getDidWin(): boolean {
        return this.didWin;
    }

    public setGameOver(state: boolean): void {
        this.gameOver = state;
    }

    public setDidWin(state: boolean): void {
        this.didWin = state;
    }
}

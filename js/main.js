import { Game } from './game.js';

const game = new Game();
game.init();

// Handle space to start
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        game.audio.init();
        game.audio.resume();
        if (game.state === 'menu') {
            game.startGame();
        } else if (game.state === 'gameover' && game.frame > 60) {
            game.state = 'menu';
            game.frame = 0;
        }
    }
});

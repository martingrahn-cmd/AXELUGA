import { Game } from './game.js';

const game = new Game();
game.init();

// Handle gameover → menu transition on Space
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        game.audio.init();
        game.audio.resume();
        // Only handle gameover→menu here; menu navigation is handled by Game.update()
        if (game.state === 'gameover' && game.frame > 60) {
            game.state = 'menu';
            game.frame = 0;
        }
    }
});

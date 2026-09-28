import './ui/style.css';
import { Game } from './game/game.js';
import { installTheme } from './ui/theme.js';

installTheme();

new Game(document.getElementById('app'));

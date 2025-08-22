// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll, showGameOver } from '../ui/ui-renderer.js';
import { renderRanking } from '../ui/lobby-renderer.js';
import { renderProfile } from '../ui/profile-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
import { updateGameTimer } from '../game-controller.js';


export function connectToServer() {
    const SERVER_URL = "https://reversus-node.dke42d.easypanel.host";
    const socket = io(SERVER_URL, {
        reconnectionAttempts: 3,
        timeout: 10000,
    });
    updateState('socket', socket);

    socket.on('connect', () => {
        const clientId = socket.id;
        console.log('Conectado ao servidor com ID:', clientId);
        updateState('clientId', clientId);
    });
    
    socket.on('connect_error', (err) => {
        console.error("Falha na conexão:", err.message);
        showSplashScreen();
    });

    socket.on('loginSuccess', (userProfile) => {
        console.log('Login successful on client:', userProfile);
        updateState('isLoggedIn', true);
        updateState('userProfile', userProfile);

        // Atualizações da UI
        dom.googleSignInContainer.classList.add('hidden');
        dom.userProfileDisplay.classList.remove('hidden');
        renderProfile(userProfile); // Renderiza o perfil completo, incluindo a barra de XP
        dom.rankingButton.classList.remove('hidden'); 
        dom.eventButton.classList.remove('hidden');
    });

    socket.on('loginError', (message) => {
        console.error('Login failed:', message);
        alert(`Erro de login: ${message}`);
    });
    
    socket.on('rankingData', (ranking) => {
        renderRanking(ranking);
    });

    socket.on('profileData', (profile) => {
        updateState('userProfile', profile);
        renderProfile(profile);
    });

    socket.on('rewardClaimed', ({ titleCode }) => {
        console.log(`Servidor confirmou a recompensa resgatada: ${titleCode}`);
        // A atualização do perfil via 'profileData' cuidará da UI.
    });

    socket.on('roomList', (rooms) => {
        // Esta função agora está em lobby-renderer.js, mas mantemos o listener.
        // A lógica de renderização de salas PvP será chamada quando necessário.
    });

    // ... (restante da lógica de conexão e jogo PvP)
}

// --- EMISSORES DE EVENTOS ---

export function emitGetRanking() {
    const { socket } = getState();
    if (socket) socket.emit('getRanking');
}

export function emitGetProfile() {
    const { socket } = getState();
    if (socket) socket.emit('getProfile');
}

export function emitClaimEventReward(titleCode) {
    const { socket } = getState();
    if (socket) {
        socket.emit('claimEventReward', { titleCode });
    }
}

export function emitGameFinished(winnerId, loserIds, mode) {
    const { socket } = getState();
    if (socket) socket.emit('gameFinished', { winnerId, loserIds, mode });
}


export function emitListRooms() {
    const { socket } = getState();
    if (socket) socket.emit('listRooms');
}

export function emitCreateRoom() {
    const { socket } = getState();
    if (socket) {
        socket.emit('createRoom');
    }
}

export function emitJoinRoom(roomId) {
    const { socket } = getState();
    if (socket) {
        socket.emit('joinRoom', { roomId });
    }
}

export function emitLeaveRoom() {
    const { socket, currentRoomId } = getState();
    if (socket && currentRoomId) {
        socket.emit('leaveRoom');
        updateState('currentRoomId', null);
        updateState('gameState', null);
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.add('hidden');
        showSplashScreen();
    }
}

export function emitLobbyChat(message) {
    const { socket } = getState();
    if(socket) {
        socket.emit('lobbyChatMessage', message);
    }
}

export function emitChatMessage(message) {
    const { socket } = getState();
    if (socket) {
        socket.emit('chatMessage', message);
    }
}

export function emitChangeMode(mode) {
    const { socket } = getState();
    if (socket) {
        socket.emit('changeMode', mode);
    }
}

export function emitPlayCard({ cardId, targetId, options = {} }) {
    const { socket } = getState();
    if (socket) {
        socket.emit('playCard', { cardId, targetId, options });
    }
}

export function emitEndTurn() {
    const { socket, gameState, playerId } = getState();
    if (!socket || !gameState || gameState.currentPlayer !== playerId) return;
    
    const player = gameState.players[playerId];
    const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
    const mustPlayValueCard = valueCardsInHandCount > 1 && !player.playedValueCardThisTurn;
    if (mustPlayValueCard) {
        alert("Você precisa jogar uma carta de valor neste turno!");
        return;
    }
    
    socket.emit('endTurn');
}
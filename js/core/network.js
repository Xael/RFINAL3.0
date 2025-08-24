// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll, showGameOver } from '../ui/ui-renderer.js';
import { renderRanking, updateLobbyUi, renderRoomList, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { renderProfile, renderFriendsList, renderSearchResults, addPrivateChatMessage, updateFriendStatusIndicator } from '../ui/profile-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
import { updateGameTimer } from '../game-controller.js';

/**
 * Sets up the player areas in the UI so the local player is always at the bottom.
 */
function setupPlayerPerspective() {
    const { gameState, playerId } = getState();
    if (!gameState || !playerId || !gameState.playerIdsInGame) return;

    const playerIds = gameState.playerIdsInGame;
    if (!playerIds.includes(playerId)) return;
    
    const myIndex = playerIds.indexOf(playerId);
    
    const orderedPlayerIds = [...playerIds.slice(myIndex), ...playerIds.slice(0, myIndex)];

    const player1Container = document.getElementById('player-1-area-container');
    const opponentsContainer = document.getElementById('opponent-zones-container');
    const createPlayerAreaHTML = (id) => `<div class="player-area" id="player-area-${id}"></div>`;
    
    if(player1Container) player1Container.innerHTML = createPlayerAreaHTML(orderedPlayerIds[0]);
    if(opponentsContainer) opponentsContainer.innerHTML = orderedPlayerIds.slice(1).map(id => createPlayerAreaHTML(id)).join('');
}


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
        
        dom.googleSignInContainer.classList.add('hidden');
        dom.userProfileDisplay.classList.remove('hidden');
        renderProfile(userProfile);
        dom.rankingButton.classList.remove('hidden'); 
        dom.eventButton.classList.remove('hidden');
        emitGetFriendsList(); // Carrega a lista de amigos após o login
    });

    socket.on('loginError', (message) => {
        console.error('Login failed:', message);
        alert(`Erro de login: ${message}`);
    });

    socket.on('forceDisconnect', (message) => {
        alert(message);
        window.location.reload();
    });

    socket.on('roomCreated', (roomId) => {
        emitJoinRoom(roomId);
    });
    
    socket.on('rankingData', (rankingData) => {
        renderRanking(rankingData);
    });

    socket.on('profileData', (profile) => {
        const { userProfile } = getState();
        if (userProfile && profile.google_id === userProfile.google_id) {
            updateState('userProfile', profile);
        }
        renderProfile(profile);
    });
    
    socket.on('viewProfileData', (profile) => {
        renderProfile(profile);
        dom.profileModal.classList.remove('hidden');
    });

    socket.on('rewardClaimed', ({ titleCode }) => {
        // A atualização do perfil via 'profileData' cuidará da UI.
    });

    // --- Social Listeners ---
    socket.on('searchResults', (results) => {
        renderSearchResults(results);
    });

    socket.on('friendsList', (friends) => {
        renderFriendsList(friends);
    });
    
    socket.on('friendStatusUpdate', ({ userId, isOnline }) => {
        updateFriendStatusIndicator(userId, isOnline);
    });

    socket.on('privateMessage', (message) => {
        addPrivateChatMessage(message);
    });


    // --- Room & Game Listeners ---
    socket.on('roomList', (rooms) => {
        renderRoomList(rooms);
    });
    
    socket.on('lobbyUpdate', async (roomData) => {
        updateState('currentRoomId', roomData.id);
        const { clientId, userProfile } = getState();
        const myPlayerData = roomData.players.find(p => p.id === clientId);
        if (myPlayerData) {
            updateState('playerId', myPlayerData.playerId);
            if (userProfile) {
                userProfile.playerId = myPlayerData.playerId;
                updateState('userProfile', userProfile);
            }
        }
        
        dom.pvpRoomListModal.classList.add('hidden');
        dom.pvpLobbyModal.classList.remove('hidden');

        // Fetch titles for lobby
        const playersWithTitles = await Promise.all(roomData.players.map(async (p) => {
            const profile = await new Promise(resolve => {
                socket.emit('viewProfile', { googleId: p.googleId });
                socket.once('viewProfileData', resolve);
            });
            return { ...p, title: profile.selected_title || '' };
        }));
        
        updateLobbyUi({ ...roomData, players: playersWithTitles });
    });

    socket.on('lobbyChatMessage', ({ speaker, message }) => {
        addLobbyChatMessage(speaker, message);
    });

    socket.on('chatMessage', ({ speaker, message }) => {
        updateLog({ type: 'dialogue', speaker, message });
    });

    socket.on('gameStarted', (initialGameState) => {
        updateState('gameState', initialGameState);
        
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.remove('hidden');

        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));
        
        setupPlayerPerspective();
        renderAll();
    });

    socket.on('gameStateUpdate', (gameState) => {
        const { gameState: localGameState } = getState();
        const localUiState = localGameState ? {
            selectedCard: localGameState.selectedCard,
            reversusTarget: localGameState.reversusTarget,
            pulaTarget: localGameState.pulaTarget,
        } : {};
        const newGameState = { ...gameState, ...localUiState };
        updateState('gameState', newGameState);
        setupPlayerPerspective();
        renderAll();
    });

    socket.on('gameOver', ({ message, winnerId }) => {
        const { gameState } = getState();
        if (gameState) {
             emitGameFinished(winnerId, [], gameState.gameMode);
        }
        showGameOver(message, "Fim de Jogo!", { action: 'menu' });
    });

    socket.on('error', (message) => {
        console.error('Server Error:', message);
        alert(`Erro do Servidor: ${message}`);
    });
}

// --- EMISSORES DE EVENTOS ---
export function emitGetRanking(page = 1) { const { socket } = getState(); if (socket) socket.emit('getRanking', { page }); }
export function emitGetProfile() { const { socket } = getState(); if (socket) socket.emit('getProfile'); }
export function emitViewProfile(googleId) { const { socket } = getState(); if (socket) socket.emit('viewProfile', { googleId }); }
export function emitSetSelectedTitle(titleCode) { const { socket } = getState(); if (socket) socket.emit('setSelectedTitle', { titleCode }); }
export function emitClaimEventReward(titleCode) { const { socket } = getState(); if (socket) socket.emit('claimEventReward', { titleCode });}
export function emitGameFinished(winnerId, loserIds, mode) { const { socket } = getState(); if (socket) socket.emit('gameFinished', { winnerId, loserIds, mode }); }
export function emitListRooms() { const { socket } = getState(); if (socket) socket.emit('listRooms'); }
export function emitCreateRoom() { const { socket } = getState(); if (socket) socket.emit('createRoom'); }
export function emitJoinRoom(roomId) { const { socket } = getState(); if (socket) socket.emit('joinRoom', { roomId }); }
export function emitLobbyChat(message) { const { socket } = getState(); if(socket) socket.emit('lobbyChatMessage', message); }
export function emitChatMessage(message) { const { socket } = getState(); if (socket) socket.emit('chatMessage', message); }
export function emitChangeMode(mode) { const { socket } = getState(); if (socket) socket.emit('changeMode', mode); }
export function emitStartGame() { const { socket } = getState(); if (socket) socket.emit('startGame'); }
export function emitPlayCard({ cardId, targetId, options = {} }) { const { socket } = getState(); if (socket) socket.emit('playCard', { cardId, targetId, options }); }
export function emitSearchUsers(query) { const { socket } = getState(); if (socket) socket.emit('searchUsers', { query }); }
export function emitAddFriend(targetUserId) { const { socket } = getState(); if (socket) socket.emit('addFriend', { targetUserId }); }
export function emitRemoveFriend(targetUserId) { const { socket } = getState(); if (socket) socket.emit('removeFriend', { targetUserId }); }
export function emitGetFriendsList() { const { socket } = getState(); if (socket) socket.emit('getFriendsList'); }
export function emitSendPrivateMessage(recipientId, content) { const { socket } = getState(); if (socket) socket.emit('sendPrivateMessage', { recipientId, content }); }

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

export function emitEndTurn() {
    const { socket, gameState, playerId } = getState();
    if (!socket || !gameState || gameState.currentPlayer !== playerId) return;
    const player = gameState.players[playerId];
    if(!player) return;
    const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
    if (valueCardsInHandCount > 1 && !player.playedValueCardThisTurn) {
        alert("Você precisa jogar uma carta de valor neste turno!");
        return;
    }
    socket.emit('endTurn');
}

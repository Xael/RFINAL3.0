// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll, showGameOver } from '../ui/ui-renderer.js';
import { renderRanking, updateLobbyUi, renderRoomList, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { renderProfile, renderFriendsList, renderSearchResults, addPrivateChatMessage, updateFriendStatusIndicator, renderFriendRequests } from '../ui/profile-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
import { updateGameTimer } from '../game-controller.js';
import { showPvpDrawSequence } from '../game-logic/turn-manager.js';
import { t } from './i18n.js';
import { animateCardPlay } from '../ui/animations.js';

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

    player1Container.innerHTML = createPlayerAreaHTML(orderedPlayerIds[0]);
    opponentsContainer.innerHTML = orderedPlayerIds.slice(1).map(id => createPlayerAreaHTML(id)).join('');
}


export function connectToServer() {
    const state = getState();
    if (state.socket || state.isConnectionAttempted) return;
    updateState('isConnectionAttempted', true);
    
    const socket = io("https://reversus-game.dke42d.easypanel.host", {
        withCredentials: true // Essencial para o login com Google via CORS
    });
    updateState('socket', socket);

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        updateState('clientId', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server.');
        alert('Você foi desconectado do servidor. Retornando ao menu principal.');
        showSplashScreen();
    });

    socket.on('forceDisconnect', (message) => {
        alert(message);
        socket.disconnect();
    });

    socket.on('loginSuccess', (userProfile) => {
        console.log('Login successful:', userProfile);
        updateState('isLoggedIn', true);
        updateState('userProfile', userProfile);
        dom.googleSignInContainer.classList.add('hidden');
        dom.userProfileDisplay.classList.remove('hidden');
        dom.eventButton.classList.remove('hidden');
        renderProfile(userProfile);
    });

    socket.on('loginError', (message) => {
        alert(message);
    });

    socket.on('roomList', (rooms) => {
        renderRoomList(rooms);
    });
    
    socket.on('roomCreated', (roomId) => {
        emitJoinRoom(roomId);
    });

    socket.on('joinedRoom', (roomData) => {
        updateState('currentRoomId', roomData.id);
        const myPlayerData = roomData.players.find(p => p.id === state.clientId);
        if (myPlayerData) updateState('playerId', myPlayerData.playerId);
        
        dom.pvpRoomListModal.classList.add('hidden');
        dom.pvpLobbyModal.classList.remove('hidden');
        updateLobbyUi(roomData);
    });
    
    socket.on('lobbyUpdate', (roomData) => {
        updateLobbyUi(roomData);
    });

    socket.on('lobbyChat', ({ speaker, message }) => {
        addLobbyChatMessage(speaker, message);
    });

    socket.on('gameStarted', async (initialGameState) => {
        console.log("Game started by server:", initialGameState);
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.remove('hidden');
        updateState('gameState', initialGameState);
        
        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));
        
        setupPlayerPerspective();
        renderAll();
        
        if (initialGameState.gamePhase === 'initial_draw') {
            await showPvpDrawSequence(initialGameState);
        }
    });

    socket.on('gameStateUpdate', (newGameState) => {
        updateState('gameState', newGameState);
        renderAll();
    });

    socket.on('cardPlayedAnimation', async ({ card, startPlayerId, targetPlayerId, targetSlotLabel }) => {
        const startElement = document.querySelector(`#hand-${startPlayerId} [data-card-id="${card.id}"]`);
        if (startElement) {
            await animateCardPlay(card, startElement, targetPlayerId, targetSlotLabel);
        }
    });

    socket.on('gameOver', ({ message, winnerId }) => {
        const { gameState } = getState();
        showGameOver(message, "Fim de Jogo!", { action: 'menu' });
        // Emit event for the winner to update stats
        if (winnerId === getState().playerId) {
            socket.emit('gameFinished', { winnerId, roomId: getState().currentRoomId, mode: gameState.gameMode });
        }
    });

    socket.on('chatMessage', ({ speaker, message }) => {
        updateLog({ type: 'dialogue', speaker, message });
    });

    socket.on('rankingData', (rankingData) => {
        renderRanking(rankingData);
    });

    socket.on('profileData', (profileData) => {
        renderProfile(profileData);
    });
    
    socket.on('viewProfileData', (profileData) => {
        dom.profileModal.classList.remove('hidden');
        renderProfile(profileData);
    });

    socket.on('error', (message) => {
        alert(message);
    });

    // Friend system events
    socket.on('searchResults', (results) => renderSearchResults(results));
    socket.on('friendsList', (friends) => renderFriendsList(friends));
    socket.on('newFriendRequest', (request) => {
        alert(t('friends.new_request_alert', { username: request.username }));
        dom.friendRequestBadge.classList.remove('hidden');
    });
    socket.on('pendingRequestsData', (requests) => {
        renderFriendRequests(requests);
        dom.friendRequestBadge.classList.toggle('hidden', requests.length === 0);
    });
    socket.on('friendRequestResponded', ({ username, action }) => {
        if(action === 'accept') alert(t('friends.request_accepted_alert', { username }));
        emitGetFriendsList(); // Refresh list on any change
    });
    socket.on('friendStatusUpdate', ({ userId, isOnline }) => updateFriendStatusIndicator(userId, isOnline));
    
    // Private Chat events
    socket.on('privateMessage', (message) => addPrivateChatMessage(message));

    // Quick PVP events
    socket.on('queueUpdate', ({ inQueue, mode, current, required }) => {
        if (inQueue) {
            dom.quickPvpQueueModal.classList.remove('hidden');
            dom.quickPvpQueueStatusText.textContent = t('quick_pvp_queue.status_text', { current, required });
        } else {
            dom.quickPvpQueueModal.classList.add('hidden');
        }
    });
}

// --- EMITTERS ---
export function emitListRooms() { getState().socket?.emit('listRooms'); }
export function emitCreateRoom() { getState().socket?.emit('createRoom'); }
export function emitJoinRoom(roomId) { getState().socket?.emit('joinRoom', { roomId }); }
export function emitLeaveRoom() { getState().socket?.emit('leaveRoom'); }
export function emitChangeMode(mode) { getState().socket?.emit('changeMode', { mode }); }
export function emitStartGame() { getState().socket?.emit('startGame'); }
export function emitPlayCard(data) { getState().socket?.emit('playCard', data); }
export function emitEndTurn() { getState().socket?.emit('endTurn'); }
export function emitChatMessage(message) { getState().socket?.emit('chatMessage', { message }); }
export function emitLobbyChat(message) { getState().socket?.emit('lobbyChat', { message }); }
export function emitGetRanking(page = 1) { getState().socket?.emit('getRanking', { page }); }
export function emitGetProfile() { getState().socket?.emit('getProfile'); }
export function emitViewProfile(googleId) { getState().socket?.emit('viewProfile', { googleId }); }
export function emitSetSelectedTitle(titleCode) { getState().socket?.emit('setSelectedTitle', { titleCode }); }

// Friend Emitters
export function emitSearchUsers(query) { getState().socket?.emit('searchUsers', { query }); }
export function emitSendFriendRequest(targetUserId, callback) { getState().socket?.emit('sendFriendRequest', { targetUserId }, callback); }
export function emitRespondToRequest(requestId, action) { getState().socket?.emit('respondToRequest', { requestId, action }); }
export function emitGetPendingRequests() { getState().socket?.emit('getPendingRequests'); }
export function emitGetFriendsList() { getState().socket?.emit('getFriendsList'); }
export function emitRemoveFriend(targetUserId) { getState().socket?.emit('removeFriend', { targetUserId }); }
export function emitSendPrivateMessage(recipientId, content) { getState().socket?.emit('sendPrivateMessage', { recipientId, content }); }

// Quick PVP Emitters
export function emitJoinQuickPvpQueue(mode) { getState().socket?.emit('joinQuickPvpQueue', { mode }); }
export function emitLeaveQuickPvpQueue() { getState().socket?.emit('leaveQuickPvpQueue'); }
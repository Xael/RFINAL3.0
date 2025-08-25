// js/ui/ui-handlers.js
import * as dom from '../core/dom.js';
import { getState, updateState } from '../core/state.js';
import { initializeGame, restartLastDuel } from '../game-controller.js';
import { renderAchievementsModal } from './achievements-renderer.js';
import { renderAll } from './ui-renderer.js';
import * as sound from '../core/sound.js';
import { startStoryMode, renderStoryNode, playEndgameSequence } from '../story/story-controller.js';
import * as saveLoad from '../core/save-load.js';
import * as achievements from '../core/achievements.js';
import { updateLog } from '../core/utils.js';
import * as config from '../core/config.js';
import * as network from '../core/network.js';
import { shatterImage } from './animations.js';
import { announceEffect } from '../core/sound.js';
import { playCard } from '../game-logic/player-actions.js';
import { advanceToNextPlayer } from '../game-logic/turn-manager.js';
import { setLanguage, t } from '../core/i18n.js';
import { showSplashScreen } from './splash-screen.js';
import { renderProfile } from './profile-renderer.js';

let currentEventData = null;
const activeChatWindows = new Set();

/**
 * Gets the ID of the local human player.
 * @returns {string | null} The player ID or null if not found.
 */
function getLocalPlayerId() {
    const { gameState, playerId } = getState();
    if (!gameState) return null;
    if (gameState.isPvp) return playerId;
    const humanPlayer = Object.values(gameState.players).find(p => p.isHuman);
    return humanPlayer ? humanPlayer.id : null;
}

/**
 * Creates and manages a private chat window for a specific user.
 * This function is now exported to be used by other modules.
 * @param {string} userId - The ID of the user to chat with.
 * @param {string} username - The username of the user to chat with.
 */
export function openChatWindow(userId, username) {
    if (activeChatWindows.has(userId)) {
        const existingWindow = document.getElementById(`chat-window-${userId}`);
        if (existingWindow) existingWindow.querySelector('.chat-window-input').focus();
        return;
    }
    activeChatWindows.add(userId);
    dom.privateChatPanel.classList.remove('hidden');

    const chatWindow = document.createElement('div');
    chatWindow.className = 'chat-window';
    chatWindow.id = `chat-window-${userId}`;
    chatWindow.innerHTML = `
        <div class="chat-window-header">
            <span>${username}</span>
            <button class="chat-window-close" data-user-id="${userId}">&times;</button>
        </div>
        <div class="chat-window-messages"></div>
        <div class="chat-window-input-area">
            <input type="text" class="chat-window-input" placeholder="${t('chat.placeholder')}">
        </div>
    `;
    dom.privateChatPanel.appendChild(chatWindow);

    const input = chatWindow.querySelector('.chat-window-input');
    input.focus();

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const content = input.value.trim();
            if (content) {
                network.emitSendPrivateMessage(parseInt(userId, 10), content);
                input.value = '';
            }
        }
    });
}

/**
 * Resets the game state after a player cancels an action modal.
 */
function cancelPlayerAction() {
    const { gameState } = getState();
    dom.targetModal.classList.add('hidden');
    dom.reversusTargetModal.classList.add('hidden');
    dom.reversusTotalChoiceModal.classList.add('hidden');
    dom.reversusIndividualEffectChoiceModal.classList.add('hidden');
    dom.pulaModal.classList.add('hidden');
    if (gameState) {
        gameState.gamePhase = 'playing';
        gameState.selectedCard = null;
        gameState.reversusTarget = null;
        gameState.pulaTarget = null;
        updateState('reversusTotalIndividualFlow', false);
    }
    renderAll();
}

/**
 * Handles clicks on cards, either selecting them or showing a viewer.
 * @param {Event} e - The click event.
 */
function handleCardClick(e) {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    
    const cardId = cardEl.dataset.cardId;
    const { gameState } = getState();
    if (!gameState) return;
    
    const myPlayerId = getLocalPlayerId();
    if (!myPlayerId) return;

    const player = gameState.players[myPlayerId];
    if (!player) return;

    const card = player.hand.find(c => String(c.id) === cardId);
    if (!card) return;

    if (e.target.classList.contains('card-maximize-button')) {
        const isHidden = cardEl.style.backgroundImage.includes('verso');
        if (isHidden) return;
        dom.cardViewerImageEl.src = cardEl.style.backgroundImage.slice(5, -2);
        dom.cardViewerModalEl.classList.remove('hidden');
        return;
    }

    if (gameState.currentPlayer !== myPlayerId || cardEl.classList.contains('disabled')) {
        return;
    }

    if (gameState.selectedCard?.id === card.id) {
        gameState.selectedCard = null;
    } else {
        gameState.selectedCard = card;
    }
    
    renderAll();
}

/**
 * Handles the logic when the "Jogar Carta" button is clicked.
 */
async function handlePlayButtonClick() {
    const { gameState } = getState();
    if (!gameState) return;
    
    const myPlayerId = getLocalPlayerId();
    if (!myPlayerId) return;

    const player = gameState.players[myPlayerId];
    const card = gameState.selectedCard;

    if (!player || !card) return;

    // Immediately disable buttons for better UX
    dom.playButton.disabled = true;
    dom.endTurnButton.disabled = true;

    if (gameState.isPvp) {
        // In PvP, we just send the event and wait for the server's gameStateUpdate
        // The modal logic for complex cards is handled below before sending the event
    } else {
        gameState.gamePhase = 'paused';
    }
    
    if (card.type === 'value') {
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId: player.id });
        } else {
            await playCard(player, card, player.id);
            gameState.gamePhase = 'playing';
            renderAll();
        }
        return;
    }

    const targetableCards = ['Mais', 'Menos', 'Sobe', 'Desce', 'Pula', 'Reversus'];

    if (targetableCards.includes(card.name)) {
        const allPlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
        if (allPlayers.length === 0) {
            updateLog(`Não há jogadores para usar a carta '${card.name}'.`);
            cancelPlayerAction();
            return;
        }
        dom.targetModalCardName.textContent = card.name;
        dom.targetPlayerButtonsEl.innerHTML = allPlayers.map(id => `<button class="control-button target-player-${id.split('-')[1]}" data-player-id="${id}">${gameState.players[id].name}</button>`).join('');
        dom.targetModal.classList.remove('hidden');
    } else if (card.name === 'Reversus Total') {
        dom.reversusTotalChoiceModal.classList.remove('hidden');
    } else if (card.name === 'Carta da Versatrix') {
        if (gameState.isPvp) {
             network.emitPlayCard({ cardId: card.id, targetId: player.id });
        } else {
             await playCard(player, card, player.id);
             gameState.gamePhase = 'playing';
             renderAll();
        }
    } else {
        console.warn(`Unhandled effect card in handlePlayButtonClick: ${card.name}`);
        cancelPlayerAction();
    }
}


/**
 * Handles the logic for ending a player's turn.
 */
function handleEndTurnButtonClick() {
    const { gameState } = getState();
    const myPlayerId = getLocalPlayerId();
    if (!myPlayerId) return;

    const player = gameState.players[myPlayerId];

    if (!player || gameState.currentPlayer !== myPlayerId) return;

    const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
    if (valueCardsInHandCount > 1 && !player.playedValueCardThisTurn) {
        updateLog("Você deve jogar uma carta de valor antes de passar o turno.");
        return;
    }
    
    // Immediately disable buttons for better UX
    dom.playButton.disabled = true;
    dom.endTurnButton.disabled = true;

    if (gameState.isPvp) {
        network.emitEndTurn();
    } else {
        updateLog(`${player.name} passou o turno.`);
        gameState.consecutivePasses++;
        advanceToNextPlayer();
    }
}

/**
 * Shows an info modal for a field effect when its indicator is clicked.
 * @param {Event} e The click event from the indicator.
 */
function handleFieldEffectIndicatorClick(e) {
    const indicator = e.target.closest('.field-effect-indicator');
    if (!indicator) return;

    const playerId = indicator.dataset.playerId;
    const { gameState } = getState();
    const activeEffect = gameState.activeFieldEffects.find(fe => fe.appliesTo === playerId);
    
    if (activeEffect) {
        dom.fieldEffectInfoTitle.textContent = t('field_effect.info_title');
        const isPositive = activeEffect.type === 'positive';
        dom.fieldEffectInfoModal.querySelector('.field-effect-card').className = `field-effect-card ${isPositive ? 'positive' : 'negative'}`;
        dom.fieldEffectInfoName.textContent = activeEffect.name;
        
        // Correctly get and translate the description
        const effectConfig = isPositive ? config.POSITIVE_EFFECTS[activeEffect.name] : config.NEGATIVE_EFFECTS[activeEffect.name];
        dom.fieldEffectInfoDescription.textContent = effectConfig ? t(effectConfig.descriptionKey) : 'Descrição não encontrada.';
        
        dom.fieldEffectInfoModal.classList.remove('hidden');
    }
}

function handleChatModerationClick(e) {
    const { mutedUsers, gameState } = getState();
    
    const reportButton = e.target.closest('.chat-report-button');
    if (reportButton) {
        const userId = reportButton.dataset.userId;
        const username = reportButton.dataset.username;
        if (confirm(`Deseja denunciar ${username} por comportamento inadequado no chat? A conversa será enviada para análise.`)) {
            network.emitReportChat(userId);
        }
        return;
    }

    const muteButton = e.target.closest('.chat-mute-button');
    if (muteButton) {
        const userId = muteButton.dataset.userId;
        if (mutedUsers.has(userId)) {
            mutedUsers.delete(userId);
            updateLog(`Você reativou as mensagens de ${muteButton.dataset.username || 'um jogador'}.`);
        } else {
            mutedUsers.add(userId);
            updateLog(`Você silenciou ${muteButton.dataset.username || 'um jogador'}.`);
        }
        // Re-render the relevant chat log
        if (gameState) {
            updateLog(); // Re-renders the in-game log
        } else {
            // This is likely the lobby, need a way to re-render it
            // For now, the button icon will change, and new messages won't appear.
            // A full re-render is more complex here. Let's just update the button.
            const isMuted = mutedUsers.has(userId);
            muteButton.title = isMuted ? 'Desmutar Jogador' : 'Silenciar Jogador';
            muteButton.innerHTML = isMuted
                ? `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path></svg>`
                : `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>`;
        }
        return;
    }
}

/**
 * Initializes all UI event handlers for the application.
 */
export const initializeUiHandlers = () => {
    // --- Splash Screen ---
    dom.quickStartButton.addEventListener('click', () => {
        sound.initializeMusic();
        dom.gameSetupModal.classList.remove('hidden');
    });
    dom.storyModeButton.addEventListener('click', () => {
        dom.storyStartOptionsModal.classList.remove('hidden');
    });
    dom.pvpModeButton.addEventListener('click', () => {
        sound.initializeMusic();
        const { isLoggedIn } = getState();
        if (!isLoggedIn) {
            alert("Você precisa fazer login com o Google para jogar no modo PvP.");
            return;
        }
        dom.pvpRoomListModal.classList.remove('hidden');
        network.emitListRooms();
    });
    dom.rankingButton.addEventListener('click', () => {
        sound.initializeMusic();
        dom.rankingModal.classList.remove('hidden');
        network.emitGetRanking();
    });
    dom.infoButton.addEventListener('click', () => {
        sound.initializeMusic();
        dom.infoModal.classList.remove('hidden');
    });
    dom.closeInfoButton.addEventListener('click', () => dom.infoModal.classList.add('hidden'));

    // --- Story Start Options ---
    dom.storyNewGameButton.addEventListener('click', () => {
        dom.storyStartOptionsModal.classList.add('hidden');
        startStoryMode();
    });
    dom.storyContinueGameButton.addEventListener('click', () => {
        if (!dom.storyContinueGameButton.disabled) {
            dom.storyStartOptionsModal.classList.add('hidden');
            saveLoad.loadGameState();
        }
    });
    dom.storyOptionsCloseButton.addEventListener('click', () => dom.storyStartOptionsModal.classList.add('hidden'));

    // --- Game Setup Modals ---
    dom.closeSetupButton.addEventListener('click', () => dom.gameSetupModal.classList.add('hidden'));
    dom.solo2pButton.addEventListener('click', () => {
        dom.gameSetupModal.classList.add('hidden');
        dom.oneVOneSetupModal.classList.remove('hidden');
    });
    dom.solo3pButton.addEventListener('click', () => initializeGame('solo', { numPlayers: 3 }));
    dom.solo4pButton.addEventListener('click', () => initializeGame('solo', { numPlayers: 4 }));
    dom.duoModeButton.addEventListener('click', () => initializeGame('duo', { numPlayers: 4 }));
    dom.oneVOneBackButton.addEventListener('click', () => {
        dom.oneVOneSetupModal.classList.add('hidden');
        dom.gameSetupModal.classList.remove('hidden');
    });

    // --- Game Actions ---
    dom.playButton.addEventListener('click', handlePlayButtonClick);
    dom.endTurnButton.addEventListener('click', handleEndTurnButtonClick);

    // AI turn end listener
    document.addEventListener('aiTurnEnded', advanceToNextPlayer);

    // --- Game Over ---
    dom.restartButton.addEventListener('click', (e) => {
        dom.gameOverModal.classList.add('hidden');
        const action = e.target.dataset.action;
        if (action === 'restart') {
            const { gameState } = getState();
            if (gameState && gameState.gameOptions) {
                initializeGame(gameState.gameMode, gameState.gameOptions);
            }
        } else if (action === 'restart_duel') {
            restartLastDuel();
        } else {
            showSplashScreen();
        }
    });

    // --- In-Game Chat ---
    const chatContainer = document.querySelector('.chat-container');
    const chatToggleCheckbox = document.getElementById('chat-toggle-checkbox');
    chatToggleCheckbox.addEventListener('change', () => {
        chatContainer.classList.toggle('disabled', !chatToggleCheckbox.checked);
        dom.chatInputArea.classList.toggle('hidden', !chatToggleCheckbox.checked);
    });

    dom.chatSendButton.addEventListener('click', () => {
        const message = dom.chatInput.value.trim();
        if (message) {
            const { gameState } = getState();
            if (gameState && gameState.isPvp) {
                network.emitChatMessage(message);
            } else {
                const myPlayerId = getLocalPlayerId();
                const player = myPlayerId ? gameState.players[myPlayerId] : null;
                if(player) {
                    updateLog({ type: 'dialogue', speaker: player.name, message: message, speakerId: player.id });
                }
            }
            dom.chatInput.value = '';
        }
    });
    dom.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') dom.chatSendButton.click();
    });

    // --- Card Interaction ---
    dom.appContainerEl.addEventListener('click', handleCardClick);
    dom.cardViewerCloseButton.addEventListener('click', () => dom.cardViewerModalEl.classList.add('hidden'));

    // --- Target Selection ---
    dom.targetPlayerButtonsEl.addEventListener('click', async (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const targetId = e.target.dataset.playerId;
        const { gameState } = getState();
        const card = gameState.selectedCard;

        dom.targetModal.classList.add('hidden');

        if (card.name === 'Reversus') {
            gameState.reversusTarget = targetId;
            dom.reversusTargetModal.classList.remove('hidden');
        } else if (card.name === 'Pula') {
            const targetPlayer = gameState.players[targetId];
            if (!targetPlayer) return;
            gameState.pulaTarget = targetId;

            const occupiedPaths = new Set(Object.values(gameState.players).map(p => p.pathId));
            const availablePaths = gameState.boardPaths.filter(p => !occupiedPaths.has(p.id));

            if (availablePaths.length === 0) {
                updateLog(`Não há caminhos vazios para usar 'Pula' em ${targetPlayer.name}.`);
                cancelPlayerAction();
                return;
            }
            dom.pulaModalTitle.textContent = t('pula.title_with_target', { targetName: targetPlayer.name });
            dom.pulaModalText.textContent = t('pula.description_with_target', { targetName: targetPlayer.name });
            dom.pulaPathButtonsEl.innerHTML = availablePaths.map(p => `<button class="control-button" data-path-id="${p.id}">${t('pula.path_button', { pathNumber: p.id + 1 })}</button>`).join('');
            dom.pulaModal.classList.remove('hidden');
        } else {
            if (gameState.isPvp) {
                network.emitPlayCard({ cardId: card.id, targetId });
            } else {
                const myPlayerId = getLocalPlayerId();
                if (!myPlayerId) return;
                await playCard(gameState.players[myPlayerId], card, targetId);
                gameState.gamePhase = 'playing';
                renderAll();
            }
        }
    });

    // --- Reversus & Pula Modals ---
    dom.reversusTargetScoreButton.addEventListener('click', async () => {
        const { gameState } = getState();
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: gameState.selectedCard.id, targetId: gameState.reversusTarget, options: { effectType: 'score' } });
        } else {
            const myPlayerId = getLocalPlayerId();
            if (!myPlayerId) return;
            await playCard(gameState.players[myPlayerId], gameState.selectedCard, gameState.reversusTarget, 'score');
            gameState.gamePhase = 'playing';
            renderAll();
        }
        cancelPlayerAction();
    });
    dom.reversusTargetMovementButton.addEventListener('click', async () => {
        const { gameState } = getState();
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: gameState.selectedCard.id, targetId: gameState.reversusTarget, options: { effectType: 'movement' } });
        } else {
            const myPlayerId = getLocalPlayerId();
            if (!myPlayerId) return;
            await playCard(gameState.players[myPlayerId], gameState.selectedCard, gameState.reversusTarget, 'movement');
            gameState.gamePhase = 'playing';
            renderAll();
        }
        cancelPlayerAction();
    });
    dom.pulaPathButtonsEl.addEventListener('click', async (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const pathId = parseInt(e.target.dataset.pathId, 10);
        const { gameState } = getState();
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: gameState.selectedCard.id, targetId: gameState.pulaTarget, options: { pulaPath: pathId } });
        } else {
            const myPlayerId = getLocalPlayerId();
            if (!myPlayerId) return;
            const targetPlayer = gameState.players[gameState.pulaTarget];
            if (targetPlayer) targetPlayer.targetPathForPula = pathId;
            await playCard(gameState.players[myPlayerId], gameState.selectedCard, gameState.pulaTarget);
            gameState.gamePhase = 'playing';
            renderAll();
        }
        cancelPlayerAction();
    });

    // --- Reversus Total ---
    dom.reversusTotalGlobalButton.addEventListener('click', async () => {
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        if (!myPlayerId) return;
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: gameState.selectedCard.id, targetId: myPlayerId, options: { isGlobal: true } });
        } else {
            await playCard(gameState.players[myPlayerId], gameState.selectedCard, myPlayerId, null, { isGlobal: true });
            gameState.gamePhase = 'playing';
            renderAll();
        }
        cancelPlayerAction();
    });
    dom.reversusTotalIndividualButton.addEventListener('click', () => {
        updateState('reversusTotalIndividualFlow', true);
        dom.reversusTotalChoiceModal.classList.add('hidden');
        // Trigger the original target selection modal again for the lock effect
        const allPlayers = getState().gameState.playerIdsInGame.filter(id => !getState().gameState.players[id].isEliminated);
        dom.targetModalCardName.textContent = "Reversus Individual";
        dom.targetPlayerButtonsEl.innerHTML = allPlayers.map(id => `<button class="control-button target-player-${id.split('-')[1]}" data-player-id="${id}">${getState().gameState.players[id].name}</button>`).join('');
        dom.targetModal.classList.remove('hidden');
    });
    dom.reversusIndividualEffectButtons.addEventListener('click', async (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const effect = e.target.dataset.effect;
        const { gameState } = getState();
        const myPlayerId = getLocalPlayerId();
        if (!myPlayerId) return;

        if (gameState.isPvp) {
            network.emitPlayCard({
                cardId: gameState.selectedCard.id,
                targetId: gameState.reversusTarget,
                options: { isIndividualLock: true, effectNameToApply: effect }
            });
        } else {
            await playCard(gameState.players[myPlayerId], gameState.selectedCard, gameState.reversusTarget, null, {
                isIndividualLock: true,
                effectNameToApply: effect
            });
            gameState.gamePhase = 'playing';
            renderAll();
        }
        cancelPlayerAction();
    });

    // --- Field Effect Target Modal ---
    dom.fieldEffectTargetButtons.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const { fieldEffectTargetResolver } = getState();
        if (fieldEffectTargetResolver) {
            fieldEffectTargetResolver(e.target.dataset.playerId);
            updateState('fieldEffectTargetResolver', null);
        }
    });

    // --- Universal Cancel Buttons ---
    [dom.targetCancelButton, dom.reversusTargetCancelButton, dom.reversusTotalChoiceCancel, dom.pulaCancelButton, dom.reversusIndividualCancelButton].forEach(btn => btn.addEventListener('click', cancelPlayerAction));

    // --- Sound Controls ---
    sound.setVolume(0.5); // Initial volume
    dom.muteButton.addEventListener('click', sound.toggleMute);
    dom.volumeSlider.addEventListener('input', (e) => sound.setVolume(parseFloat(e.target.value)));
    dom.nextTrackButton.addEventListener('click', sound.changeTrack);
    dom.musicPlayer.addEventListener('ended', sound.changeTrack);
    dom.fullscreenButton.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`));
            document.getElementById('fullscreen-icon-enter').classList.add('hidden');
            document.getElementById('fullscreen-icon-exit').classList.remove('hidden');
        } else {
            document.exitFullscreen();
            document.getElementById('fullscreen-icon-enter').classList.remove('hidden');
            document.getElementById('fullscreen-icon-exit').classList.add('hidden');
        }
    });

    // --- Info Tabs ---
    dom.infoModal.querySelector('.info-tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('info-tab-button')) {
            const tab = e.target.dataset.tab;
            dom.infoModal.querySelectorAll('.info-tab-button').forEach(b => b.classList.remove('active'));
            dom.infoModal.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`${tab}-tab-content`).classList.add('active');
        }
    });
    
    // --- Admin Panel Handlers ---
    dom.adminButton.addEventListener('click', () => {
        dom.adminPanelModal.classList.remove('hidden');
        network.emitAdminGetReports(); // Fetch reports when opening
    });
    dom.closeAdminPanelButton.addEventListener('click', () => dom.adminPanelModal.classList.add('hidden'));

    dom.adminPanelModal.querySelector('.info-tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('admin-tab-button')) {
            const tab = e.target.dataset.tab;
            dom.adminPanelModal.querySelectorAll('.admin-tab-button').forEach(b => b.classList.remove('active'));
            dom.adminPanelModal.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            if (tab === 'reports') {
                document.getElementById('admin-reports-tab-content').classList.add('active');
                 network.emitAdminGetReports();
            } else if (tab === 'users') {
                document.getElementById('admin-users-tab-content').classList.add('active');
            }
        }
    });
    
    document.getElementById('admin-reports-container').addEventListener('click', (e) => {
        const resolveButton = e.target.closest('.resolve-report-btn');
        if (resolveButton) {
            const reportId = resolveButton.dataset.reportId;
            network.emitAdminUpdateReportStatus(reportId, 'resolved');
        }
        const banButton = e.target.closest('.ban-user-from-report-btn');
        if (banButton) {
            const googleId = banButton.dataset.googleId;
            const username = banButton.dataset.username;
            if (confirm(`Tem certeza que deseja banir PERMANENTEMENTE o usuário ${username}?`)) {
                network.emitAdminBanUser(googleId);
            }
        }
    });

    document.getElementById('admin-user-search-button').addEventListener('click', () => {
        const query = document.getElementById('admin-user-search-input').value;
        if(query.trim()) {
            network.emitAdminSearchUsers(query.trim());
        }
    });

    document.getElementById('admin-user-search-results').addEventListener('click', (e) => {
        const banButton = e.target.closest('.ban-user-from-search-btn');
        if (banButton) {
            const googleId = banButton.dataset.googleId;
            const username = banButton.dataset.username;
            if (confirm(`Tem certeza que deseja banir PERMANENTEMENTE o usuário ${username}?`)) {
                network.emitAdminBanUser(googleId);
            }
        }
    });
    
    // --- Story/Event Listeners ---
    document.addEventListener('startStoryGame', (e) => {
        updateState('lastStoryGameOptions', e.detail); // Save options for restart
        initializeGame(e.detail.mode, e.detail.options);
    });
    document.addEventListener('storyWinLoss', (e) => {
        const { battle, won, reason } = e.detail;
        const { gameState } = getState();
        const state = getState();

        if (battle === 'tutorial_necroverso' && won) {
            achievements.grantAchievement('tutorial_win');
            renderStoryNode('post_tutorial');
        } else if (battle === 'tutorial_necroverso' && !won) {
            renderStoryNode('tutorial_loss');
        } else if (battle === 'contravox' && won) {
            achievements.grantAchievement('contravox_win');
            renderStoryNode('post_contravox_victory');
        } else if (battle === 'versatrix' && won) {
            if (!state.storyState.lostToVersatrix) {
                achievements.grantAchievement('versatrix_win');
            }
            renderStoryNode('post_versatrix_victory');
        } else if (battle === 'versatrix' && !won) {
            state.storyState.lostToVersatrix = true;
            achievements.grantAchievement('versatrix_loss');
            renderStoryNode('post_versatrix_defeat');
        } else if (battle === 'reversum' && won) {
            achievements.grantAchievement('reversum_win');
            renderStoryNode('post_reversum_victory');
        } else if (battle === 'necroverso_king' && won) {
            achievements.grantAchievement('true_end_beta');
            renderStoryNode('post_necroverso_king_victory');
        } else if (battle.startsWith('event_')) {
            if (won) {
                const currentMonth = new Date().getMonth();
                const progressKey = `event_progress_${currentMonth}`;
                let progress = JSON.parse(localStorage.getItem(progressKey)) || 0;
                progress++;
                localStorage.setItem(progressKey, JSON.stringify(progress));
                if (progress >= 3) {
                    network.emitClaimEventReward(currentEventData.rewardCode);
                }
            }
            showGameOver(won ? "Você venceu o desafio!" : "Você foi derrotado!", "Fim do Desafio", { text: 'Voltar ao Menu', action: 'menu' });
        } else {
             const buttonOptions = { text: 'Tentar Novamente', action: 'restart_duel' };
             showGameOver("Você foi derrotado...", "Derrota...", buttonOptions);
        }
    });

    // --- Language Switcher ---
    document.querySelector('.language-switcher').addEventListener('click', (e) => {
        if (e.target.classList.contains('lang-button')) {
            const lang = e.target.id.split('-')[1] + '-' + e.target.id.split('-')[2];
            setLanguage(lang);
        }
    });

    // --- Delegated click handler for dynamically generated content ---
    document.body.addEventListener('click', (e) => {
        // --- CHAT MODERATION ---
        if (e.target.closest('.chat-moderation-buttons')) {
            handleChatModerationClick(e);
        }
        
        // --- JOIN PVP ROOM ---
        const joinButton = e.target.closest('.join-room-button');
        if (joinButton) {
            network.emitJoinRoom(joinButton.dataset.roomId);
        }

        // --- RANKING PAGINATION & PROFILE VIEW ---
        const prevBtn = e.target.closest('#rank-prev-btn');
        const nextBtn = e.target.closest('#rank-next-btn');
        if (prevBtn || nextBtn) {
            const currentPage = parseInt(document.querySelector('.ranking-pagination span').textContent.match(/(\d+)/)[0]);
            const newPage = prevBtn ? currentPage - 1 : currentPage + 1;
            network.emitGetRanking(newPage);
        }
        const rankName = e.target.closest('.rank-name.clickable');
        if (rankName) {
            network.emitViewProfile(rankName.dataset.googleId);
        }

        // --- PROFILE TABS & ACTIONS ---
        const profileTab = e.target.closest('.profile-tab-button');
        if (profileTab) {
            const tab = profileTab.dataset.tab;
            document.querySelectorAll('.profile-tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
            profileTab.classList.add('active');
            document.getElementById(`${tab}-tab-content`).classList.add('active');
        }
        const lobbyProfileName = e.target.closest('.lobby-player-slot .player-name.clickable');
        if (lobbyProfileName) {
            network.emitViewProfile(lobbyProfileName.dataset.googleId);
        }

        // --- FRIEND ACTIONS (delegated) ---
        const addFriendBtn = e.target.closest('.add-friend-btn');
        if(addFriendBtn) {
            const targetUserId = parseInt(addFriendBtn.dataset.userId, 10);
            network.emitSendFriendRequest(targetUserId, (response) => {
                if(response.success) {
                    alert('Pedido de amizade enviado!');
                    addFriendBtn.textContent = t('profile.request_sent');
                    addFriendBtn.disabled = true;
                } else {
                    alert(`Erro: ${response.error}`);
                }
            });
        }
        const removeFriendBtn = e.target.closest('.remove-friend-btn');
        if(removeFriendBtn) {
            const targetUserId = parseInt(removeFriendBtn.dataset.userId, 10);
            const username = removeFriendBtn.closest('.friend-item')?.querySelector('.friend-name')?.textContent.trim() || 'este jogador';
            if(confirm(t('confirm.remove_friend', { username }))) {
                network.emitRemoveFriend(targetUserId);
            }
        }
        const viewProfileBtn = e.target.closest('.view-profile-btn');
        if(viewProfileBtn) {
            network.emitViewProfile(viewProfileBtn.dataset.googleId);
        }
        const sendMessageBtn = e.target.closest('.send-message-btn');
        if(sendMessageBtn) {
            openChatWindow(sendMessageBtn.dataset.userId, sendMessageBtn.dataset.username);
        }
        const acceptRequestBtn = e.target.closest('.accept-request-btn');
        if (acceptRequestBtn) {
            network.emitRespondToRequest(parseInt(acceptRequestBtn.dataset.requestId, 10), 'accept');
        }
        const declineRequestBtn = e.target.closest('.decline-request-btn');
        if (declineRequestBtn) {
            network.emitRespondToRequest(parseInt(declineRequestBtn.dataset.requestId, 10), 'decline');
        }
        const closeChatBtn = e.target.closest('.chat-window-close');
        if (closeChatBtn) {
            const userId = closeChatBtn.dataset.userId;
            const chatWindow = document.getElementById(`chat-window-${userId}`);
            if (chatWindow) chatWindow.remove();
            activeChatWindows.delete(userId);
            if (activeChatWindows.size === 0) dom.privateChatPanel.classList.add('hidden');
        }
        
        // --- FIELD EFFECT INDICATOR ---
        if (e.target.closest('.field-effect-indicator')) {
            handleFieldEffectIndicatorClick(e);
        }
    });
};
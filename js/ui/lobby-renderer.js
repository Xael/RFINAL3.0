import * as dom from '../core/dom.js';
import { getState, updateState } from '../core/state.js';
import { t } from '../core/i18n.js';
import * as network from '../core/network.js';

export const renderRoomList = (rooms) => {
    if (!dom.pvpRoomGridEl) return;
    if (rooms.length === 0) {
        dom.pvpRoomGridEl.innerHTML = `<p style="text-align: center; width: 100%;">${t('pvp.no_rooms')}</p>`;
        return;
    }

    const modeKeyMap = {
        'solo-2p': 'pvp.mode_2p',
        'solo-3p': 'pvp.mode_3p',
        'solo-4p': 'pvp.mode_4p',
        'duo': 'pvp.mode_duo'
    };

    dom.pvpRoomGridEl.innerHTML = rooms.map((room, index) => {
        const colorClass = `color-${(index % 4) + 1}`;
        const modeText = t(modeKeyMap[room.mode] || room.mode);
        return `
            <div class="room-card ${colorClass}">
                <h3>${room.name}</h3>
                <p>${t('pvp.room_card_mode', { mode: modeText })}</p>
                <p>${t('pvp.room_card_players', { count: room.playerCount })}</p>
                <button class="control-button join-room-button" data-room-id="${room.id}">${t('pvp.enter')}</button>
            </div>
        `;
    }).join('');
};


export const renderRanking = (rankingData) => {
    const { players, currentPage, totalPages } = rankingData;

    if (!players) {
        dom.rankingContainer.innerHTML = `<p>${t('ranking.error')}</p>`;
        dom.rankingPagination.innerHTML = '';
        return;
    }
    if (players.length === 0 && currentPage === 1) {
        dom.rankingContainer.innerHTML = `<p>${t('ranking.empty')}</p>`;
        dom.rankingPagination.innerHTML = '';
        return;
    }

    const tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>${t('ranking.header_rank')}</th>
                    <th colspan="2">${t('ranking.header_player')}</th>
                    <th>${t('ranking.header_victories')}</th>
                </tr>
            </thead>
            <tbody>
                ${players.map(player => {
                    let titleText = player.selected_title_code ? t(`titles.${player.selected_title_code}`) : '';
                    if (titleText.startsWith('titles.')) {
                        titleText = player.selected_title_code; // Fallback to the code itself
                    }
                    return `
                    <tr class="rank-${player.rank}">
                        <td class="rank-position">${player.rank}</td>
                        <td><img src="${player.avatar_url}" alt="Avatar" class="rank-avatar"></td>
                        <td>
                            <span class="rank-name clickable" data-google-id="${player.google_id}">${player.username}</span>
                            <span class="rank-player-title">${titleText}</span>
                        </td>
                        <td>${player.victories}</td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
    dom.rankingContainer.innerHTML = tableHTML;

    // Render pagination
    const paginationHTML = `
        <button id="rank-prev-btn" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>
        <span>Página ${currentPage} de ${totalPages}</span>
        <button id="rank-next-btn" ${currentPage >= totalPages ? 'disabled' : ''}>&gt;</button>
    `;
    dom.rankingPagination.innerHTML = paginationHTML;
};


export const updateLobbyUi = (roomData) => {
    const { clientId } = getState();
    const isHost = roomData.hostId === clientId;

    dom.lobbyTitle.textContent = t('pvp.lobby_title', { roomName: roomData.name });

    const playerGrid = document.querySelector('.lobby-player-grid');
    playerGrid.innerHTML = ''; 
    const playerSlots = ['player-1', 'player-2', 'player-3', 'player-4'];
    
    playerSlots.forEach((slot, index) => {
        const player = roomData.players.find(p => p.playerId === slot);
        const slotEl = document.createElement('div');
        slotEl.className = 'lobby-player-slot';
        slotEl.id = `lobby-player-${index + 1}`;
        
        if (player) {
            const hostStar = player.id === roomData.hostId ? ' <span class="master-star">★</span>' : '';
            let playerTitleText = player.title_code ? t(`titles.${player.title_code}`) : '';
            if (playerTitleText.startsWith('titles.')) {
                playerTitleText = player.title_code;
            }
            const playerTitle = playerTitleText ? `<span class="player-title">${playerTitleText}</span>` : '';
            slotEl.innerHTML = `
                <div>
                    <span class="player-name clickable" data-google-id="${player.googleId}">${player.username}</span>${hostStar}
                </div>
                ${playerTitle}
            `;
        } else {
            slotEl.textContent = t('pvp.waiting_player');
        }
        playerGrid.appendChild(slotEl);
    });

    dom.lobbyGameModeEl.value = roomData.mode;
    dom.lobbyGameModeEl.disabled = !isHost;

    const playerCount = roomData.players.length;
    let canStart = false;
    switch (roomData.mode) {
        case 'solo-2p': canStart = playerCount === 2; break;
        case 'solo-3p': canStart = playerCount === 3; break;
        case 'solo-4p': case 'duo': canStart = playerCount === 4; break;
    }
    dom.lobbyStartGameButton.disabled = !(isHost && canStart);
};

export const addLobbyChatMessage = ({ speaker, message, speakerId }) => {
    const { mutedUsers, userProfile } = getState();
    if (speakerId && mutedUsers.has(speakerId.toString())) {
        return; // Não renderiza a mensagem se o usuário estiver mutado
    }

    const messageEl = document.createElement('div');
    messageEl.className = 'log-message dialogue'; // Reutilizando classes de estilo
    const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const isMuted = speakerId && mutedUsers.has(speakerId.toString());

    const moderationButtons = (speakerId && speakerId !== userProfile?.id) ? `
        <div class="chat-moderation-buttons">
            <button class="chat-report-button" data-user-id="${speakerId}" data-username="${speaker}" title="Denunciar Jogador">
                <svg viewBox="0 0 24 24"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"></path></svg>
            </button>
            <button class="chat-mute-button" data-user-id="${speakerId}" title="${isMuted ? 'Desmutar' : 'Silenciar'} Jogador">
                ${isMuted 
                    ? `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path></svg>`
                    : `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>`
                }
            </button>
        </div>
    ` : '';
    
    messageEl.innerHTML = `
        <div class="log-speaker-container">
            <strong>${speaker}:</strong>
            ${moderationButtons}
        </div>
        <span>${sanitizedMessage}</span>`;

    dom.lobbyChatHistoryEl.appendChild(messageEl);
    dom.lobbyChatHistoryEl.scrollTop = dom.lobbyChatHistoryEl.scrollHeight;
};
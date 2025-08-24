// js/ui/profile-renderer.js
import * as dom from '../core/dom.js';
import { t, getCurrentLanguage } from '../core/i18n.js';
import * as network from '../core/network.js';
import { getState } from '../core/state.js';
import { openChatWindow } from './ui-handlers.js';

function xpForLevel(level) {
    if (level <= 1) return 0;
    return (level - 1) * (level - 1) * 100;
}

export function renderProfile(profileData) {
    if (!profileData) return;
    const { userProfile: myProfile } = getState();
    if (!myProfile) return;
    const isMyProfile = myProfile.google_id === profileData.google_id;

    // --- 1. Renderizar o Display do Cabeçalho (se for meu perfil) ---
    if (isMyProfile) {
        if (dom.userProfileDisplay.classList.contains('hidden')) {
            dom.userProfileDisplay.classList.remove('hidden');
        }
        dom.userAvatar.src = profileData.avatar_url || '';
        dom.userName.textContent = profileData.username || t('game.you');
        dom.userLevel.textContent = profileData.level || 1;
        const currentLevelXp = xpForLevel(profileData.level);
        const nextLevelXp = xpForLevel(profileData.level + 1);
        const xpIntoLevel = profileData.xp - currentLevelXp;
        const xpForThisLevel = nextLevelXp - currentLevelXp;
        const xpPercentage = xpForThisLevel > 0 ? (xpIntoLevel / xpForThisLevel) * 100 : 0;
        dom.xpBarFill.style.width = `${Math.min(100, xpPercentage)}%`;
        dom.xpBarText.textContent = `${profileData.xp} / ${nextLevelXp} XP`;
    }

    // --- 2. Renderizar o Modal de Perfil Detalhado ---
    const lang = getCurrentLanguage().replace('_', '-');
    const joinDate = new Date(profileData.created_at).toLocaleDateString(lang);
    const selectedTitleText = profileData.selected_title_code ? t(`titles.${profileData.selected_title_code}`) : '';


    const titlesHTML = isMyProfile ? (profileData.titles || []).reduce((acc, title) => {
        if (!acc[title.line]) acc[title.line] = '';
        const titleName = t(`titles.${title.code}`) || title.name;
        acc[title.line] += `
            <li>
                <input type="radio" id="title-${title.code}" name="selected-title" value="${title.code}" ${profileData.selected_title_code === title.code ? 'checked' : ''}>
                <label for="title-${title.code}">${titleName}</label>
            </li>`;
        return acc;
    }, {}) : {};
    
    const titlesSectionHTML = isMyProfile ? `
        <div class="profile-section">
            <h3>${t('profile.select_title')}</h3>
            <form id="title-selection-form">
                ${Object.entries(titlesHTML).map(([line, lis]) => `<h4>${line}</h4><ul class="profile-titles-list">${lis}</ul>`).join('') || `<p>${t('profile.no_titles')}</p>`}
            </form>
        </div>` : '';

    const historyHTML = (profileData.history || []).map(match => `
        <li>
            <span class="${match.outcome === 'Vitória' ? 'history-outcome-win' : 'history-outcome-loss'}">${t(match.outcome === 'Vitória' ? 'profile.outcome_win' : 'profile.outcome_loss')}</span>
            <span>${match.mode}</span>
            <span>${new Date(match.date).toLocaleDateString(lang)}</span>
        </li>`
    ).join('');

    dom.profileDataContainer.innerHTML = `
        <div class="profile-grid">
            <div class="profile-sidebar">
                <img src="${profileData.avatar_url}" alt="${t('profile.avatar_alt')}" class="profile-avatar">
                <h2 class="profile-username">${profileData.username}</h2>
                <p class="profile-title-display">${selectedTitleText}</p>
                <p class="profile-joindate">${t('profile.since', { date: joinDate })}</p>
            </div>
            <div class="profile-main-content">
                <div class="profile-stats-grid">
                    <div class="profile-stat-item"><h4>${t('profile.level')}</h4><p>${profileData.level}</p></div>
                    <div class="profile-stat-item"><h4>${t('profile.experience')}</h4><p>${profileData.xp}</p></div>
                    <div class="profile-stat-item"><h4>${t('profile.victories')}</h4><p>${profileData.victories}</p></div>
                    <div class="profile-stat-item"><h4>${t('profile.defeats')}</h4><p>${profileData.defeats}</p></div>
                </div>
                ${titlesSectionHTML}
                <div class="profile-section">
                    <h3>${t('profile.match_history')}</h3>
                    <ul class="profile-history-list">${historyHTML || `<li>${t('profile.no_history')}</li>`}</ul>
                </div>
            </div>
        </div>`;

    if (isMyProfile) {
        document.getElementById('title-selection-form')?.addEventListener('change', (e) => {
            if (e.target.name === 'selected-title') network.emitSetSelectedTitle(e.target.value);
        });
    }

    const actionButtonsContainer = document.getElementById('profile-action-buttons');
    if (!isMyProfile) {
        let buttonHTML = '';
        switch(profileData.friendshipStatus) {
            case 'friends':
                buttonHTML = `<button class="control-button cancel remove-friend-btn" data-user-id="${profileData.id}">${t('profile.remove_friend')}</button>`;
                break;
            case 'pending':
                buttonHTML = `<button class="control-button" disabled>${t('profile.request_sent')}</button>`;
                break;
            default: // 'none'
                buttonHTML = `<button class="control-button add-friend-btn" data-user-id="${profileData.id}">${t('profile.add_friend')}</button>`;
                break;
        }
        actionButtonsContainer.innerHTML = buttonHTML;
    } else {
        actionButtonsContainer.innerHTML = '';
    }
}


export function renderSearchResults(results) {
    const container = document.getElementById('friends-search-results');
    if (results.length === 0) {
        container.innerHTML = `<p>${t('friends.no_results')}</p>`;
        return;
    }
    container.innerHTML = results.map(user => `
        <div class="friend-item">
            <img src="${user.avatar_url}" alt="Avatar" class="friend-avatar">
            <div class="friend-info">
                <span class="friend-name">${user.username}</span>
            </div>
            <div class="friend-actions">
                <button class="control-button add-friend-btn" data-user-id="${user.id}">${t('friends.add')}</button>
            </div>
        </div>
    `).join('');
}

export function renderFriendsList(friends) {
    const container = document.getElementById('friends-list-container');
    if (friends.length === 0) {
        container.innerHTML = `<p>${t('friends.no_friends')}</p>`;
        return;
    }
    container.innerHTML = friends.map(friend => {
        const titleText = friend.selected_title_code ? t(`titles.${friend.selected_title_code}`) : '';
        return `
            <div class="friend-item" id="friend-item-${friend.id}">
                <img src="${friend.avatar_url}" alt="Avatar" class="friend-avatar">
                <div class="friend-info">
                    <span class="friend-name">
                        <div class="friend-status ${friend.isOnline ? 'online' : 'offline'}" id="friend-status-${friend.id}" title="${t(friend.isOnline ? 'friends.status_online' : 'friends.status_offline')}"></div>
                        ${friend.username}
                    </span>
                    <span class="friend-title">${titleText}</span>
                </div>
                <div class="friend-actions">
                    <button class="control-button view-profile-btn" data-google-id="${friend.google_id}">${t('friends.view_profile')}</button>
                    <button class="control-button send-message-btn" data-user-id="${friend.id}" data-username="${friend.username}" ${!friend.isOnline ? 'disabled' : ''}>${t('friends.send_message')}</button>
                    <button class="control-button cancel remove-friend-btn" data-user-id="${friend.id}">${t('friends.remove')}</button>
                </div>
            </div>
        `}).join('');
}

export function renderFriendRequests(requests) {
    const container = dom.friendRequestsListContainer;
    if (!container) return;
    if (!requests || requests.length === 0) {
        container.innerHTML = `<p>${t('friends.no_requests')}</p>`;
        return;
    }
    container.innerHTML = requests.map(req => `
        <div class="friend-item friend-request-item" id="friend-request-${req.id}">
            <img src="${req.avatar_url}" alt="Avatar" class="friend-avatar">
            <div class="friend-info">
                <span class="friend-name">${req.username}</span>
            </div>
            <div class="friend-actions">
                <button class="control-button btn-p3-color accept-request-btn" data-request-id="${req.id}">${t('friends.accept')}</button>
                <button class="control-button cancel decline-request-btn" data-request-id="${req.id}">${t('friends.decline')}</button>
            </div>
        </div>
    `).join('');
}

export function updateFriendStatusIndicator(userId, isOnline) {
    const statusEl = document.getElementById(`friend-status-${userId}`);
    const messageBtn = document.querySelector(`.send-message-btn[data-user-id="${userId}"]`);
    if (statusEl) {
        statusEl.className = `friend-status ${isOnline ? 'online' : 'offline'}`;
        statusEl.title = t(isOnline ? 'friends.status_online' : 'friends.status_offline');
    }
    if (messageBtn) {
        messageBtn.disabled = !isOnline;
    }
}

export function addPrivateChatMessage(message) {
    const { userProfile } = getState();
    if (!userProfile) return;

    const isSentByMe = message.senderId === userProfile.id;
    const chatPartnerId = isSentByMe ? message.recipientId : message.senderId;
    const chatPartnerUsername = isSentByMe ? null : message.senderUsername;

    let chatWindow = document.getElementById(`chat-window-${chatPartnerId}`);
    // If window doesn't exist and the message is for me, open it.
    if (!chatWindow && !isSentByMe) {
        openChatWindow(chatPartnerId, chatPartnerUsername);
        chatWindow = document.getElementById(`chat-window-${chatPartnerId}`);
    }

    if (!chatWindow) {
        console.log("Chat window not found for message:", message);
        return;
    }
    
    const messagesContainer = chatWindow.querySelector('.chat-window-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isSentByMe ? 'sent' : 'received'}`;
    // Sanitize message content before inserting
    messageEl.textContent = message.content;
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
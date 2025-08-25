import { getState } from './state.js';
import * as dom from './dom.js';
import * as config from './config.js';
import { createDeck } from '../game-logic/deck.js';

/**
 * Handles dealing a card from a specified deck, reshuffling from the discard pile if empty.
 * This function is now more robust and centralized.
 * @param {('value'|'effect')} deckType - The type of deck to draw from.
 * @returns {object | null} The card object, or null if no cards are available.
 */
export function dealCard(deckType) {
    const { gameState } = getState();
    if (gameState.decks[deckType].length === 0) {
        if (gameState.discardPiles[deckType].length === 0) {
            const configDeck = deckType === 'value' ? config.VALUE_DECK_CONFIG : config.EFFECT_DECK_CONFIG;
            gameState.decks[deckType] = shuffle(createDeck(configDeck, deckType));
            updateLog(`O baralho de ${deckType} e o descarte estavam vazios. Um novo baralho foi criado.`);
            if (gameState.decks[deckType].length === 0) {
                 console.error(`Falha catastrófica ao recriar o baralho de ${deckType}`);
                 return null;
            }
        } else {
            gameState.decks[deckType] = shuffle([...gameState.discardPiles[deckType]]);
            gameState.discardPiles[deckType] = [];
        }
    }
    return gameState.decks[deckType].pop();
}


/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param {Array} array The array to shuffle.
 * @returns {Array} The shuffled array.
 */
export const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

/**
 * Adds a message to the in-game log and updates the UI. Can also be called without a message to just re-render from the current state.
 * @param {string | object} [logEntry] - The message string or a log object with metadata.
 */
export const updateLog = (logEntry) => {
    const { gameState, mutedUsers } = getState();
    if (!gameState) return;

    if (logEntry) {
        if (gameState.isPvp) {
            if (logEntry.type === 'dialogue') {
                gameState.log.unshift(logEntry);
            }
        } else {
            const entry = typeof logEntry === 'string' ? { type: 'system', message: logEntry } : logEntry;
            gameState.log.unshift(entry);
        }
    }
    
    if (gameState.log.length > 50) {
        gameState.log.pop();
    }
    
    const emojiMap = {
        ':)': '😊',
        ':(': '😞',
        ';(': '😭',
        's2': '❤️',
        '<3': '❤️'
    };

    dom.logEl.innerHTML = gameState.log.map(m => {
        const isMuted = m.speakerId && mutedUsers.has(m.speakerId.toString());
        const mutedClass = isMuted ? 'muted' : '';
        const sanitizedMessage = String(m.message || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const emojiMessage = sanitizedMessage.replace(/:\)|:\(|;\(|s2|&lt;3|<3/gi, (match) => emojiMap[match.toLowerCase()] || match);

        if (m.type === 'dialogue' && m.speaker) {
            const speakerClass = config.AI_CHAT_PERSONALITIES.hasOwnProperty(m.speaker) 
                ? `speaker-${m.speaker}` 
                : `speaker-player-1`;
            
            const moderationButtons = (m.speakerId && m.speakerId !== getState().userProfile?.id) ? `
                <div class="chat-moderation-buttons">
                    <button class="chat-report-button" data-user-id="${m.speakerId}" data-username="${m.speaker}" title="Denunciar Jogador">
                        <svg viewBox="0 0 24 24"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"></path></svg>
                    </button>
                    <button class="chat-mute-button" data-user-id="${m.speakerId}" title="${isMuted ? 'Desmutar' : 'Silenciar'} Jogador">
                        ${isMuted 
                            ? `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path></svg>`
                            : `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>`
                        }
                    </button>
                </div>
            ` : '';

            return `<div class="log-message dialogue ${speakerClass} ${mutedClass}">
                        <div class="log-speaker-container">
                            <strong>${m.speaker}:</strong>
                            ${moderationButtons}
                        </div>
                        <span>${emojiMessage}</span>
                    </div>`;
        }
        return `<div class="log-message system">${emojiMessage}</div>`;
    }).join('');

    dom.logEl.scrollTop = 0;
};
import { getState } from '../core/state.js';

/**
 * Gets the image URL for a given card.
 * @param {object} card - The card object.
 * @param {boolean} isHidden - Whether the card should be rendered face-down.
 * @returns {string} The URL of the card image.
 */
export const getCardImageUrl = (card, isHidden) => {
    if (isHidden) {
        return card.type === 'value' ? 'verso_valor.png' : 'verso_efeito.png';
    }
    if (card.name === 'NECRO_X_CURSE' || card.name === 'NECRO X') {
        return 'cartanecroverso.png';
    }
    if (card.name === 'Carta da Versatrix') {
        return 'cartaversatrix.png';
    }
    const cardNameSanitized = card.name.toString().toLowerCase().replace(/\s/g, '');
    return `frente_${cardNameSanitized}.png`;
};

/**
 * Creates the HTML for a single card.
 * @param {object} card - The card object to render.
 * @param {string} context - The context in which the card is being rendered (e.g., 'player-hand', 'opponent-hand', 'play-zone').
 * @param {string} playerId - The ID of the player associated with the card.
 * @returns {string} The HTML string for the card.
 */
export const renderCard = (card, context, playerId) => {
    const { gameState, playerId: myPlayerId } = getState();
    const classList = ['card', card.type];

    let isHidden;
    if (context === 'play-zone' || context === 'modal') {
        // Cards in the play zone or a modal are ALWAYS face up for everyone.
        isHidden = false;
    } else if (gameState.isPvp) {
        // In PvP, visibility is determined by the session's player ID and server data.
        const isMyCard = playerId === myPlayerId;
        isHidden = !isMyCard && !(gameState.revealedHands || []).includes(playerId);
    } else {
        // In single-player, visibility depends on the `isHuman` flag.
        const player = gameState.players[playerId];
        const isHumanPlayer = player ? player.isHuman : false;
        isHidden = !isHumanPlayer && !(gameState.revealedHands || []).includes(playerId);
    }

    // Logic to obscure cards (Contravox ability) - also needs to be robust
    const isMyTurnToSeeObscured = gameState.isPvp ? (playerId === myPlayerId) : (gameState.players[playerId]?.isHuman);
    const isCardObscuredByContravox = isMyTurnToSeeObscured && context === 'player-hand' && gameState.player1CardsObscured;

    let isCardDisabled = card.isBlocked || false;
    if (isMyTurnToSeeObscured && context === 'player-hand') {
        const player = gameState.players[playerId];
        const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
        
        if (card.type === 'value' && (valueCardsInHandCount <= 1 || player.playedValueCardThisTurn)) {
             isCardDisabled = true;
        }
    }
    
    if (isMyTurnToSeeObscured && context === 'player-hand' && gameState.selectedCard?.id === card.id) classList.push('selected');
    if (isCardDisabled) classList.push('disabled');
    if (context === 'modal') classList.push('modal-card');
    
    if (card.name === 'Reversus Total') {
        classList.push('reversus-total-card');
        if (isMyTurnToSeeObscured) {
            classList.push('reversus-total-glow');
        }
    }
    
    if (card.isLocked) {
        classList.push('locked');
    }
    
    if (context === 'play-zone' && card.casterId) {
        const caster = gameState.players[card.casterId];
        if (caster && caster.aiType === 'necroverso') {
            classList.push('necro-glow');
        }
    }
    
    let cardTitle = '';
    if (isCardObscuredByContravox && card.type === 'effect') {
        cardTitle = 'title="Não é possível saber qual efeito será aplicado..."';
    }
    if (card.name === 'NECRO_X_CURSE') {
        cardTitle = 'title="Esta carta está amaldiçoada e não pode ser jogada."';
    }


    let cardStyle;
    if (isCardObscuredByContravox) {
        cardStyle = `style="background-image: url('cartacontravox.png');"`;
    } else {
        cardStyle = `style="background-image: url('./${getCardImageUrl(card, isHidden)}');"`;
    }
    
    const maximizeButtonHTML = !isHidden && !isCardObscuredByContravox ? '<div class="card-maximize-button" title="Ver carta"></div>' : '';

    return `<div class="${classList.join(' ')}" data-card-id="${card.id}" ${cardTitle} ${isCardDisabled ? 'aria-disabled="true"' : ''} ${cardStyle}>
                ${maximizeButtonHTML}
            </div>`;
};
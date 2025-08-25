// js/ui/admin-renderer.js
import * as dom from '../core/dom.js';

function sanitize(text) {
    const element = document.createElement('div');
    element.innerText = text;
    return element.innerHTML;
}

export function renderAdminReports(reports) {
    const container = document.getElementById('admin-reports-container');
    if (!container) return;

    if (!reports || reports.length === 0) {
        container.innerHTML = '<p>Nenhuma denúncia pendente. Bom trabalho!</p>';
        return;
    }

    container.innerHTML = reports.map(report => {
        const reportDate = new Date(report.created_at).toLocaleString();
        const chatContext = (report.chat_context || [])
            .map(msg => `<div><strong>${sanitize(msg.speaker || 'Sistema')}:</strong> ${sanitize(msg.message || '')}</div>`)
            .join('');

        return `
            <div class="admin-report-item">
                <div class="admin-report-header">
                    <div class="admin-report-info">
                        <p><strong>ID:</strong> ${report.id} | <strong>Data:</strong> ${reportDate}</p>
                        <p><strong>Denunciou:</strong> ${sanitize(report.reporter_username)}</p>
                        <p><strong>Denunciado:</strong> ${sanitize(report.reported_username)}</p>
                    </div>
                    <div class="admin-report-actions">
                        <button class="control-button secondary resolve-report-btn" data-report-id="${report.id}">Marcar como Resolvida</button>
                        <button class="control-button cancel ban-user-from-report-btn" data-google-id="${report.reported_google_id}" data-username="${sanitize(report.reported_username)}">Banir Usuário</button>
                    </div>
                </div>
                <div class="admin-chat-context">
                    <h4>Contexto do Chat:</h4>
                    ${chatContext}
                </div>
            </div>
        `;
    }).join('');
}

export function renderAdminUserSearchResults(users) {
    const container = document.getElementById('admin-user-search-results');
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = '<p>Nenhum usuário encontrado.</p>';
        return;
    }

    container.innerHTML = users.map(user => `
         <div class="admin-report-item">
            <div class="admin-report-header">
                <div class="admin-report-info">
                    <p><strong>Usuário:</strong> ${sanitize(user.username)}</p>
                    <p><strong>ID Google:</strong> ${sanitize(user.google_id)}</p>
                    <p><strong>Banido:</strong> ${user.is_banned ? 'Sim' : 'Não'}</p>
                </div>
                 <div class="admin-report-actions">
                    <button class="control-button cancel ban-user-from-search-btn" data-google-id="${user.google_id}" data-username="${sanitize(user.username)}" ${user.is_banned ? 'disabled' : ''}>
                        ${user.is_banned ? 'Já Banido' : 'Banir Usuário'}
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

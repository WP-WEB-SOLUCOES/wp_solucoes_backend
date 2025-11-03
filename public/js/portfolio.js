// /public/js/portfolio.js
// Lógica de Filtragem e Popups do Portfólio

// Variável para rastrear o estado do popup (GLOBAL DENTRO DESTE MÓDULO)
let isPopupOpen = false;

// =======================================================
// 1. FUNÇÕES GLOBAIS DE POPUP (ATRIBUÍDAS A 'window')
// =======================================================

/**
 * Abre o popup. Adiciona o estado ao histórico do navegador.
 * Nota: Atribuído a window.openPopup para funcionar com onclick="" no HTML.
 * @param {string} popupId - O ID do elemento popup-overlay a ser aberto.
 */
window.openPopup = function(popupId) {
    const popup = document.getElementById(popupId);
    if (!popup) return;

    popup.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Adiciona ao histórico APENAS se não estivermos já em um estado de popup
    if (!isPopupOpen) {
        window.history.pushState({ popup: true, id: popupId }, '', `#${popupId}`);
        isPopupOpen = true;
    }
    
    // Foca no popup para melhor acessibilidade
    setTimeout(() => {
        popup.focus();
    }, 100);
}

/**
 * Fecha o popup. Usa window.history.back() para gerenciar o estado.
 * Nota: Atribuído a window.closePopup para funcionar com onclick="" no HTML.
 * @param {string} popupId - O ID do elemento popup-overlay a ser fechado.
 */
window.closePopup = function(popupId) {
    const popup = document.getElementById(popupId);
    if (!popup) return;

    // Remove a classe 'active'
    popup.classList.remove('active');
    
    // Se o popup foi aberto usando history.pushState, voltamos no histórico para limpar o estado.
    if (isPopupOpen) {
        isPopupOpen = false; 
        window.history.back(); 
    } else {
        // Se foi fechado diretamente (sem history.back), ajustamos o scroll
        document.body.style.overflow = 'auto';
    }
}


// =======================================================
// 2. LÓGICA DE FILTRAGEM E LISTENERS DE FECHAMENTO
// =======================================================

function setupPortfolioFiltering() {
    document.querySelectorAll('.portfolio-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // 1. Atualiza a aba ativa
            document.querySelectorAll('.portfolio-tab').forEach(t => {
                t.classList.remove('active');
            });
            this.classList.add('active');
            
            // 2. Filtra os itens
            const category = this.getAttribute('data-category');
            const items = document.querySelectorAll('.portfolio-item');
            
            items.forEach(item => {
                const itemCategory = item.getAttribute('data-category');
                item.classList.remove('animate'); 
                
                if (category === 'all' || itemCategory === category) {
                    item.style.display = 'block';
                    // Re-aplica a animação após um pequeno timeout
                    setTimeout(() => {
                        item.classList.add('animate');
                    }, 10);
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
}

function setupClosingEvents() {
    // Fechar popup ao clicar fora (overlay)
    document.querySelectorAll('.popup-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                const currentId = this.id;
                window.closePopup(currentId);
            }
        });
    });

    // Listener principal para o botão "Voltar" do navegador (popstate)
    window.addEventListener('popstate', function(e) {
        const activePopup = document.querySelector('.popup-overlay.active');
        
        if (activePopup && (!e.state || !e.state.popup)) {
            activePopup.classList.remove('active');
            document.body.style.overflow = 'auto';
            isPopupOpen = false;
        }
    });

    // Fechar com ESC (Desktop)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const activePopup = document.querySelector('.popup-overlay.active');
            if (activePopup) {
                window.closePopup(activePopup.id); 
            }
        }
    });
}


// =======================================================
// 3. INICIALIZAÇÃO
// =======================================================

document.addEventListener('DOMContentLoaded', function() {
    setupPortfolioFiltering();
    setupClosingEvents();
    
    // Simula o clique em "All" (todos) para garantir que o filtro inicial seja aplicado
    document.querySelector('.portfolio-tab[data-category="all"]')?.click();
});
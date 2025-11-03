// ===================================
// CÓDIGO JAVASCRIPT COMPLETO E CORRIGIDO
// ===================================

// ===================================
// FUNCIONALIDADES GERAIS (Scroll, Menu, Animações)
// ===================================

// Progress Bar
window.addEventListener('scroll', function() {
    const winHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset;
    const trackLength = docHeight - winHeight;
    // Previne divisão por zero em páginas muito curtas
    const progress = trackLength > 0 ? Math.floor(scrollTop / trackLength * 100) : 100;
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.width = progress + '%';
    }
});

// Header scroll effect
window.addEventListener('scroll', function() {
    const header = document.getElementById('header');
    if (header) {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }
});

// Mobile menu toggle
document.getElementById('mobileToggle')?.addEventListener('click', function() {
    const navActions = document.getElementById('navActions');
    if (navActions) {
        navActions.classList.toggle('active');
        
        // Change icon
        const icon = this.querySelector('i');
        if (icon) {
            if (navActions.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
    }
});

// Scroll animations
function checkScroll() {
    const elements = document.querySelectorAll('.feature-card, .service-card, .process-step, .portfolio-item');
    
    elements.forEach(element => {
        const elementTop = element.getBoundingClientRect().top;
        const elementVisible = 150;
        
        if (elementTop < window.innerHeight - elementVisible) {
            element.classList.add('animate');
        }
    });
}

window.addEventListener('scroll', checkScroll);

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-actions a').forEach(link => {
    link.addEventListener('click', function() {
        const navActions = document.getElementById('navActions');
        const mobileToggle = document.getElementById('mobileToggle');
        
        if (navActions && mobileToggle) {
             // Fecha o menu
            navActions.classList.remove('active');
            
            // Restaura o ícone
            const icon = mobileToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
    });
});


// ===================================
// PORTFOLIO E POPUPS (CORRIGIDO)
// ===================================

// Variável para rastrear o estado do popup (ajuda a evitar pushState duplicado)
let isPopupOpen = false;

// Portfolio filtering
document.querySelectorAll('.portfolio-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        // Update active tab
        document.querySelectorAll('.portfolio-tab').forEach(t => {
            t.classList.remove('active');
        });
        this.classList.add('active');
        
        // Filter items
        const category = this.getAttribute('data-category');
        const items = document.querySelectorAll('.portfolio-item');
        
        items.forEach(item => {
            const itemCategory = item.getAttribute('data-category');
            if (category === 'all' || itemCategory === category) {
                // Lógica de exibição e animação
                item.style.display = 'block';
                item.classList.remove('animate'); // Reseta a animação
                setTimeout(() => {
                    item.classList.add('animate');
                }, 10);
            } else {
                item.style.display = 'none';
                item.classList.remove('animate');
            }
        });
    });
});

// Funções do Popup
function openPopup(popupId) {
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

function closePopup(popupId) {
    const popup = document.getElementById(popupId);
    if (!popup) return;

    // Remove a classe 'active'
    popup.classList.remove('active');
    document.body.style.overflow = 'auto';
    
    // Se o popup foi aberto usando history.pushState, voltamos no histórico para limpar o estado.
    if (isPopupOpen) {
        isPopupOpen = false; 
        window.history.back(); 
    }
    
    // Limpeza de overflow caso o history.back não o faça por algum motivo
    const activePopupCount = document.querySelectorAll('.popup-overlay.active').length;
    if (activePopupCount === 0) {
         document.body.style.overflow = 'auto';
    }
}

// Fechar popup ao clicar fora (overlay)
function enhancePopupMobile() {
    document.querySelectorAll('.popup-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            // Garante que o clique foi no overlay e não no conteúdo interno
            if (e.target === this) {
                 const currentId = this.id;
                 if (isPopupOpen) {
                     closePopup(currentId);
                 } else {
                    this.classList.remove('active');
                    document.body.style.overflow = 'auto';
                 }
            }
        });
    });
}


// Listener principal para o botão "Voltar" do navegador (popstate)
window.addEventListener('popstate', function(e) {
    const activePopup = document.querySelector('.popup-overlay.active');
    
    // Se não há um estado de popup no histórico, e há um popup ativo, fecha.
    if (activePopup && (!e.state || !e.state.popup)) {
        activePopup.classList.remove('active');
        document.body.style.overflow = 'auto';
        isPopupOpen = false;
    }
});


// Fechar com ESC (Desktop) - Usa o fluxo de closePopup para gerenciar o histórico.
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const activePopup = document.querySelector('.popup-overlay.active');
        if (activePopup) {
            closePopup(activePopup.id); 
        }
    }
});

// Inicialização geral ao carregar o DOM
document.addEventListener('DOMContentLoaded', function() {
    // Inicializa a funcionalidade de fechar por clique no overlay
    enhancePopupMobile();
    
    // Inicializa as animações de scroll
    checkScroll(); 
    
    // Simula o clique em "All" (todos) para garantir que o filtro inicial seja aplicado
    document.querySelector('.portfolio-tab[data-category="all"]')?.click();
    
    // Logs originais (pode remover no ambiente de produção)
    const portfolioItems = document.querySelectorAll('.portfolio-item');
    console.log('Portfolio items found:', portfolioItems.length);
    portfolioItems.forEach(item => {
        const category = item.getAttribute('data-category');
        console.log('Item category:', category, item);
    });
});
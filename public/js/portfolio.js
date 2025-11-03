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
                item.style.display = 'block';
                // Add animation for appearing items
                setTimeout(() => {
                    item.classList.add('animate');
                }, 100);
            } else {
                item.style.display = 'none';
            }
        });
    });
});

// Funções do Popup (atualizadas para mobile)
function openPopup(popupId) {
    const popup = document.getElementById(popupId);
    popup.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Adiciona ao histórico para o botão voltar funcionar
    window.history.pushState({ popup: true }, '');
    
    // Foca no popup para melhor acessibilidade
    setTimeout(() => {
        popup.focus();
    }, 100);
}

function closePopup(popupId) {
    const popup = document.getElementById(popupId);
    popup.classList.remove('active');
    document.body.style.overflow = 'auto';
    
    // Volta no histórico
    window.history.back();
}

// Fechar com ESC (mantém para desktop)
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.popup-overlay').forEach(popup => {
            closePopup(popup.id);
        });
    }
});

// Fechar popup com tecla ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.popup-overlay').forEach(popup => {
            popup.classList.remove('active');
        });
        document.body.style.overflow = 'auto';
    }
});

// Initialize portfolio items with data-category attributes
document.addEventListener('DOMContentLoaded', function() {
    const portfolioItems = document.querySelectorAll('.portfolio-item');
    console.log('Portfolio items found:', portfolioItems.length);
    
    portfolioItems.forEach(item => {
        const category = item.getAttribute('data-category');
        console.log('Item category:', category, item);
    });
});
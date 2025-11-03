// /public/js/main.js
// Funcionalidades: Header, Menu Mobile, Progress Bar e Animações de Scroll.

// ===================================
// FUNCIONALIDADES GERAIS
// ===================================

// Progress Bar
window.addEventListener('scroll', function() {
    const winHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset;
    const trackLength = docHeight - winHeight;
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

// Scroll animations (Função auxiliar)
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

// Event Listeners para Animações e Menu
window.addEventListener('scroll', checkScroll);
window.addEventListener('load', checkScroll); // Garante que elementos visíveis no load já animem

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-actions a').forEach(link => {
    link.addEventListener('click', function() {
        const navActions = document.getElementById('navActions');
        const mobileToggle = document.getElementById('mobileToggle');
        
        if (navActions && mobileToggle && navActions.classList.contains('active')) {
             // Fecha o menu e restaura o ícone
            navActions.classList.remove('active');
            const icon = mobileToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
    });
});
// Progress Bar
window.addEventListener('scroll', function() {
    const winHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset;
    const trackLength = docHeight - winHeight;
    const progress = Math.floor(scrollTop / trackLength * 100);
    document.getElementById('progressBar').style.width = progress + '%';
});

// Header scroll effect
window.addEventListener('scroll', function() {
    const header = document.getElementById('header');
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

// Mobile menu toggle
document.getElementById('mobileToggle').addEventListener('click', function() {
    const navActions = document.getElementById('navActions');
    navActions.classList.toggle('active');
    
    // Change icon
    const icon = this.querySelector('i');
    if (navActions.classList.contains('active')) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
    } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
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
window.addEventListener('load', checkScroll);

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-actions a').forEach(link => {
    link.addEventListener('click', function() {
        const navActions = document.getElementById('navActions');
        const mobileToggle = document.getElementById('mobileToggle');
        const icon = mobileToggle.querySelector('i');
        
        navActions.classList.remove('active');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    });
});

// Melhora a experiência mobile nos popups
function enhancePopupMobile() {
    // Fecha popup ao clicar fora (melhor para mobile)
    document.querySelectorAll('.popup-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
    });
    
    // Fecha popup com botão voltar do navegador mobile
    window.addEventListener('popstate', function() {
        document.querySelectorAll('.popup-overlay').forEach(popup => {
            popup.classList.remove('active');
        });
        document.body.style.overflow = 'auto';
    });
    
    // Previne scroll do body quando popup está aberto
    document.querySelectorAll('.portfolio-item').forEach(item => {
        item.addEventListener('click', function() {
            document.body.style.overflow = 'hidden';
            // Adiciona ao histórico para o botão voltar funcionar
            window.history.pushState({ popup: true }, '');
        });
    });
}

// Adicione esta linha no DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    enhancePopupMobile();
});
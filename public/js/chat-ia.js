// chat-ia.js - Versão final com ícones elegantes (sem imagens)
class ChatIA {
    constructor() {
        this.isOpen = false;
        this.messages = [];
        this.isTyping = false;
        this.humanChatActive = false;
        this.pendingHumanTransfer = false;
        this.startTime = Date.now();
        this.sessionId = this.getOrCreateSessionId();

        this.webSocket = null;

        this.initializeChat();
        this.restorePreviousSession();
    }

    // === SISTEMA DE SESSÃO ===
    getOrCreateSessionId() {
        let sessionId = this.getCookie('chat_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            this.setCookie('chat_session_id', sessionId, 15);
        }
        return sessionId;
    }

    setCookie(name, value, minutes) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (minutes * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    }

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    restorePreviousSession() {
        const savedState = localStorage.getItem(`chat_state_${this.sessionId}`);
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                this.humanChatActive = state.humanChatActive || false;
                this.messages = state.messages || [];

                if (this.humanChatActive) {
                    setTimeout(() => this.initializeWebSocket(), 1000);
                }
            } catch (e) {
                console.log('Erro ao restaurar sessão:', e);
            }
        }
    }

    saveState() {
        const state = {
            humanChatActive: this.humanChatActive,
            messages: this.messages,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(`chat_state_${this.sessionId}`, JSON.stringify(state));
    }

    // === INICIALIZAÇÃO ===
    initializeChat() {
        this.createChatHTML();
        this.injectStyles(); // Injeta CSS dos avatares elegantes
        this.bindEvents();

        if (!this.humanChatActive && this.messages.length === 0) {
            setTimeout(() => this.loadWelcomeMessage(), 500);
        } else {
            this.restoreMessages();
        }
    }

    createChatHTML() {
        const chatHTML = `
            <div class="chat-widget">
                <div class="chat-container" id="chatContainer">
                    <div class="chat-header">
                        <div class="chat-header-info">
                            <div class="chat-avatar">
                                <i class="fas fa-robot"></i>
                            </div>
                            <div class="chat-agent-info">
                                <h3 id="chatAgentName">Assistente IA</h3>
                                <p id="chatAgentStatus">Online • WP Web Soluções</p>
                            </div>
                        </div>
                        <button class="chat-close" id="chatClose">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="human-attendant-bar" id="humanAttendantBar">
                        <div class="attendant-bar-content">
                            <div class="attendant-info">
                                <i class="fas fa-user-headset"></i>
                                <span>Precisa de ajuda humana?</span>
                            </div>
                            <button class="btn-human-attendant-bar" id="btnHumanAttendantBar">
                                <i class="fas fa-comments"></i>
                                Falar com Atendente
                            </button>
                        </div>
                    </div>

                    <div class="chat-messages" id="chatMessages"></div>

                    <div class="chat-typing" id="chatTyping">
                        <div class="typing-dots">
                            <span></span><span></span><span></span>
                        </div>
                        <span class="typing-text">Assistente está digitando...</span>
                    </div>

                    <div class="chat-transfer" id="chatTransfer">
                        <div class="transfer-message">
                            <i class="fas fa-user-headset"></i>
                            <span>Conectando com atendente humano...</span>
                        </div>
                    </div>

                    <div class="chat-input-container">
                        <div class="input-wrapper">
                            <textarea class="chat-input" id="chatInput" placeholder="Digite sua mensagem..." rows="1"></textarea>
                            <button class="chat-send" id="chatSend">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <button class="chat-button pulse" id="chatButton">
                    <i class="fas fa-comments"></i>
                    <span class="chat-notification"></span>
                </button>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', chatHTML);
    }

    // === ESTILOS ELEGANTES DOS AVATARES (INJETADO NO DOM) ===
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* === AVATARES ELEGANTES === */
            .chat-avatar,
            .message-avatar {
                width: 42px; height: 42px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-size: 1.2rem; color: white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                border: 2.5px solid rgba(255,255,255,0.3);
                position: relative; overflow: hidden;
                transition: all 0.3s ease;
                flex-shrink: 0;
            }

            /* Cores por tipo */
            .chat-avatar,
            .message.bot .message-avatar { background: linear-gradient(135deg, #c62da5, #da4178); }

            .message.user .message-avatar { background: linear-gradient(135deg, #4a90e2, #357abd); }

            .message.attendant .message-avatar,
            .chat-header.human-mode .chat-avatar { background: linear-gradient(135deg, #34c759, #28a745); }

            /* Hover */
            .chat-avatar:hover,
            .message-avatar:hover {
                transform: translateY(-2px) scale(1.05);
                box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            }

            /* Ponto online */
            .chat-avatar::after,
            .message-avatar::after {
                content: '';
                position: absolute; bottom: 3px; right: 3px;
                width: 10px; height: 10px;
                background: #4ade80; border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 0 8px rgba(74,222,128,0.6);
                animation: pulse-online 2s infinite;
            }

            @keyframes pulse-online {
                0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.7); }
                70% { box-shadow: 0 0 0 8px rgba(74,222,128,0); }
                100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
            }

            /* Ícones menores nas mensagens */
            .message.bot .message-avatar i,
            .message.attendant .message-avatar i { font-size: 1.1rem; }
            .message.user .message-avatar i { font-size: 1.15rem; }
        `;
        document.head.appendChild(style);
    }

    bindEvents() {
        const chatButton = document.getElementById('chatButton');
        const chatClose = document.getElementById('chatClose');
        const chatSend = document.getElementById('chatSend');
        const chatInput = document.getElementById('chatInput');
        const btnHumanAttendantBar = document.getElementById('btnHumanAttendantBar');

        chatButton.addEventListener('click', () => this.toggleChat());
        chatClose.addEventListener('click', () => this.closeChat());
        chatSend.addEventListener('click', () => this.sendMessage());
        btnHumanAttendantBar.addEventListener('click', () => this.requestHumanAttendant());

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        chatInput.addEventListener('input', this.autoResize.bind(this));
    }

    autoResize() {
        const textarea = document.getElementById('chatInput');
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    toggleChat() {
        const chatContainer = document.getElementById('chatContainer');
        const chatButton = document.getElementById('chatButton');

        this.isOpen = !this.isOpen;

        if (this.isOpen) {
            chatContainer.classList.add('active');
            chatButton.classList.remove('pulse');
            document.getElementById('chatInput').focus();

            if (this.humanChatActive) {
                const lastAttendantMsg = this.messages.find(m => m.isAttendant);
                const name = lastAttendantMsg ? lastAttendantMsg.attendantName : 'Atendente Humano';
                this.updateInterfaceForHumanMode(name);
            } else if (this.messages.length === 0) {
                this.loadWelcomeMessage();
            }
        } else {
            chatContainer.classList.remove('active');
        }
    }

    closeChat() {
        this.isOpen = false;
        document.getElementById('chatContainer').classList.remove('active');
    }

    // === BOTÃO ATENDENTE HUMANO ===
    requestHumanAttendant() {
        if (this.humanChatActive) {
            this.addMessage({
                text: "Você já está em atendimento com um especialista humano!",
                isBot: true,
                isAttendant: true,
                timestamp: new Date()
            });
            return;
        }

        if (this.pendingHumanTransfer) return;

        this.transferToHuman();
    }

    // === MENSAGENS PRINCIPAIS ===
    loadWelcomeMessage() {
        const welcomeMessage = {
            text: `**Olá! Sou o Assistente IA da WP Web Soluções**

Posso ajudar você com:
• Dúvidas sobre desenvolvimento de software
• Orçamentos e prazos
• Explicações técnicas
• Conexão com nossos especialistas

**Fale naturalmente!** Em que posso ajudar?`,
            isBot: true,
            timestamp: new Date()
        };

        this.addMessage(welcomeMessage);
    }

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (!message || this.isTyping) return;

        this.addMessage({ text: message, isBot: false, timestamp: new Date() });
        input.value = '';
        this.autoResize();

        if (this.humanChatActive) {
            if (this.webSocket && this.webSocket.socket?.connected) {
                this.webSocket.sendMessage(message);
            } else {
                this.addMessage({
                    text: "**Conexão perdida com o atendente**\n\nTentando reconectar...",
                    isBot: true,
                    timestamp: new Date()
                });
                this.initializeWebSocket();
            }
        } else {
            await this.processWithServer(message);
        }
    }

    async processWithServer(userMessage) {
        this.showTypingIndicator();

        try {
            const response = await fetch('/api/chat/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    message: userMessage,
                    sessionId: this.sessionId
                })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();

            setTimeout(() => {
                this.hideTypingIndicator();

                if (data.transferToHuman) {
                    this.transferToHuman();
                } else if (data.success) {
                    this.addMessage({
                        text: data.response,
                        isBot: true,
                        timestamp: new Date()
                    });
                }
            }, 800 + Math.random() * 800);

        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
            this.hideTypingIndicator();
            this.addMessage({
                text: "Ops! Estou com dificuldades técnicas. Pode repetir?",
                isBot: true,
                timestamp: new Date()
            });
        }
    }

    // === TRANSFERÊNCIA PARA ATENDENTE HUMANO ===
    transferToHuman() {
        this.pendingHumanTransfer = true;
        this.showClientInfoForm();
    }

    showClientInfoForm() {
        const formHTML = `
            <div class="client-info-form" id="clientInfoForm">
                <div class="form-header">
                    <h4>Conectar com Atendente Humano</h4>
                    <p>Preencha seus dados para um atendimento rápido e personalizado:</p>
                </div>
                <div class="form-fields">
                    <div class="form-group">
                        <label for="clientName">Nome Completo *</label>
                        <input type="text" id="clientName" placeholder="Ex: João Silva" required>
                    </div>
                    <div class="form-group">
                        <label for="clientEmail">E-mail *</label>
                        <input type="email" id="clientEmail" placeholder="joao@exemplo.com" required>
                    </div>
                    <div class="form-group">
                        <label for="clientPhone">WhatsApp *</label>
                        <input type="tel" id="clientPhone" placeholder="(11) 99999-9999" required>
                    </div>
                    <div class="form-group">
                        <label for="clientProject">Tipo de Projeto</label>
                        <select id="clientProject">
                            <option value="">Selecione...</option>
                            <option value="App Mobile">App Mobile</option>
                            <option value="Site Institucional">Site Institucional</option>
                            <option value="E-commerce">E-commerce</option>
                            <option value="Sistema Web">Sistema Web</option>
                            <option value="Automação">Automação</option>
                            <option value="Consultoria">Consultoria</option>
                            <option value="Outro">Outro</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="clientUrgency">Nível de Urgência *</label>
                        <select id="clientUrgency" required>
                            <option value="">Selecione...</option>
                            <option value="Baixa">Baixa – Posso esperar alguns dias</option>
                            <option value="Média">Média – Preciso em 1-2 dias</option>
                            <option value="Alta">Alta – Urgente! Hoje ou amanhã</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="clientMessage">Mensagem Inicial</label>
                        <textarea id="clientMessage" rows="3" placeholder="Descreva seu projeto, dúvida ou necessidade..."></textarea>
                    </div>
                </div>
                <div class="form-error" id="formError"></div>
                <div class="form-actions">
                    <button type="button" class="btn-cancel" id="cancelFormBtn">Continuar com IA</button>
                    <button type="button" class="btn-submit" id="submitFormBtn">Conectar com Atendente</button>
                </div>
            </div>`;

        const msg = document.createElement('div');
        msg.className = 'message bot';
        msg.innerHTML = `
            <div class="message-content">
                <div class="message-text">${formHTML}</div>
                <div class="message-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `;

        document.getElementById('chatMessages').appendChild(msg);
        this.scrollToBottom();
        this.bindFormEvents();
    }

    bindFormEvents() {
        document.getElementById('cancelFormBtn')?.addEventListener('click', () => {
            document.getElementById('clientInfoForm')?.closest('.message')?.remove();
            this.pendingHumanTransfer = false;
            this.addMessage({
                text: "Continuando com o atendimento por IA. Como posso ajudar?",
                isBot: true,
                timestamp: new Date()
            });
        });

        document.getElementById('submitFormBtn')?.addEventListener('click', () => this.submitClientInfoForm());

        const form = document.getElementById('clientInfoForm');
        if (form) {
            form.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                    e.preventDefault();
                    this.submitClientInfoForm();
                }
            });
        }
    }

    async submitClientInfoForm() {
        const name = document.getElementById('clientName').value.trim();
        const email = document.getElementById('clientEmail').value.trim();
        const phone = document.getElementById('clientPhone').value.trim();
        const urgency = document.getElementById('clientUrgency').value;

        if (!name) return this.showFormError('Por favor, informe seu nome completo.');
        if (!email || !this.validateEmail(email)) return this.showFormError('Por favor, informe um e-mail válido.');
        if (!phone || phone.replace(/\D/g, '').length < 11) return this.showFormError('Informe um WhatsApp válido.');
        if (!urgency) return this.showFormError('Selecione o nível de urgência.');

        const clientData = {
            name, email, phone,
            project: document.getElementById('clientProject').value,
            urgency,
            message: document.getElementById('clientMessage').value,
            timeOnPage: Math.round((Date.now() - this.startTime) / 1000) + 's',
            source: document.referrer || 'Direto',
            page: location.href,
            sessionId: this.sessionId,
            timestamp: new Date().toISOString()
        };

        try {
            await fetch('/api/chat/save-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.sessionId, clientData })
            });
        } catch (e) { console.error(e); }

        document.getElementById('clientInfoForm')?.closest('.message')?.remove();
        this.addMessage({
            text: `**Obrigado, ${name}!**  
Estamos conectando você com um especialista...  
*Urgência: ${urgency}*`,
            isBot: true,
            timestamp: new Date()
        });

        this.startHumanChat(clientData);
    }

    validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    showFormError(msg) {
        alert(msg);
    }

    // === WEBSOCKET PARA ATENDENTE HUMANO ===
    startHumanChat(clientData) {
        this.humanChatActive = true;
        this.pendingHumanTransfer = false;
        this.saveState();

        this.showTransferIndicator();
        this.updateInterfaceForHumanMode();

        document.getElementById('chatAgentName').textContent = 'Conectando...';

        this.initializeWebSocket(clientData);
    }

    initializeWebSocket(clientData = null) {
        if (!this.webSocket) {
            this.webSocket = new ChatWebSocket(this);
        }

        this.webSocket.connect();

        if (clientData) {
            setTimeout(() => {
                if (this.webSocket.socket?.connected) {
                    const initialMessage = `Novo cliente conectado:\nNome: ${clientData.name}\nProjeto: ${clientData.project || 'Não informado'}\nMensagem: ${clientData.message || 'Sem mensagem adicional'}`;
                    this.webSocket.sendMessage(initialMessage);
                }
            }, 2000);
        }
    }

    // === MÉTODOS AUXILIARES ===
    addMessage(message) {
        const container = document.getElementById('chatMessages');
        const el = document.createElement('div');
        el.className = `message ${message.isBot ? 'bot' : 'user'}${message.isAttendant ? ' attendant' : ''}`;

        const time = (message.timestamp ? new Date(message.timestamp) : new Date())
            .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const avatarIcon = message.isBot
            ? (message.isAttendant ? '<i class="fas fa-headset"></i>' : '<i class="fas fa-robot"></i>')
            : '<i class="fas fa-user"></i>';

        el.innerHTML = `
            <div class="message-avatar">
                ${avatarIcon}
            </div>
            <div class="message-content">
                <div class="message-text">${this.formatMessage(message.text)}</div>
                <div class="message-time">${time}</div>
            </div>
        `;

        container.appendChild(el);
        container.scrollTop = container.scrollHeight;

        this.messages.push(message);
        this.saveState();
    }

    formatMessage(text) {
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }

    showTypingIndicator() {
        this.isTyping = true;
        document.getElementById('chatTyping').classList.add('active');
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.isTyping = false;
        document.getElementById('chatTyping').classList.remove('active');
    }

    showTransferIndicator() {
        document.getElementById('chatTransfer').classList.add('active');
        this.scrollToBottom();
    }

    hideTransferIndicator() {
        document.getElementById('chatTransfer').classList.remove('active');
    }

    updateInterfaceForHumanMode(name = 'Atendente Humano') {
        document.getElementById('chatAgentName').textContent = name;
        document.getElementById('chatAgentStatus').textContent = 'Online • Em atendimento';

        const avatarIcon = document.querySelector('.chat-avatar i');
        if (avatarIcon) {
            avatarIcon.className = 'fas fa-headset';
        }

        // Muda cor do cabeçalho para verde
        document.querySelector('.chat-header').classList.add('human-mode');

        document.getElementById('humanAttendantBar').style.display = 'none';
    }

    scrollToBottom() {
        const container = document.getElementById('chatMessages');
        container.scrollTop = container.scrollHeight;
    }

    restoreMessages() {
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';

        this.messages.forEach(message => {
            if (this.humanChatActive && message.isBot && !message.text.includes("Assistente IA")) {
                message.isAttendant = true;
            }
            this.addMessage(message);
        });
    }
}

// === INICIALIZAÇÃO ===
document.addEventListener('DOMContentLoaded', () => {
    window.chatIA = new ChatIA();
    console.log('Chat IA inicializado - Modo: ' + (window.chatIA.humanChatActive ? 'HUMANO' : 'IA'));
});
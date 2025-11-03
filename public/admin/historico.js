// /public/admin/historico.js

// Função auxiliar para definir o link ativo no menu
function setActiveNav(activeId) {
    document.querySelectorAll('.nav-menu .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.getElementById(activeId);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    // =======================================================
    // 1. VERIFICAÇÃO DE AUTENTICAÇÃO
    // =======================================================
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // =======================================================
    // 2. INICIALIZAÇÃO E ELEMENTOS DA UI
    // =======================================================
    // Elementos da UI
    const attendantNameUI = document.getElementById('attendantName');
    const attendantAvatarUI = document.getElementById('attendantAvatar');
    const logoutButton = document.getElementById('logoutButton');
    const historyListUI = document.getElementById('historyList');
    const emptyListMessage = document.getElementById('emptyListMessage');
    
    const chatHeader = document.getElementById('chatHeader');
    const chatAvatar = document.getElementById('chatAvatar');
    const chatClientName = document.getElementById('chatClientName');
    const chatClientStatus = document.getElementById('chatClientStatus');
    const chatMessagesUI = document.getElementById('chatMessages');
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    
    const detailsPlaceholder = document.getElementById('detailsPlaceholder');
    const clientInfo = document.getElementById('clientInfo');
    const clientDetailName = document.getElementById('clientDetailName');
    const clientDetailEmail = document.getElementById('clientDetailEmail');
    const clientDetailPhone = document.getElementById('clientDetailPhone');
    const clientDetailProject = document.getElementById('clientDetailProject');
    const clientDetailUrgency = document.getElementById('clientDetailUrgency'); 
    const clientDetailMessage = document.getElementById('clientDetailMessage');
    const clientDetailSource = document.getElementById('clientDetailSource');
    const clientDetailTime = document.getElementById('clientDetailTime');

    const chatBackBtn = document.getElementById('chatBackBtn');

    // Variáveis de estado
    let chatHistory = {}; // Armazena os chats buscados
    let selectedSessionId = null;
    const attendantName = sessionStorage.getItem('atendenteUser') || 'Atendente';
    const attendantRole = sessionStorage.getItem('atendenteRole') || 'atendente';

    // --- Configuração Inicial da UI ---
    attendantNameUI.textContent = attendantName;
    attendantAvatarUI.textContent = attendantName.charAt(0).toUpperCase();
    
    // Define o link de navegação "Histórico" como ativo
    setActiveNav('nav-link-historico');
    
    // Mostra "Usuários" se for admin (copiado do dashboard.js)
    if (attendantRole === 'admin') {
        const navItemUsers = document.getElementById('nav-item-users');
        if (navItemUsers) {
            navItemUsers.style.display = 'block';
            // Adicionar lógica de modal se desejar
        }
    }

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        sessionStorage.removeItem('atendenteUser');
        sessionStorage.removeItem('atendenteRole');
        window.location.href = 'login.html';
    });

    // =======================================================
    // 3. LÓGICA DE DADOS
    // =======================================================

    // --- Busca o histórico no servidor ---
    async function fetchHistory() {
        try {
            const response = await fetch('/admin/history', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    alert('Sessão expirada. Faça login novamente.');
                    window.location.href = 'login.html';
                }
                throw new Error('Falha ao buscar histórico');
            }

            const data = await response.json();
            
            if (data.success && data.history) {
                // Converte o array em um objeto map (igual ao dashboard.js)
                chatHistory = data.history.reduce((acc, session) => {
                    acc[session.sessionId] = session; 
                    return acc;
                }, {});
                renderHistoryList();
            }

        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
            emptyListMessage.textContent = 'Erro ao carregar histórico.';
            emptyListMessage.classList.remove('hidden');
        }
    }

    // =======================================================
    // 4. LÓGICA DE RENDERIZAÇÃO
    // =======================================================

    // --- Renderiza a lista de chats do histórico ---
    function renderHistoryList() {
        historyListUI.innerHTML = '';
        const historyArray = Object.values(chatHistory);

        if (historyArray.length === 0) {
            emptyListMessage.textContent = 'Nenhum chat fechado encontrado.';
            emptyListMessage.classList.remove('hidden');
            return;
        }

        emptyListMessage.classList.add('hidden');
        
        historyArray.forEach(session => {
            const clientName = session.clientData?.name || `Cliente ${session.sessionId.slice(8, 12)}`;
            const sessionId = session.sessionId;

            const li = document.createElement('li');
            li.className = 'client-item offline'; // Adiciona 'offline'
            li.dataset.id = sessionId;

            if (sessionId === selectedSessionId) {
                li.classList.add('selected');
            }
            
            const lastMessage = session.messages[session.messages.length - 1];
            let lastMessageContent = "Chat fechado.";
            if (lastMessage) {
                lastMessageContent = lastMessage.content;
            }

            if (session.assignedTo) {
                 lastMessageContent = `Atendido por: ${session.assignedTo}`;
            }

            li.innerHTML = `
                <div class="avatar">${clientName.charAt(0).toUpperCase()}</div>
                <div class="client-info">
                    <span class="client-name">${clientName}</span>
                    <span class="client-last-message">${lastMessageContent}</span>
                </div>
                <div class="client-meta">
                    <span class="client-timestamp">${new Date(session.updatedAt).toLocaleDateString('pt-BR')}</span>
                </div>
            `;

            li.addEventListener('click', () => handleHistoryClick(session));
            historyListUI.appendChild(li);
        });
    }

    // --- Mostra o chat selecionado (clique) ---
    function handleHistoryClick(session) {
        const chatMain = document.querySelector('.dashboard-chat');
        if (chatMain && window.innerWidth <= 768) {
            chatMain.classList.add('active'); // Mostra a tela de chat no mobile
        }

        selectedSessionId = session.sessionId;
        renderHistoryList(); // Re-renderiza para marcar o 'selected'
        
        chatPlaceholder.classList.add('hidden');
        const clientName = session.clientData?.name || `Cliente ${session.sessionId.slice(8, 12)}`;
        
        chatClientName.textContent = clientName;
        chatClientStatus.textContent = `Chat de ${new Date(session.updatedAt).toLocaleDateString('pt-BR')}`;
        chatClientStatus.style.color = 'var(--text-muted)'; // Cor de status "fechado"
        chatAvatar.textContent = clientName.charAt(0).toUpperCase();

        // Carrega o histórico de mensagens
        chatMessagesUI.innerHTML = '';
        
        session.history?.forEach(msg => {
            appendMessage(msg.role === 'user' ? 'client' : 'bot-history', msg.content, msg.role === 'user' ? clientName : "Assistente IA", true);
        });
        
        session.messages?.forEach(msg => {
            const name = (msg.sender === 'client') ? clientName : 
                         (msg.sender === 'atendente') ? (msg.attendantName || 'Atendente') :
                         'Sistema';
            appendMessage(msg.sender, msg.content, name, true);
        });
        
        chatMessagesUI.scrollTop = chatMessagesUI.scrollHeight;

        // Preenche os Detalhes
        if (session.clientData && Object.keys(session.clientData).length > 0) {
            detailsPlaceholder.classList.add('hidden');
            clientInfo.classList.remove('hidden');
            
            const data = session.clientData;
            clientDetailName.textContent = data.name || 'Não informado';
            clientDetailEmail.textContent = data.email || 'Não informado';
            clientDetailPhone.textContent = data.phone || 'Não informado';
            clientDetailProject.textContent = data.project || 'Não informado';
            if (clientDetailUrgency) {
                clientDetailUrgency.textContent = data.urgency || 'Não informado';
            }
            clientDetailMessage.textContent = data.message || '(Nenhuma)';
            clientDetailSource.textContent = data.source || 'Não informado';
            clientDetailTime.textContent = data.timeOnPage || 'Não informado';
        } else {
            detailsPlaceholder.classList.remove('hidden');
            clientInfo.classList.add('hidden');
        }
    }

    // --- Função para adicionar uma mensagem na tela (copiada do dashboard.js) ---
    function appendMessage(sender, content, fromName, isLoadingHistory = false) {
        chatPlaceholder.classList.add('hidden');
        
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', sender);
        
        const avatarInitial = fromName.charAt(0).toUpperCase();
        const senderName = (sender === 'client') ? fromName : (sender === 'atendente' ? fromName : 'Sistema'); 
        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        if (sender === 'bot-history' || sender === 'system') {
            const icon = (sender === 'system') ? 'fas fa-info-circle' : 'fas fa-robot';
            const prefix = (sender === 'system') ? '[SISTEMA]' : '[IA]';
            
            messageEl.innerHTML = `
                <div class="message-content">
                    <div class="message-text">
                        <i class="${icon}"></i> <strong>${prefix}</strong> ${content.replace(/\n/g, '<br>')}
                    </div>
                    <div class="message-time">${time}</div>
                </div>`;
            messageEl.classList.add('system-message'); 
        } else {
            messageEl.innerHTML = `
                <div class="avatar">${avatarInitial}</div>
                <div class="message-content">
                    <span class="message-sender">${senderName}</span>
                    <div class="message-text">${content.replace(/\n/g, '<br>')}</div>
                    <span class="message-time">${time}</span>
                </div>
            `;
        }

        chatMessagesUI.appendChild(messageEl);
        
        if (!isLoadingHistory) {
             chatMessagesUI.scrollTop = chatMessagesUI.scrollHeight;
        } else {
             chatMessagesUI.scrollTop = chatMessagesUI.scrollHeight;
        }
    }

    // --- Lógica de responsividade (Botão Voltar Mobile) ---
    if (chatBackBtn) {
        chatBackBtn.addEventListener('click', () => {
            const chatMain = document.querySelector('.dashboard-chat');
            if (chatMain) {
                chatMain.classList.remove('active');
            }
            selectedSessionId = null; // Desseleciona o chat
            renderHistoryList(); // Re-renderiza a lista
        });
    }

    // =======================================================
    // 5. INICIALIZAÇÃO DA PÁGINA
    // =======================================================
    fetchHistory();
});

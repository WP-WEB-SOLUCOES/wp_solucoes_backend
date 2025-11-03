// /public/admin/main.js
// VERSÃO FINAL (Cookie Auth, XSS-Safe, Chat Interno & Notificações com @Menções)

// Variáveis globais de estado
let socket;
let clients = {};
let chatHistory = {};
let internalMessages = [];
let onlineAttendants = [];
let selectedSessionId = null;

// Contagens de Notificação
let newClientMessageCount = 0;
let newInternalMessageCount = 0;

// Estado do Pop-up de Menções
let mentionPopupOpen = false;
let mentionFilter = '';
let selectedMentionIndex = 0;
let mentionPopupUsers = [];

const attendantName = sessionStorage.getItem('atendenteUser') || 'Atendente';
const attendantRole = sessionStorage.getItem('atendenteRole') || 'atendente';

// =======================================================
// ROTEADOR DE PÁGINAS
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    if (!sessionStorage.getItem('atendenteUser')) {
        window.location.href = '/admin/login';
        return;
    }
    
    const attendantNameUI = document.getElementById('attendantName');
    const attendantAvatarUI = document.getElementById('attendantAvatar');
    const logoutButton = document.getElementById('logoutButton');
    
    if (attendantNameUI) attendantNameUI.textContent = attendantName;
    if (attendantAvatarUI) attendantAvatarUI.textContent = attendantName.charAt(0).toUpperCase();

    const userMenuItem = document.getElementById('nav-item-users');
    if (userMenuItem && attendantRole === 'admin') {
        userMenuItem.style.display = 'list-item'; 
    }
    
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await fetch('/admin/logout');
            } catch (err) {
                console.error("Erro ao fazer logout:", err);
            }
            sessionStorage.removeItem('atendenteUser');
            sessionStorage.removeItem('atendenteRole');
            window.location.href = '/admin/login';
        });
    }

    const navLinks = document.querySelectorAll('.nav-menu .nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = link.getAttribute('data-page');
            
            if (pageName) {
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                loadPage(pageName);
            }
        });
    });

    loadPage('dashboard');
    setActiveNav('nav-link-atendimento');
    initializeSocket();
    setupAdminModal();
});

// Função: Define o link ativo no menu
function setActiveNav(activeId) {
    document.querySelectorAll('.nav-menu .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.getElementById(activeId);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// Função: Carrega o HTML da página parcial
async function loadPage(pageName) {
    const appContent = document.getElementById('app-content');
    if (!appContent) return;
    try {
        const response = await fetch(`/pages/${pageName}`, {
             credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                 window.location.href = '/admin/login';
                 return;
            }
            throw new Error(`Página não encontrada: ${pageName}`);
        }
        
        appContent.innerHTML = await response.text();
        
        if (pageName === 'dashboard') {
            initDashboardPage();
        } else if (pageName === 'historico') {
            initHistoricoPage();
        } else if (pageName === 'internals') {
            initInternalsPage();
        }
    } catch (error) {
        console.error('Erro ao carregar página:', error);
        appContent.innerHTML = `<h2 style="color: var(--error); padding: var(--space-8);">Erro ao carregar conteúdo.</h2>`;
    }
}

// =======================================================
// LÓGICA DE SOCKET.IO (Global)
// =======================================================
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Conectado ao servidor, autenticando via cookie...');
    });

    // --- Eventos de Chat de Cliente ---
    socket.on('update_client_list', (clientListArray) => {
        clients = clientListArray.reduce((acc, client) => {
            if (client.session) acc[client.session.sessionId] = client;
            return acc;
        }, {});
        if (document.getElementById('clientList')) {
            renderClientList(clients, 'dashboard');
        }
        if (selectedSessionId && clients[selectedSessionId]) {
            handleClientClick(clients[selectedSessionId], true, 'dashboard');
        } else if (selectedSessionId && document.getElementById('clientList')) {
            clearChatUI();
        }
    });

    socket.on('client_message', (data) => {
        const { fromSession, fromName, content } = data;
        if (!clients[fromSession]) return;
        
        if (!clients[fromSession].session.messages) {
            clients[fromSession].session.messages = [];
        }
        clients[fromSession].session.messages.push({ sender: 'client', content, timestamp: new Date() });

        const onDashboardPage = document.getElementById('clientList');
        if (!onDashboardPage || (onDashboardPage && fromSession !== selectedSessionId)) {
            newClientMessageCount++;
            updateNotificationBadges();
        }

        if (onDashboardPage) {
            if (fromSession === selectedSessionId) {
                appendMessage('client', content, fromName);
            }
            const clientItem = document.querySelector(`.client-item[data-id="${fromSession}"]`);
            if (clientItem) {
                if (!clients[fromSession].session.assignedTo) {
                    const lastMsgSpan = clientItem.querySelector('.client-last-message');
                    if (lastMsgSpan) lastMsgSpan.textContent = content;
                }
                if (fromSession !== selectedSessionId) {
                    const badge = clientItem.querySelector('.client-new-badge');
                    if (badge) badge.classList.remove('hidden');
                }
            }
        }
    });

    // --- Evento de Chat Interno ---
    socket.on('new_internal_message', (data) => {
        internalMessages.push(data);
        
        if (data.from === attendantName) {
            if (document.getElementById('internalMessages')) {
                 appendInternalMessage(data);
            }
            return;
        }
        const messagesUI = document.getElementById('internalMessages');
        if (messagesUI) {
            appendInternalMessage(data);
        } else {
            newInternalMessageCount++;
            updateNotificationBadges();
        }
    });

    // --- Evento de Menção ---
    socket.on('you_were_mentioned', (data) => {
        playNotificationSound();
        if (!document.getElementById('internalMessages')) {
            newInternalMessageCount++;
            updateNotificationBadges();
        }
    });

    // --- Evento de Lista de Atendentes ---
    socket.on('update_attendant_list', (attendantList) => {
        onlineAttendants = attendantList;
        if (document.getElementById('attendantList')) {
            renderAttendantList();
        }
    });

    // --- Eventos de Erro ---
    socket.on('auth_error', (errorMessage) => {
        console.error('Erro de autenticação:', errorMessage);
        alert('Sua sessão expirou ou é inválida. Por favor, faça login novamente.');
        sessionStorage.removeItem('atendenteUser');
        sessionStorage.removeItem('atendenteRole');
        window.location.href = '/admin/login';
    });
    
    socket.on('message_error', (data) => {
        if (data.toSession === selectedSessionId) {
            alert(`Erro: ${data.error}`);
            if (clients[selectedSessionId]) {
                handleClientClick(clients[selectedSessionId], true, 'dashboard');
            }
        }
    });

    socket.on('disconnect', (reason) => {
        if (reason === 'io server disconnect') {
            console.log('Desconectado pelo servidor (provavelmente auth).');
            sessionStorage.removeItem('atendenteUser');
            sessionStorage.removeItem('atendenteRole');
            window.location.href = '/admin/login';
        }
        console.log('Desconectado do servidor. Razão:', reason);
    });
}

// =======================================================
// LÓGICA DE BADGES DE NOTIFICAÇÃO
// =======================================================
function updateNotificationBadges() {
    const dashboardBadge = document.getElementById('dashboardBadge');
    if (dashboardBadge) {
        if (newClientMessageCount > 0) {
            dashboardBadge.textContent = newClientMessageCount > 9 ? '9+' : newClientMessageCount;
            dashboardBadge.classList.add('active');
        } else {
            dashboardBadge.textContent = '';
            dashboardBadge.classList.remove('active');
        }
    }
    const internalsBadge = document.getElementById('internalsBadge');
    if (internalsBadge) {
        if (newInternalMessageCount > 0) {
            internalsBadge.textContent = newInternalMessageCount > 9 ? '9+' : newInternalMessageCount;
            internalsBadge.classList.add('active');
        } else {
            internalsBadge.textContent = '';
            internalsBadge.classList.remove('active');
        }
    }
}


// =======================================================
// LÓGICA DA PÁGINA "ATENDIMENTO" (dashboard.html)
// =======================================================
function initDashboardPage() {
    console.log('Inicializando página de Atendimento...');
    
    newClientMessageCount = 0;
    updateNotificationBadges();
    
    const chatForm = document.getElementById('chatForm');
    const closeChatBtn = document.getElementById('closeChatBtn');
    
    renderClientList(clients, 'dashboard');
    
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const messageInput = document.getElementById('messageInput');
            const content = messageInput.value.trim();
            if (content && selectedSessionId) {
                socket.emit('admin_message', { content, toSession: selectedSessionId });
                const messageData = { sender: 'atendente', content, timestamp: new Date(), attendantName };
                if (!clients[selectedSessionId].session.messages) {
                    clients[selectedSessionId].session.messages = [];
                }
                clients[selectedSessionId].session.messages.push(messageData);
                appendMessage('atendente', content, attendantName);
                messageInput.value = '';
                messageInput.focus();
            }
        });
    }
    
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            if (!selectedSessionId) return;
            if (confirm('Tem certeza que deseja fechar este chat? Esta ação não pode ser desfeita.')) {
                socket.emit('admin_close_chat', { sessionId: selectedSessionId });
                clearChatUI();
            }
        });
    }

    const chatBackBtn = document.getElementById('chatBackBtn');
    if (chatBackBtn) {
        chatBackBtn.addEventListener('click', () => {
            const chatMain = document.querySelector('.dashboard-chat');
            if (chatMain) chatMain.classList.remove('active');
            selectedSessionId = null;
            renderClientList(clients, 'dashboard');
        });
    }
}

// =======================================================
// LÓGICA DA PÁGINA "HISTÓRICO" (historico.html)
// =======================================================
async function initHistoricoPage() {
    console.log('Inicializando página de Histórico...');
    
    try {
        const response = await fetch('/api/chat/history', { credentials: 'include' });
        if (!response.ok) {
            if(response.status === 401 || response.status === 403) {
                 window.location.href = '/admin/login';
                 return;
            }
            throw new Error('Falha ao buscar histórico.');
        }
        const data = await response.json();
        const emptyListMessage = document.getElementById('emptyListMessage');
        if (data.success) {
            chatHistory = data.chats.reduce((acc, chat) => {
                acc[chat.sessionId] = { session: chat };
                return acc;
            }, {});
            renderClientList(chatHistory, 'historico');
        } else {
            if (emptyListMessage) emptyListMessage.textContent = data.message || 'Erro ao carregar histórico.';
        }
    } catch (error) {
        console.error("Erro ao buscar histórico:", error);
        const emptyListMessage = document.getElementById('emptyListMessage');
        if (emptyListMessage) emptyListMessage.textContent = 'Erro de conexão ao buscar histórico.';
    }

    const chatBackBtn = document.getElementById('chatBackBtn');
    if (chatBackBtn) {
        chatBackBtn.addEventListener('click', () => {
            const chatMain = document.querySelector('.dashboard-chat');
            if (chatMain) chatMain.classList.remove('active');
            selectedSessionId = null;
            renderClientList(chatHistory, 'historico');
        });
    }
}

// =======================================================
// LÓGICA DA PÁGINA "INTERNO" (internals.html)
// =======================================================
function initInternalsPage() {
    console.log('Inicializando página de Chat Interno...');
    newInternalMessageCount = 0;
    updateNotificationBadges();

    const form = document.getElementById('internalChatForm');
    const input = document.getElementById('internalMessageInput');
    const messagesUI = document.getElementById('internalMessages');
    const mentionPopup = document.getElementById('mentionPopup');

    messagesUI.innerHTML = ''; 
    appendInternalMessage({
        system: true,
        content: "Bem-vindo ao chat interno. As mensagens aqui são temporárias e visíveis apenas para atendentes online."
    });
    internalMessages.forEach(msg => {
        appendInternalMessage(msg);
    });

    renderAttendantList();

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const content = input.value.trim();
            if (content) {
                socket.emit('internal_message', { content });
                input.value = '';
                input.style.height = 'auto'; 
            }
        });
    }
    
    if(input) {
         input.addEventListener('input', () => {
             input.style.height = 'auto';
             input.style.height = Math.min(input.scrollHeight, 120) + 'px';
         });

         // --- INÍCIO DA CORREÇÃO ---
         // Keydown para setas (Up/Down) e Enter/Tab
         input.addEventListener('keydown', (e) => {
            
            // Caso 1: O pop-up de menção ESTÁ aberto
            if (mentionPopupOpen) {
                // Deixa a função handleMentionKeydown decidir o que fazer (setas, enter, tab)
                handleMentionKeydown(e);
                
                // Se o Enter ou Tab foi para selecionar, impede o envio do form
                if(e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                }
                return;
            }

            // Caso 2: O pop-up ESTÁ FECHADO e o usuário apertou Enter
            if (!mentionPopupOpen && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Impede a quebra de linha
                // Dispara o 'submit' do formulário
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
         });
         // --- FIM DA CORREÇÃO ---
         
         // Keyup para @ e filtragem
         input.addEventListener('keyup', (e) => {
            const text = input.value;
            const caretPos = input.selectionStart;

            if (e.key === 'Escape') {
                closeMentionPopup();
                return;
            }
            // Ignora as teclas de navegação
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Tab') {
                return;
            }

            const lastAtIndex = text.lastIndexOf('@', caretPos - 1);
            
            if (lastAtIndex === -1) {
                closeMentionPopup();
                return;
            }

            const precedingChar = text.charAt(lastAtIndex - 1);
            if (lastAtIndex > 0 && precedingChar !== ' ' && precedingChar !== '\n') {
                closeMentionPopup();
                return; 
            }

            mentionFilter = text.substring(lastAtIndex + 1, caretPos);

            if (mentionFilter.includes(' ')) {
                closeMentionPopup();
                return;
            }

            openMentionPopup();
            updateMentionPopup();
         });
    }
}


// =======================================================
// FUNÇÕES DE AJUDA PARA MENÇÕES
// =======================================================
function openMentionPopup() {
    if (mentionPopupOpen) return;
    mentionPopupOpen = true;
    document.getElementById('mentionPopup').style.display = 'block';
}

function closeMentionPopup() {
    if (!mentionPopupOpen) return;
    mentionPopupOpen = false;
    document.getElementById('mentionPopup').style.display = 'none';
    mentionFilter = '';
    selectedMentionIndex = 0;
}

function updateMentionPopup() {
    const popup = document.getElementById('mentionPopup');
    popup.innerHTML = ''; // Limpa

    mentionPopupUsers = onlineAttendants.filter(a => 
        a.username.toLowerCase().startsWith(mentionFilter.toLowerCase()) &&
        a.username !== attendantName
    );

    if (mentionPopupUsers.length === 0) {
        closeMentionPopup();
        return;
    }

    if (selectedMentionIndex < 0) selectedMentionIndex = 0;
    if (selectedMentionIndex >= mentionPopupUsers.length) selectedMentionIndex = mentionPopupUsers.length - 1;

    mentionPopupUsers.forEach((user, index) => {
        const item = document.createElement('div');
        item.className = 'mention-item';
        if (index === selectedMentionIndex) {
            item.classList.add('selected');
        }

        item.innerHTML = `
            <span class="avatar">${user.username.charAt(0).toUpperCase()}</span>
            <span class="name">${user.username}</span>
            <span class="role">${user.role === 'admin' ? 'Admin' : 'Atendente'}</span>
        `;
        
        item.addEventListener('click', () => {
            selectMention(user.username);
        });
        
        popup.appendChild(item);
    });
}

function handleMentionKeydown(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedMentionIndex = (selectedMentionIndex + 1) % mentionPopupUsers.length;
        updateMentionPopup();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedMentionIndex = (selectedMentionIndex - 1 + mentionPopupUsers.length) % mentionPopupUsers.length;
        updateMentionPopup();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (mentionPopupUsers[selectedMentionIndex]) {
            selectMention(mentionPopupUsers[selectedMentionIndex].username);
        }
    }
}

function selectMention(username) {
    const input = document.getElementById('internalMessageInput');
    const text = input.value;
    const caretPos = input.selectionStart;
    
    const lastAtIndex = text.lastIndexOf('@', caretPos - 1);
    
    if (lastAtIndex === -1) {
        closeMentionPopup();
        return;
    }

    const textBefore = text.substring(0, lastAtIndex);
    const newText = `@${username} `;
    const textAfter = text.substring(caretPos);

    input.value = textBefore + newText + textAfter;
    
    const newCaretPos = (textBefore + newText).length;
    input.focus();
    input.setSelectionRange(newCaretPos, newCaretPos);

    closeMentionPopup();
}

// =======================================================
// FUNÇÕES COMPARTILHADAS (Chat de Cliente)
// =======================================================
function renderClientList(dataMap, type) {
    const clientListUI = document.getElementById('clientList');
    const emptyListMessage = document.getElementById('emptyListMessage');
    if (!clientListUI) return;
    clientListUI.innerHTML = '';
    let clientArray = Object.values(dataMap);
    if (clientArray.length === 0) {
        if (emptyListMessage) {
            emptyListMessage.classList.remove('hidden');
            clientListUI.classList.add('hidden');
            let message = (attendantRole === 'admin') ? "Nenhum cliente ativo." : "Nenhum chat na sua fila.";
            let icon = "fa-moon";
            if (type === 'historico') {
                message = "Nenhum chat fechado encontrado.";
                icon = "fa-archive";
            }
            emptyListMessage.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
        }
        return;
    }
    if (emptyListMessage) emptyListMessage.classList.add('hidden');
    clientListUI.classList.remove('hidden');
    clientArray.sort((a, b) => new Date(b.session.updatedAt) - new Date(a.session.updatedAt));
    
    clientArray.forEach(client => {
        const session = client.session;
        const clientName = session.clientData?.name || `Cliente ${session.sessionId.slice(8, 12)}`;
        const sessionId = session.sessionId;
        const assignedTo = session.assignedTo;
        const li = document.createElement('li');
        li.className = 'client-item';
        li.dataset.id = sessionId;
        if (type === 'dashboard' && !client.socketId) li.classList.add('offline');
        if (sessionId === selectedSessionId) li.classList.add('selected');
        if (assignedTo && assignedTo !== attendantName) li.classList.add('assigned-other');
        const messages = session.messages || [];
        const lastMessage = messages[messages.length - 1];
        let lastMessageContent = "Novo cliente conectado.";
        if (lastMessage) {
            if (lastMessage.sender === 'client') lastMessageContent = lastMessage.content;
            else if (lastMessage.sender === 'atendente') lastMessageContent = `${lastMessage.attendantName === attendantName ? 'Você' : lastMessage.attendantName}: ${lastMessage.content}`;
            else if (lastMessage.sender === 'system') lastMessageContent = "Cliente preencheu o formulário.";
        }
        if (type === 'dashboard' && assignedTo && attendantRole === 'admin') lastMessageContent = `Atendido por: ${assignedTo}`;
        if (type === 'historico') lastMessageContent = `Fechado por: ${assignedTo || 'Sistema'}`;
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.textContent = clientName.charAt(0).toUpperCase();
        const infoDiv = document.createElement('div');
        infoDiv.className = 'client-info';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'client-name';
        nameSpan.textContent = clientName;
        const lastMsgSpan = document.createElement('span');
        lastMsgSpan.className = 'client-last-message';
        lastMsgSpan.textContent = lastMessageContent;
        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(lastMsgSpan);
        const metaDiv = document.createElement('div');
        metaDiv.className = 'client-meta';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'client-timestamp';
        timeSpan.textContent = new Date(session.updatedAt || session.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'client-new-badge hidden';
        badgeSpan.innerHTML = '<i class="fas fa-circle"></i>';
        metaDiv.appendChild(timeSpan);
        metaDiv.appendChild(badgeSpan);
        li.appendChild(avatarDiv);
        li.appendChild(infoDiv);
        li.appendChild(metaDiv);
        li.addEventListener('click', () => {
            const data = (type === 'dashboard') ? clients[sessionId] : chatHistory[sessionId];
            handleClientClick(data, false, type);
        });
        clientListUI.appendChild(li);
    });
}

function handleClientClick(client, isRefresh = false, type = 'dashboard') {
    const chatMain = document.querySelector('.dashboard-chat');
    if (chatMain && window.innerWidth <= 768) chatMain.classList.add('active');
    
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    const chatClientName = document.getElementById('chatClientName');
    const chatClientStatus = document.getElementById('chatClientStatus');
    const chatAvatar = document.getElementById('chatAvatar');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.querySelector('.btn-send');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const detailsPlaceholder = document.getElementById('detailsPlaceholder');
    const clientInfo = document.getElementById('clientInfo');

    if (!chatPlaceholder || !chatClientName || !chatClientStatus || !chatAvatar || !detailsPlaceholder || !clientInfo) return;
    if (type === 'dashboard' && (!messageInput || !sendButton || !closeChatBtn)) return;

    const session = client.session;
    const clientName = session.clientData?.name || `Cliente ${session.sessionId.slice(8, 12)}`;
    selectedSessionId = session.sessionId;
    
    if (!isRefresh) {
        const dataMap = (type === 'dashboard') ? clients : chatHistory;
        renderClientList(dataMap, type);
    }
    
    chatPlaceholder.classList.add('hidden');
    chatClientName.textContent = clientName;
    chatClientStatus.textContent = session.clientData?.email || `ID: ${session.sessionId}`;
    chatAvatar.textContent = clientName.charAt(0).toUpperCase();

    if (type === 'dashboard') {
        const assignedTo = session.assignedTo;
        const isAssignedToMe = (assignedTo === attendantName);
        const isUnassigned = (!assignedTo);
        const isAdmin = (attendantRole === 'admin');

        if (client.socketId) {
            if (isAssignedToMe || isUnassigned || isAdmin) {
                messageInput.disabled = false;
                sendButton.disabled = false;
                closeChatBtn.style.display = 'flex';
                if (isUnassigned) {
                    messageInput.placeholder = "Digite para assumir o chat...";
                    chatClientStatus.textContent = session.clientData?.email || 'Aguardando atendente';
                } else if (!isAssignedToMe && isAdmin) {
                    messageInput.placeholder = `Atendido por ${assignedTo}. Digite para assumir...`;
                    chatClientStatus.textContent = `Atendido por ${assignedTo}`;
                } else {
                    messageInput.placeholder = "Digite sua resposta...";
                    chatClientStatus.textContent = session.clientData?.email || 'Online';
                }
                if (!isRefresh) messageInput.focus();
                chatClientStatus.style.color = 'var(--success)';
            } else {
                messageInput.disabled = true;
                sendButton.disabled = true;
                closeChatBtn.style.display = 'none';
                messageInput.placeholder = `Atendido por ${assignedTo}`;
                chatClientStatus.style.color = 'var(--warning)';
                chatClientStatus.textContent = `Atendido por ${assignedTo}`;
            }
        } else {
            messageInput.disabled = true;
            sendButton.disabled = true;
            closeChatBtn.style.display = 'none';
            messageInput.placeholder = "Cliente Offline";
            chatClientStatus.style.color = 'var(--text-muted)';
            chatClientStatus.textContent = 'Cliente Offline';
            if (assignedTo) chatClientStatus.textContent += ` (Atendido por ${assignedTo})`;
        }
    } else {
        messageInput.disabled = true;
        sendButton.disabled = true;
        if (closeChatBtn) closeChatBtn.style.display = 'none';
        messageInput.placeholder = "Este chat está fechado";
        chatClientStatus.textContent = `Chat fechado em ${new Date(session.updatedAt).toLocaleDateString()}`;
        chatClientStatus.style.color = 'var(--text-muted)';
    }

    const chatMessagesUI = document.getElementById('chatMessages');
    chatMessagesUI.querySelectorAll('.message').forEach(msg => msg.remove());
    session.history?.forEach(msg => appendMessage(msg.role === 'user' ? 'client' : 'bot-history', msg.content, msg.role === 'user' ? clientName : "Assistente IA", true));
    session.messages?.forEach(msg => {
        const name = (msg.sender === 'client') ? clientName : (msg.sender === 'atendente') ? (msg.attendantName || 'Atendente') : 'Sistema';
        appendMessage(msg.sender, msg.content, name, true);
    });
    chatMessagesUI.scrollTop = chatMessagesUI.scrollHeight;

    if (session.clientData && Object.keys(session.clientData).length > 0) {
        detailsPlaceholder.classList.add('hidden');
        clientInfo.classList.remove('hidden');
        const data = session.clientData;
        const fields = ['Name', 'Email', 'Phone', 'Project', 'Urgency', 'Message', 'Source', 'Time'];
        fields.forEach(field => {
            const el = document.getElementById(`clientDetail${field}`);
            if (el) {
                const dataField = field.charAt(0).toLowerCase() + field.slice(1);
                const value = data[dataField] || (el.tagName === 'P' ? '(Nenhuma)' : 'Não informado');
                el.textContent = value;
            }
        });
    } else {
        detailsPlaceholder.classList.remove('hidden');
        clientInfo.classList.add('hidden');
    }
}

function appendMessage(sender, content, fromName, isLoadingHistory = false) {
    const chatMessagesUI = document.getElementById('chatMessages');
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    if (!chatMessagesUI || !chatPlaceholder) return;
    chatPlaceholder.classList.add('hidden');
    const messageEl = document.createElement('div');
    messageEl.classList.add('message', sender);
    const avatarInitial = fromName.charAt(0).toUpperCase();
    const senderName = (sender === 'client') ? fromName : (sender === 'atendente' ? fromName : 'Sistema');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (sender === 'bot-history' || sender === 'system') {
        messageEl.classList.add('system-message');
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        const icon = document.createElement('i');
        icon.className = (sender === 'system') ? 'fas fa-info-circle' : 'fas fa-robot';
        const strong = document.createElement('strong');
        strong.textContent = (sender === 'system') ? '[SISTEMA] ' : '[IA] ';
        textDiv.appendChild(icon);
        textDiv.appendChild(strong);
        textDiv.appendChild(document.createTextNode(content));
        textDiv.style.whiteSpace = 'pre-wrap';
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = time;
        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(timeDiv);
        messageEl.appendChild(contentDiv);
    } else {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.textContent = avatarInitial;
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-sender';
        senderSpan.textContent = senderName;
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = content;
        textDiv.style.whiteSpace = 'pre-wrap';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = time;
        contentDiv.appendChild(senderSpan);
        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(timeSpan);
        messageEl.appendChild(avatarDiv);
        messageEl.appendChild(contentDiv);
    }
    chatMessagesUI.appendChild(messageEl);
    if (!isLoadingHistory) {
        chatMessagesUI.scrollTop = chatMessagesUI.scrollHeight;
    }
}


function clearChatUI() {
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    const chatClientName = document.getElementById('chatClientName');
    const chatClientStatus = document.getElementById('chatClientStatus');
    const chatAvatar = document.getElementById('chatAvatar');
    const chatMessagesUI = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.querySelector('.btn-send');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const detailsPlaceholder = document.getElementById('detailsPlaceholder');
    const clientInfo = document.getElementById('clientInfo');
    if (chatPlaceholder) chatPlaceholder.classList.remove('hidden');
    if (chatClientName) chatClientName.textContent = 'Nenhum chat selecionado';
    if (chatClientStatus) chatClientStatus.textContent = 'Selecione um cliente para conversar';
    if (chatAvatar) chatAvatar.textContent = '?';
    if (chatMessagesUI && chatPlaceholder) {
        chatMessagesUI.querySelectorAll('.message').forEach(msg => msg.remove());
    }
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.placeholder = "Selecione um chat";
    }
    if (sendButton) sendButton.disabled = true;
    if (closeChatBtn) closeChatBtn.style.display = 'none';
    if (detailsPlaceholder) detailsPlaceholder.classList.remove('hidden');
    if (clientInfo) clientInfo.classList.add('hidden');
    selectedSessionId = null;
    if (document.getElementById('clientList')) {
        renderClientList(clients, 'dashboard');
    }
}

// =======================================================
// FUNÇÕES COMPARTILHADAS (Chat Interno)
// =======================================================
/**
 * Adiciona uma mensagem na UI do chat INTERNO
 * @param {object} msg - O objeto da mensagem { from, content, timestamp, system? }
 */
function appendInternalMessage(msg) {
    const messagesUI = document.getElementById('internalMessages');
    if (!messagesUI) return; 

    const messageEl = document.createElement('div');
    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // --- LÓGICA DE DESTAQUE DE MENÇÃO (SEGURA) ---
    const myMention = `@${attendantName}`;
    let content = msg.content;
    if (content && content.includes(myMention)) {
        messageEl.classList.add('message-mention');
    }

    if (msg.system) {
        messageEl.className = 'message system-message';
        messageEl.innerHTML = `
            <div class="message-content">
                <div class="message-text">
                    <i class="fas fa-info-circle"></i> 
                    <strong>[SISTEMA]</strong> ${msg.content}
                </div>
            </div>`;
    } 
    // Mensagem de Outro Atendente (usa .client para alinhar à esquerda)
    else if (msg.from !== attendantName) {
        messageEl.className = 'message client message-internal'; // Usa .client para esquerda
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.textContent = msg.from.charAt(0).toUpperCase();

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-sender';
        senderSpan.textContent = msg.from;
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.style.whiteSpace = 'pre-wrap';
        
        // Constrói o texto com o highlight (se houver)
        if (content && content.includes(myMention)) {
            const parts = content.split(myMention);
            parts.forEach((part, index) => {
                textDiv.appendChild(document.createTextNode(part));
                if (index < parts.length - 1) {
                    const strong = document.createElement('strong');
                    strong.className = 'mention-highlight';
                    strong.textContent = myMention;
                    textDiv.appendChild(strong);
                }
            });
        } else {
            textDiv.textContent = content || ''; // Rota normal
        }
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = time;

        contentDiv.appendChild(senderSpan);
        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(timeSpan);
        messageEl.appendChild(avatarDiv);
        messageEl.appendChild(contentDiv);
    } 
    // Minha Própria Mensagem (usa .atendente para alinhar à direita)
    else {
        messageEl.className = 'message atendente message-internal'; // Usa .atendente para direita
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.textContent = attendantName.charAt(0).toUpperCase();
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-sender';
        senderSpan.textContent = 'Você';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.style.whiteSpace = 'pre-wrap';
        textDiv.textContent = content || '';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = time;

        contentDiv.appendChild(senderSpan);
        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(timeSpan);
        messageEl.appendChild(avatarDiv);
        messageEl.appendChild(contentDiv);
    }

    messagesUI.appendChild(messageEl);
    messagesUI.scrollTop = messagesUI.scrollHeight;
}

/**
 * Renderiza a lista de atendentes online
 */
function renderAttendantList() {
    const listUI = document.getElementById('attendantList');
    const countUI = document.getElementById('attendantCount');
    
    if (!listUI || !countUI) return; 

    listUI.innerHTML = '';
    countUI.textContent = `(${onlineAttendants.length})`;

    onlineAttendants.sort((a, b) => a.username.localeCompare(b.username));

    onlineAttendants.forEach(attendant => {
        const li = document.createElement('li');
        li.className = 'attendant-item';
        
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = attendant.username.charAt(0).toUpperCase();
        
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = attendant.username;
        
        if (attendant.username === attendantName) {
            name.textContent += ' (Você)';
            name.style.fontWeight = 'bold';
        }

        const role = document.createElement('span');
        role.className = `role ${attendant.role}`;
        role.textContent = attendant.role === 'admin' ? 'Admin' : 'Atendente';
        
        li.appendChild(avatar);
        li.appendChild(name);
        li.appendChild(role);
        listUI.appendChild(li);
    });
}

// =======================================================
// LÓGICA DO MODAL DE REGISTRO (da Casca)
// =======================================================
function setupAdminModal() {
    const navLinkUsers = document.getElementById('nav-link-users');
    const registerUserModal = document.getElementById('registerUserModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const registerForm = document.getElementById('registerForm');
    const registerMessage = document.getElementById('registerMessage');

    if (navLinkUsers) {
        navLinkUsers.addEventListener('click', (e) => {
            e.preventDefault();
            if (registerMessage) registerMessage.style.display = 'none';
            if (registerForm) registerForm.reset();
            if (registerUserModal) registerUserModal.style.display = 'flex';
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (registerUserModal) registerUserModal.style.display = 'none';
        });
    }

    if (registerUserModal) {
        registerUserModal.addEventListener('click', (e) => {
            if (e.target === registerUserModal) {
                registerUserModal.style.display = 'none';
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const password = document.getElementById('registerPassword').value;
            const role = document.getElementById('registerRole').value;
            registerMessage.style.display = 'none';
            registerMessage.className = 'message-feedback';
            try {
                const response = await fetch('/admin/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username, password, role })
                });
                const data = await response.json();
                if (response.ok) {
                    registerMessage.textContent = data.message;
                    registerMessage.classList.add('success');
                    registerForm.reset();
                } else {
                    if(response.status === 401 || response.status === 403) {
                         alert("Sua sessão expirou ou você não tem permissão.");
                         window.location.href = '/admin/login';
                    }
                    registerMessage.textContent = data.message || 'Erro ao registrar.';
                    registerMessage.classList.add('error');
                }
                registerMessage.style.display = 'block';
            } catch (error) {
                console.error('Erro no fetch de registro:', error);
                registerMessage.textContent = 'Erro de conexão com o servidor.';
                registerMessage.classList.add('error');
                registerMessage.style.display = 'block';
            }
        });
    }
}

// =======================================================
// FUNÇÃO DE SOM DE NOTIFICAÇÃO
// =======================================================
function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
        console.warn("Não foi possível tocar o som de notificação.", e);
    }
}
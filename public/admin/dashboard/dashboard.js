// /public/admin/dashboard.js (Versão Completa e Corrigida)

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
    const socket = io();

    // -- Elementos da UI --
    const attendantNameUI = document.getElementById('attendantName');
    const attendantAvatarUI = document.getElementById('attendantAvatar');
    const logoutButton = document.getElementById('logoutButton');
    const clientListUI = document.getElementById('clientList');
    const emptyListMessage = document.getElementById('emptyListMessage');
    const chatHeader = document.getElementById('chatHeader');
    const chatAvatar = document.getElementById('chatAvatar');
    const chatClientName = document.getElementById('chatClientName');
    const chatClientStatus = document.getElementById('chatClientStatus');
    const chatMessagesUI = document.getElementById('chatMessages');
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');
    const sendButton = chatForm.querySelector('.btn-send');
    const clientDetailsPanel = document.getElementById('clientDetailsPanel');
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

    // --- NOVOS Elementos do Modal ---
    const navItemUsers = document.getElementById('nav-item-users');
    const navLinkUsers = document.getElementById('nav-link-users');
    const registerUserModal = document.getElementById('registerUserModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const registerForm = document.getElementById('registerForm');
    const registerMessage = document.getElementById('registerMessage');

    // Variáveis de estado
    let clients = {};
    let selectedSessionId = null;
    const attendantName = sessionStorage.getItem('atendenteUser') || 'Atendente';
    const attendantRole = sessionStorage.getItem('atendenteRole') || 'atendente';


    // --- Configuração Inicial da UI ---
    attendantNameUI.textContent = attendantName;
    attendantAvatarUI.textContent = attendantName.charAt(0).toUpperCase();
    
    // --- NOVO: Mostrar link de "Usuários" se for admin ---
    if (attendantRole === 'admin') {
        if (navItemUsers) {
            navItemUsers.style.display = 'block';
        }
    }

    // --- ATUALIZADO: Evento de Logout ---
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        sessionStorage.removeItem('atendenteUser');
        sessionStorage.removeItem('atendenteRole'); // Limpa a role também
        window.location.href = 'login.html';
    });


    // =======================================================
    // 3. OUVINTES DO SOCKET (EVENTOS DO SERVIDOR)
    // =======================================================
    
    socket.on('connect', () => {
        console.log('Conectado ao servidor, autenticando...');
        socket.emit('admin_auth', token);
    });

    // 3.1. Recebe a lista de clientes
    socket.on('update_client_list', (clientListArray) => {
        console.log("Recebida nova lista de clientes:", clientListArray);
        clients = clientListArray.reduce((acc, client) => {
            if (client.session) {
                acc[client.session.sessionId] = client; 
            }
            return acc;
        }, {});
        renderClientList();
        
        if (selectedSessionId && clients[selectedSessionId]) {
            handleClientClick(clients[selectedSessionId], true); 
        }
    });

    // 3.2. Recebe mensagem de um cliente
    socket.on('client_message', (data) => {
        const { fromSession, fromName, content } = data;
        
        if (clients[fromSession]) {
            if (!clients[fromSession].session.messages) {
                clients[fromSession].session.messages = [];
            }
            clients[fromSession].session.messages.push({ sender: 'client', content, timestamp: new Date() });
        } else {
            console.warn(`Mensagem recebida de sessão desconhecida: ${fromSession}`);
            return;
        }

        if (fromSession === selectedSessionId) {
            appendMessage('client', content, fromName);
        }
        
        const clientItem = document.querySelector(`.client-item[data-id="${fromSession}"]`);
        if (clientItem) {
            const assignedTo = clients[fromSession].session.assignedTo;
            if (!assignedTo) {
                 clientItem.querySelector('.client-last-message').textContent = content;
            }
           
            if (fromSession !== selectedSessionId) {
                clientItem.querySelector('.client-new-badge')?.classList.remove('hidden');
            }
        }
    });

    // 3.3. Erros de autenticação
    socket.on('auth_error', (errorMessage) => {
        console.error('Erro de autenticação:', errorMessage);
        alert('Sua sessão expirou ou é inválida. Por favor, faça login novamente.');
        localStorage.removeItem('adminToken');
        window.location.href = 'login.html';
    });
    
    socket.on('message_error', (data) => {
        if(data.toSession === selectedSessionId) {
            alert(`Erro: ${data.error}`);
             if (clients[selectedSessionId]) {
                handleClientClick(clients[selectedSessionId], true);
            }
        }
    });

    // 3.4. Desconexões forçadas
    socket.on('disconnect', (reason) => {
        if (reason === 'io server disconnect') {
            console.log('Desconectado pelo servidor (provavelmente auth).');
            localStorage.removeItem('adminToken');
            window.location.href = 'login.html';
        }
        console.log('Desconectado do servidor. Razão:', reason);
    });

    // =======================================================
    // 4. LÓGICA DA UI (EVENTOS DO USUÁRIO)
    // =======================================================

    // 4.1. Lógica para enviar mensagem
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const content = messageInput.value.trim();

        if (content && selectedSessionId) {
            socket.emit('admin_message', {
                content: content,
                toSession: selectedSessionId
            });
            
            const messageData = { sender: 'atendente', content: content, timestamp: new Date(), attendantName: attendantName };
            if (!clients[selectedSessionId].session.messages) {
                 clients[selectedSessionId].session.messages = [];
            }
            clients[selectedSessionId].session.messages.push(messageData);
            
            appendMessage('atendente', content, attendantName);
            messageInput.value = '';
            messageInput.focus(); // Mantém o foco
        }
    });

    // 4.2. Função para renderizar a lista de clientes
    function renderClientList() {
        clientListUI.innerHTML = '';
        
        let clientArray = Object.values(clients);

        if (attendantRole === 'atendente') {
            clientArray = clientArray.filter(client => {
                const assignedTo = client.session.assignedTo;
                // Mostra se o chat não tem dono (!assignedTo) OU se o dono sou eu
                return !assignedTo || assignedTo === attendantName;
            });
        }
        // Admins verão todos os chats (não entra no 'if')

        if (clientArray.length === 0) {
            emptyListMessage.textContent = (attendantRole === 'admin') 
                ? "Nenhum cliente ativo no momento."
                : "Nenhum chat na sua fila.";
            emptyListMessage.classList.remove('hidden');
            return;
        }

        emptyListMessage.classList.add('hidden');
        
        clientArray.sort((a, b) => new Date(b.session.updatedAt) - new Date(a.session.updatedAt));

        clientArray.forEach(client => {
            const session = client.session;
            const clientName = session.clientData?.name || `Cliente ${session.sessionId.slice(8, 12)}`;
            const sessionId = session.sessionId;
            const assignedTo = session.assignedTo; 

            const li = document.createElement('li');
            li.className = 'client-item';
            li.dataset.id = sessionId;

            if (!client.socketId) {
                li.classList.add('offline');
            }

            if (sessionId === selectedSessionId) {
                li.classList.add('selected');
            }
            
             if (assignedTo && assignedTo !== attendantName) {
                li.classList.add('assigned-other');
            }

            const messages = session.messages || [];
            const lastMessage = messages[messages.length - 1];
            let lastMessageContent = "Novo cliente conectado."; // Padrão
            
            if (lastMessage) {
                if(lastMessage.sender === 'client') {
                    lastMessageContent = lastMessage.content;
                } else if (lastMessage.sender === 'atendente') {
                    lastMessageContent = `Você: ${lastMessage.content}`;
                } else if (lastMessage.sender === 'system') {
                    lastMessageContent = "Cliente preencheu o formulário.";
                }
            }

            // Prioriza mostrar quem está atendendo (se for admin)
            if(assignedTo && attendantRole === 'admin') {
                lastMessageContent = `Atendido por: ${assignedTo}`;
            }

            li.innerHTML = `
                <div class="avatar">${clientName.charAt(0).toUpperCase()}</div>
                <div class="client-info">
                    <span class="client-name">${clientName}</span>
                    <span class="client-last-message">${lastMessageContent}</span>
                </div>
                <div class="client-meta">
                    <span class="client-timestamp">${new Date(session.updatedAt || session.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span class="client-new-badge hidden"><i class="fas fa-circle"></i></span>
                </div>
            `;

            li.addEventListener('click', () => handleClientClick(client));
            clientListUI.appendChild(li);
        });
    }

    // 4.3. Função para quando um cliente é clicado
    function handleClientClick(client, isRefresh = false) {
        // --- Lógica para responsividade móvel (se aplicável) ---
        const chatMain = document.querySelector('.dashboard-chat');
        if (chatMain) {
            chatMain.classList.add('active'); // Mostra a tela de chat no mobile
        }

        const session = client.session;
        const clientName = session.clientData?.name || `Cliente ${session.sessionId.slice(8, 12)}`;
        
        selectedSessionId = session.sessionId;
        
        if (!isRefresh) {
             renderClientList(); 
        }
        
        chatPlaceholder.classList.add('hidden');
        chatClientName.textContent = clientName;
        chatClientStatus.textContent = session.clientData?.email || `ID: ${session.sessionId}`;
        chatAvatar.textContent = clientName.charAt(0).toUpperCase();

        const assignedTo = session.assignedTo;
        const isAssignedToMe = (assignedTo === attendantName);
        const isUnassigned = (!assignedTo);
        const isAdmin = (attendantRole === 'admin'); 

        if (client.socketId) {
            // Cliente está online
            if (isAssignedToMe || isUnassigned || isAdmin) {
                messageInput.disabled = false;
                sendButton.disabled = false;
                
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
                // Atendido por OUTRO e eu NÃO SOU ADMIN
                messageInput.disabled = true;
                sendButton.disabled = true;
                messageInput.placeholder = `Atendido por ${assignedTo}`;
                chatClientStatus.style.color = 'var(--warning)';
                chatClientStatus.textContent = `Atendido por ${assignedTo}`;
            }
        } else {
            // Cliente está offline
            messageInput.disabled = true;
            sendButton.disabled = true;
            messageInput.placeholder = "Cliente Offline";
            chatClientStatus.style.color = 'var(--text-muted)';
            chatClientStatus.textContent = 'Cliente Offline';
             if (assignedTo) {
                chatClientStatus.textContent += ` (Atendido por ${assignedTo})`;
            }
        }

        // Carrega o histórico de mensagens
        if (!isRefresh) {
            chatMessagesUI.innerHTML = '';
            
            // Histórico da IA (se houver)
            session.history?.forEach(msg => {
                appendMessage(msg.role === 'user' ? 'client' : 'bot-history', msg.content, msg.role === 'user' ? clientName : "Assistente IA", true);
            });
            
            // Histórico do Atendimento Humano (IA e Sistema)
            session.messages?.forEach(msg => {
                const name = (msg.sender === 'client') ? clientName : 
                             (msg.sender === 'atendente') ? (msg.attendantName || 'Atendente') :
                             'Sistema'; // 'system' ou qualquer outro
                appendMessage(msg.sender, msg.content, name, true);
            });
            
            // Rola para o final após carregar
            chatMessagesUI.scrollTop = chatMessagesUI.scrollHeight;
        }


        // Coluna 4: Preenche os Detalhes
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

    // 4.4. Função para adicionar uma mensagem na tela
    function appendMessage(sender, content, fromName, isLoadingHistory = false) {
        chatPlaceholder.classList.add('hidden');
        
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', sender); // 'client', 'atendente', 'bot-history', ou 'system'
        
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
            // Lógica normal para 'client' e 'atendente'
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
        }
    }


    // =======================================================
    // 5. NOVO: LÓGICA DO MODAL DE REGISTRO
    // =======================================================

    // --- Abrir o modal ---
    if (navLinkUsers) {
        navLinkUsers.addEventListener('click', (e) => {
            e.preventDefault();
            registerMessage.style.display = 'none'; // Limpa mensagens antigas
            registerForm.reset(); // Limpa o formulário
            registerUserModal.style.display = 'flex';
        });
    }

    // --- Fechar o modal (Botão X) ---
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            registerUserModal.style.display = 'none';
        });
    }

    // --- Fechar o modal (Clicando fora) ---
    if (registerUserModal) {
        registerUserModal.addEventListener('click', (e) => {
            // Fecha apenas se clicar no overlay (fundo)
            if (e.target === registerUserModal) {
                registerUserModal.style.display = 'none';
            }
        });
    }

    // --- Enviar o formulário de registro ---
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('registerUsername').value;
            const password = document.getElementById('registerPassword').value;
            const role = document.getElementById('registerRole').value;
            
            // Limpa mensagens de feedback
            registerMessage.style.display = 'none';
            registerMessage.className = 'message-feedback';

            try {
                const response = await fetch('/admin/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` // Envia o token de admin
                    },
                    body: JSON.stringify({ username, password, role })
                });

                const data = await response.json();

                if (response.ok) {
                    // Sucesso
                    registerMessage.textContent = data.message;
                    registerMessage.classList.add('success');
                    registerForm.reset();
                } else {
                    // Erro (ex: 403, 409)
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

    // --- Lógica de responsividade (Mobile) ---
    // Adiciona listener para voltar da tela de chat para a lista
    if (chatHeader) {
        chatHeader.addEventListener('click', () => {
            // Em telas pequenas, isso "fecha" a tela de chat
            if (window.innerWidth <= 768) {
                const chatMain = document.querySelector('.dashboard-chat');
                if (chatMain) {
                    chatMain.classList.remove('active');
                }
                selectedSessionId = null; // Desseleciona o chat
                renderClientList(); // Re-renderiza a lista para tirar a seleção
            }
        });
    }

});


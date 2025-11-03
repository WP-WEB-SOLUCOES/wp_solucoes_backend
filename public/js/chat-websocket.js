// /public/js/chat-websocket.js
// ATUALIZADO para funcionar com o server.js baseado em 'sessionId'

class ChatWebSocket {
    constructor(chatIAInstance) {
        this.socket = null;
        this.chatIA = chatIAInstance; // Referência à sua classe ChatIA principal
        
        // Esta variável (clientData) não é mais usada por esta classe.
        // O 'chat-ia.js' vai enviá-la via HTTP para '/api/chat/save-client'.
    }

    connect() {
        // 1. Pega o sessionId da instância principal do ChatIA
        const sessionId = this.chatIA.sessionId;
        if (!sessionId) {
            console.error("WebSocket: Não foi possível conectar, sessionId está nulo.");
            return;
        }

        // 2. Conecta ao servidor (ou reconecta se já existia)
        if (this.socket && this.socket.connected) {
            console.log('Socket já está conectado.');
            return;
        }

        this.socket = io();

        // 3. --- Ouvintes de Eventos do Socket ---

        this.socket.on('connect', () => {
            console.log(`Chat WebSocket Conectado (Socket ID: ${this.socket.id}).`);
            
            // 4. Envia 'client_join' com o NOVO formato (sessionId)
            // Isso diz ao servidor a qual "sessão" este socket pertence.
            this.socket.emit('client_join', { sessionId: sessionId });
        });

        // *** MUDANÇA AQUI (NOVO EVENTO) ***
        // 5. Ouve pelo evento que informa que o atendente entrou
        this.socket.on('attendant_joined', (data) => {
            const { name } = data; // Nome do atendente
            console.log(`Atendente ${name} entrou no chat.`);
            
            // Atualiza a UI para mostrar que um humano está ativo
            this.chatIA.hideTransferIndicator();
            this.chatIA.updateInterfaceForHumanMode(name); // Passa o nome
        });


        // 6. Ouve por mensagens do Atendente
        this.socket.on('server_message', (data) => {
            // *** MUDANÇA AQUI ***
            const { content, from } = data; // 'from' agora é o NOME DO ATENDENTE
            
            // Usa o método do ChatIA para adicionar a mensagem na tela
            this.chatIA.addMessage({
                text: content,
                isBot: true, // 'isBot' aqui significa "não é o usuário"
                isAttendant: true, // *** NOVO: Flag para avatar
                attendantName: from, // *** NOVO: Passa o nome
                timestamp: new Date()
            });

            // Atualiza a UI (garante que está com nome certo)
            this.chatIA.hideTransferIndicator();
            this.chatIA.updateInterfaceForHumanMode(from); // Passa o nome
        });

        // 7. Ouve por desconexões
        this.socket.on('disconnect', () => {
            console.log('Desconectado do servidor de chat humano.');
            // O ChatIA mostrará um erro se o usuário tentar enviar uma msg
        });

        // 8. Ouve por erros (ex: se o atendente tentar falar com um cliente que já saiu)
        this.socket.on('message_error', (data) => {
            console.warn('Erro do servidor de chat:', data.error);
            this.chatIA.addMessage({
                text: `⚠️ **O atendente foi desconectado.** Estamos tentando reconectar...`,
                isBot: true,
                timestamp: new Date()
            });
        });
    }

    // 9. Método para ENVIAR MENSAGEM (chamado pelo chat-ia.js)
    sendMessage(messageText) {
        const sessionId = this.chatIA.sessionId;

        if (this.socket && this.socket.connected) {
            // 10. Envia 'client_message' com o NOVO formato (objeto)
            this.socket.emit('client_message', { 
                content: messageText, 
                sessionId: sessionId 
            });
        } else {
            console.error("Socket não está conectado. Não é possível enviar mensagem.");
            // Mostra um erro e tenta reconectar
            this.chatIA.addMessage({
                text: "⚠️ **Conexão perdida.** Tentando reconectar...",
                isBot: true,
                timestamp: new Date()
            });
            this.connect(); // Tenta reconectar
        }
    }
}
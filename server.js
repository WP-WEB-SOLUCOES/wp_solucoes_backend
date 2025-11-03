// server.js - Versão CORRIGIDA (sem HSTS em dev, com cookie path)

// =======================================================
// 1. Importações e Configuração
// =======================================================
require('dotenv').config(); 
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const Groq = require('groq-sdk');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const { exec } = require('child_process');

// --- Configuração Principal (Carregada do .env) ---
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Mudei para 0.0.0.0 para ser acessível externamente
const JWT_SECRET = process.env.JWT_SECRET;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Validação de configuração
if (!MONGO_URI || !JWT_SECRET || !GROQ_API_KEY || !WEBHOOK_SECRET) {
    console.error("Erro: Variáveis de ambiente (MONGO_URI, JWT_SECRET, GROQ_API_KEY, WEBHOOK_SECRET) não estão definidas.");
    process.exit(1);
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

// =======================================================
// 2. Sistema de IA Aprimorado
// =======================================================
class AIChatManager {
    constructor() {
        this.conversationContexts = new Map();
    }
    getContext(sessionId) {
        if (!this.conversationContexts.has(sessionId)) {
            this.conversationContexts.set(sessionId, []);
        }
        return this.conversationContexts.get(sessionId);
    }
    updateContext(sessionId, role, content) {
        const context = this.getContext(sessionId);
        context.push({ role, content });
        if (context.length > 6) context.splice(0, context.length - 6);
    }
    shouldTransferToHuman(message) {
        const transferTriggers = [
            'falar com atendente', 'atendente humano', 'falar com gente',
            'consultor', 'especialista', 'quero contratar', 'fechar negócio',
            'proposta comercial', 'reunião', 'telefone', 'whatsapp',
            'ligar', 'contato direto', 'falar com alguém', 'falar com pessoa'
        ];
        const lower = message.toLowerCase();
        return transferTriggers.some(trigger => lower.includes(trigger));
    }
    getSystemPrompt() {
        return `Você é o Assistente IA da WP Web Soluções, uma empresa de desenvolvimento de software.
# SUA PERSONALIDADE:
- Amigável, natural e conversacional
- Técnico mas acessível 
- Entusiástico em ajudar
- Transparente sobre preços e prazos
# CONHECIMENTO SOBRE A EMPRESA:
* O nome da empresa vem de World Programmed Web Soluções ou seja Mundo Programado
• Desenvolvemos apps, sites, sistemas web e automações
• Apps: normalmente R$ 8.000 - R$ 25.000 (2-4 meses)
• Sites: R$ 1.500 - R$ 8.000 (1-6 semanas)  
• Sistemas: R$ 12.000+ (2-5 meses)
• Trabalhamos com Python, Node.js, React, Flutter, etc.
# FORMA DE RESPONDER:
- RESPOSTAS CURTAS E OBJETIVAS Visando converter o visitante em lead
- NUNCA use formatação rígida como "Stack:", "Tempo:", "Investimento:"
- NUNCA faça listas com bullets se não for natural
- NUNCA repita exatamente a mesma estrutura de resposta
- Fale como uma pessoa real, variando suas respostas
- Seja específico quando perguntarem sobre preços
- Para dúvidas conceituais, explique de forma clara
# TRANSFERÊNCIA:
Só transfira para atendente humano quando o cliente pedir explicitamente ou demonstrar intenção clara de fechar negócio.
Responda EXATAMENTE como um especialista real conversaria, sem scripts pré-definido.`;
    }
    async getAIResponse(userMessage, sessionId) {
        if (this.shouldTransferToHuman(userMessage)) {
            return "transfer_to_human";
        }
        try {
            const context = this.getContext(sessionId);
            const messagesForGroq = [
                { role: "system", content: this.getSystemPrompt() },
                ...context.slice(-4),
                { role: "user", content: userMessage }
            ];
            const completion = await groq.chat.completions.create({
                model: "llama-3.1-8b-instant",
                messages: messagesForGroq,
                temperature: 0.8,
                max_tokens: 600,
                top_p: 0.9,
            });
            const response = completion.choices[0]?.message?.content?.trim();
            if (!response) { throw new Error('Resposta vazia'); }
            this.updateContext(sessionId, 'assistant', response);
            return response;
        } catch (error) {
            console.error("Erro Groq API:", error);
            return "Hmm, estou com uma instabilidade aqui. Pode repetir sua pergunta? Se preferir, posso conectar você com nosso time humano.";
        }
    }
    getWelcomeMessage() {
        return `👋 Olá! Sou o assistente IA da WP Web Soluções. 
Posso ajudar você com dúvidas sobre desenvolvimento de software, orçamentos ou explicar como trabalhamos. 
Pode falar naturalmente comigo! Do que você precisa?`;
    }
}

// =======================================================
// 3. Inicialização do Gerenciador de IA
// =======================================================
const aiManager = new AIChatManager();

// =======================================================
// 4. Schemas do MongoDB
// =======================================================
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
        type: String,
        default: 'atendente',
        enum: ['atendente', 'admin']
    }
});
const ChatSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    clientData: { type: Object, default: {} },
    messages: { type: Array, default: [] },
    history: { type: Array, default: [] },
    status: { type: String, default: 'active' },
    assignedTo: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);
const ChatSession = mongoose.model('ChatSession', ChatSessionSchema);

// =======================================================
// 5. Conexão MongoDB
// =======================================================
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB conectado com sucesso.'))
    .catch(err => {
        console.error('Falha na conexão com o MongoDB:', err.message);
        process.exit(1);
    });

// =======================================================
// 6. Configuração Express e Middlewares
// =======================================================
const app = express();

// =======================================================
// 6.5 ROTA DE AUTO-DEPLOY (GITHUB WEBHOOK)
// =======================================================
// Usamos express.raw() para o webhook ANTES do express.json()
app.post('/github-webhook', express.raw({ type: 'application/json' }), (req, res) => {
    console.log('Webhook do GitHub recebido...');

    try {
        // 1. Verificar o Segredo
        const signature = req.get('X-Hub-Signature-256');
        if (!signature) {
            console.warn('Webhook rejeitado: Sem assinatura.');
            return res.status(401).send('Assinatura X-Hub-Signature-256 é obrigatória.');
        }

        const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
        const digest = 'sha256=' + hmac.update(req.body).digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
            console.warn('Webhook rejeitado: Assinatura inválida.');
            return res.status(401).send('Assinatura inválida.');
        }

        // 2. Verificar o Evento
        const event = req.get('X-GitHub-Event');
        const data = JSON.parse(req.body.toString());

        // A. Se for o evento "ping" (teste do GitHub)
        if (event === 'ping') {
            console.log('Evento "ping" do GitHub recebido com sucesso.');
            return res.status(200).send('Ping recebido com sucesso.');
        }

        // B. Se for um push para a branch 'main'
        if (event === 'push' && data.ref === 'refs/heads/main') {
            console.log('Push para a branch [main] detectado. Iniciando deploy...');
            res.status(202).send('Deploy iniciado.'); // Responde ao GitHub primeiro

            // Executa o script
            const deployScript = path.join(__dirname, 'deploy.sh');
            exec(`sh ${deployScript}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Erro ao executar deploy.sh: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`Stderr do deploy.sh: ${stderr}`);
                    return;
                }
                console.log(`Stdout do deploy.sh: \n${stdout}`);
            });

        } else {
            console.log('Webhook recebido, mas não é um push para a [main]. Ignorando.');
            res.status(200).send('Evento recebido, mas ignorado.');
        }

    } catch (error) {
        console.error('Erro GERAL na rota /github-webhook:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

// Middlewares Padrão (DEPOIS do webhook raw)
app.use(express.json());
app.use(cookieParser());

// --- Middleware de Segurança Helmet ---
// <<< CORREÇÃO CRÍTICA >>>
const helmetConfig = { 
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], 
        scriptSrc: ["'self'"], 
        styleSrc: [
          "'self'", 
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com", 
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'", 
          "https://fonts.gstatic.com",  
          "https://cdnjs.cloudflare.com" 
        ],
        connectSrc: ["'self'", "wss:", "https://api.groq.com"], 
        imgSrc: ["'self'", "data:"],
        frameSrc: ["'none'"], 
        objectSrc: ["'none'"], 
      },
    }
};
// Só adiciona HSTS se estiver em produção
if (IS_PRODUCTION) {
    helmetConfig.hsts = {
        maxAge: 31536000, // 1 ano
        includeSubDomains: true,
        preload: true
    };
}
app.use(helmet(helmetConfig));
// <<< FIM DA CORREÇÃO >>>


// --- Rotas Públicas de PÁGINA (Antes do 'static') ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'main.html'));
});

// --- Proteção contra Força Bruta no Login ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10,
    message: {
        success: false,
        message: 'Muitas tentativas de login deste IP. Tente novamente após 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Rota de Login Admin (com Cookie HttpOnly) ---
app.post('/admin/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
        }
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
        }
        const isValid = await argon2.verify(user.passwordHash, password);
        if (isValid) {
            console.log(`Atendente ${user.username} (Role: ${user.role}) logou com sucesso.`);
            const token = jwt.sign(
                { id: user._id, username: user.username, role: user.role },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            // <<< CORREÇÃO CRÍTICA >>>
            res.cookie('token', token, {
                httpOnly: true,
                secure: IS_PRODUCTION, // Só será true em produção
                sameSite: 'strict',
                maxAge: 3600 * 1000,
                path: '/admin'
            });

            res.json({
                success: true,
                user: { username: user.username, role: user.role }
            });

        } else {
            console.warn(`Tentativa de login falha para ${username}`);
            res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
        }
    } catch (error) {
        console.error('Erro na rota de login:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

// --- Rota de Logout (Limpa o Cookie) ---
app.get('/admin/logout', (req, res) => {
    // <<< CORREÇÃO CRÍTICA >>>
    res.clearCookie('token', {
        httpOnly: true,
        secure: IS_PRODUCTION, // Só será true em produção
        sameSite: 'strict',
        path: '/admin' 
    });
    res.json({ success: true, message: 'Logout efetuado com sucesso.' });
});

// --- Rota da API de Chat (Pública) ---
app.post('/api/chat/message', async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        if (!message || !sessionId) {
            return res.status(400).json({ success: false, error: 'Mensagem e sessionId são obrigatórios' });
        }
        const response = await aiManager.getAIResponse(message, sessionId);
        await ChatSession.findOneAndUpdate(
            { sessionId },
            {
                $push: { history: { role: 'user', content: message, timestamp: new Date() } },
                updatedAt: new Date()
            },
            { upsert: true }
        );
        if (response !== "transfer_to_human") {
            await ChatSession.findOneAndUpdate(
                { sessionId },
                {
                    $push: { history: { role: 'assistant', content: response, timestamp: new Date() } },
                    updatedAt: new Date()
                }
            );
        }
        res.json({
            success: true,
            response: response,
            transferToHuman: response === "transfer_to_human"
        });
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        res.status(500).json({
            success: false,
            response: "Desculpe, estou com problemas técnicos. Tente novamente."
        });
    }
});

// =======================================================
// 7. Sistema de Socket.io
// =======================================================
const server = http.createServer(app);
const io = socketIo(server);
const clients = new Map();
const attendants = new Map();

// --- Funções de Broadcast ---
function getFilteredClientList(role, username) {
    const fullList = Array.from(clients.values());
    if (role === 'admin') {
        return fullList;
    }
    return fullList.filter(client => {
        const assignedTo = client.session.assignedTo;
        return !assignedTo || assignedTo === username;
    });
}
function broadcastClientList() {
    for (const attendant of attendants.values()) {
        const filteredList = getFilteredClientList(attendant.role, attendant.username);
        io.to(attendant.socketId).emit('update_client_list', filteredList);
    }
}
function broadcastAttendantList() {
    const list = Array.from(attendants.values()).map(a => ({ 
        username: a.username, 
        role: a.role 
    }));
    io.to('admin_room').emit('update_attendant_list', list);
}

// --- Middleware de Verificação de Admin (lendo cookie) ---
const verifyAdmin = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        if (req.path.startsWith('/pages/')) {
            return res.redirect('/admin/login'); // Rota limpa
        }
        return res.status(401).json({ success: false, message: 'Token não fornecido.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        if (req.path === '/admin/register') {
            if (decoded.role === 'admin') next();
            else return res.status(403).json({ success: false, message: 'Acesso negado. Requer privilégios de administrador.' });
        }
        else if (req.path === '/api/chat/history') {
            if (decoded.role === 'admin' || decoded.role === 'atendente') next();
            else return res.status(403).json({ success: false, message: 'Acesso negado.' });
        }
        else if (req.path.startsWith('/pages/')) {
             if (decoded.role === 'admin' || decoded.role === 'atendente') next();
             else return res.status(403).send('Acesso negado.');
        }
    } catch (error) {
        if (req.path.startsWith('/pages/')) {
            return res.redirect('/admin/login'); // Rota limpa
        }
        return res.status(401).json({ success: false, message: 'Token inválido ou expirado.' });
    }
};

// --- Rotas Protegidas ---
app.post('/admin/register', verifyAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: 'Usuário, senha e função (role) são obrigatórios.' });
        }
        if (role !== 'admin' && role !== 'atendente') {
            return res.status(400).json({ success: false, message: 'Função (role) deve ser "admin" ou "atendente".' });
        }
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Este nome de usuário já está em uso.' });
        }
        const passwordHash = await argon2.hash(password);
        const newUser = new User({
            username: username.toLowerCase(),
            passwordHash,
            role
        });
        await newUser.save();
        res.status(201).json({ success: true, message: `Usuário '${username}' criado com sucesso como ${role}.` });
    } catch (error) {
        console.error('Erro ao registrar novo usuário:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

app.get('/api/chat/history', verifyAdmin, async (req, res) => {
    try {
        let query = { status: 'closed' };
        if (req.user.role !== 'admin') {
            query.assignedTo = req.user.username;
        }
        const closedChats = await ChatSession.find(query)
            .sort({ updatedAt: -1 })
            .limit(100);
        res.json({ success: true, chats: closedChats });
    } catch (error) {
        console.error('Erro ao buscar histórico de chats:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

app.get('/pages/dashboard', verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});
app.get('/pages/historico', verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'historico.html'));
});
app.get('/pages/internals', verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'internals.html'));
});

// --- Rota de Salvar Cliente (Pública) ---
app.post('/api/chat/save-client', async (req, res) => {
    try {
        const { sessionId, clientData } = req.body;
        const systemMessageContent = `👤 Novo cliente conectado:
Nome: ${clientData.name}
E-mail: ${clientData.email}
WhatsApp: ${clientData.phone}
Projeto: ${clientData.project || 'Não informado'}
Urgência: ${clientData.urgency || 'Não informada'}
Mensagem: ${clientData.message || 'Sem mensagem adicional'}`;
        const systemMessage = {
            sender: 'system',
            content: systemMessageContent,
            timestamp: new Date()
        };
        const updatedSession = await ChatSession.findOneAndUpdate(
            { sessionId },
            {
                clientData,
                updatedAt: new Date(),
                status: 'waiting_human',
                $push: { messages: systemMessage }
            },
            { upsert: true, new: true }
        );
        const clientEntry = clients.get(sessionId);
        if (clientEntry) {
            clientEntry.session = updatedSession;
        } else {
            clients.set(sessionId, {
                socketId: null,
                session: updatedSession
            });
        }
        broadcastClientList();
        res.json({ success: true, message: 'Dados salvos com sucesso' });
    } catch (error) {
        console.error('Erro ao salvar dados do cliente:', error);
        res.status(500).json({ success: false, error: 'Erro ao salvar dados' });
    }
});

// --- Servidor de Arquivos Estáticos (DEVE VIR POR ÚLTIMO) ---
app.use(express.static(path.join(__dirname, 'public')));


// --- Middleware de Autenticação do Socket.io ---
io.use((socket, next) => {
    const cookieString = socket.handshake.headers.cookie;
    if (!cookieString) {
        return next(); // Cliente normal
    }
    const cookies = cookieString.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.split('=').map(s => s.trim());
        acc[key] = value;
        return acc;
    }, {});
    const token = cookies.token; 
    if (!token) {
        return next(); // Cliente sem token de admin
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded; // Anexa dados do admin ao socket
    } catch (err) {
        console.warn(`Autenticação de socket falhou: ${err.message}`);
    }
    next();
});

// --- Lógica de Conexão do Socket.io ---
io.on('connection', (socket) => {

    // --- Autenticação Automática de Admin ---
    if (socket.user) {
        const adminName = socket.user.username;
        const adminRole = socket.user.role || 'atendente';
        socket.join('admin_room');
        attendants.set(socket.id, {
            username: adminName,
            socketId: socket.id,
            role: adminRole
        });
        console.log(`Atendente ${adminName} (Role: ${adminRole}) autenticado via cookie`);
        broadcastAttendantList(); 
        (async () => {
            try {
                const allActiveSessions = await ChatSession.find({
                    status: { $in: ['active', 'waiting_human', 'in_progress'] }
                });
                allActiveSessions.forEach(session => {
                    const clientEntry = clients.get(session.sessionId);
                    if (clientEntry) clientEntry.session = session;
                    else clients.set(session.sessionId, { socketId: null, session: session });
                });
                const initialList = getFilteredClientList(adminRole, adminName);
                socket.emit('update_client_list', initialList);
            } catch(err) {
                console.error("Erro ao buscar sessões para admin recém-conectado:", err);
            }
        })();
    }
    // --- Fim da Autenticação de Admin ---

    // --- Eventos de Cliente ---
    socket.on('client_join', async (data) => {
        if (socket.user) return;
        const { sessionId } = data;
        if (!sessionId) return;
        try {
            let session = await ChatSession.findOne({ sessionId });
            if (!session) {
                session = await new ChatSession({
                    sessionId,
                    clientData: { name: `Cliente ${sessionId.slice(8, 12)}` },
                    status: 'active'
                }).save();
            }
            clients.set(sessionId, { socketId: socket.id, session: session });
            console.log(`Cliente ${sessionId} conectado (Socket: ${socket.id})`);
            broadcastClientList();
        } catch (error) {
            console.error("Erro ao buscar/criar sessão do cliente:", error);
        }
    });

    socket.on('client_message', async (data) => {
        if (socket.user) return;
        const { content, sessionId } = data;
        if (!content || typeof content !== 'string' || content.length > 5000) {
            console.warn(`Cliente ${sessionId} enviou mensagem inválida.`);
            return;
        }
        const client = clients.get(sessionId);
        if (!client) return;
        const messageData = { sender: 'client', content, timestamp: new Date() };
        if (!client.session.messages) client.session.messages = [];
        client.session.messages.push(messageData);
        try {
            await ChatSession.findOneAndUpdate(
                { sessionId },
                { $push: { messages: messageData }, updatedAt: new Date() }
            );
        } catch (err) {
            console.error('Erro ao atualizar mensagens no DB:', err);
        }
        io.to('admin_room').emit('client_message', {
            content: content,
            fromSession: sessionId,
            fromName: client.session.clientData?.name || `Cliente ${sessionId.slice(8, 12)}`
        });
        broadcastClientList();
    });

    // --- Eventos de Admin ---
    socket.on('admin_message', async (data) => {
        if (!socket.user) return;
        const attendant = attendants.get(socket.id);
        if (!attendant) return;
        const { content, toSession } = data;
        if (!content || typeof content !== 'string' || content.length > 5000) {
            console.warn(`Atendente ${attendant.username} enviou mensagem inválida.`);
            return;
        }
        const client = clients.get(toSession);
        if (!client) {
            socket.emit('message_error', { error: 'Cliente não encontrado', toSession });
            return;
        }
        const attendantName = attendant.username;
        const attendantRole = attendant.role;
        const currentOwner = client.session.assignedTo;
        const isUnassigned = !currentOwner;
        const isAssignedToMe = (currentOwner === attendantName);
        const isAdmin = (attendantRole === 'admin');
        let needsToNotifyClient = false;
        let needsToUpdateDB = false;
        if (isUnassigned) {
            client.session.assignedTo = attendantName;
            client.session.status = 'in_progress';
            needsToNotifyClient = true;
            needsToUpdateDB = true;
        } else if (!isAssignedToMe && !isAdmin) {
            socket.emit('message_error', { error: `Este chat já está sendo atendido por ${currentOwner}`, toSession });
            return;
        } else if (!isAssignedToMe && isAdmin) {
            client.session.assignedTo = attendantName;
            client.session.status = 'in_progress';
            needsToNotifyClient = true;
            needsToUpdateDB = true;
        }
        if (needsToUpdateDB) {
            await ChatSession.findOneAndUpdate(
                { sessionId: toSession },
                { assignedTo: attendantName, status: 'in_progress', updatedAt: new Date() }
            );
        }
        if (needsToNotifyClient && client.socketId) {
            io.to(client.socketId).emit('attendant_joined', { name: attendantName });
        }
        const messageData = {
            sender: 'atendente',
            content,
            attendantName: attendantName,
            timestamp: new Date()
        };
        if (!client.session.messages) client.session.messages = [];
        client.session.messages.push(messageData);
        try {
            await ChatSession.findOneAndUpdate(
                { sessionId: toSession },
                { $push: { messages: messageData }, updatedAt: new Date() }
            );
        } catch (err) {
            console.error('Erro ao atualizar mensagens no DB:', err);
        }
        if (client.socketId) {
            io.to(client.socketId).emit('server_message', { content: content, from: attendantName });
        }
        broadcastClientList();
    });

    socket.on('admin_close_chat', async (data) => {
        if (!socket.user) return;
        const attendant = attendants.get(socket.id);
        if (!attendant) return;
        const { sessionId } = data;
        const client = clients.get(sessionId);
        if (!client) return;
        const isOwner = (client.session.assignedTo === attendant.username);
        const isAdmin = (attendant.role === 'admin');
        if (isOwner || isAdmin) {
            console.log(`Atendente ${attendant.username} fechou o chat ${sessionId}`);
            await ChatSession.findOneAndUpdate(
                { sessionId: sessionId },
                { status: 'closed', updatedAt: new Date() }
            );
            clients.delete(sessionId);
            if (client.socketId) {
                io.to(client.socketId).emit('chat_closed_by_admin', { message: 'Este atendimento foi encerrado.' });
            }
            broadcastClientList();
        } else {
            socket.emit('message_error', { error: 'Você não tem permissão para fechar este chat.', toSession: sessionId });
        }
    });
    
    socket.on('internal_message', async (data) => {
        if (!socket.user) return;
        const attendant = attendants.get(socket.id);
        if (!attendant) return;
        
        const { content } = data;
        if (!content || typeof content !== 'string' || content.length > 2000) {
             console.warn(`Atendente ${attendant.username} enviou mensagem interna inválida.`);
            return;
        }
        
        const messagePayload = {
            from: attendant.username,
            content: content,
            timestamp: new Date()
        };
        const mentions = content.match(/@(\w+)/g);
        if (mentions) {
            const mentionedUsernames = mentions.map(m => m.substring(1));
            attendants.forEach(attendantEntry => {
                if (
                    mentionedUsernames.includes(attendantEntry.username) &&
                    attendantEntry.socketId !== socket.id
                ) {
                    io.to(attendantEntry.socketId).emit('you_were_mentioned', {
                        from: attendant.username,
                        content: content
                    });
                }
            });
        }
        io.to('admin_room').emit('new_internal_message', messagePayload);
    });

    // --- Desconexão ---
    socket.on('disconnect', () => {
        let needsUpdate = false;
        for (const [sessionId, client] of clients.entries()) {
            if (client.socketId === socket.id) {
                client.socketId = null;
                console.log(`Cliente ${sessionId} desconectado (marcado como offline)`);
                needsUpdate = true;
                break;
            }
        }
        if (attendants.has(socket.id)) {
            const attendant = attendants.get(socket.id);
            console.log(`Atendente ${attendant.username} desconectado`);
            attendants.delete(socket.id);
            broadcastAttendantList(); 
        }
        if (needsUpdate) {
            broadcastClientList();
        }
    });
});

// =======================================================
// 8. Iniciar Servidor
// =======================================================
server.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
    console.log(`🤖 Sistema de IA inicializado`);
    console.log(`💬 Chat em tempo pronto para conexões`);
    if (IS_PRODUCTION) {
        console.log("Rodando em modo de Produção (HSTS Habilitado)");
    } else {
        console.warn("Atenção: Rodando em modo de Desenvolvimento (HSTS Desabilitado)");
    }
});
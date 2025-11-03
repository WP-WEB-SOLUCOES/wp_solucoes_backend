// server.js - Versão CORRIGIDA E FUNCIONAL

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

// --- Configuração Principal ---
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
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
            if (!response) throw new Error('Resposta vazia');

            this.updateContext(sessionId, 'assistant', response);
            return response;
        } catch (error) {
            console.error("Erro Groq API:", error);
            return "Hmm, estou com uma instabilidade aqui. Pode repetir sua pergunta? Se preferir, posso conectar você com nosso time humano.";
        }
    }

    getWelcomeMessage() {
        return `Olá! Sou o assistente IA da WP Web Soluções. 
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
    role: { type: String, default: 'atendente', enum: ['atendente', 'admin'] }
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
app.post('/github-webhook', express.raw({ type: 'application/json' }), (req, res) => {
    console.log('Webhook do GitHub recebido...');
    try {
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

        const event = req.get('X-GitHub-Event');
        const data = JSON.parse(req.body.toString());

        if (event === 'ping') {
            console.log('Evento "ping" do GitHub recebido com sucesso.');
            return res.status(200).send('Ping recebido com sucesso.');
        }

        if (event === 'push' && data.ref === 'refs/heads/main') {
            console.log('Push para a branch [main] detectado. Iniciando deploy...');
            res.status(202).send('Deploy iniciado.');

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

// Middlewares (após webhook)
app.use(express.json());
app.use(cookieParser());

// --- Helmet com HSTS condicional ---
const helmetConfig = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "wss:", "https://api.groq.com"],
            imgSrc: ["'self'", "data:"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
    hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
};
app.use(helmet(helmetConfig));

// --- Rotas Públicas de PÁGINA ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('/admin/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'main.html'));
});

// --- Rate Limit no Login ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Muitas tentativas de login deste IP. Tente novamente após 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Rota de Login Admin ---
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
        if (!isValid) {
            console.warn(`Tentativa de login falha para ${username}`);
            return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
        }

        console.log(`Atendente ${user.username} (Role: ${user.role}) logou com sucesso.`);
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 3600 * 1000,
            path: '/'
        });

        res.json({ success: true, user: { username: user.username, role: user.role } });
    } catch (error) {
        console.error('Erro na rota de login:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

// --- Logout ---
app.get('/admin/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'strict',
        path: '/'
    });
    res.json({ success: true, message: 'Logout efetuado com sucesso.' });
});

// --- API de Chat Pública ---
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
    const fullList = Array.from(clients.values()).map(c => ({
        sessionId: c.session.sessionId,
        clientName: c.session.clientData?.name || `Cliente ${c.session.sessionId.slice(8, 12)}`,
        status: c.session.status,
        assignedTo: c.session.assignedTo,
        lastActivity: c.session.updatedAt,
        isOnline: !!c.socketId
    }));

    if (role === 'admin') return fullList;
    return fullList.filter(client => !client.assignedTo || client.assignedTo === username);
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

// --- Middleware de Autenticação Socket ---
io.use((socket, next) => {
    const cookieString = socket.handshake.headers.cookie;
    if (!cookieString) return next();

    const cookies = cookieString.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.split('=').map(s => s.trim());
        acc[key] = value;
        return acc;
    }, {});

    const token = cookies.token;
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
    } catch (err) {
        console.warn(`Autenticação de socket falhou: ${err.message}`);
    }
    next();
});

// --- Verificação de Admin (Express) ---
const verifyAdmin = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        if (req.path.startsWith('/pages/')) return res.redirect('/admin/login');
        return res.status(401).json({ success: false, message: 'Token não fornecido.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        if (req.path === '/admin/register' && decoded.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Acesso negado. Requer admin.' });
        }
        if (['/api/chat/history', '/pages/dashboard', '/pages/historico', '/pages/internals'].some(p => req.path.startsWith(p))) {
            if (!['admin', 'atendente'].includes(decoded.role)) {
                return res.status(403).send('Acesso negado.');
            }
        }
        next();
    } catch (error) {
        if (req.path.startsWith('/pages/')) return res.redirect('/admin/login');
        return res.status(401).json({ success: false, message: 'Token inválido ou expirado.' });
    }
};

// --- Rotas Protegidas ---
app.post('/admin/register', verifyAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: 'Usuário, senha e função são obrigatórios.' });
        }
        if (!['admin', 'atendente'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Função deve ser "admin" ou "atendente".' });
        }

        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Usuário já existe.' });
        }

        const passwordHash = await argon2.hash(password);
        const newUser = new User({ username: username.toLowerCase(), passwordHash, role });
        await newUser.save();

        res.status(201).json({ success: true, message: `Usuário '${username}' criado como ${role}.` });
    } catch (error) {
        console.error('Erro ao registrar:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

app.get('/api/chat/history', verifyAdmin, async (req, res) => {
    try {
        let query = { status: 'closed' };
        if (req.user.role !== 'admin') query.assignedTo = req.user.username;

        const closedChats = await ChatSession.find(query)
            .sort({ updatedAt: -1 })
            .limit(100);

        res.json({ success: true, chats: closedChats });
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

app.get('/pages/dashboard', verifyAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));
app.get('/pages/historico', verifyAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'historico.html')));
app.get('/pages/internals', verifyAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'internals.html')));

// --- Salvar Dados do Cliente ---
app.post('/api/chat/save-client', async (req, res) => {
    try {
        const { sessionId, clientData } = req.body;
        const systemMessageContent = `Novo cliente conectado:
Nome: ${clientData.name}
E-mail: ${clientData.email}
WhatsApp: ${clientData.phone}
Projeto: ${clientData.project || 'Não informado'}
Urgência: ${clientData.urgency || 'Não informada'}
Mensagem: ${clientData.message || 'Sem mensagem adicional'}`;

        const systemMessage = { sender: 'system', content: systemMessageContent, timestamp: new Date() };

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
            clients.set(sessionId, { socketId: null, session: updatedSession });
        }

        broadcastClientList();
        res.json({ success: true, message: 'Dados salvos com sucesso' });
    } catch (error) {
        console.error('Erro ao salvar cliente:', error);
        res.status(500).json({ success: false, error: 'Erro ao salvar dados' });
    }
});

// --- Rotas de Diagnóstico (ANTES do static) ---
app.get('/admin/main.js', (req, res) => {
    console.log('[DIAGNÓSTICO] Rota GET /admin/main.js acionada.');
    const filePath = path.join(__dirname, 'public', 'admin', 'main.js');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('[DIAGNÓSTICO] Erro ao enviar main.js:', err);
            res.status(500).send(`Erro: ${err.message}`);
        } else {
            console.log('[DIAGNÓSTICO] main.js enviado com sucesso!');
        }
    });
});

app.get('/admin/dashboard.css', (req, res) => {
    console.log('[DIAGNÓSTICO] Rota GET /admin/dashboard.css acionada.');
    const filePath = path.join(__dirname, 'public', 'admin', 'dashboard.css');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('[DIAGNÓSTICO] Erro ao enviar dashboard.css:', err);
            res.status(500).send(`Erro: ${err.message}`);
        } else {
            console.log('[DIAGNÓSTICO] dashboard.css enviado com sucesso!');
        }
    });
});

// --- Arquivos Estáticos (ÚLTIMO) ---
app.use(express.static(path.join(__dirname, 'public')));

// =======================================================
// 8. Socket.io Eventos
// =======================================================
io.on('connection', (socket) => {
    // --- Admin Autenticado ---
    if (socket.user) {
        const { username, role = 'atendente' } = socket.user;
        socket.join('admin_room');
        attendants.set(socket.id, { username, socketId: socket.id, role });

        console.log(`Atendente ${username} (Role: ${role}) conectado via socket`);
        broadcastAttendantList();

        (async () => {
            try {
                const activeSessions = await ChatSession.find({
                    status: { $in: ['active', 'waiting_human', 'in_progress'] }
                });
                activeSessions.forEach(session => {
                    const entry = clients.get(session.sessionId);
                    if (entry) entry.session = session;
                    else clients.set(session.sessionId, { socketId: null, session });
                });
                socket.emit('update_client_list', getFilteredClientList(role, username));
            } catch (err) {
                console.error("Erro ao carregar sessões para admin:", err);
            }
        })();
    }

    // --- Cliente ---
    socket.on('client_join', async ({ sessionId }) => {
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

            clients.set(sessionId, { socketId: socket.id, session });
            console.log(`Cliente ${sessionId} conectado (Socket: ${socket.id})`);
            broadcastClientList();
        } catch (error) {
            console.error("Erro ao criar sessão:", error);
        }
    });

    socket.on('client_message', async ({ content, sessionId }) => {
        if (socket.user || !content || content.length > 5000) return;

        const client = clients.get(sessionId);
        if (!client) return;

        const messageData = { sender: 'client', content, timestamp: new Date() };
        client.session.messages.push(messageData);

        await ChatSession.findOneAndUpdate(
            { sessionId },
            { $push: { messages: messageData }, updatedAt: new Date() }
        );

        io.to('admin_room').emit('client_message', {
            content,
            fromSession: sessionId,
            fromName: client.session.clientData?.name || `Cliente ${sessionId.slice(8, 12)}`
        });
        broadcastClientList();
    });

    // --- Admin Envia Mensagem ---
    socket.on('admin_message', async ({ content, toSession }) => {
        if (!socket.user || !content || content.length > 5000) return;

        const attendant = attendants.get(socket.id);
        if (!attendant) return;

        const client = clients.get(toSession);
        if (!client) return socket.emit('message_error', { error: 'Cliente não encontrado', toSession });

        const { username, role } = attendant;
        const currentOwner = client.session.assignedTo;
        const isUnassigned = !currentOwner;
        const isMine = currentOwner === username;
        const isAdmin = role === 'admin';

        if (!isUnassigned && !isMine && !isAdmin) {
            return socket.emit('message_error', { error: `Chat já está com ${currentOwner}`, toSession });
        }

        if (isUnassigned || (!isMine && isAdmin)) {
            client.session.assignedTo = username;
            client.session.status = 'in_progress';
            await ChatSession.findOneAndUpdate(
                { sessionId: toSession },
                { assignedTo: username, status: 'in_progress', updatedAt: new Date() }
            );
            if (client.socketId) {
                io.to(client.socketId).emit('attendant_joined', { name: username });
            }
        }

        const messageData = { sender: 'atendente', content, attendantName: username, timestamp: new Date() };
        client.session.messages.push(messageData);

        await ChatSession.findOneAndUpdate(
            { sessionId: toSession },
            { $push: { messages: messageData }, updatedAt: new Date() }
        );

        if (client.socketId) {
            io.to(client.socketId).emit('server_message', { content, from: username });
        }
        broadcastClientList();
    });

    socket.on('admin_close_chat', async ({ sessionId }) => {
        if (!socket.user) return;
        const attendant = attendants.get(socket.id);
        if (!attendant) return;

        const client = clients.get(sessionId);
        if (!client) return;

        const isOwner = client.session.assignedTo === attendant.username;
        const isAdmin = attendant.role === 'admin';

        if (isOwner || isAdmin) {
            await ChatSession.findOneAndUpdate(
                { sessionId },
                { status: 'closed', updatedAt: new Date() }
            );
            clients.delete(sessionId);
            if (client.socketId) {
                io.to(client.socketId).emit('chat_closed_by_admin', { message: 'Atendimento encerrado.' });
            }
            broadcastClientList();
        }
    });

    socket.on('internal_message', async ({ content }) => {
        if (!socket.user || !content || content.length > 2000) return;
        const attendant = attendants.get(socket.id);
        if (!attendant) return;

        const payload = { from: attendant.username, content, timestamp: new Date() };
        const mentions = content.match(/@(\w+)/g);

        if (mentions) {
            const mentioned = mentions.map(m => m.substring(1));
            attendants.forEach(a => {
                if (mentioned.includes(a.username) && a.socketId !== socket.id) {
                    io.to(a.socketId).emit('you_were_mentioned', { from: attendant.username, content });
                }
            });
        }

        io.to('admin_room').emit('new_internal_message', payload);
    });

    // --- Desconexão ---
    socket.on('disconnect', () => {
        let updated = false;
        for (const [sessionId, client] of clients.entries()) {
            if (client.socketId === socket.id) {
                client.socketId = null;
                updated = true;
                console.log(`Cliente ${sessionId} desconectado`);
                break;
            }
        }

        if (attendants.has(socket.id)) {
            const attendant = attendants.get(socket.id);
            console.log(`Atendente ${attendant.username} desconectado`);
            attendants.delete(socket.id);
            broadcastAttendantList();
        }

        if (updated) broadcastClientList();
    });
});

// =======================================================
// 9. Iniciar Servidor
// =======================================================
server.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${PORT}`);
    console.log(`Sistema de IA inicializado`);
    console.log(`Chat em tempo real ativo`);
    console.log(IS_PRODUCTION ? "Modo Produção" : "Modo Desenvolvimento (HSTS desativado)");
});
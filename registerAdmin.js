// registerUsers.js
const mongoose = require('mongoose');
const argon2 = require('argon2');

// =======================================================
// CONFIGURE AQUI
// =======================================================
const MONGO_URI = 'mongodb+srv://retsugo:777-Rroot@wpweb.zmbbef6.mongodb.net/db_wpweb?retryWrites=true&w=majority'; 

// --- Dados do Administrador ---
const ADMIN_USER = {
    username: 'connectawp',
    password: 'Retsugog21&',
    role: 'admin' // Papel deve ser 'admin'
};

// --- Dados do Atendente ---
const ATTENDANT_USER = {
    username: 'rafael',
    password: '777-Rroot',
    role: 'atendente' // Papel deve ser 'atendente'
};
// =======================================================

// Schema do Usuário (deve ser IDÊNTICO ao do server.js)
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { 
        type: String, 
        default: 'atendente', 
        enum: ['atendente', 'admin'] // Garante que só esses valores são aceitos
    }
});

const User = mongoose.model('User', UserSchema);

// Função auxiliar para criar um usuário
async function createUser(userData) {
    try {
        // 1. Verificar se o usuário já existe
        const existingUser = await User.findOne({ username: userData.username });
        if (existingUser) {
            console.log(`[AVISO] O usuário '${userData.username}' já existe. Pulando.`);
            return;
        }

        // 2. Criar o hash da senha
        console.log(`[INFO] Criando hash da senha para ${userData.username}...`);
        const passwordHash = await argon2.hash(userData.password);

        // 3. Salvar no banco
        const newUser = new User({
            username: userData.username,
            passwordHash: passwordHash,
            role: userData.role // Salva o papel (role)
        });
        await newUser.save();

        console.log(`[SUCESSO] Usuário '${userData.username}' (Role: ${userData.role}) criado!`);

    } catch (error) {
        console.error(`[ERRO] Falha ao criar usuário ${userData.username}:`, error.message);
    }
}

async function registerUsers() {
    try {
        console.log('Conectando ao MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Conectado.');
        console.log('--- Iniciando registro de usuários ---');

        // Criar Admin
        await createUser(ADMIN_USER);

        // Criar Atendente
        await createUser(ATTENDANT_USER);

        console.log('--------------------------------------');
        console.log('Registro de usuários concluído.');

    } catch (error) {
        console.error('Erro fatal no script de registro:', error);
    } finally {
        // 4. Desconectar
        await mongoose.disconnect();
        console.log('Desconectado do MongoDB.');
    }
}

// Executa a função principal
registerUsers();
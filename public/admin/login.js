// /public/admin/login.js (Versão Cookie Auth)

document.addEventListener('DOMContentLoaded', () => {
    // Seleciona todos os elementos que vamos usar
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const loginBtn = document.getElementById('loginBtn');
    const statusModal = document.getElementById('statusModal');

    // 1. Lógica para Mostrar/Esconder Senha
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);

        // Muda o ícone
        const icon = togglePasswordBtn.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    });

    // 2. Lógica de Submissão do Formulário
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Impede o recarregamento da página

        const username = usernameInput.value;
        const password = passwordInput.value;

        // Validação simples
        if (!username || !password) {
            alert('Por favor, preencha o usuário e a senha.');
            return;
        }

        // Ativa o estado de "carregando"
        setLoading(true);

        try {
            // 3. Faz a chamada para a API (nosso server.js)
            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                // SUCESSO!
                
                // Não salvamos mais o token (ele está no cookie HttpOnly)
                // Apenas salvamos os dados da UI (username e role) no sessionStorage
                sessionStorage.setItem('atendenteUser', data.user.username);
                sessionStorage.setItem('atendenteRole', data.user.role);
                
                // Atualiza o modal para "Sucesso"
                updateModal('success');

                // Espera um segundo e redireciona para o dashboard
                setTimeout(() => {
                    window.location.href = '/admin/';
                }, 1000);

            } else {
                // FALHA (Usuário ou senha errados)
                
                // Limpa qualquer dado de sessão anterior
                sessionStorage.removeItem('atendenteUser');
                sessionStorage.removeItem('atendenteRole');
                
                updateModal('error', data.message);
                
                // Tira o loading e esconde o modal após 2 segundos
                setTimeout(() => {
                    setLoading(false);
                }, 2000);
            }

        } catch (error) {
            // FALHA (Erro de rede, servidor offline, etc.)
            console.error('Erro na requisição de login:', error);

            // Limpa qualquer dado de sessão anterior
            sessionStorage.removeItem('atendenteUser');
            sessionStorage.removeItem('atendenteRole');

            updateModal('error', 'Erro de conexão. O servidor pode estar offline.');
            
            setTimeout(() => {
                setLoading(false);
            }, 2000);
        }
    });

    // Função para controlar o estado de "carregando"
    function setLoading(isLoading) {
        if (isLoading) {
            loginBtn.classList.add('loading');
            loginBtn.disabled = true;
            statusModal.classList.add('active');
            updateModal('loading'); // Garante que o modal esteja no estado inicial
        } else {
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
            statusModal.classList.remove('active');
        }
    }

    // Função para atualizar o conteúdo do modal de status
    function updateModal(state, message = '') {
        const icon = statusModal.querySelector('.modal-icon i');
        const title = statusModal.querySelector('h3');
        const text = statusModal.querySelector('p');
        const progressBar = statusModal.querySelector('.progress-bar');

        // Remove classes de animação e ícones anteriores
        icon.className = 'fas';
        progressBar.style.display = 'block';

        if (state === 'loading') {
            icon.classList.add('fa-sync-alt', 'fa-spin');
            title.textContent = 'Autenticando';
            text.textContent = 'Conectando com o servidor...';
        } else if (state === 'success') {
            icon.classList.add('fa-check-circle');
            title.textContent = 'Sucesso!';
            text.textContent = 'Login efetuado. Redirecionando...';
            progressBar.style.display = 'none'; // Esconde a barra
        } else if (state === 'error') {
            icon.classList.add('fa-times-circle');
            title.textContent = 'Falha no Login';
            text.textContent = message || 'Usuário ou senha inválidos.';
            progressBar.style.display = 'none'; // Esconde a barra
        }
    }
});
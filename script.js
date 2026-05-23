// =========================================================================
// FIREBASE IMPORTS E CONFIGURAÇÃO
// =========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBRddH3U2K6DAW8gAQZC1gZu7XUVSWgebE",
    authDomain: "fir-manut.firebaseapp.com",
    projectId: "fir-manut",
    storageBucket: "fir-manut.firebasestorage.app",
    messagingSenderId: "509518361914",
    appId: "1:509518361914:web:456e0eb1f3d97cdf8ccc03"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// =========================================================================
// CLOUDINARY CONFIG
// =========================================================================
const CLOUDINARY_CLOUD_NAME    = 'dxc1zmhbj';
const CLOUDINARY_UPLOAD_PRESET = '5s_manutencao';
const CLOUDINARY_URL           = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// =========================================================================
// CONSTANTES E CREDENCIAIS DO SISTEMA
// =========================================================================
const ADMIN_CREDENTIALS = { login: 'admin@weg.net', senha: 'admin123' };
const DEVICE_MASTER_KEY = 'WEG2026';

// ESTRUTURA DE CONTAINERS: cada setor tem seu próprio gaveteiro
const CONTAINERS_PADRAO = [
    {
        id: 1,
        nome: 'Elétrica',
        tipo: 'gaveteiro',
        icone: 'fa-bolt',
        cor: '#2a5288',
        gavetas: [
            { id: 1,  label: "G1",  title: "Sensores M12"   },
            { id: 2,  label: "G2",  title: "Botões e LED's" },
            { id: 3,  label: "G3",  title: "Fusíveis"       },
            { id: 4,  label: "G4",  title: "Contatoras"     },
            { id: 5,  label: "G5",  title: "Prensas Cabos"  },
            { id: 6,  label: "G6",  title: "Bornes e Relés" },
            { id: 7,  label: "G7",  title: "Abraçadeiras"   },
            { id: 8,  label: "G8",  title: "Anilhas"        },
            { id: 9,  label: "G9",  title: "Lâmpadas"       },
            { id: 10, label: "G10", title: "Miscelânea 1"   },
            { id: 11, label: "G11", title: "Miscelânea 2"   },
            { id: 12, label: "G12", title: "Outros"         }
        ]
    },
    {
        id: 2,
        nome: 'Mecânica',
        tipo: 'gaveteiro',
        icone: 'fa-gears',
        cor: '#dc2626',
        gavetas: [
            { id: 13, label: "M1", title: "Ferramentas" },
            { id: 14, label: "M2", title: "Rolamentos" },
            { id: 15, label: "M3", title: "Parafusos" },
            { id: 16, label: "M4", title: "Correias" },
            { id: 17, label: "M5", title: "Engrenagens" },
            { id: 18, label: "M6", title: "Molas" }
        ]
    }
];

// =========================================================================
// VARIÁVEIS GLOBAIS
// =========================================================================
let database = { 
    version: 4,
    containers: JSON.parse(JSON.stringify(CONTAINERS_PADRAO)),  // deep copy
    items: {}  // Agora indexado por "containerId_gavetaId"
};

// Inicializar items vazios para todas as gavetas (IDs únicos globais)
database.containers.forEach(container => {
    container.gavetas.forEach(gaveta => {
        if (!database.items[gaveta.id]) database.items[gaveta.id] = [];
    });
});

// =========================================================================
// HELPERS DE CONTAINERS E GAVETAS
// -------------------------------------------------------------------------
// Como agora temos VÁRIOS gaveteiros/armários (containers), centralizamos
// aqui toda a lógica de localizar gavetas. Os IDs das gavetas são ÚNICOS
// em todo o sistema (Elétrica 1-12, Mecânica 13-18, etc.), então
// database.items[idGaveta] continua funcionando direto, sem chave composta.
// =========================================================================

// Retorna uma lista "achatada" de TODAS as gavetas de TODOS os containers.
// Usado em buscas globais, KPIs gerais, exportação CSV, pedido de compra, etc.
function getTodasGavetas() {
    const todas = [];
    database.containers.forEach(container => {
        (container.gavetas || []).forEach(gaveta => {
            todas.push({ ...gaveta, containerId: container.id, containerNome: container.nome });
        });
    });
    return todas;
}

// Retorna apenas as gavetas de UM container específico (pelo id do container).
function getGavetasDoContainer(containerId) {
    const container = database.containers.find(c => c.id === containerId);
    return container ? (container.gavetas || []) : [];
}

// Acha uma gaveta específica pelo seu id (procurando em todos os containers).
function acharGaveta(idGaveta) {
    for (const container of database.containers) {
        const gaveta = (container.gavetas || []).find(g => g.id === idGaveta);
        if (gaveta) return gaveta;
    }
    return null;
}

// Acha qual container "dono" de uma gaveta (pelo id da gaveta).
function getContainerDeGaveta(idGaveta) {
    return database.containers.find(c => (c.gavetas || []).some(g => g.id === idGaveta)) || null;
}

// Retorna o objeto do container atualmente selecionado.
function getContainerAtual() {
    return database.containers.find(c => c.id === containerAtual) || null;
}

// Gera o próximo ID único de gaveta (maior id existente + 1).
// Garante que novos containers não colidam com gavetas existentes.
function proximoIdGaveta() {
    let maxId = 0;
    database.containers.forEach(c => {
        (c.gavetas || []).forEach(g => { if (g.id > maxId) maxId = g.id; });
    });
    return maxId + 1;
}

// Gera o próximo ID único de container.
function proximoIdContainer() {
    let maxId = 0;
    database.containers.forEach(c => { if (c.id > maxId) maxId = c.id; });
    return maxId + 1;
}

let usuariosSalvos  = [];
let historicoLogs   = [];
let usuarioLogado   = null;

let containerAtual       = null;  // Container selecionado (Elétrica, Mecânica, etc.)
let gavetaAtualAberta    = null;
let pecaSendoConferidaId = null;
let gavetaSendoEditadaId = null;
let pecaSendoEditadaId   = null;
let pecaSendoMovidaId    = null;

let usuarioAguardandoRedefinicao = null;

// Drag and Drop
let draggedDrawerIndex = null;
let draggedPecaId      = null;

// Variáveis do Carrossel de Imagens
let carrosselInterval = null;
let carrosselImagens  = [];
let carrosselIndex    = 0;

// =========================================================================
// INICIALIZAÇÃO PWA E FIREBASE
// =========================================================================
window.onload = () => {
    iniciarPWA();
    iniciarSincronizacaoFirebase();
    configurarEventosEnter();

    const deviceAuthorized = localStorage.getItem('5s_device_authorized');
    if (deviceAuthorized === 'true') {
        document.getElementById('view-device-auth').classList.replace('view-active', 'view-hidden');
        document.getElementById('view-login').classList.replace('view-hidden', 'view-active');
    }
};

function iniciarPWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('PWA Service Worker registrado com sucesso.', reg.scope))
            .catch(err => console.error('Erro ao registrar Service Worker PWA:', err));
    }
}

// =========================================================================
// VALIDADOR DE SENHA FORTE
// =========================================================================
function validarSenhaForte(senha) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    return regex.test(senha);
}

// =========================================================================
// HELPERS DE STATUS
// =========================================================================
function getGavetaStatus(pecas) {
    if (!pecas || pecas.length === 0) return 'verde';
    const temZerado  = pecas.some(p => p.current === 0);
    const temCritico = pecas.some(p => p.current > 0 && p.current < p.expected * 0.25);
    const temBaixo   = pecas.some(p => p.current > 0 && p.current < p.expected * 0.5);
    const temAlerta  = pecas.some(p => p.current < p.expected);
    if (temZerado)  return 'vermelho';
    if (temCritico) return 'laranja';
    if (temBaixo)   return 'amarelo';
    if (temAlerta)  return 'amarelo';
    return 'verde';
}

function getPecaStatus(peca) {
    if (peca.current === 0) return 'vermelho';
    if (peca.current < peca.expected * 0.25) return 'laranja';
    if (peca.current < peca.expected * 0.5) return 'amarelo';
    if (peca.current < peca.expected) return 'amarelo';
    return 'verde';
}

function getStatusText(status) {
    const map = { verde: 'OK', amarelo: 'Atenção', laranja: 'Crítico', vermelho: 'Zerado' };
    return map[status] || 'OK';
}

// =========================================================================
// HISTÓRICO / LOGS
// =========================================================================
function registrarLog(acao) {
    const agora = new Date();
    const data  = agora.toLocaleDateString('pt-BR');
    const hora  = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nome  = usuarioLogado ? usuarioLogado.nome : 'Sistema';

    historicoLogs.unshift({ data, hora, nome, acao });
    if (historicoLogs.length > 200) historicoLogs = historicoLogs.slice(0, 200);
    salvarHistorico();
}

function renderizarHistorico() {
    const lista = document.getElementById('lista-historico');
    if (!lista) return;
    lista.innerHTML = '';

    if (!historicoLogs || historicoLogs.length === 0) {
        lista.innerHTML = '<p style="text-align:center;color:#64748b;padding:30px;">Nenhuma atividade registrada ainda.</p>';
        return;
    }

    historicoLogs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'log-item';
        div.innerHTML = `
            <span class="log-time">${log.data} ${log.hora}</span>
            <span class="log-text"><strong>${log.nome}</strong> ${log.acao}</span>
        `;
        lista.appendChild(div);
    });
}

// =========================================================================
// NOTIFICAÇÕES (Web Push API)
// =========================================================================
function solicitarPermissaoNotificacao() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

function enviarNotificacao(titulo, corpo) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try { new Notification(titulo, { body: corpo, icon: 'icon-192x192.png' }); } 
        catch (e) {}
    }
}

// =========================================================================
// MENU MOBILE
// =========================================================================
function toggleMenuMobile() {
    const sidebar = document.getElementById('sidebar-menu');
    const overlay = document.getElementById('mobile-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
}

// =========================================================================
// CLOUDINARY — UPLOAD DE IMAGEM
// =========================================================================
async function uploadImagemCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Cloudinary: ${response.status} — ${err}`);
    }
    const data = await response.json();
    return data.secure_url;
}

// =========================================================================
// FIRESTORE
// =========================================================================
async function salvarConfig() {
    try {
        await setDoc(doc(db, "manutencao_5s", "config"), {
            containers: database.containers,   // Nova estrutura (vários gaveteiros/armários)
            usuarios:   usuariosSalvos
        });
    } catch (e) {
        console.error("Erro ao salvar config:", e);
        mostrarAlerta("Erro de Conexão", "Não foi possível salvar a configuração na nuvem.");
    }
}

async function salvarHistorico() {
    try {
        await setDoc(doc(db, "manutencao_5s", "historico"), { logs: historicoLogs });
    } catch (e) {
        console.error("Erro ao salvar histórico:", e);
    }
}

async function salvarItensDaGaveta(idGaveta) {
    try {
        await setDoc(doc(db, "manutencao_5s", `itens_g${idGaveta}`), {
            items: database.items[idGaveta] || []
        });
    } catch (e) {
        console.error(`Erro ao salvar gaveta ${idGaveta}:`, e);
        mostrarAlerta("Erro de Conexão", "Não foi possível salvar os itens na nuvem.");
    }
}

// =========================================================================
// BACKUP, RESTAURAR E EXPORTAR CSV
// =========================================================================
function fazerBackup() {
    const payload = {
        versao: 'v3', geradoEm: new Date().toISOString(),
        database, usuarios: usuariosSalvos, historico: historicoLogs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url; a.download = `backup_5s_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.json`;
    a.click(); URL.revokeObjectURL(url);
    registrarLog('gerou um arquivo de backup do sistema.');
}

function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const dados = JSON.parse(e.target.result);
            if (!dados.database || !dados.usuarios) return mostrarAlerta('Arquivo Inválido', 'O arquivo selecionado não é um backup válido.');

            database       = dados.database;
            usuariosSalvos = dados.usuarios;
            historicoLogs  = dados.historico || [];

            // Migração de backups ANTIGOS: se vier com "drawers" e sem "containers",
            // converte para a estrutura nova (Container Elétrica).
            if (!database.containers && database.drawers) {
                database.containers = [{
                    id: 1, nome: 'Elétrica', tipo: 'gaveteiro',
                    icone: 'fa-bolt', cor: '#2a5288', gavetas: database.drawers
                }];
                delete database.drawers;
            }
            if (!database.containers) database.containers = [];

            await salvarConfig();
            await salvarHistorico();
            for (const gaveta of getTodasGavetas()) {
                await salvarItensDaGaveta(gaveta.id);
            }
            registrarLog('restaurou o sistema a partir de um arquivo de backup.');
            mostrarAlerta('Sucesso', 'Backup restaurado com sucesso! O sistema foi atualizado.');
            atualizarDashboard();
        } catch (err) {
            mostrarAlerta('Erro de Leitura', 'Não foi possível ler o arquivo. Verifique se é um JSON válido.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function exportarEstoqueCSV() {
    let csv = 'Local;Gaveta;Label;Divisória;Código;Nome;Padrão 5S;Qtd Atual;Status;Requisitado\n';
    getTodasGavetas().forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(p => {
            const status = getStatusText(getPecaStatus(p));
            csv += `"${gaveta.containerNome}";"${gaveta.title}";"${gaveta.label}";"${p.divisoria || 'Geral'}";"${p.code || ''}";"${p.name}";${p.expected};${p.current};"${status}";"${p.requested ? 'Sim' : 'Não'}"\n`;
        });
    });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url; a.download = `estoque_5s_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    registrarLog('exportou o relatório de estoque em CSV.');
}

function exportarHistoricoCSV() {
    let csv = 'Data;Hora;Usuário;Ação\n';
    historicoLogs.forEach(log => {
        csv += `"${log.data}";"${log.hora}";"${log.nome}";"${log.acao}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url; a.download = `historico_5s_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    registrarLog('exportou o histórico de atividades em CSV.');
}

// =========================================================================
// SINCRONIZAÇÃO FIREBASE
// =========================================================================
async function iniciarSincronizacaoFirebase() {
    onSnapshot(doc(db, "manutencao_5s", "config"), (snap) => {
        if (snap.exists()) {
            const d = snap.data();

            if (d.containers && Array.isArray(d.containers) && d.containers.length > 0) {
                // Formato NOVO: já tem containers salvos na nuvem
                database.containers = d.containers;
            } else if (d.drawers && Array.isArray(d.drawers)) {
                // MIGRAÇÃO: formato antigo (lista de gavetas solta) → vira Container "Elétrica"
                // e já adiciona o gaveteiro "Mecânica" novo ao lado.
                database.containers = [
                    {
                        id: 1,
                        nome: 'Elétrica',
                        tipo: 'gaveteiro',
                        icone: 'fa-bolt',
                        cor: '#2a5288',
                        gavetas: d.drawers
                    },
                    // Gaveteiro da Mecânica (gavetas com IDs únicos 13-18)
                    JSON.parse(JSON.stringify(CONTAINERS_PADRAO[1]))
                ];
                console.log('Migração: dados antigos → Container Elétrica + novo Container Mecânica.');
                salvarConfig();  // Persiste já no formato novo
            }

            usuariosSalvos = d.usuarios || [];

            // Garante que toda gaveta tenha um array de items inicializado
            getTodasGavetas().forEach(g => { if (!database.items[g.id]) database.items[g.id] = []; });
            registrarListenersGavetas();
        } else {
            salvarConfig();
            registrarListenersGavetas();
        }
        atualizarSeLogado();
    });

    onSnapshot(doc(db, "manutencao_5s", "historico"), (snap) => {
        if (snap.exists()) historicoLogs = snap.data().logs || [];
        atualizarSeLogado();
    });
}

function registrarListenersGavetas() {
    // Escuta as mudanças em tempo real de cada gaveta de TODOS os containers
    getTodasGavetas().forEach(gaveta => {
        onSnapshot(doc(db, "manutencao_5s", `itens_g${gaveta.id}`), (snap) => {
            database.items[gaveta.id] = snap.exists() ? (snap.data().items || []) : [];
            // Preenche campos que podem faltar em dados antigos (retrocompatibilidade)
            database.items[gaveta.id].forEach(p => {
                if (p.requested      === undefined) p.requested      = false;
                if (p.lastTakenBy    === undefined) p.lastTakenBy    = null;
                if (p.position       === undefined) p.position       = 999;
                if (p.divisoria      === undefined) p.divisoria      = 'Geral';
                if (p.size           === undefined) p.size           = 1;
                // Campos do Grid 10x5 (peças antigas ganham posição padrão):
                if (p.coluna         === undefined) p.coluna         = 1;
                if (p.linha          === undefined) p.linha          = 1;
                if (p.larguraColunas === undefined) p.larguraColunas = 1;
                if (p.alturaLinhas   === undefined) p.alturaLinhas   = p.size || 6;
            });
            atualizarSeLogado();
        });
    });
}

function atualizarSeLogado() {
    const container = document.getElementById('app-container');
    if (container && container.classList.contains('view-active')) {
        atualizarDashboard();
    }
}

// =========================================================================
// EVENTOS E AUTORIZAÇÃO
// =========================================================================
function configurarEventosEnter() {
    const map = [
        { inputId: 'input-device-key',    btnAcao: autorizarDispositivo   },
        { inputId: 'input-login-id',      btnAcao: realizarLogin          },
        { inputId: 'input-login-senha',   btnAcao: realizarLogin          },
        { inputId: 'reg-senha',           btnAcao: registrarUsuario        },
        { inputId: 'conf-qtd-atual',      btnAcao: salvarConferencia       },
        { inputId: 'edit-gaveta-nome',    btnAcao: salvarNomeGaveta        },
        { inputId: 'novo-atual',          btnAcao: salvarNovoItem          },
        { inputId: 'edit-peca-atual',     btnAcao: salvarEdicaoPeca        },
        { inputId: 'nova-senha-confirma', btnAcao: salvarSenhaObrigatoria  }
    ];
    map.forEach(item => {
        const el = document.getElementById(item.inputId);
        if (el) el.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); item.btnAcao(); }
        });
    });
}

function autorizarDispositivo() {
    const key = document.getElementById('input-device-key').value;
    if (key === DEVICE_MASTER_KEY) {
        localStorage.setItem('5s_device_authorized', 'true');
        document.getElementById('view-device-auth').classList.replace('view-active', 'view-hidden');
        document.getElementById('view-login').classList.replace('view-hidden', 'view-active');
    } else {
        mostrarAlerta('Acesso Negado', 'Chave mestre incorreta.');
    }
}

function alternarTelaLogin() {
    const fe = document.getElementById('form-entrar');
    const fr = document.getElementById('form-registrar');
    if (fe.classList.contains('view-hidden')) {
        fe.classList.replace('view-hidden', 'view-active');
        fr.classList.replace('view-active', 'view-hidden');
    } else {
        fe.classList.replace('view-active', 'view-hidden');
        fr.classList.replace('view-hidden', 'view-active');
    }
}

function registrarUsuario() {
    const nome   = document.getElementById('reg-nome').value.trim();
    const cracha = document.getElementById('reg-cracha').value.trim();
    const senha  = document.getElementById('reg-senha').value.trim();

    if (!nome || !cracha || !senha) return mostrarAlerta('Erro', 'Preencha todos os campos!');
    if (usuariosSalvos.find(u => u.cracha === cracha)) return mostrarAlerta('Erro', 'Crachá já cadastrado!');

    if (!validarSenhaForte(senha)) return mostrarAlerta('Senha Fraca', 'A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.');

    const novoUser = { nome, cracha, senha, role: 'USER' };
    usuariosSalvos.push(novoUser);
    salvarConfig();
    aplicarLogin(novoUser);
}

function realizarLogin() {
    const id    = document.getElementById('input-login-id').value.trim();
    const senha = document.getElementById('input-login-senha').value.trim();
    if (!id || !senha) return mostrarAlerta('Erro', 'Preencha os dados de acesso.');

    if (id === ADMIN_CREDENTIALS.login && senha === ADMIN_CREDENTIALS.senha) {
        aplicarLogin({ nome: 'Administrador', cracha: 'Admin', role: 'ADMIN' });
        return;
    }

    const user = usuariosSalvos.find(u => u.cracha === id && u.senha === senha);
    if (!user) return mostrarAlerta('Acesso Negado', 'Crachá ou Senha incorretos.');

    if (!validarSenhaForte(user.senha)) {
        usuarioAguardandoRedefinicao = user;
        document.getElementById('modal-redefinir-senha').classList.remove('view-hidden');
        return;
    }
    aplicarLogin(user);
}

async function salvarSenhaObrigatoria() {
    const novaSenha = document.getElementById('nova-senha-obrigatoria').value.trim();
    const confirma  = document.getElementById('nova-senha-confirma').value.trim();

    if (novaSenha !== confirma) return mostrarAlerta('Erro', 'As senhas não coincidem.');
    if (!validarSenhaForte(novaSenha)) return mostrarAlerta('Senha Fraca', 'A nova senha não atende aos requisitos.');

    usuarioAguardandoRedefinicao.senha = novaSenha;
    await salvarConfig();
    document.getElementById('nova-senha-obrigatoria').value = '';
    document.getElementById('nova-senha-confirma').value    = '';
    document.getElementById('modal-redefinir-senha').classList.add('view-hidden');
    registrarLog('atualizou a própria senha para o novo padrão corporativo.');
    aplicarLogin(usuarioAguardandoRedefinicao);
    usuarioAguardandoRedefinicao = null;
}

function cancelarRedefinicaoSenha() {
    usuarioAguardandoRedefinicao = null;
    document.getElementById('nova-senha-obrigatoria').value = '';
    document.getElementById('nova-senha-confirma').value    = '';
    document.getElementById('modal-redefinir-senha').classList.add('view-hidden');
}

function aplicarLogin(user) {
    usuarioLogado = user;
    document.getElementById('usuario-logado-nome').innerText   = user.nome;
    document.getElementById('usuario-logado-codigo').innerText = `Crachá: ${user.cracha}`;

    if (user.role === 'ADMIN') {
        document.body.classList.add('is-admin');
        document.getElementById('badge-admin').classList.remove('view-hidden');
    } else {
        document.body.classList.remove('is-admin');
        document.getElementById('badge-admin').classList.add('view-hidden');
    }

    document.getElementById('view-login').classList.replace('view-active', 'view-hidden');
    document.getElementById('app-container').classList.replace('view-hidden', 'view-active');
    document.getElementById('input-login-senha').value = '';
    document.getElementById('reg-senha').value         = '';

    solicitarPermissaoNotificacao();
    atualizarDashboard();
    mostrarTela('view-dashboard');
}

// =========================================================================
// NAVEGAÇÃO
// =========================================================================
function mostrarTela(id) {
    ['view-dashboard', 'view-containers', 'view-gavetas', 'view-compartimentos', 'view-historico', 'view-config'].forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.replace('view-active', 'view-hidden');
    });

    const alvo = document.getElementById(id);
    if (alvo) alvo.classList.replace('view-hidden', 'view-active');

    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.currentTarget && event.currentTarget.classList) {
        event.currentTarget.classList.add('active');
    }

    document.getElementById('sidebar-menu').classList.remove('open');
    document.getElementById('mobile-overlay').classList.remove('open');

    if (id === 'view-gavetas' || id === 'view-dashboard' || id === 'view-containers') gavetaAtualAberta = null;
    if (id === 'view-containers') renderContainers();   // Tela de seleção de locais
    if (id === 'view-historico')  renderizarHistorico();

    const scroll = document.getElementById('area-conteudo-scroll');
    if (scroll) scroll.scrollTo(0, 0);

    if (id === 'view-dashboard') {
        iniciarCarrosselDashboard();
        setTimeout(() => { const inp = document.getElementById('input-busca-global'); if (inp) inp.focus(); }, 300);
    } else {
        pararCarrosselDashboard();
    }
}

function voltarParaContainers() { containerAtual = null; mostrarTela('view-containers'); }

function voltarParaGavetas() { mostrarTela('view-gavetas'); }
function sairDoSistema()     { location.reload(); }

// =========================================================================
// MOSTRAR/OCULTAR SENHA (botão de olho nos campos de senha)
// -------------------------------------------------------------------------
// Recebe o id do campo de senha e alterna entre type="password" e "text".
// O ícone (olho aberto/fechado) também é atualizado.
// =========================================================================
function toggleVerSenha(idCampo, elementoBotao) {
    const campo = document.getElementById(idCampo);
    if (!campo) return;
    const icone = elementoBotao ? elementoBotao.querySelector('i') : null;
    if (campo.type === 'password') {
        campo.type = 'text';
        if (icone) { icone.classList.remove('fa-eye'); icone.classList.add('fa-eye-slash'); }
    } else {
        campo.type = 'password';
        if (icone) { icone.classList.remove('fa-eye-slash'); icone.classList.add('fa-eye'); }
    }
}

// =========================================================================
// DASHBOARD, BUSCA E CARROSSEL
// =========================================================================
function atualizarImagensCarrossel() {
    carrosselImagens = [];
    getTodasGavetas().forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(peca => {
            if (peca.image && peca.image.trim() !== '') carrosselImagens.push(peca.image);
        });
    });

    if (carrosselImagens.length === 0) {
        carrosselImagens = [
            'https://images.unsplash.com/photo-1581092160562-40aa08e78837?q=80&w=2070&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1631281956016-30c1e85cae92?q=80&w=2070&auto=format&fit=crop'
        ];
    }
}

function iniciarCarrosselDashboard() {
    pararCarrosselDashboard();
    atualizarImagensCarrossel();
    const wrapper = document.querySelector('.dashboard-wrapper');
    if (!wrapper) return;

    if (carrosselIndex >= carrosselImagens.length) carrosselIndex = 0;
    wrapper.style.backgroundImage = `url('${carrosselImagens[carrosselIndex]}')`;

    carrosselInterval = setInterval(() => {
        carrosselIndex++;
        if (carrosselIndex >= carrosselImagens.length) carrosselIndex = 0;
        wrapper.style.backgroundImage = `url('${carrosselImagens[carrosselIndex]}')`;
    }, 4500); 
}

function pararCarrosselDashboard() {
    if (carrosselInterval) { clearInterval(carrosselInterval); carrosselInterval = null; }
}

function buscarPecasGlobal() {
    const termo = document.getElementById('input-busca-global').value.toLowerCase();
    const resultadosDiv = document.getElementById('resultados-busca-global');
    resultadosDiv.innerHTML = '';

    if (termo.length < 2) { resultadosDiv.classList.add('view-hidden'); return; }

    let achados = [];
    getTodasGavetas().forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(peca => {
            if (peca.name.toLowerCase().includes(termo) || (peca.code && peca.code.toLowerCase().includes(termo))) {
                achados.push({ gaveta, peca });
            }
        });
    });

    if (achados.length === 0) {
        resultadosDiv.innerHTML = '<p style="color: white; text-shadow: 1px 1px 2px black; padding: 20px;">Nenhum item encontrado.</p>';
        resultadosDiv.classList.remove('view-hidden');
        return;
    }

    achados.forEach(item => {
        const div = document.createElement('div');
        div.className = 'resultado-card';
        div.onclick   = () => {
            document.getElementById('input-busca-global').value = '';
            resultadosDiv.classList.add('view-hidden');
            abrirGaveta(item.gaveta.id);
        };
        div.innerHTML = `
            <div class="res-info">
                <h4>${item.peca.name}</h4>
                <p>Item: ${item.peca.code || 'S/N'} &nbsp;|&nbsp; <strong>${item.gaveta.label}</strong> (Div: ${item.peca.divisoria || 'Geral'})</p>
            </div>
            <div class="res-tag"><i class="fa-solid fa-box-open"></i> ${item.peca.current} un</div>
        `;
        resultadosDiv.appendChild(div);
    });
    resultadosDiv.classList.remove('view-hidden');
}

function atualizarDashboard() {
    renderArmarioVertical();
    calcularKPIs();
    verificarEstoqueZerado();
    renderizarHistorico();

    atualizarImagensCarrossel();
    const dashAtivo = document.getElementById('view-dashboard') && document.getElementById('view-dashboard').classList.contains('view-active');
    if (dashAtivo && !carrosselInterval && carrosselImagens.length > 0) iniciarCarrosselDashboard();

    if (gavetaAtualAberta !== null) renderizarPecasDaGaveta(gavetaAtualAberta);
}

function verificarEstoqueZerado() {
    let qtdZerados = 0;
    getTodasGavetas().forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(p => { if (p.current === 0) qtdZerados++; });
    });
    const banner = document.getElementById('alerta-global-zerado');
    if (!banner) return;
    if (qtdZerados > 0) {
        banner.classList.remove('view-hidden');
        document.getElementById('texto-alerta-zerado').innerHTML = `<strong>Atenção:</strong> Existem <strong>${qtdZerados} item(ns)</strong> com estoque ZERADO no armário!`;
    } else {
        banner.classList.add('view-hidden');
    }
}

function calcularKPIs() {
    let alerts = 0;
    const lista = document.getElementById('kpi-lista-gavetas');
    if (!lista) return;
    lista.innerHTML = '';

    // KPIs do container atual; se nenhum selecionado, mostra todas as gavetas do sistema
    const gavetas = containerAtual ? getGavetasDoContainer(containerAtual) : getTodasGavetas();

    gavetas.forEach(gaveta => {
        const status = getGavetaStatus(database.items[gaveta.id] || []);
        const div = document.createElement('div');
        div.className = `kpi-status-item ${status}`;
        div.innerHTML = `<i class="fa-solid fa-circle-${status === 'verde' ? 'check' : 'exclamation'}"></i> ${gaveta.label}: ${getStatusText(status)}`;
        lista.appendChild(div);
        if (status !== 'verde') alerts++;
    });
    const kpiEl = document.getElementById('kpi-pendencias-count');
    if (kpiEl) kpiEl.innerText = alerts;
}

// =========================================================================
// ARMÁRIO VERTICAL COM DRAG AND DROP
// =========================================================================
function renderArmarioVertical() {
    const chassi = document.getElementById('menu-gavetas');
    if (!chassi) return;
    chassi.innerHTML = '';

    // Pega só as gavetas do container atualmente selecionado (Elétrica, Mecânica...)
    const gavetasDoContainer = getGavetasDoContainer(containerAtual);

    gavetasDoContainer.forEach((gaveta, index) => {
        const status = getGavetaStatus(database.items[gaveta.id] || []);
        const div = document.createElement('div');
        div.className = 'btn-gaveta';

        div.innerHTML = `
            <div class="gaveta-content">
                <i class="fa-solid fa-grip-vertical drag-handle admin-only" title="Arraste para reordenar a gaveta" style="cursor: grab; font-size: 1.2rem; color: rgba(255,255,255,0.5);"></i>
                <span class="gnumber">${gaveta.label}</span>
                <span class="glabel">${gaveta.title}</span>
                <button class="btn-edit-gaveta admin-only" onclick="window.abrirModalEditarGaveta(event, ${gaveta.id})" title="Renomear Gaveta">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <div class="gstatus-light ${status}"></div>
            </div>`;

        div.onclick = (e) => {
            if (e.target.closest('.btn-edit-gaveta') || e.target.closest('.drag-handle')) return;
            abrirGaveta(gaveta.id);
        };

        if (usuarioLogado && usuarioLogado.role === 'ADMIN') {
            div.draggable = true;

            div.ondragstart = (e) => {
                draggedDrawerIndex = index;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => div.classList.add('dragging'), 0);
            };

            div.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                div.classList.add('drag-over');
            };

            div.ondragleave = () => { div.classList.remove('drag-over'); };

            div.ondrop = async (e) => {
                e.preventDefault();
                div.classList.remove('drag-over');
                if (draggedDrawerIndex === null || draggedDrawerIndex === index) return;

                // Reordena dentro do array de gavetas do container atual
                const cont = getContainerAtual();
                if (!cont) return;
                const gavetaArrastada = cont.gavetas[draggedDrawerIndex];
                cont.gavetas.splice(draggedDrawerIndex, 1);
                cont.gavetas.splice(index, 0, gavetaArrastada);

                registrarLog(`reordenou a ${gavetaArrastada.label} no ${cont.nome}.`);

                await salvarConfig();
                renderArmarioVertical(); 
            };

            div.ondragend = () => {
                div.classList.remove('dragging');
                draggedDrawerIndex = null;
            };
        }

        chassi.appendChild(div);
    });
}

// =========================================================================
// INTERIOR DA GAVETA E DRAG AND DROP DAS PEÇAS
// =========================================================================
function abrirGaveta(idGaveta) {
    gavetaAtualAberta = idGaveta;
    const gaveta = acharGaveta(idGaveta);
    if (!gaveta) return;

    // Garante que o container dono dessa gaveta fique selecionado
    // (importante quando a busca global abre uma peça de outro container)
    const containerDono = getContainerDeGaveta(idGaveta);
    if (containerDono) containerAtual = containerDono.id;

    document.getElementById('titulo-gaveta-aberta').innerText = `${gaveta.label}: ${gaveta.title}`;
    renderizarPecasDaGaveta(idGaveta);
    mostrarTela('view-compartimentos');
}

// =========================================================================
// TELA DE SELEÇÃO DE LOCAIS (CONTAINERS: Gaveteiros, Armários, Mezaninos)
// =========================================================================
// Cada "container" é um local físico de estoque. Esta tela mostra todos eles
// como cards. O usuário clica em um para ver as gavetas/prateleiras dentro.
function renderContainers() {
    const grid = document.getElementById('containers-grid');
    if (!grid) return;
    grid.innerHTML = '';

    database.containers.forEach(container => {
        // Calcula estatísticas do container: total de peças e quantas estão zeradas
        let totalPecas = 0, totalZerados = 0;
        (container.gavetas || []).forEach(g => {
            (database.items[g.id] || []).forEach(p => {
                totalPecas++;
                if (p.current === 0) totalZerados++;
            });
        });

        const numCompartimentos = (container.gavetas || []).length;
        const rotuloCompart = container.tipo === 'armario' ? 'prateleiras'
                            : container.tipo === 'mezanino' ? 'seções'
                            : 'gavetas';

        const card = document.createElement('div');
        card.className = 'container-card';
        card.style.borderTopColor = container.cor || '#2a5288';
        card.onclick = () => abrirContainer(container.id);

        card.innerHTML = `
            <div class="container-card-icone" style="background:${container.cor || '#2a5288'}">
                <i class="fa-solid ${container.icone || 'fa-box-archive'}"></i>
            </div>
            <div class="container-card-info">
                <h3>${container.nome}</h3>
                <span class="container-tipo-badge">${tipoContainerLabel(container.tipo)}</span>
                <p>${numCompartimentos} ${rotuloCompart} · ${totalPecas} peças</p>
                ${totalZerados > 0 ? `<p class="container-alerta"><i class="fa-solid fa-triangle-exclamation"></i> ${totalZerados} item(ns) zerado(s)</p>` : '<p class="container-ok"><i class="fa-solid fa-circle-check"></i> Tudo abastecido</p>'}
            </div>
            <div class="container-card-seta"><i class="fa-solid fa-chevron-right"></i></div>
            <button class="btn-excluir-container admin-only" onclick="event.stopPropagation(); window.excluirContainer(${container.id})" title="Excluir este local">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        grid.appendChild(card);
    });
}

// Traduz o tipo do container para um rótulo amigável
function tipoContainerLabel(tipo) {
    const map = { gaveteiro: 'Gaveteiro', armario: 'Armário', mezanino: 'Mezanino / Almox.' };
    return map[tipo] || 'Local';
}

// Abre um container: seleciona-o e mostra suas gavetas/prateleiras
function abrirContainer(idContainer) {
    containerAtual = idContainer;
    const container = getContainerAtual();
    const titulo = document.getElementById('titulo-container-atual');
    if (titulo && container) {
        titulo.innerHTML = `<i class="fa-solid ${container.icone}"></i> ${container.nome}`;
    }
    atualizarDashboard();
    mostrarTela('view-gavetas');
}

// =========================================================================
// ASSISTENTE (WIZARD) DE CRIAÇÃO DE NOVOS LOCAIS DE ESTOQUE
// -------------------------------------------------------------------------
// Pergunta ao usuário o tipo de local (gaveteiro, armário ou mezanino) e,
// conforme o tipo, pede as informações necessárias para montar a estrutura:
//   - Gaveteiro → quantas gavetas
//   - Armário   → quantas portas e quantas prateleiras por porta
//   - Mezanino  → quantas seções/estantes
// No final, gera automaticamente os compartimentos (gavetas) com IDs únicos.
// =========================================================================
function abrirWizardContainer() {
    // Limpa e prepara o formulário
    document.getElementById('wiz-nome').value = '';
    document.getElementById('wiz-tipo').value = 'gaveteiro';
    document.getElementById('wiz-num-gavetas').value = '12';
    document.getElementById('wiz-num-portas').value = '2';
    document.getElementById('wiz-num-prateleiras').value = '4';
    document.getElementById('wiz-num-secoes').value = '10';
    wizardTipoMudou();  // Ajusta quais campos aparecem
    document.getElementById('modal-wizard-container').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('wiz-nome').focus(), 100);
}

function fecharWizardContainer() {
    document.getElementById('modal-wizard-container').classList.add('view-hidden');
}

// Mostra/esconde os campos conforme o tipo de local escolhido
function wizardTipoMudou() {
    const tipo = document.getElementById('wiz-tipo').value;
    document.getElementById('wiz-campos-gaveteiro').style.display = (tipo === 'gaveteiro') ? 'block' : 'none';
    document.getElementById('wiz-campos-armario').style.display   = (tipo === 'armario')   ? 'block' : 'none';
    document.getElementById('wiz-campos-mezanino').style.display  = (tipo === 'mezanino')  ? 'block' : 'none';
}

// Cria de fato o novo container com base nas respostas do wizard
async function criarContainer() {
    const nome = document.getElementById('wiz-nome').value.trim();
    const tipo = document.getElementById('wiz-tipo').value;

    if (!nome) return mostrarAlerta('Atenção', 'Dê um nome para o local (Ex: Mecânica, Almoxarifado...).');

    // Ícones e cores padrão por tipo
    const presets = {
        gaveteiro: { icone: 'fa-table-cells', cor: '#2a5288' },
        armario:   { icone: 'fa-warehouse',   cor: '#7c3aed' },
        mezanino:  { icone: 'fa-layer-group',  cor: '#059669' }
    };

    // Monta as gavetas/compartimentos conforme o tipo escolhido
    const gavetas = [];
    let idGaveta = proximoIdGaveta();

    if (tipo === 'gaveteiro') {
        const num = Math.max(1, parseInt(document.getElementById('wiz-num-gavetas').value) || 1);
        for (let i = 1; i <= num; i++) {
            gavetas.push({ id: idGaveta++, label: `G${i}`, title: `Gaveta ${i}` });
        }
    } else if (tipo === 'armario') {
        const portas = Math.max(1, parseInt(document.getElementById('wiz-num-portas').value) || 1);
        const prateleiras = Math.max(1, parseInt(document.getElementById('wiz-num-prateleiras').value) || 1);
        // Cada prateleira de cada porta vira um compartimento (com grid próprio)
        for (let p = 1; p <= portas; p++) {
            for (let pr = 1; pr <= prateleiras; pr++) {
                gavetas.push({ id: idGaveta++, label: `P${p}-Prat${pr}`, title: `Porta ${p} · Prateleira ${pr}` });
            }
        }
    } else if (tipo === 'mezanino') {
        const secoes = Math.max(1, parseInt(document.getElementById('wiz-num-secoes').value) || 1);
        for (let s = 1; s <= secoes; s++) {
            gavetas.push({ id: idGaveta++, label: `S${s}`, title: `Seção ${s}` });
        }
    }

    // Cria o novo container e inicializa o estoque vazio de cada compartimento
    const novoContainer = {
        id:      proximoIdContainer(),
        nome:    nome,
        tipo:    tipo,
        icone:   presets[tipo].icone,
        cor:     presets[tipo].cor,
        gavetas: gavetas
    };
    gavetas.forEach(g => { if (!database.items[g.id]) database.items[g.id] = []; });

    database.containers.push(novoContainer);
    registrarLog(`criou o novo local "${nome}" (${tipoContainerLabel(tipo)}) com ${gavetas.length} compartimentos.`);

    await salvarConfig();
    registrarListenersGavetas();  // Passa a escutar as novas gavetas no Firestore
    fecharWizardContainer();
    renderContainers();
    mostrarAlerta('Local Criado!', `"${nome}" foi criado com ${gavetas.length} compartimentos. Agora é só clicar nele e cadastrar as peças.`);
}

// Exclui um container inteiro (e todo o estoque dentro dele). Ação destrutiva!
async function excluirContainer(idContainer) {
    const container = database.containers.find(c => c.id === idContainer);
    if (!container) return;

    if (!confirm(`ATENÇÃO: Excluir o local "${container.nome}" apaga TODAS as suas gavetas e peças. Esta ação não pode ser desfeita. Continuar?`)) return;

    // Remove os items de cada gaveta da memória
    (container.gavetas || []).forEach(g => { delete database.items[g.id]; });
    database.containers = database.containers.filter(c => c.id !== idContainer);

    if (containerAtual === idContainer) containerAtual = null;

    registrarLog(`excluiu o local "${container.nome}" e todo o seu conteúdo.`);
    await salvarConfig();
    renderContainers();
}

// =========================================================================
// NOVA GAVETA AVULSA (adiciona uma gaveta a um local já existente)
// -------------------------------------------------------------------------
// Útil quando o usuário precisa só de mais uma gaveta sem recriar o local.
// A gaveta recebe um ID único global (não colide com nenhuma outra).
// =========================================================================
function abrirModalNovaGaveta() {
    if (!containerAtual) return mostrarAlerta('Atenção', 'Abra um local primeiro para adicionar uma gaveta.');
    document.getElementById('nova-gaveta-label').value = '';
    document.getElementById('nova-gaveta-title').value = '';
    document.getElementById('modal-nova-gaveta').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('nova-gaveta-label').focus(), 100);
}

function fecharModalNovaGaveta() {
    document.getElementById('modal-nova-gaveta').classList.add('view-hidden');
}

async function salvarNovaGaveta() {
    const label = document.getElementById('nova-gaveta-label').value.trim();
    const title = document.getElementById('nova-gaveta-title').value.trim();

    if (!label) return mostrarAlerta('Atenção', 'Dê uma etiqueta curta para a gaveta (Ex: G13).');

    const container = getContainerAtual();
    if (!container) return;

    const novaGaveta = {
        id:    proximoIdGaveta(),                 // ID único global
        label: label,
        title: title || label                     // Se não informar nome, usa a etiqueta
    };

    container.gavetas.push(novaGaveta);
    database.items[novaGaveta.id] = [];

    registrarLog(`adicionou a gaveta "${label}" ao ${container.nome}.`);
    await salvarConfig();
    registrarListenersGavetas();   // Passa a escutar a nova gaveta no Firestore
    fecharModalNovaGaveta();
    renderArmarioVertical();
}

// =========================================================================
// PRÉ-VISUALIZAÇÃO DO TAMANHO (barra mostrando quantos espaços a peça ocupa)
// -------------------------------------------------------------------------
// Desenha uma coluna de 10 espaços e pinta de azul os N de baixo, mostrando
// visualmente quanto da coluna a peça vai ocupar. 'prefixo' = 'novo' ou 'edit'.
// =========================================================================
function atualizarPreviewTamanho(prefixo) {
    const idCampo   = prefixo === 'edit' ? 'edit-peca-tamanho' : 'novo-tamanho';
    const idPreview = prefixo === 'edit' ? 'edit-tam-preview'  : 'novo-tam-preview';

    const preview = document.getElementById(idPreview);
    if (!preview) return;

    const tam = Math.min(10, Math.max(1, parseInt(document.getElementById(idCampo).value) || 1));

    // Desenha 10 espaços; os 'tam' de baixo ficam preenchidos
    preview.innerHTML = '';
    for (let i = 10; i >= 1; i--) {
        const slot = document.createElement('div');
        slot.className = 'tam-preview-slot' + (i <= tam ? ' preenchido' : '');
        if (i === tam) slot.innerHTML = `<span>${tam}/10</span>`;
        preview.appendChild(slot);
    }
}





// =========================================================================
// DISTRIBUIÇÃO AUTOMÁTICA EM COLUNAS (BIN-PACKING / ENCAIXE INTELIGENTE)
// -------------------------------------------------------------------------
// Coração do novo layout. Recebe a lista de peças e distribui automaticamente
// entre 5 colunas físicas (cada uma com 10 espaços verticais). Cada peça ocupa
// um "tamanho" (1 a 10 espaços). O algoritmo é BEST-FIT balanceado:
//   1. percorre as peças na ordem (campo position);
//   2. coloca cada peça na coluna MAIS VAZIA que ainda comporte o tamanho dela;
//   3. se não couber em nenhuma respeitando a capacidade 10, coloca na coluna
//      mais curta mesmo assim (transbordo controlado → a gaveta ganha scroll).
// Resultado: nunca há sobreposição, o espaço é equilibrado e parece uma
// gaveta industrial real.
// =========================================================================
const COLUNAS_GAVETA   = 5;   // 5 divisórias verticais físicas
const ESPACOS_POR_COL  = 10;  // 10 encaixes verticais por coluna

function getTamanhoPeca(peca) {
    // Lê o tamanho físico vertical (1-10). Aceita campos antigos por compatibilidade.
    const t = parseInt(peca.tamanho ?? peca.alturaLinhas ?? peca.size ?? 1);
    return Math.min(ESPACOS_POR_COL, Math.max(1, isNaN(t) ? 1 : t));
}

function distribuirEmColunas(pecas) {
    // Inicializa as 5 colunas vazias
    const colunas = Array.from({ length: COLUNAS_GAVETA }, () => ({ itens: [], ocupacao: 0 }));

    // Ordena pela posição definida pelo usuário (mantém intenção de ordem)
    const ordenadas = [...pecas].sort((a, b) => (a.position || 999) - (b.position || 999));

    // FASE 1: peças com COLUNA ATRIBUÍDA manualmente (via arraste) vão direto pra ela
    ordenadas.forEach(peca => {
        const col = parseInt(peca.coluna);
        if (col >= 1 && col <= COLUNAS_GAVETA) {
            const tam = getTamanhoPeca(peca);
            colunas[col - 1].itens.push({ peca, tam });
            colunas[col - 1].ocupacao += tam;
        }
    });

    // FASE 2: peças SEM coluna definida → encaixe automático (best-fit balanceado)
    ordenadas.forEach(peca => {
        const col = parseInt(peca.coluna);
        if (col >= 1 && col <= COLUNAS_GAVETA) return;  // já posicionada na fase 1

        const tam = getTamanhoPeca(peca);
        let alvo = null, menorOcupacao = Infinity;
        for (const c of colunas) {
            if (c.ocupacao + tam <= ESPACOS_POR_COL && c.ocupacao < menorOcupacao) {
                menorOcupacao = c.ocupacao;
                alvo = c;
            }
        }
        if (!alvo) {
            alvo = colunas.reduce((min, c) => (c.ocupacao < min.ocupacao ? c : min), colunas[0]);
        }
        alvo.itens.push({ peca, tam });
        alvo.ocupacao += tam;
    });

    return colunas;
}

// Monta o conteúdo interno de uma peça. AGORA TODAS mostram foto:
// - pequenas (1-2): layout HORIZONTAL (mini-foto à esquerda + nome/qtd à direita)
// - médias/grandes (3+): layout VERTICAL com foto crescendo conforme o tamanho
// Toda a peça é clicável e abre o painel de ações.
function montarConteudoPeca(peca, tam, statusPeca) {
    const corQtd = statusPeca === 'verde' ? 'var(--status-verde)' : 'var(--text-primary)';
    const tagDivisoria = (peca.divisoria && peca.divisoria !== 'Geral')
        ? `<span class="peca-tag-div">${peca.divisoria}</span>` : '';

    const imgHtml = peca.image
        ? `<img src="${peca.image}" alt="${peca.name}">`
        : `<i class="fa-solid fa-microchip peca-img-placeholder"></i>`;

    // Controle rápido de quantidade (+/-)
    const controleQtd = `
        <div class="peca-qtd" onclick="event.stopPropagation()">
            <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, -1)"><i class="fa-solid fa-minus"></i></button>
            <strong style="color:${corQtd}">${peca.current}</strong>
            <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, 1)"><i class="fa-solid fa-plus"></i></button>
        </div>`;

    if (tam <= 2) {
        // PEQUENA: horizontal — mini-foto + nome + quantidade. Mostra imagem também!
        return `
            <div class="peca-mini-conteudo">
                <div class="peca-mini-img">${imgHtml}</div>
                <div class="peca-mini-texto">
                    <div class="peca-mini-topo">
                        <span class="peca-status-dot ${statusPeca}"></span>
                        <span class="peca-nome-mini" title="${peca.name}">${peca.name}</span>
                    </div>
                    ${controleQtd}
                </div>
            </div>`;
    }

    // MÉDIA / GRANDE: vertical com foto ocupando o espaço extra
    return `
        <div class="peca-cabecalho">
            <span class="badge-status ${statusPeca}">${getStatusText(statusPeca)}</span>
            ${tagDivisoria}
            <span class="peca-codigo">${peca.code || 'S/N'}</span>
        </div>
        <div class="peca-nome">${peca.name}</div>
        <div class="peca-imagem">${imgHtml}</div>
        <div class="peca-rodape">
            <span class="peca-padrao">5S: ${peca.expected}</span>
            ${controleQtd}
        </div>`;
}

function renderizarPecasDaGaveta(idGaveta) {
    const mainContainer = document.getElementById('container-divisorias');
    if (!mainContainer) return;
    mainContainer.innerHTML = '';
    const pecasBrutas = database.items[idGaveta] || [];

    if (pecasBrutas.length === 0) {
        mainContainer.innerHTML = '<p style="text-align:center; color:#64748b; font-size:1.1rem; padding:40px;">Nenhuma peça cadastrada nesta gaveta.</p>';
        return;
    }

    // Distribui TODAS as peças da gaveta nas 5 colunas físicas (sem sobreposição)
    const colunas = distribuirEmColunas(pecasBrutas);

    // Container físico da gaveta (as 5 colunas com divisórias metálicas)
    const gaveta = document.createElement('div');
    gaveta.className = 'gaveta-fisica';

    const ehAdmin = usuarioLogado && usuarioLogado.role === 'ADMIN';

    colunas.forEach((coluna, indexColuna) => {
        const colDiv = document.createElement('div');
        colDiv.className = 'gaveta-coluna';
        colDiv.dataset.coluna = indexColuna + 1;   // 1 a 5 (usado no arraste)

        coluna.itens.forEach(({ peca, tam }) => {
            const statusPeca = getPecaStatus(peca);
            const isVazio = (peca.name || '').trim().toLowerCase() === 'vazio';

            const pecaDiv = document.createElement('div');
            const faixa = tam <= 2 ? 'peca-mini' : (tam <= 4 ? 'peca-media' : 'peca-grande');
            pecaDiv.className = `peca-fisica ${faixa} status-borda-${statusPeca}` + (isVazio ? ' peca-vazia' : '');

            // ALTURA PROPORCIONAL EXATA: tamanho N = N espaços × altura do slot.
            // Sem somar gaps (que quebravam a conta). Coluna = 10 espaços exatos.
            pecaDiv.style.flex = `0 0 calc(var(--slot-altura) * ${tam})`;

            if (isVazio) {
                pecaDiv.innerHTML = `<div class="peca-vazia-label"><i class="fa-solid fa-box-open"></i> livre</div>`;
            } else {
                pecaDiv.innerHTML = montarConteudoPeca(peca, tam, statusPeca);
                pecaDiv.onclick = () => abrirAcoesPeca(peca.id);
                pecaDiv.style.cursor = 'pointer';
            }

            // ---- ARRASTAR (somente ADMIN): mover peça entre colunas/posições ----
            if (ehAdmin) {
                pecaDiv.draggable = true;

                pecaDiv.ondragstart = (e) => {
                    // Não inicia arraste ao mexer nos botões +/-
                    if (e.target.closest('button')) { e.preventDefault(); return; }
                    draggedPecaId = peca.id;
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => pecaDiv.classList.add('arrastando'), 0);
                };
                pecaDiv.ondragend = () => {
                    pecaDiv.classList.remove('arrastando');
                    draggedPecaId = null;
                };
                pecaDiv.ondragover = (e) => { e.preventDefault(); pecaDiv.classList.add('drop-alvo'); };
                pecaDiv.ondragleave = () => pecaDiv.classList.remove('drop-alvo');
                pecaDiv.ondrop = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pecaDiv.classList.remove('drop-alvo');
                    soltarPecaSobre(peca.id, indexColuna + 1);
                };
            }

            colDiv.appendChild(pecaDiv);
        });

        // ESPAÇO LIVRE: sobra da coluna (também é área onde se pode SOLTAR uma peça)
        if (coluna.ocupacao < ESPACOS_POR_COL) {
            const livre = ESPACOS_POR_COL - coluna.ocupacao;
            const vazio = document.createElement('div');
            vazio.className = 'coluna-espaco-livre';
            vazio.innerHTML = `<span><i class="fa-solid fa-grip-lines"></i><br>${livre} livre(s)</span>`;
            colDiv.appendChild(vazio);
        }

        // A COLUNA INTEIRA é uma área de drop: soltar aqui joga a peça pro fim desta coluna
        if (ehAdmin) {
            colDiv.ondragover = (e) => { e.preventDefault(); colDiv.classList.add('coluna-drop'); };
            colDiv.ondragleave = () => colDiv.classList.remove('coluna-drop');
            colDiv.ondrop = (e) => {
                e.preventDefault();
                colDiv.classList.remove('coluna-drop');
                soltarPecaNaColuna(indexColuna + 1);
            };
        }

        gaveta.appendChild(colDiv);
    });

    mainContainer.appendChild(gaveta);
}

// =========================================================================
// MOVIMENTAÇÃO MANUAL POR ARRASTE
// -------------------------------------------------------------------------
// Duas formas de soltar:
//  - soltarPecaSobre: largou em cima de OUTRA peça → assume a coluna dela e
//    fica logo antes dela na ordem (position).
//  - soltarPecaNaColuna: largou num espaço livre/coluna → vai pro fim daquela coluna.
// A peça arrastada recebe um campo "coluna" (1-5). Como a posição é manual,
// o sistema respeita e nunca sobrepõe (as peças empilham em sequência).
// =========================================================================
async function soltarPecaSobre(idAlvo, colunaDestino) {
    if (!draggedPecaId || draggedPecaId === idAlvo) return;
    const itens = database.items[gavetaAtualAberta];
    const arrastada = itens.find(p => p.id === draggedPecaId);
    const alvo      = itens.find(p => p.id === idAlvo);
    if (!arrastada || !alvo) return;

    arrastada.coluna = colunaDestino;
    // Reordena: coloca a arrastada imediatamente antes da peça alvo
    arrastada.position = (alvo.position || 1) - 0.5;
    renumerarPosicoes(itens);

    registrarLog(`moveu a peça "${arrastada.name}" para a coluna ${colunaDestino}.`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    renderizarPecasDaGaveta(gavetaAtualAberta);
}

async function soltarPecaNaColuna(colunaDestino) {
    if (!draggedPecaId) return;
    const itens = database.items[gavetaAtualAberta];
    const arrastada = itens.find(p => p.id === draggedPecaId);
    if (!arrastada) return;

    arrastada.coluna = colunaDestino;
    // Vai pro fim: maior position atual + 1
    const maxPos = itens.reduce((m, p) => Math.max(m, p.position || 0), 0);
    arrastada.position = maxPos + 1;
    renumerarPosicoes(itens);

    registrarLog(`moveu a peça "${arrastada.name}" para a coluna ${colunaDestino}.`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    renderizarPecasDaGaveta(gavetaAtualAberta);
}

// Renumera as posições de 1 em diante (mantém a ordem, limpa frações)
function renumerarPosicoes(itens) {
    itens.sort((a, b) => (a.position || 999) - (b.position || 999))
         .forEach((p, i) => { p.position = i + 1; });
}

// =========================================================================
// PAINEL DE AÇÕES DA PEÇA
// -------------------------------------------------------------------------
// Como os cards na gaveta física são compactos (parecem encaixes reais),
// todas as ações (conferir, requisitar, mover, editar, excluir) ficam num
// painel que abre ao TOCAR na peça. Isso mantém a gaveta limpa e funciona
// muito bem no celular.
// =========================================================================
let pecaAcoesId = null;

function abrirAcoesPeca(idPeca) {
    pecaAcoesId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;

    const statusPeca = getPecaStatus(peca);
    const ehAdmin = usuarioLogado && usuarioLogado.role === 'ADMIN';

    document.getElementById('acoes-peca-nome').innerText = peca.name;
    document.getElementById('acoes-peca-info').innerHTML =
        `<span class="badge-status ${statusPeca}">${getStatusText(statusPeca)}</span> ` +
        `Item: ${peca.code || 'S/N'} · Divisória: ${peca.divisoria || 'Geral'} · Tamanho: ${getTamanhoPeca(peca)} espaço(s)`;

    // Imagem (se houver)
    const imgBox = document.getElementById('acoes-peca-imagem');
    imgBox.innerHTML = peca.image
        ? `<img src="${peca.image}" alt="${peca.name}" style="max-width:100%; max-height:160px; object-fit:contain; mix-blend-mode:multiply;">`
        : `<i class="fa-solid fa-microchip" style="font-size:3rem; color:#cbd5e1;"></i>`;

    // Quantidade atual com controle rápido
    document.getElementById('acoes-peca-qtd').innerHTML = `
        <span>Padrão 5S: <strong>${peca.expected}</strong></span>
        <div class="quick-control">
            <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, -1); window.atualizarPainelAcoes()"><i class="fa-solid fa-minus"></i></button>
            <strong id="acoes-qtd-valor">${peca.current}</strong>
            <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, 1); window.atualizarPainelAcoes()"><i class="fa-solid fa-plus"></i></button>
        </div>`;

    // Botões de ação (alguns só para admin)
    document.getElementById('acoes-peca-botoes').innerHTML = `
        <button class="btn-conferir" onclick="window.fecharAcoesPeca(); window.abrirModalConferencia(${peca.id})">
            <i class="fa-solid fa-clipboard-check"></i> Definir Contagem Exata
        </button>
        <button class="btn-requisitado ${peca.requested ? 'ativo' : ''}" onclick="window.alternarStatusRequisitado(${peca.id}); window.fecharAcoesPeca()">
            <i class="fa-solid fa-cart-arrow-down"></i> ${peca.requested ? 'Já Requisitado' : 'Marcar como Requisitado'}
        </button>
        ${ehAdmin ? `
        <button class="btn-mover" onclick="window.fecharAcoesPeca(); window.abrirModalMoverPeca(${peca.id})">
            <i class="fa-solid fa-right-left"></i> Mover para outra Gaveta
        </button>
        <button class="btn-conferir" style="background:#0284c7" onclick="window.fecharAcoesPeca(); window.abrirModalEditarPeca(${peca.id})">
            <i class="fa-solid fa-pen"></i> Editar Peça
        </button>
        <button class="btn-requisitado" style="background:#fee2e2;color:#b91c1c;border-color:#ef4444" onclick="window.fecharAcoesPeca(); window.excluirPeca(${peca.id})">
            <i class="fa-solid fa-trash"></i> Excluir Peça
        </button>` : ''}`;

    document.getElementById('modal-acoes-peca').classList.remove('view-hidden');
}

// Atualiza só o número da quantidade no painel (após +/-) sem fechar
function atualizarPainelAcoes() {
    if (pecaAcoesId === null) return;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaAcoesId);
    const el = document.getElementById('acoes-qtd-valor');
    if (peca && el) el.innerText = peca.current;
}

function fecharAcoesPeca() {
    document.getElementById('modal-acoes-peca').classList.add('view-hidden');
    pecaAcoesId = null;
}

function ajusteRapidoEstoque(idPeca, delta) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;
    let novaQtd = Math.max(0, peca.current + delta);
    if (delta < 0 && peca.current > 0) {
        peca.lastTakenBy = usuarioLogado.nome;
        registrarLog(`retirou 1 unidade da peça "${peca.name}"`);
        enviarNotificacao("Peça Retirada", `Você retirou 1x ${peca.name}. Restaram ${novaQtd} peça(s).`);
    } else if (delta > 0) {
        registrarLog(`adicionou 1 unidade da peça "${peca.name}"`);
    }
    peca.current = novaQtd;
    if (peca.current >= peca.expected) peca.requested = false;
    salvarItensDaGaveta(gavetaAtualAberta);
}

function alternarStatusRequisitado(idPeca) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;
    peca.requested = !peca.requested;
    registrarLog(`${peca.requested ? 'marcou como REQUISITADO' : 'removeu o status requisitado de'} a peça "${peca.name}"`);
    salvarItensDaGaveta(gavetaAtualAberta);
}

function excluirPeca(idPeca) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;
    if (confirm(`Tem certeza que deseja excluir a peça "${peca.name}" da gaveta?`)) {
        database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== idPeca);
        registrarLog(`excluiu a peça "${peca.name}" do sistema`);
        salvarItensDaGaveta(gavetaAtualAberta);
    }
}

// =========================================================================
// MOVER PEÇA ENTRE GAVETAS
// =========================================================================
function abrirModalMoverPeca(idPeca) {
    pecaSendoMovidaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    document.getElementById('mover-peca-nome').innerText = peca.name;
    const select = document.getElementById('mover-destino-select');
    select.innerHTML = '';
    getTodasGavetas().forEach(gaveta => {
        if (gaveta.id === gavetaAtualAberta) return;
        const option      = document.createElement('option');
        option.value      = gaveta.id;
        option.innerText  = `${gaveta.label} — ${gaveta.title}`;
        select.appendChild(option);
    });
    document.getElementById('modal-mover-peca').classList.remove('view-hidden');
}

function fecharModalMoverPeca() {
    document.getElementById('modal-mover-peca').classList.add('view-hidden');
    pecaSendoMovidaId = null;
}

async function confirmarMoverPeca() {
    const destinoId     = parseInt(document.getElementById('mover-destino-select').value);
    const gavetaOrigem  = acharGaveta(gavetaAtualAberta);
    const gavetaDestino = acharGaveta(destinoId);
    const peca          = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoMovidaId);

    database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== pecaSendoMovidaId);
    if (!database.items[destinoId]) database.items[destinoId] = [];
    database.items[destinoId].push(peca);

    registrarLog(`moveu a peça "${peca.name}" da ${gavetaOrigem.label} para ${gavetaDestino.label}`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    await salvarItensDaGaveta(destinoId);
    fecharModalMoverPeca();
}

function abrirModalEditarGaveta(eventoClick, idGaveta) {
    eventoClick.stopPropagation();
    gavetaSendoEditadaId = idGaveta;
    const gaveta = acharGaveta(idGaveta);
    document.getElementById('edit-gaveta-nome').value = gaveta.title;
    document.getElementById('modal-editar-gaveta').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('edit-gaveta-nome').focus(), 100);
}

function fecharModalEditarGaveta() {
    document.getElementById('modal-editar-gaveta').classList.add('view-hidden');
}

function salvarNomeGaveta() {
    const novoNome = document.getElementById('edit-gaveta-nome').value.trim();
    if (!novoNome) return mostrarAlerta('Atenção', 'O nome da gaveta não pode ficar vazio.');
    const gaveta     = acharGaveta(gavetaSendoEditadaId);
    const nomeAntigo = gaveta.title;
    gaveta.title     = novoNome;
    registrarLog(`alterou o nome da gaveta ${gaveta.label} de "${nomeAntigo}" para "${novoNome}"`);
    salvarConfig();
    fecharModalEditarGaveta();
}

// =========================================================================
// GERENCIAMENTO DE PEÇAS
// =========================================================================
function abrirModalCadastro() {
    ['novo-codigo', 'novo-nome', 'novo-posicao'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('novo-esperado').value  = '1';
    document.getElementById('novo-atual').value     = '0';
    document.getElementById('novo-divisoria').value = 'Geral';

    // TAMANHO FÍSICO: padrão 2 espaços (peça pequena/média)
    document.getElementById('novo-tamanho').value   = '2';

    document.getElementById('novo-imagem').value    = '';
    document.getElementById('modal-cadastro').classList.remove('view-hidden');
    atualizarPreviewTamanho('novo');
    setTimeout(() => document.getElementById('novo-nome').focus(), 100);
}

function fecharModalCadastro() { document.getElementById('modal-cadastro').classList.add('view-hidden'); }

async function salvarNovoItem() {
    const codigo    = document.getElementById('novo-codigo').value.trim();
    const nome      = document.getElementById('novo-nome').value.trim();
    const esperado  = parseInt(document.getElementById('novo-esperado').value);
    const atual     = parseInt(document.getElementById('novo-atual').value);
    const posicao   = parseInt(document.getElementById('novo-posicao').value) || 999;
    const divisoria = document.getElementById('novo-divisoria').value.trim() || 'Geral';

    // TAMANHO FÍSICO: quantos espaços verticais (1-10) a peça ocupa.
    // A posição (coluna/linha) é calculada AUTOMATICAMENTE pelo bin-packing.
    const tamanho   = Math.min(10, Math.max(1, parseInt(document.getElementById('novo-tamanho').value) || 1));

    const imgInput  = document.getElementById('novo-imagem');

    if (!nome) return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');

    const btnSalvar = document.querySelector('#modal-cadastro .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const novaPeca = {
        id:          Date.now(),
        code:        codigo || `G${gavetaAtualAberta}-P${(database.items[gavetaAtualAberta] || []).length + 1}`,
        name:        nome, 
        expected:    esperado, 
        current:     atual, 
        position:    posicao,
        divisoria:   divisoria, 
        tamanho:     tamanho,   // Tamanho físico vertical (1-10) — base do encaixe automático
        size:        tamanho,   // Compatibilidade com código/dados antigos
        requested:   false, 
        lastTakenBy: null, 
        image:       null
    };

    if (imgInput.files && imgInput.files[0]) {
        try { novaPeca.image = await uploadImagemCloudinary(imgInput.files[0]); } 
        catch (err) { mostrarAlerta('Aviso', 'Não foi possível enviar a foto. A peça será salva sem imagem.'); }
    }

    database.items[gavetaAtualAberta].push(novaPeca);
    registrarLog(`cadastrou "${novaPeca.name}" na Divisória ${divisoria} (tamanho ${tamanho}).`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    fecharModalCadastro();

    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Peça'; }
}

function abrirModalEditarPeca(idPeca) {
    pecaSendoEditadaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;
    document.getElementById('edit-peca-codigo').value    = peca.code    || '';
    document.getElementById('edit-peca-nome').value      = peca.name;
    document.getElementById('edit-peca-esperado').value  = peca.expected;
    document.getElementById('edit-peca-atual').value     = peca.current;
    document.getElementById('edit-peca-posicao').value   = (peca.position && peca.position !== 999) ? peca.position : '';
    document.getElementById('edit-peca-divisoria').value = peca.divisoria || 'Geral';

    // TAMANHO FÍSICO (1-10), com default pra dados antigos
    document.getElementById('edit-peca-tamanho').value = getTamanhoPeca(peca);

    document.getElementById('edit-peca-imagem').value    = '';
    document.getElementById('modal-editar-peca').classList.remove('view-hidden');
    atualizarPreviewTamanho('edit');
    setTimeout(() => document.getElementById('edit-peca-nome').focus(), 100);
}

function fecharModalEditarPeca() { document.getElementById('modal-editar-peca').classList.add('view-hidden'); }

async function salvarEdicaoPeca() {
    const novoCodigo    = document.getElementById('edit-peca-codigo').value.trim();
    const novoNome      = document.getElementById('edit-peca-nome').value.trim();
    const novoEsperado  = parseInt(document.getElementById('edit-peca-esperado').value);
    const novoAtual     = parseInt(document.getElementById('edit-peca-atual').value);
    const novaPosicao   = parseInt(document.getElementById('edit-peca-posicao').value) || 999;
    const novaDivisoria = document.getElementById('edit-peca-divisoria').value.trim() || 'Geral';

    // TAMANHO FÍSICO (1-10) — posição é recalculada automaticamente
    const novoTamanho   = Math.min(10, Math.max(1, parseInt(document.getElementById('edit-peca-tamanho').value) || 1));

    const imgInput      = document.getElementById('edit-peca-imagem');

    if (!novoNome) return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');

    const btnSalvar = document.querySelector('#modal-editar-peca .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const peca      = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoEditadaId);
    peca.code       = novoCodigo;
    peca.name       = novoNome;
    peca.expected   = novoEsperado;
    peca.current    = novoAtual;
    peca.position   = novaPosicao;
    peca.divisoria  = novaDivisoria;
    peca.tamanho    = novoTamanho;
    peca.size       = novoTamanho;  // Compatibilidade

    if (peca.current >= peca.expected) peca.requested = false;

    if (imgInput.files && imgInput.files[0]) {
        try { peca.image = await uploadImagemCloudinary(imgInput.files[0]); } 
        catch (err) { mostrarAlerta('Aviso', 'Não foi possível enviar a nova foto. A imagem anterior foi mantida.'); }
    }

    registrarLog(`editou as informações da peça "${peca.name}" (tamanho ${novoTamanho})`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    fecharModalEditarPeca();

    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Alterações'; }
}

function abrirModalConferencia(idPeca) {
    pecaSendoConferidaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;
    document.getElementById('conf-nome-peca').innerText = peca.name;
    document.getElementById('conf-qtd-atual').value     = peca.current;
    document.getElementById('modal-conferencia').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('conf-qtd-atual').focus(), 100);
}

function fecharModalConferencia() { document.getElementById('modal-conferencia').classList.add('view-hidden'); }

function salvarConferencia() {
    const novaQtd = parseInt(document.getElementById('conf-qtd-atual').value);
    if (isNaN(novaQtd) || novaQtd < 0) return mostrarAlerta('Valor Inválido', 'A quantidade deve ser um número igual ou maior que zero.');
    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoConferidaId);
    if (!peca) return;
    if (novaQtd !== peca.current) registrarLog(`alterou a contagem de "${peca.name}" de ${peca.current} para ${novaQtd}`);
    if (novaQtd < peca.current) peca.lastTakenBy = usuarioLogado.nome;
    peca.current = novaQtd;
    if (peca.current >= peca.expected) peca.requested = false;
    salvarItensDaGaveta(gavetaAtualAberta);
    fecharModalConferencia();
}

function mostrarAlerta(titulo, mensagem) {
    document.getElementById('alerta-titulo').innerText   = titulo;
    document.getElementById('alerta-mensagem').innerText = mensagem;
    document.getElementById('modal-alerta').classList.remove('view-hidden');
}

function fecharAlerta() { document.getElementById('modal-alerta').classList.add('view-hidden'); }

// =========================================================================
// GERADOR DE PEDIDO DE COMPRA
// =========================================================================
function gerarEmailPedido() {
    const containerItens = document.getElementById('formulario-pedido-itens');
    containerItens.innerHTML = '';
    let itensFaltando = [];

    getTodasGavetas().forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(peca => {
            if (peca.current < peca.expected) {
                itensFaltando.push({ nome: peca.name, codigo: peca.code, falta: peca.expected - peca.current });
            }
        });
    });

    if (itensFaltando.length === 0) return mostrarAlerta("Tudo em Ordem", "Não há peças faltando no gaveteiro neste momento.");

    itensFaltando.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.border          = '1px solid var(--border-color)';
        div.style.padding         = '15px';
        div.style.marginBottom    = '15px';
        div.style.borderRadius    = '8px';
        div.style.backgroundColor = '#f8fafc';

        div.innerHTML = `
            <p style="font-weight: bold; margin-bottom: 12px; color: var(--cabinet-blue); font-size: 1.05rem;">
                <i class="fa-solid fa-box-open"></i> ${item.falta} un. | ${item.nome}
                <span style="font-weight: normal; color: var(--text-secondary);">(Item: ${item.codigo || 'S/N'})</span>
            </p>
            <div class="form-group row" style="margin-bottom: 10px;">
                <div class="col">
                    <label>Ordem de Serviço (OS):</label>
                    <input type="text" id="os-${index}" placeholder="Ex: 12345678">
                </div>
                <div class="col">
                    <label>Almoxarifado:</label>
                    <select id="almo-${index}" onchange="window.toggleCompradoFora(${index})">
                        <option value="Automação">Automação</option>
                        <option value="Estoque">Estoque</option>
                        <option value="Comprado Fora">Comprado Fora</option>
                    </select>
                </div>
            </div>
            <div id="extra-${index}" class="view-hidden" style="border-top: 1px dashed #cbd5e1; padding-top: 10px; margin-top: 10px;">
                <div class="form-group row">
                    <div class="col">
                        <label>Fornecedor:</label>
                        <input type="text" id="forn-${index}" placeholder="Nome do fornecedor">
                    </div>
                    <div class="col">
                        <label>Unid. Medida:</label>
                        <input type="text" id="unid-${index}" placeholder="Ex: PC, RL, CX">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label>Justificativa:</label>
                    <input type="text" id="just-${index}" placeholder="Motivo da compra">
                </div>
            </div>
        `;
        containerItens.appendChild(div);
    });

    document.getElementById('formulario-pedido-itens').classList.remove('view-hidden');
    document.getElementById('texto-pedido-gerado').classList.add('view-hidden');
    document.getElementById('btn-gerar-texto-pedido').classList.remove('view-hidden');
    document.getElementById('btn-copiar-pedido').classList.add('view-hidden');
    document.getElementById('pedido-subtitle').innerText = "Preencha os detalhes de cada item para gerar a solicitação.";

    window.itensFaltandoTemp = itensFaltando;
    document.getElementById('modal-pedido').classList.remove('view-hidden');
}

function toggleCompradoFora(index) {
    const select   = document.getElementById(`almo-${index}`).value;
    const extraDiv = document.getElementById(`extra-${index}`);
    if (select === 'Comprado Fora') extraDiv.classList.remove('view-hidden');
    else extraDiv.classList.add('view-hidden');
}

function processarFormularioPedido() {
    const nomeSolicitante = usuarioLogado ? usuarioLogado.nome : 'Manutenção';
    let textoFinal = `Olá,\n\nPor favor, solicito a compra/reposição dos seguintes materiais faltantes para o nosso gaveteiro elétrico:\n\n`;

    window.itensFaltandoTemp.forEach((item, index) => {
        const os   = document.getElementById(`os-${index}`).value    || 'Não informada';
        const almo = document.getElementById(`almo-${index}`).value;

        textoFinal += `- ${item.falta} un. | ${item.nome} (Item: ${item.codigo || 'S/N'}) | OS: ${os} | Almox: ${almo}\n`;

        if (almo === 'Comprado Fora') {
            const forn = document.getElementById(`forn-${index}`).value || 'Não informado';
            const unid = document.getElementById(`unid-${index}`).value || 'Não informada';
            const just = document.getElementById(`just-${index}`).value || 'Não informada';
            textoFinal += `  > Detalhes Compra Externa - Fornecedor: ${forn} | UM: ${unid} | Justificativa: ${just}\n`;
        }
    });

    textoFinal += `\nFico no aguardo.\nObrigado,\n${nomeSolicitante}`;

    document.getElementById('texto-pedido-gerado').value = textoFinal;
    document.getElementById('formulario-pedido-itens').classList.add('view-hidden');
    document.getElementById('texto-pedido-gerado').classList.remove('view-hidden');
    document.getElementById('btn-gerar-texto-pedido').classList.add('view-hidden');
    document.getElementById('btn-copiar-pedido').classList.remove('view-hidden');
    document.getElementById('pedido-subtitle').innerText = "Copie o texto pronto abaixo para enviar diretamente no seu Outlook ou Teams.";
}

function fecharModalPedido() { document.getElementById('modal-pedido').classList.add('view-hidden'); }

function copiarTextoPedido(event) {
    const ta  = document.getElementById('texto-pedido-gerado');
    const btn = (event && event.currentTarget) ? event.currentTarget : document.getElementById('btn-copiar-pedido');

    const finalizar = () => {
        const orig = btn.innerHTML;
        btn.innerHTML             = `<i class="fa-solid fa-check"></i> Copiado!`;
        btn.style.backgroundColor = 'var(--status-verde)';
        registrarLog('copiou a lista de pedido de peças para envio.');
        setTimeout(() => { btn.innerHTML = orig; btn.style.backgroundColor = 'var(--drawer-blue)'; }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(finalizar).catch(() => {
            ta.select(); document.execCommand('copy'); finalizar();
        });
    } else {
        ta.select(); document.execCommand('copy'); finalizar();
    }
}

// =========================================================================
// EXPOSIÇÃO GLOBAL DE FUNÇÕES (NECESSÁRIO POR SER type="module")
// =========================================================================
window.toggleMenuMobile          = toggleMenuMobile;
window.autorizarDispositivo      = autorizarDispositivo;
window.realizarLogin             = realizarLogin;
window.alternarTelaLogin         = alternarTelaLogin;
window.registrarUsuario          = registrarUsuario;
window.mostrarTela               = mostrarTela;
window.gerarEmailPedido          = gerarEmailPedido;
window.sairDoSistema             = sairDoSistema;
window.fazerBackup               = fazerBackup;
window.restaurarBackup           = restaurarBackup;
window.exportarEstoqueCSV        = exportarEstoqueCSV;
window.exportarHistoricoCSV      = exportarHistoricoCSV;
window.voltarParaGavetas         = voltarParaGavetas;
window.abrirModalCadastro        = abrirModalCadastro;
window.fecharModalCadastro       = fecharModalCadastro;
window.salvarNovoItem            = salvarNovoItem;
window.abrirModalEditarPeca      = abrirModalEditarPeca;
window.fecharModalEditarPeca     = fecharModalEditarPeca;
window.salvarEdicaoPeca          = salvarEdicaoPeca;
window.abrirModalConferencia     = abrirModalConferencia;
window.fecharModalConferencia    = fecharModalConferencia;
window.salvarConferencia         = salvarConferencia;
window.abrirModalEditarGaveta    = abrirModalEditarGaveta;
window.fecharModalEditarGaveta   = fecharModalEditarGaveta;
window.salvarNomeGaveta          = salvarNomeGaveta;
window.fecharModalPedido         = fecharModalPedido;
window.copiarTextoPedido         = copiarTextoPedido;
window.fecharAlerta              = fecharAlerta;
window.abrirGaveta               = abrirGaveta;
window.ajusteRapidoEstoque       = ajusteRapidoEstoque;
window.alternarStatusRequisitado = alternarStatusRequisitado;
window.excluirPeca               = excluirPeca;
window.abrirModalMoverPeca       = abrirModalMoverPeca;
window.fecharModalMoverPeca      = fecharModalMoverPeca;
window.confirmarMoverPeca        = confirmarMoverPeca;
window.toggleCompradoFora        = toggleCompradoFora;
window.processarFormularioPedido = processarFormularioPedido;
window.salvarSenhaObrigatoria    = salvarSenhaObrigatoria;
window.cancelarRedefinicaoSenha  = cancelarRedefinicaoSenha;
window.buscarPecasGlobal         = buscarPecasGlobal;

// --- Funções do sistema de múltiplos locais (containers) ---
window.renderContainers          = renderContainers;
window.abrirContainer            = abrirContainer;
window.voltarParaContainers      = voltarParaContainers;
window.abrirWizardContainer      = abrirWizardContainer;
window.fecharWizardContainer     = fecharWizardContainer;
window.wizardTipoMudou           = wizardTipoMudou;
window.criarContainer            = criarContainer;
window.excluirContainer          = excluirContainer;
window.abrirModalNovaGaveta      = abrirModalNovaGaveta;
window.fecharModalNovaGaveta     = fecharModalNovaGaveta;
window.salvarNovaGaveta          = salvarNovaGaveta;
window.atualizarPreviewTamanho   = atualizarPreviewTamanho;
window.abrirAcoesPeca            = abrirAcoesPeca;
window.fecharAcoesPeca           = fecharAcoesPeca;
window.atualizarPainelAcoes      = atualizarPainelAcoes;
window.toggleVerSenha            = toggleVerSenha;

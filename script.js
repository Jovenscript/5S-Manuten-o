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

const GAVETAS_PADRAO = [
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
];

// =========================================================================
// VARIÁVEIS GLOBAIS
// =========================================================================
let database = { drawers: [...GAVETAS_PADRAO], items: {} };
GAVETAS_PADRAO.forEach(d => { database.items[d.id] = []; });

let usuariosSalvos  = [];
let historicoLogs   = [];
let usuarioLogado   = null;

let gavetaAtualAberta    = null;
let pecaSendoConferidaId = null;
let gavetaSendoEditadaId = null;
let pecaSendoEditadaId   = null;
let pecaSendoMovidaId    = null;

let usuarioAguardandoRedefinicao = null;

// Carrossel
let carrosselInterval = null;
let carrosselImagens  = [];
let carrosselIndex    = 0;

// Reorganização de gavetas (drag-and-drop)
let modoReorganizar = false;
let drag = null;

// Confirmação customizada
let confirmCallback = null;

// PWA install
let deferredInstallPrompt = null;

// =========================================================================
// PWA — REGISTRO DO SERVICE WORKER  (ESTAVA FALTANDO — POR ISSO NÃO INSTALAVA)
// =========================================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker registrado.'))
            .catch(err => console.warn('Falha ao registrar Service Worker:', err));
    });
}

// PWA — captura o evento de instalação e mostra o botão "Instalar App"
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btn-instalar-pwa');
    if (btn) btn.classList.remove('view-hidden');
});

function instalarPWA() {
    if (!deferredInstallPrompt) {
        return mostrarAlerta('Instalação', 'Se o botão não funcionar, use o menu do navegador → "Adicionar à tela inicial". No iPhone (Safari): botão Compartilhar → "Adicionar à Tela de Início".');
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
        deferredInstallPrompt = null;
        const btn = document.getElementById('btn-instalar-pwa');
        if (btn) btn.classList.add('view-hidden');
    });
}

window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('btn-instalar-pwa');
    if (btn) btn.classList.add('view-hidden');
});

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
    if (pecas.some(p => p.current === 0))                          return 'vermelho';
    if (pecas.some(p => p.current > 0 && p.current < p.expected * 0.25)) return 'laranja';
    if (pecas.some(p => p.current < p.expected))                   return 'amarelo';
    return 'verde';
}

function getPecaStatus(peca) {
    if (peca.current === 0)                  return 'vermelho';
    if (peca.current < peca.expected * 0.25) return 'laranja';
    if (peca.current < peca.expected)        return 'amarelo';
    return 'verde';
}

function getStatusText(status) {
    return { verde: 'OK', amarelo: 'Atenção', laranja: 'Crítico', vermelho: 'Zerado' }[status] || 'OK';
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
        try {
            new Notification(titulo, { body: corpo, icon: 'icon-192x192.png' });
        } catch (e) { /* silencioso */ }
    }
}

// =========================================================================
// MENU MOBILE
// =========================================================================
function toggleMenuMobile() {
    document.getElementById('sidebar-menu').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('open');
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
// FIRESTORE — DOCUMENTOS SEPARADOS
// =========================================================================
async function salvarConfig() {
    try {
        await setDoc(doc(db, "manutencao_5s", "config"), {
            drawers:  database.drawers,
            usuarios: usuariosSalvos
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
        versao: 'v4',
        geradoEm: new Date().toISOString(),
        database,
        usuarios: usuariosSalvos,
        historico: historicoLogs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    baixarArquivo(blob, `backup_5s_${dataArquivo()}.json`);
    registrarLog('gerou um arquivo de backup do sistema.');
}

function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const dados = JSON.parse(e.target.result);
            if (!dados.database || !dados.usuarios) {
                return mostrarAlerta('Arquivo Inválido', 'O arquivo selecionado não é um backup válido do sistema.');
            }
            database       = dados.database;
            usuariosSalvos = dados.usuarios;
            historicoLogs  = dados.historico || [];

            await salvarConfig();
            await salvarHistorico();
            for (const gaveta of GAVETAS_PADRAO) await salvarItensDaGaveta(gaveta.id);

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
    let csv = 'Gaveta;Label;Divisória;Código;Nome;Padrão 5S;Qtd Atual;Status;Requisitado\n';
    database.drawers.forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(p => {
            const status = getStatusText(getPecaStatus(p));
            csv += `"${gaveta.title}";"${gaveta.label}";"${p.divisoria || 'Geral'}";"${p.code || ''}";"${p.name}";${p.expected};${p.current};"${status}";"${p.requested ? 'Sim' : 'Não'}"\n`;
        });
    });
    baixarArquivo(new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }), `estoque_5s_${dataArquivo()}.csv`);
    registrarLog('exportou o relatório de estoque em CSV.');
}

function exportarHistoricoCSV() {
    let csv = 'Data;Hora;Usuário;Ação\n';
    historicoLogs.forEach(log => { csv += `"${log.data}";"${log.hora}";"${log.nome}";"${log.acao}"\n`; });
    baixarArquivo(new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }), `historico_5s_${dataArquivo()}.csv`);
    registrarLog('exportou o histórico de atividades em CSV.');
}

function baixarArquivo(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
}
function dataArquivo() { return new Date().toLocaleDateString('pt-BR').replace(/\//g, '-'); }

// =========================================================================
// INICIALIZAÇÃO, MIGRAÇÃO E SINCRONIZAÇÃO FIREBASE
// =========================================================================
window.addEventListener('load', () => {
    iniciarSincronizacaoFirebase();
    configurarEventosEnter();

    if (localStorage.getItem('5s_device_authorized') === 'true') {
        document.getElementById('view-device-auth').classList.replace('view-active', 'view-hidden');
        document.getElementById('view-login').classList.replace('view-hidden', 'view-active');
    }
});

async function iniciarSincronizacaoFirebase() {
    setupListeners();
    migrarDadosLegados();
}

function setupListeners() {
    onSnapshot(doc(db, "manutencao_5s", "config"), (snap) => {
        if (snap.exists()) {
            const d = snap.data();
            // Não sobrescreve a ordem enquanto o admin está arrastando gavetas
            if (!modoReorganizar) {
                database.drawers = d.drawers || [...GAVETAS_PADRAO];
            }
            usuariosSalvos = d.usuarios || [];
            database.drawers.forEach(g => { if (!database.items[g.id]) database.items[g.id] = []; });
        } else {
            salvarConfig();
        }
        atualizarSeLogado();
    });

    onSnapshot(doc(db, "manutencao_5s", "historico"), (snap) => {
        if (snap.exists()) historicoLogs = snap.data().logs || [];
        atualizarSeLogado();
    });

    GAVETAS_PADRAO.forEach(gaveta => {
        onSnapshot(doc(db, "manutencao_5s", `itens_g${gaveta.id}`), (snap) => {
            database.items[gaveta.id] = snap.exists() ? (snap.data().items || []) : [];
            database.items[gaveta.id].forEach(p => {
                if (p.requested   === undefined) p.requested   = false;
                if (p.lastTakenBy === undefined) p.lastTakenBy = null;
                if (p.position    === undefined) p.position    = 999;
                if (p.divisoria   === undefined) p.divisoria   = 'Geral';
                if (p.size        === undefined) p.size        = 1;
            });
            atualizarSeLogado();
        });
    });
}

function atualizarSeLogado() {
    const container = document.getElementById('app-container');
    if (container && container.classList.contains('view-active')) atualizarDashboard();
}

async function migrarDadosLegados() {
    if (localStorage.getItem('5s_migrado_v3')) return;
    try {
        const legadoSnap = await getDoc(doc(db, "manutencao_5s", "dados_sistema"));
        const configSnap = await getDoc(doc(db, "manutencao_5s", "config"));
        if (!legadoSnap.exists() || configSnap.exists()) {
            localStorage.setItem('5s_migrado_v3', 'true');
            return;
        }
        const legado    = legadoSnap.data();
        const db_legado = legado.database || {};
        await setDoc(doc(db, "manutencao_5s", "config"), {
            drawers:  db_legado.drawers || [...GAVETAS_PADRAO],
            usuarios: legado.usuarios   || []
        });
        await setDoc(doc(db, "manutencao_5s", "historico"), { logs: legado.historico || [] });
        for (const gaveta of GAVETAS_PADRAO) {
            const itens = ((db_legado.items || {})[gaveta.id] || []).map(p => ({
                ...p, image: null, position: 999, divisoria: 'Geral', size: 1
            }));
            await setDoc(doc(db, "manutencao_5s", `itens_g${gaveta.id}`), { items: itens });
        }
        localStorage.setItem('5s_migrado_v3', 'true');
    } catch (e) {
        console.warn("Aviso na migração:", e);
    }
}

// =========================================================================
// EVENTOS E AUTORIZAÇÃO
// =========================================================================
function configurarEventosEnter() {
    const map = [
        { inputId: 'input-device-key',    btnAcao: autorizarDispositivo  },
        { inputId: 'input-login-id',      btnAcao: realizarLogin          },
        { inputId: 'input-login-senha',   btnAcao: realizarLogin          },
        { inputId: 'reg-senha',           btnAcao: registrarUsuario       },
        { inputId: 'conf-qtd-atual',      btnAcao: salvarConferencia      },
        { inputId: 'edit-gaveta-nome',    btnAcao: salvarNomeGaveta       },
        { inputId: 'novo-atual',          btnAcao: salvarNovoItem         },
        { inputId: 'edit-peca-atual',     btnAcao: salvarEdicaoPeca       },
        { inputId: 'nova-senha-confirma', btnAcao: salvarSenhaObrigatoria }
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
    // Sair do modo reorganizar ao trocar de tela (salva a ordem)
    if (modoReorganizar && id !== 'view-gavetas') finalizarReorganizacao();

    ['view-dashboard', 'view-gavetas', 'view-compartimentos', 'view-historico', 'view-config'].forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.replace('view-active', 'view-hidden');
    });

    const alvo = document.getElementById(id);
    if (alvo) alvo.classList.replace('view-hidden', 'view-active');

    // Destaca o item de menu correto (sem depender de "event" global)
    const navAtivo = (id === 'view-compartimentos') ? 'view-gavetas' : id;
    document.querySelectorAll('.nav-item').forEach(l => {
        l.classList.toggle('active', l.dataset.view === navAtivo);
    });

    document.getElementById('sidebar-menu').classList.remove('open');
    document.getElementById('mobile-overlay').classList.remove('open');

    if (id === 'view-gavetas' || id === 'view-dashboard') gavetaAtualAberta = null;
    if (id === 'view-historico') renderizarHistorico();

    const scroll = document.getElementById('area-conteudo-scroll');
    if (scroll) scroll.scrollTo(0, 0);

    if (id === 'view-dashboard') {
        iniciarCarrosselDashboard();
        setTimeout(() => { const inp = document.getElementById('input-busca-global'); if (inp) inp.focus(); }, 300);
    } else {
        pararCarrosselDashboard();
    }
}

function voltarParaGavetas() { mostrarTela('view-gavetas'); }
function sairDoSistema()     { location.reload(); }

// =========================================================================
// CARROSSEL DASHBOARD
// =========================================================================
function atualizarImagensCarrossel() {
    carrosselImagens = [];
    database.drawers.forEach(gaveta => {
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
        carrosselIndex = (carrosselIndex + 1) % carrosselImagens.length;
        wrapper.style.backgroundImage = `url('${carrosselImagens[carrosselIndex]}')`;
    }, 4500);
}

function pararCarrosselDashboard() {
    if (carrosselInterval) { clearInterval(carrosselInterval); carrosselInterval = null; }
}

// =========================================================================
// BUSCA GLOBAL
// =========================================================================
function buscarPecasGlobal() {
    const termo         = document.getElementById('input-busca-global').value.toLowerCase();
    const resultadosDiv = document.getElementById('resultados-busca-global');
    resultadosDiv.innerHTML = '';

    if (termo.length < 2) { resultadosDiv.classList.add('view-hidden'); return; }

    let achados = [];
    database.drawers.forEach(gaveta => {
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
        div.onclick = () => {
            document.getElementById('input-busca-global').value = '';
            resultadosDiv.classList.add('view-hidden');
            abrirGaveta(item.gaveta.id);
        };
        div.innerHTML = `
            <div class="res-info">
                <h4>${item.peca.name}</h4>
                <p>Item: ${item.peca.code || 'S/N'} &nbsp;|&nbsp; <strong>${item.gaveta.label}</strong> (Div: ${item.peca.divisoria || 'Geral'} - Pos: ${item.peca.position === 999 ? 'Livre' : item.peca.position})</p>
            </div>
            <div class="res-tag"><i class="fa-solid fa-box-open"></i> ${item.peca.current} un</div>`;
        resultadosDiv.appendChild(div);
    });
    resultadosDiv.classList.remove('view-hidden');
}

// =========================================================================
// DASHBOARD / KPIs / ARMÁRIO
// =========================================================================
function atualizarDashboard() {
    if (!modoReorganizar) renderArmarioVertical();
    calcularKPIs();
    verificarEstoqueZerado();
    renderizarHistorico();
    atualizarImagensCarrossel();

    const dashAtivo = document.getElementById('view-dashboard')?.classList.contains('view-active');
    if (dashAtivo && !carrosselInterval && carrosselImagens.length > 0) iniciarCarrosselDashboard();

    if (gavetaAtualAberta !== null) renderizarPecasDaGaveta(gavetaAtualAberta);
}

function verificarEstoqueZerado() {
    let qtdZerados = 0;
    database.drawers.forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(p => { if (p.current === 0) qtdZerados++; });
    });
    const banner = document.getElementById('alerta-global-zerado');
    if (!banner) return;
    if (qtdZerados > 0) {
        banner.classList.remove('view-hidden');
        document.getElementById('texto-alerta-zerado').innerHTML =
            `<strong>Atenção:</strong> Existem <strong>${qtdZerados} item(ns)</strong> com estoque ZERADO no armário!`;
    } else {
        banner.classList.add('view-hidden');
    }
}

function calcularKPIs() {
    let alerts = 0;
    const lista = document.getElementById('kpi-lista-gavetas');
    if (!lista) return;
    lista.innerHTML = '';
    database.drawers.forEach(gaveta => {
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

function renderArmarioVertical() {
    const chassi = document.getElementById('menu-gavetas');
    if (!chassi) return;
    chassi.innerHTML = '';
    chassi.classList.toggle('modo-reorganizar', modoReorganizar);

    database.drawers.forEach((gaveta, idx) => {
        const status = getGavetaStatus(database.items[gaveta.id] || []);
        const div = document.createElement('div');
        div.className = 'btn-gaveta';
        div.dataset.id = gaveta.id;

        if (modoReorganizar) {
            div.classList.add('reordenando');
            div.innerHTML = `
                <div class="gaveta-content">
                    <span class="reorder-handle"><i class="fa-solid fa-grip-lines"></i></span>
                    <span class="gnumber">${gaveta.label}</span>
                    <span class="glabel">${gaveta.title}</span>
                    <div class="reorder-arrows">
                        <button class="btn-arrow" ${idx === 0 ? 'disabled' : ''} onclick="window.moverGaveta(${gaveta.id}, -1)" title="Subir"><i class="fa-solid fa-chevron-up"></i></button>
                        <button class="btn-arrow" ${idx === database.drawers.length - 1 ? 'disabled' : ''} onclick="window.moverGaveta(${gaveta.id}, 1)" title="Descer"><i class="fa-solid fa-chevron-down"></i></button>
                    </div>
                    <div class="gstatus-light ${status}"></div>
                </div>`;
            // Drag via Pointer Events (funciona em toque e mouse)
            div.addEventListener('pointerdown', (e) => gavetaPointerDown(e, gaveta.id));
        } else {
            div.onclick = () => abrirGaveta(gaveta.id);
            div.innerHTML = `
                <div class="gaveta-content">
                    <span class="gnumber">${gaveta.label}</span>
                    <span class="glabel">${gaveta.title}</span>
                    <button class="btn-edit-gaveta admin-only" onclick="window.abrirModalEditarGaveta(event, ${gaveta.id})" title="Renomear Gaveta">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <div class="gstatus-light ${status}"></div>
                </div>`;
        }
        chassi.appendChild(div);
    });
}

// =========================================================================
// REORGANIZAR GAVETAS (DRAG-AND-DROP + SETAS)
// =========================================================================
function alternarModoReorganizar() {
    if (modoReorganizar) { finalizarReorganizacao(); return; }
    modoReorganizar = true;
    const btn  = document.getElementById('btn-toggle-reorganizar');
    btn.classList.add('ativo');
    btn.querySelector('span').innerText = 'Concluir';
    btn.querySelector('i').className = 'fa-solid fa-check';
    document.getElementById('dica-reorganizar').classList.remove('view-hidden');
    renderArmarioVertical();
}

function finalizarReorganizacao() {
    modoReorganizar = false;
    const btn = document.getElementById('btn-toggle-reorganizar');
    if (btn) {
        btn.classList.remove('ativo');
        btn.querySelector('span').innerText = 'Reorganizar';
        btn.querySelector('i').className = 'fa-solid fa-up-down-left-right';
    }
    document.getElementById('dica-reorganizar')?.classList.add('view-hidden');
    salvarConfig();
    registrarLog('reorganizou a ordem das gavetas no armário.');
    renderArmarioVertical();
}

function moverGaveta(idGaveta, direcao) {
    const idx = database.drawers.findIndex(d => d.id === idGaveta);
    const novo = idx + direcao;
    if (novo < 0 || novo >= database.drawers.length) return;
    const arr = database.drawers;
    [arr[idx], arr[novo]] = [arr[novo], arr[idx]];
    renderArmarioVertical();
}

function gavetaPointerDown(e, id) {
    if (!modoReorganizar) return;
    // ignora cliques nos botões de seta
    if (e.target.closest('.btn-arrow')) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    drag = { id, el, startY: e.clientY, moved: false, pointerId: e.pointerId };
    el.classList.add('arrastando');
    el.addEventListener('pointermove', gavetaPointerMove);
    el.addEventListener('pointerup', gavetaPointerUp);
    el.addEventListener('pointercancel', gavetaPointerUp);
}

function gavetaPointerMove(e) {
    if (!drag) return;
    e.preventDefault();
    drag.moved = true;
    const dy = e.clientY - drag.startY;
    drag.el.style.transform = `translateY(${dy}px) scale(1.02)`;
}

function gavetaPointerUp(e) {
    if (!drag) return;
    const el = drag.el;
    el.style.transform = '';
    el.classList.remove('arrastando');
    el.removeEventListener('pointermove', gavetaPointerMove);
    el.removeEventListener('pointerup', gavetaPointerUp);
    el.removeEventListener('pointercancel', gavetaPointerUp);

    if (drag.moved) {
        const chassi  = document.getElementById('menu-gavetas');
        const outros  = [...chassi.children].filter(c => c !== el);
        const y = e.clientY;
        let posInsercao = outros.length;
        for (let i = 0; i < outros.length; i++) {
            const r = outros[i].getBoundingClientRect();
            if (y < r.top + r.height / 2) { posInsercao = i; break; }
        }
        const idsOrdenados = outros.map(c => parseInt(c.dataset.id));
        idsOrdenados.splice(posInsercao, 0, drag.id);
        database.drawers.sort((a, b) => idsOrdenados.indexOf(a.id) - idsOrdenados.indexOf(b.id));
        renderArmarioVertical();
    }
    drag = null;
}

// =========================================================================
// DENTRO DA GAVETA (DIVISÓRIAS E GRID)
// =========================================================================
function abrirGaveta(idGaveta) {
    gavetaAtualAberta = idGaveta;
    const gaveta = database.drawers.find(d => d.id === idGaveta);
    document.getElementById('titulo-gaveta-aberta').innerText = `${gaveta.label}: ${gaveta.title}`;
    renderizarPecasDaGaveta(idGaveta);
    mostrarTela('view-compartimentos');
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

    const grupos = {};
    pecasBrutas.forEach(peca => {
        const divi = (peca.divisoria || 'Geral').toUpperCase();
        (grupos[divi] = grupos[divi] || []).push(peca);
    });

    Object.keys(grupos).sort().forEach(nomeDivisoria => {
        const headerDivi = document.createElement('div');
        headerDivi.className = 'divisoria-header';
        headerDivi.innerHTML = `<i class="fa-solid fa-layer-group"></i> Divisória: ${nomeDivisoria}`;
        mainContainer.appendChild(headerDivi);

        const gridDivi = document.createElement('div');
        gridDivi.className = 'grid-pecas';

        grupos[nomeDivisoria].sort((a, b) => (a.position || 999) - (b.position || 999)).forEach(peca => {
            const statusPeca = getPecaStatus(peca);
            const corQtd     = statusPeca === 'verde' ? 'var(--status-verde)' : 'var(--text-primary)';
            const imgHtml    = peca.image ? `<img src="${peca.image}" alt="${peca.name}" loading="lazy">` : `<i class="fa-solid fa-microchip"></i>`;
            const retiradaHtml = peca.lastTakenBy
                ? `<div class="last-taken-info"><i class="fa-solid fa-clock-rotate-left"></i> Último a retirar: <strong>${peca.lastTakenBy}</strong></div>` : '';
            const displayPosition = (peca.position && peca.position !== 999) ? peca.position : '-';
            const displaySize     = peca.size || 1;

            const div = document.createElement('div');
            div.className = 'compartimento-card';
            div.style.setProperty('--span-size', displaySize);
            div.innerHTML = `
                <div class="card-top">
                    <div class="card-top-left">
                        <span class="card-local" title="Posição exata no gaveteiro">📌 Pos: ${displayPosition} | Item: ${peca.code || 'S/N'}</span>
                        <button class="btn-edit-peca admin-only" onclick="window.abrirModalEditarPeca(${peca.id})" title="Editar Peça"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-excluir admin-only" onclick="window.excluirPeca(${peca.id})" title="Excluir Peça"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="badge-status ${statusPeca}">${getStatusText(statusPeca)}</div>
                </div>
                <div class="card-title">${peca.name}</div>
                <div class="card-image-box">${imgHtml}</div>
                <div class="card-data-row">
                    <div class="data-box"><span>Padrão 5S</span><strong>${peca.expected}</strong></div>
                    <div class="data-box">
                        <span>Física Atual</span>
                        <div class="quick-control">
                            <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, -1)"><i class="fa-solid fa-minus"></i></button>
                            <strong style="color:${corQtd}">${peca.current}</strong>
                            <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, 1)"><i class="fa-solid fa-plus"></i></button>
                        </div>
                    </div>
                </div>
                ${retiradaHtml}
                <div class="botoes-acao-card">
                    <button class="btn-conferir" onclick="window.abrirModalConferencia(${peca.id})"><i class="fa-solid fa-clipboard-check"></i> Definir Contagem Exata</button>
                    <button class="btn-requisitado ${peca.requested ? 'ativo' : ''}" onclick="window.alternarStatusRequisitado(${peca.id})"><i class="fa-solid fa-cart-arrow-down"></i> ${peca.requested ? 'Já Requisitado' : 'Marcar como Requisitado'}</button>
                    <button class="btn-mover admin-only" onclick="window.abrirModalMoverPeca(${peca.id})"><i class="fa-solid fa-right-left"></i> Mover para outra Gaveta</button>
                </div>`;
            gridDivi.appendChild(div);
        });
        mainContainer.appendChild(gridDivi);
    });
}

function ajusteRapidoEstoque(idPeca, delta) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;
    let novaQtd = Math.max(0, peca.current + delta);
    if (delta < 0 && peca.current > 0) {
        peca.lastTakenBy = usuarioLogado.nome;
        registrarLog(`retirou 1 unidade da peça "${peca.name}" (Item: ${peca.code})`);
        enviarNotificacao("Peça Retirada", `Você retirou 1x ${peca.name}. Restaram ${novaQtd} peça(s).`);
    } else if (delta > 0) {
        registrarLog(`adicionou 1 unidade da peça "${peca.name}" (Item: ${peca.code})`);
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
    mostrarConfirmar('Excluir Peça', `Tem certeza que deseja excluir a peça "${peca.name}" da gaveta?`, () => {
        database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== idPeca);
        registrarLog(`excluiu a peça "${peca.name}" do sistema`);
        salvarItensDaGaveta(gavetaAtualAberta);
    });
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
    database.drawers.forEach(gaveta => {
        if (gaveta.id === gavetaAtualAberta) return;
        const option = document.createElement('option');
        option.value = gaveta.id;
        option.innerText = `${gaveta.label} — ${gaveta.title}`;
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
    const gavetaOrigem  = database.drawers.find(d => d.id === gavetaAtualAberta);
    const gavetaDestino = database.drawers.find(d => d.id === destinoId);
    const peca          = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoMovidaId);

    database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== pecaSendoMovidaId);
    if (!database.items[destinoId]) database.items[destinoId] = [];
    database.items[destinoId].push(peca);

    registrarLog(`moveu a peça "${peca.name}" da ${gavetaOrigem.label} para ${gavetaDestino.label} (${gavetaDestino.title})`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    await salvarItensDaGaveta(destinoId);
    fecharModalMoverPeca();
}

// =========================================================================
// EDITAR NOME DA GAVETA
// =========================================================================
function abrirModalEditarGaveta(eventoClick, idGaveta) {
    eventoClick.stopPropagation();
    gavetaSendoEditadaId = idGaveta;
    const gaveta = database.drawers.find(d => d.id === idGaveta);
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
    const gaveta = database.drawers.find(d => d.id === gavetaSendoEditadaId);
    const nomeAntigo = gaveta.title;
    gaveta.title = novoNome;
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
    document.getElementById('novo-tamanho').value   = '1';
    document.getElementById('novo-imagem').value    = '';
    document.getElementById('modal-cadastro').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('novo-nome').focus(), 100);
}

function fecharModalCadastro() {
    document.getElementById('modal-cadastro').classList.add('view-hidden');
}

async function salvarNovoItem() {
    const codigo    = document.getElementById('novo-codigo').value.trim();
    const nome      = document.getElementById('novo-nome').value.trim();
    const esperado  = parseInt(document.getElementById('novo-esperado').value);
    const atual     = parseInt(document.getElementById('novo-atual').value);
    const posicao   = parseInt(document.getElementById('novo-posicao').value) || 999;
    const divisoria = document.getElementById('novo-divisoria').value.trim() || 'Geral';
    const tamanho   = parseInt(document.getElementById('novo-tamanho').value) || 1;
    const imgInput  = document.getElementById('novo-imagem');

    if (!nome) return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');

    const btnSalvar = document.querySelector('#modal-cadastro .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const novaPeca = {
        id: Date.now(),
        code: codigo || `G${gavetaAtualAberta}-P${(database.items[gavetaAtualAberta] || []).length + 1}`,
        name: nome, expected: esperado, current: atual, position: posicao,
        divisoria, size: tamanho, requested: false, lastTakenBy: null, image: null
    };

    if (imgInput.files && imgInput.files[0]) {
        try { novaPeca.image = await uploadImagemCloudinary(imgInput.files[0]); }
        catch (err) { console.error("Erro Cloudinary:", err); mostrarAlerta('Aviso', 'Não foi possível enviar a foto. A peça será salva sem imagem.'); }
    }

    database.items[gavetaAtualAberta].push(novaPeca);
    registrarLog(`cadastrou "${novaPeca.name}" na Divisória ${divisoria}.`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    fecharModalCadastro();
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Peça'; }
}

function abrirModalEditarPeca(idPeca) {
    pecaSendoEditadaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;
    document.getElementById('edit-peca-codigo').value    = peca.code || '';
    document.getElementById('edit-peca-nome').value      = peca.name;
    document.getElementById('edit-peca-esperado').value  = peca.expected;
    document.getElementById('edit-peca-atual').value     = peca.current;
    document.getElementById('edit-peca-posicao').value   = (peca.position && peca.position !== 999) ? peca.position : '';
    document.getElementById('edit-peca-divisoria').value = peca.divisoria || 'Geral';
    document.getElementById('edit-peca-tamanho').value   = peca.size || 1;
    document.getElementById('edit-peca-imagem').value    = '';
    document.getElementById('modal-editar-peca').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('edit-peca-nome').focus(), 100);
}

function fecharModalEditarPeca() {
    document.getElementById('modal-editar-peca').classList.add('view-hidden');
}

async function salvarEdicaoPeca() {
    const novoCodigo    = document.getElementById('edit-peca-codigo').value.trim();
    const novoNome      = document.getElementById('edit-peca-nome').value.trim();
    const novoEsperado  = parseInt(document.getElementById('edit-peca-esperado').value);
    const novoAtual     = parseInt(document.getElementById('edit-peca-atual').value);
    const novaPosicao   = parseInt(document.getElementById('edit-peca-posicao').value) || 999;
    const novaDivisoria = document.getElementById('edit-peca-divisoria').value.trim() || 'Geral';
    const novoTamanho   = parseInt(document.getElementById('edit-peca-tamanho').value) || 1;
    const imgInput      = document.getElementById('edit-peca-imagem');

    if (!novoNome) return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');
    if (isNaN(novoEsperado) || isNaN(novoAtual)) return mostrarAlerta('Erro', 'Valores numéricos inválidos.');

    const btnSalvar = document.querySelector('#modal-editar-peca .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoEditadaId);
    Object.assign(peca, {
        code: novoCodigo, name: novoNome, expected: novoEsperado, current: novoAtual,
        position: novaPosicao, divisoria: novaDivisoria, size: novoTamanho
    });
    if (peca.current >= peca.expected) peca.requested = false;

    if (imgInput.files && imgInput.files[0]) {
        try { peca.image = await uploadImagemCloudinary(imgInput.files[0]); }
        catch (err) { console.error("Erro Cloudinary:", err); mostrarAlerta('Aviso', 'Não foi possível enviar a nova foto. A imagem anterior foi mantida.'); }
    }

    registrarLog(`editou as informações da peça "${peca.name}"`);
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

function fecharModalConferencia() {
    document.getElementById('modal-conferencia').classList.add('view-hidden');
}

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

// =========================================================================
// ALERTA E CONFIRMAÇÃO CUSTOMIZADOS
// =========================================================================
function mostrarAlerta(titulo, mensagem) {
    document.getElementById('alerta-titulo').innerText   = titulo;
    document.getElementById('alerta-mensagem').innerText = mensagem;
    document.getElementById('modal-alerta').classList.remove('view-hidden');
}
function fecharAlerta() { document.getElementById('modal-alerta').classList.add('view-hidden'); }

function mostrarConfirmar(titulo, mensagem, onOk) {
    document.getElementById('confirmar-titulo').innerText   = titulo;
    document.getElementById('confirmar-mensagem').innerText = mensagem;
    confirmCallback = onOk;
    document.getElementById('btn-confirmar-ok').onclick = () => { fecharConfirmar(); if (confirmCallback) confirmCallback(); };
    document.getElementById('modal-confirmar').classList.remove('view-hidden');
}
function fecharConfirmar() {
    document.getElementById('modal-confirmar').classList.add('view-hidden');
    confirmCallback = null;
}

// =========================================================================
// GERADOR DE PEDIDO DE COMPRA
// =========================================================================
function gerarEmailPedido() {
    const containerItens = document.getElementById('formulario-pedido-itens');
    containerItens.innerHTML = '';
    let itensFaltando = [];

    database.drawers.forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(peca => {
            if (peca.current < peca.expected) {
                itensFaltando.push({ nome: peca.name, codigo: peca.code, falta: peca.expected - peca.current });
            }
        });
    });

    if (itensFaltando.length === 0) return mostrarAlerta("Tudo em Ordem", "Não há peças faltando no gaveteiro neste momento.");

    itensFaltando.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'pedido-item-card';
        div.innerHTML = `
            <p class="pedido-item-titulo"><i class="fa-solid fa-box-open"></i> ${item.falta} un. | ${item.nome}
                <span class="pedido-item-cod">(Item: ${item.codigo || 'S/N'})</span></p>
            <div class="form-group row" style="margin-bottom: 10px;">
                <div class="col"><label>Ordem de Serviço (OS):</label><input type="text" id="os-${index}" placeholder="Ex: 12345678"></div>
                <div class="col"><label>Almoxarifado:</label>
                    <select id="almo-${index}" onchange="window.toggleCompradoFora(${index})">
                        <option value="Automação">Automação</option>
                        <option value="Estoque">Estoque</option>
                        <option value="Comprado Fora">Comprado Fora</option>
                    </select>
                </div>
            </div>
            <div id="extra-${index}" class="view-hidden pedido-extra">
                <div class="form-group row">
                    <div class="col"><label>Fornecedor:</label><input type="text" id="forn-${index}" placeholder="Nome do fornecedor"></div>
                    <div class="col"><label>Unid. Medida:</label><input type="text" id="unid-${index}" placeholder="Ex: PC, RL, CX"></div>
                </div>
                <div class="form-group" style="margin-bottom: 0;"><label>Justificativa:</label><input type="text" id="just-${index}" placeholder="Motivo da compra"></div>
            </div>`;
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
    const extraDiv = document.getElementById(`extra-${index}`);
    if (document.getElementById(`almo-${index}`).value === 'Comprado Fora') extraDiv.classList.remove('view-hidden');
    else extraDiv.classList.add('view-hidden');
}

function processarFormularioPedido() {
    const nomeSolicitante = usuarioLogado ? usuarioLogado.nome : 'Manutenção';
    let textoFinal = `Olá,\n\nPor favor, solicito a compra/reposição dos seguintes materiais faltantes para o nosso gaveteiro elétrico:\n\n`;

    window.itensFaltandoTemp.forEach((item, index) => {
        const os   = document.getElementById(`os-${index}`).value || 'Não informada';
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

function fecharModalPedido() {
    document.getElementById('modal-pedido').classList.add('view-hidden');
}

function copiarTextoPedido(ev) {
    const ta = document.getElementById('texto-pedido-gerado');
    const texto = ta.value;
    const btn = ev ? ev.currentTarget : null;
    const feedback = () => {
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
            btn.style.backgroundColor = 'var(--status-verde)';
            setTimeout(() => { btn.innerHTML = orig; btn.style.backgroundColor = ''; }, 2000);
        }
        registrarLog('copiou a lista de pedido de peças para envio.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(feedback).catch(() => { ta.select(); document.execCommand('copy'); feedback(); });
    } else {
        ta.select(); document.execCommand('copy'); feedback();
    }
}

// =========================================================================
// EXPOSIÇÃO GLOBAL DE FUNÇÕES (necessário por type="module")
// =========================================================================
Object.assign(window, {
    toggleMenuMobile, autorizarDispositivo, realizarLogin, alternarTelaLogin, registrarUsuario,
    mostrarTela, gerarEmailPedido, sairDoSistema, fazerBackup, restaurarBackup,
    exportarEstoqueCSV, exportarHistoricoCSV, voltarParaGavetas, abrirModalCadastro,
    fecharModalCadastro, salvarNovoItem, abrirModalEditarPeca, fecharModalEditarPeca,
    salvarEdicaoPeca, abrirModalConferencia, fecharModalConferencia, salvarConferencia,
    abrirModalEditarGaveta, fecharModalEditarGaveta, salvarNomeGaveta, fecharModalPedido,
    copiarTextoPedido, fecharAlerta, fecharConfirmar, abrirGaveta, ajusteRapidoEstoque,
    alternarStatusRequisitado, excluirPeca, abrirModalMoverPeca, fecharModalMoverPeca,
    confirmarMoverPeca, toggleCompradoFora, processarFormularioPedido, salvarSenhaObrigatoria,
    cancelarRedefinicaoSenha, buscarPecasGlobal, instalarPWA,
    alternarModoReorganizar, moverGaveta
});

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

let draggedDrawerIndex = null;
let draggedPecaId      = null;

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
        navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
    }
}

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
        div.innerHTML = `<span class="log-time">${log.data} ${log.hora}</span><span class="log-text"><strong>${log.nome}</strong> ${log.acao}</span>`;
        lista.appendChild(div);
    });
}

function solicitarPermissaoNotificacao() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

function enviarNotificacao(titulo, corpo) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try { new Notification(titulo, { body: corpo, icon: '/icon-192x192.png' }); } catch (e) {}
    }
}

function toggleMenuMobile() {
    document.getElementById('sidebar-menu').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('open');
}

async function uploadImagemCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`Cloudinary Error`);
    const data = await response.json();
    return data.secure_url;
}

// =========================================================================
// FIRESTORE
// =========================================================================
async function salvarConfig() {
    try { await setDoc(doc(db, "manutencao_5s", "config"), { drawers: database.drawers, usuarios: usuariosSalvos }); } 
    catch (e) { mostrarAlerta("Erro", "Não foi possível salvar config."); }
}

async function salvarHistorico() {
    try { await setDoc(doc(db, "manutencao_5s", "historico"), { logs: historicoLogs }); } catch (e) {}
}

async function salvarItensDaGaveta(idGaveta) {
    try { await setDoc(doc(db, "manutencao_5s", `itens_g${idGaveta}`), { items: database.items[idGaveta] || [] }); } 
    catch (e) { mostrarAlerta("Erro", "Não foi possível salvar itens."); }
}

function fazerBackup() {
    const payload = { versao: 'v3', geradoEm: new Date().toISOString(), database, usuarios: usuariosSalvos, historico: historicoLogs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url; a.download = `backup_5s_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.json`;
    a.click(); URL.revokeObjectURL(url);
    registrarLog('gerou um arquivo de backup.');
}

function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const dados = JSON.parse(e.target.result);
            if (!dados.database || !dados.usuarios) return mostrarAlerta('Erro', 'Backup inválido.');
            database = dados.database; usuariosSalvos = dados.usuarios; historicoLogs = dados.historico || [];
            await salvarConfig(); await salvarHistorico();
            for (const gaveta of database.drawers) await salvarItensDaGaveta(gaveta.id);
            registrarLog('restaurou o backup.');
            mostrarAlerta('Sucesso', 'Backup restaurado com sucesso!');
            atualizarDashboard();
        } catch (err) { mostrarAlerta('Erro', 'Arquivo corrompido.'); }
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
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url; a.download = `estoque_5s_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    registrarLog('exportou o estoque em CSV.');
}

function exportarHistoricoCSV() {
    let csv = 'Data;Hora;Usuário;Ação\n';
    historicoLogs.forEach(log => { csv += `"${log.data}";"${log.hora}";"${log.nome}";"${log.acao}"\n`; });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url; a.download = `historico_5s_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    registrarLog('exportou histórico em CSV.');
}

async function iniciarSincronizacaoFirebase() {
    onSnapshot(doc(db, "manutencao_5s", "config"), (snap) => {
        if (snap.exists()) {
            const d = snap.data();
            database.drawers = d.drawers  || [...GAVETAS_PADRAO];
            usuariosSalvos   = d.usuarios || [];
            database.drawers.forEach(g => { if (!database.items[g.id]) database.items[g.id] = []; });
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
    database.drawers.forEach(gaveta => {
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
    } else { mostrarAlerta('Acesso Negado', 'Chave mestre incorreta.'); }
}

function alternarTelaLogin() {
    const fe = document.getElementById('form-entrar');
    const fr = document.getElementById('form-registrar');
    if (fe.classList.contains('view-hidden')) { fe.classList.replace('view-hidden', 'view-active'); fr.classList.replace('view-active', 'view-hidden'); } 
    else { fe.classList.replace('view-active', 'view-hidden'); fr.classList.replace('view-hidden', 'view-active'); }
}

function registrarUsuario() {
    const nome = document.getElementById('reg-nome').value.trim();
    const cracha = document.getElementById('reg-cracha').value.trim();
    const senha = document.getElementById('reg-senha').value.trim();
    if (!nome || !cracha || !senha) return mostrarAlerta('Erro', 'Preencha todos os campos!');
    if (usuariosSalvos.find(u => u.cracha === cracha)) return mostrarAlerta('Erro', 'Crachá já cadastrado!');
    if (!validarSenhaForte(senha)) return mostrarAlerta('Senha Fraca', 'Mínimo 8 caracteres, maiúscula, minúscula, número e símbolo.');
    const novoUser = { nome, cracha, senha, role: 'USER' };
    usuariosSalvos.push(novoUser);
    salvarConfig();
    aplicarLogin(novoUser);
}

function realizarLogin() {
    const id = document.getElementById('input-login-id').value.trim();
    const senha = document.getElementById('input-login-senha').value.trim();
    if (!id || !senha) return mostrarAlerta('Erro', 'Preencha os dados.');
    if (id === ADMIN_CREDENTIALS.login && senha === ADMIN_CREDENTIALS.senha) {
        aplicarLogin({ nome: 'Administrador', cracha: 'Admin', role: 'ADMIN' });
        return;
    }
    const user = usuariosSalvos.find(u => u.cracha === id && u.senha === senha);
    if (!user) return mostrarAlerta('Acesso Negado', 'Dados incorretos.');
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
    registrarLog('atualizou a própria senha.');
    aplicarLogin(usuarioAguardandoRedefinicao);
    usuarioAguardandoRedefinicao = null;
}

function cancelarRedefinicaoSenha() {
    usuarioAguardandoRedefinicao = null;
    document.getElementById('modal-redefinir-senha').classList.add('view-hidden');
}

function aplicarLogin(user) {
    usuarioLogado = user;
    document.getElementById('usuario-logado-nome').innerText = user.nome;
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
    solicitarPermissaoNotificacao();
    atualizarDashboard();
    mostrarTela('view-dashboard');
}

function mostrarTela(id) {
    ['view-dashboard', 'view-gavetas', 'view-compartimentos', 'view-historico', 'view-config'].forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.replace('view-active', 'view-hidden');
    });
    const alvo = document.getElementById(id);
    if (alvo) alvo.classList.replace('view-hidden', 'view-active');
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.currentTarget && event.currentTarget.classList) event.currentTarget.classList.add('active');
    document.getElementById('sidebar-menu').classList.remove('open');
    document.getElementById('mobile-overlay').classList.remove('open');
    if (id === 'view-gavetas' || id === 'view-dashboard') gavetaAtualAberta = null;
    if (id === 'view-historico') renderizarHistorico();
    const scroll = document.getElementById('area-conteudo-scroll');
    if (scroll) scroll.scrollTo(0, 0);
    if (id === 'view-dashboard') {
        iniciarCarrosselDashboard();
        setTimeout(() => { const inp = document.getElementById('input-busca-global'); if (inp) inp.focus(); }, 300);
    } else { pararCarrosselDashboard(); }
}

function voltarParaGavetas() { mostrarTela('view-gavetas'); }
function sairDoSistema()     { location.reload(); }

// =========================================================================
// DASHBOARD & CARROSSEL
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
            'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop'
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
        div.onclick   = () => { document.getElementById('input-busca-global').value = ''; resultadosDiv.classList.add('view-hidden'); abrirGaveta(item.gaveta.id); };
        div.innerHTML = `
            <div class="res-info"><h4>${item.peca.name}</h4><p>Item: ${item.peca.code || 'S/N'} | <strong>${item.gaveta.label}</strong> (Div: ${item.peca.divisoria || 'Geral'})</p></div>
            <div class="res-tag"><i class="fa-solid fa-box-open"></i> ${item.peca.current} un</div>`;
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
    database.drawers.forEach(gaveta => { (database.items[gaveta.id] || []).forEach(p => { if (p.current === 0) qtdZerados++; }); });
    const banner = document.getElementById('alerta-global-zerado');
    if (!banner) return;
    if (qtdZerados > 0) {
        banner.classList.remove('view-hidden');
        document.getElementById('texto-alerta-zerado').innerHTML = `<strong>Atenção:</strong> Existem <strong>${qtdZerados} item(ns)</strong> com estoque ZERADO no armário!`;
    } else { banner.classList.add('view-hidden'); }
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

// =========================================================================
// ARMÁRIO VERTICAL (GAVETAS DRAG AND DROP)
// =========================================================================
function renderArmarioVertical() {
    const chassi = document.getElementById('menu-gavetas');
    if (!chassi) return;
    chassi.innerHTML = '';
    database.drawers.forEach((gaveta, index) => {
        const status = getGavetaStatus(database.items[gaveta.id] || []);
        const div = document.createElement('div');
        div.className = 'btn-gaveta';
        div.innerHTML = `
            <div class="gaveta-content">
                <i class="fa-solid fa-grip-vertical drag-handle admin-only" title="Arraste para reordenar" style="cursor: grab; font-size: 1.2rem; color: rgba(255,255,255,0.5);"></i>
                <span class="gnumber">${gaveta.label}</span>
                <span class="glabel">${gaveta.title}</span>
                <button class="btn-edit-gaveta admin-only" onclick="window.abrirModalEditarGaveta(event, ${gaveta.id})" title="Renomear Gaveta"><i class="fa-solid fa-pen"></i></button>
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
                e.dataTransfer.setData('text/plain', index);
                setTimeout(() => div.classList.add('dragging'), 0);
            };
            div.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drag-over'); };
            div.ondragleave = (e) => { if (!div.contains(e.relatedTarget)) div.classList.remove('drag-over'); };
            div.ondrop = async (e) => {
                e.preventDefault();
                div.classList.remove('drag-over');
                if (draggedDrawerIndex === null || draggedDrawerIndex === index) return;
                const gavetaArrastada = database.drawers[draggedDrawerIndex];
                database.drawers.splice(draggedDrawerIndex, 1);
                database.drawers.splice(index, 0, gavetaArrastada);
                registrarLog(`reordenou a ${gavetaArrastada.label} para a nova posição no armário.`);
                await salvarConfig(); renderArmarioVertical(); 
            };
            div.ondragend = () => { div.classList.remove('dragging'); draggedDrawerIndex = null; };
        }
        chassi.appendChild(div);
    });
}

// =========================================================================
// INTERIOR DA GAVETA: GRID REAL (COLMEIA DINÂMICA)
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
        if (!grupos[divi]) grupos[divi] = [];
        grupos[divi].push(peca);
    });

    const nomesDivisorias = Object.keys(grupos).sort();

    nomesDivisorias.forEach(nomeDivisoria => {
        const headerDivi = document.createElement('div');
        headerDivi.className = 'divisoria-header';
        headerDivi.innerHTML = `<i class="fa-solid fa-layer-group"></i> Divisória: ${nomeDivisoria}`;
        mainContainer.appendChild(headerDivi);

        const gridDivi = document.createElement('div');
        gridDivi.className = 'gaveteiro-grid'; // CSS Grid Industrial (5 Colunas, Auto-Rows: 60px, Dense)

        const pecasOrdenadas = grupos[nomeDivisoria].sort((a, b) => (a.position || 999) - (b.position || 999));

        pecasOrdenadas.forEach(peca => {
            const statusPeca = getPecaStatus(peca);
            
            const imgHtml = peca.image 
                ? `<img src="${peca.image}" alt="${peca.name}" class="peca-img" draggable="false">` 
                : `<i class="fa-solid fa-microchip peca-icon-placeholder"></i>`;
                
            const retiradaHtml = peca.lastTakenBy ? `<div class="last-taken-clean">Últ. retirada: ${peca.lastTakenBy}</div>` : '';

            const displayPosition = (peca.position && peca.position !== 999) ? peca.position : '-';
            
            // O sistema não limita o tamanho do span! Fallback para 3 caso seja peça antiga sem 'size'
            const displaySize = peca.size || 3;

            const div = document.createElement('div');
            div.className = 'compartimento-card';
            
            // CSS Dinâmico: A altura da peça dita quantas 'linhas de 60px' ela ocupa na colmeia
            div.style.gridRow = `span ${displaySize}`;

            // Adiciona um listener pra forçar ativação do menu no toque do celular
            div.onclick = () => { div.classList.toggle('active-touch'); };

            // ESTRUTURA LIMPA: Apenas dados essenciais aparecem por padrão.
            // Ações ficam escondidas no '.card-overlay-acoes' via CSS Hover
            div.innerHTML = `
                <div class="card-padrao">
                    <div class="card-header-clean">
                        <span class="pos-badge" title="Posição">#${displayPosition}</span>
                        <span class="status-indicator ${statusPeca}" title="Status: ${getStatusText(statusPeca)}"></span>
                    </div>
                    
                    <div class="card-image-clean">
                        ${imgHtml}
                    </div>
                    
                    <div class="card-info-clean">
                        <div class="codigo-clean">${peca.code || 'S/N'}</div>
                        <div class="nome-clean">${peca.name}</div>
                    </div>
                    
                    <div class="card-qtd-clean">
                        <span class="qtd-atual">${peca.current}</span>
                        <span class="qtd-ideal">/ ${peca.expected}</span>
                    </div>
                </div>

                <div class="card-overlay-acoes">
                    <i class="fa-solid fa-grip drag-handle-item admin-only" title="Arraste para reordenar a peça"></i>
                    
                    <div class="quick-control">
                        <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, -1)"><i class="fa-solid fa-minus"></i></button>
                        <strong>${peca.current}</strong>
                        <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, 1)"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    
                    <button class="btn-acao-clean" onclick="window.abrirModalConferencia(${peca.id})">
                        <i class="fa-solid fa-clipboard-check"></i> Contagem
                    </button>
                    
                    <button class="btn-acao-clean ${peca.requested ? 'ativo' : ''}" onclick="window.alternarStatusRequisitado(${peca.id})">
                        <i class="fa-solid fa-cart-arrow-down"></i> ${peca.requested ? 'Já Requisitado' : 'Requisitar'}
                    </button>
                    
                    <button class="btn-acao-clean admin-only" onclick="window.abrirModalMoverPeca(${peca.id})">
                        <i class="fa-solid fa-right-left"></i> Mover Gaveta
                    </button>

                    <div class="admin-actions-clean admin-only">
                        <button class="btn-edit-peca" title="Editar Peça" onclick="window.abrirModalEditarPeca(${peca.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-excluir" title="Excluir Peça" onclick="window.excluirPeca(${peca.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    
                    ${retiradaHtml}
                </div>
            `;
            
            // Drag and Drop (ADMIN) mantendo a mesma lógica robusta já existente
            if (usuarioLogado && usuarioLogado.role === 'ADMIN') {
                div.draggable = true;

                div.ondragstart = (e) => {
                    if(e.target.closest('.btn-quick') || e.target.closest('button')) {
                        e.preventDefault(); return;
                    }
                    draggedPecaId = peca.id;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', peca.id);
                    setTimeout(() => div.classList.add('dragging'), 0);
                };

                div.ondragover = (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    div.classList.add('drag-over');
                };

                div.ondragleave = (e) => {
                    if (!div.contains(e.relatedTarget)) div.classList.remove('drag-over');
                };

                div.ondrop = async (e) => {
                    e.preventDefault();
                    div.classList.remove('drag-over');
                    
                    if (!draggedPecaId || draggedPecaId === peca.id) return;

                    let itensGaveta = database.items[gavetaAtualAberta];
                    const pecaArrastada = itensGaveta.find(p => p.id === draggedPecaId);
                    const pecaAlvo = peca; 

                    if(!pecaArrastada || !pecaAlvo) return;

                    pecaArrastada.divisoria = pecaAlvo.divisoria;

                    let divisoriaItems = itensGaveta.filter(p => p.divisoria === pecaAlvo.divisoria).sort((a, b) => (a.position || 999) - (b.position || 999));
                    divisoriaItems = divisoriaItems.filter(p => p.id !== draggedPecaId);
                    
                    const novoIndexAlvo = divisoriaItems.findIndex(p => p.id === pecaAlvo.id);
                    const insertIndex = novoIndexAlvo !== -1 ? novoIndexAlvo : divisoriaItems.length;
                    
                    divisoriaItems.splice(insertIndex, 0, pecaArrastada);
                    divisoriaItems.forEach((p, index) => { p.position = index + 1; });

                    registrarLog(`reordenou a peça "${pecaArrastada.name}" na gaveta`);
                    await salvarItensDaGaveta(gavetaAtualAberta);
                    renderizarPecasDaGaveta(gavetaAtualAberta); 
                };

                div.ondragend = () => { div.classList.remove('dragging'); draggedPecaId = null; };
            }

            gridDivi.appendChild(div);
        });
        
        mainContainer.appendChild(gridDivi);
    });
}

// RESTANTE DO CÓDIGO PERMANECE INALTERADO!
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

function abrirModalMoverPeca(idPeca) {
    pecaSendoMovidaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    document.getElementById('mover-peca-nome').innerText = peca.name;
    const select = document.getElementById('mover-destino-select');
    select.innerHTML = '';
    database.drawers.forEach(gaveta => {
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
    const gavetaOrigem  = database.drawers.find(d => d.id === gavetaAtualAberta);
    const gavetaDestino = database.drawers.find(d => d.id === destinoId);
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
    const gaveta     = database.drawers.find(d => d.id === gavetaSendoEditadaId);
    const nomeAntigo = gaveta.title;
    gaveta.title     = novoNome;
    registrarLog(`alterou o nome da gaveta ${gaveta.label} de "${nomeAntigo}" para "${novoNome}"`);
    salvarConfig();
    fecharModalEditarGaveta();
}

function abrirModalCadastro() {
    ['novo-codigo', 'novo-nome', 'novo-posicao'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('novo-esperado').value  = '1';
    document.getElementById('novo-atual').value     = '0';
    document.getElementById('novo-divisoria').value = 'Geral';
    document.getElementById('novo-tamanho').value   = '3'; // Default para 3
    document.getElementById('novo-imagem').value    = '';
    document.getElementById('modal-cadastro').classList.remove('view-hidden');
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
    const tamanho   = parseInt(document.getElementById('novo-tamanho').value) || 3;
    const imgInput  = document.getElementById('novo-imagem');

    if (!nome) return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');

    const btnSalvar = document.querySelector('#modal-cadastro .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const novaPeca = {
        id:          Date.now(),
        code:        codigo || `G${gavetaAtualAberta}-P${(database.items[gavetaAtualAberta] || []).length + 1}`,
        name:        nome, expected: esperado, current: atual, position: posicao,
        divisoria:   divisoria, size: tamanho, requested: false, lastTakenBy: null, image: null
    };

    if (imgInput.files && imgInput.files[0]) {
        try { novaPeca.image = await uploadImagemCloudinary(imgInput.files[0]); } 
        catch (err) { mostrarAlerta('Aviso', 'Não foi possível enviar a foto. A peça será salva sem imagem.'); }
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
    document.getElementById('edit-peca-codigo').value    = peca.code    || '';
    document.getElementById('edit-peca-nome').value      = peca.name;
    document.getElementById('edit-peca-esperado').value  = peca.expected;
    document.getElementById('edit-peca-atual').value     = peca.current;
    document.getElementById('edit-peca-posicao').value   = (peca.position && peca.position !== 999) ? peca.position : '';
    document.getElementById('edit-peca-divisoria').value = peca.divisoria || 'Geral';
    document.getElementById('edit-peca-tamanho').value   = peca.size || 3;
    document.getElementById('edit-peca-imagem').value    = '';
    document.getElementById('modal-editar-peca').classList.remove('view-hidden');
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
    const novoTamanho   = parseInt(document.getElementById('edit-peca-tamanho').value) || 3;
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
    peca.size       = novoTamanho;

    if (peca.current >= peca.expected) peca.requested = false;

    if (imgInput.files && imgInput.files[0]) {
        try { peca.image = await uploadImagemCloudinary(imgInput.files[0]); } 
        catch (err) { mostrarAlerta('Aviso', 'Não foi possível enviar a nova foto. A imagem anterior foi mantida.'); }
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

function copiarTextoPedido() {
    const ta  = document.getElementById('texto-pedido-gerado');
    ta.select(); document.execCommand('copy');
    const btn  = event.currentTarget;
    const orig = btn.innerHTML;
    btn.innerHTML             = `<i class="fa-solid fa-check"></i> Copiado!`;
    btn.style.backgroundColor = 'var(--status-verde)';
    registrarLog('copiou a lista de pedido de peças para envio.');
    setTimeout(() => { btn.innerHTML = orig; btn.style.backgroundColor = 'var(--drawer-blue)'; }, 2000);
}

// =========================================================================
// EXPOSIÇÃO GLOBAL DE FUNÇÕES
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

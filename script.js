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
// INICIALIZAÇÃO, MIGRAÇÃO E SINCRONIZAÇÃO FIREBASE
// =========================================================================
window.onload = () => {
    iniciarSincronizacaoFirebase();
    configurarEventosEnter();

    const deviceAuthorized = localStorage.getItem('5s_device_authorized');
    if (deviceAuthorized === 'true') {
        document.getElementById('view-device-auth').classList.replace('view-active', 'view-hidden');
        document.getElementById('view-login').classList.replace('view-hidden', 'view-active');
    }
};

async function iniciarSincronizacaoFirebase() {
    setupListeners();
    migrarDadosLegados();
}

function setupListeners() {
    onSnapshot(doc(db, "manutencao_5s", "config"), (snap) => {
        if (snap.exists()) {
            const d = snap.data();
            database.drawers = d.drawers  || [...GAVETAS_PADRAO];
            usuariosSalvos   = d.usuarios || [];
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
                if (p.position    === undefined) p.position    = 999; // 999 Joga as peças sem posição pro final
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

async function migrarDadosLegados() {
    if (localStorage.getItem('5s_migrado_v2')) return; 

    try {
        const legadoSnap = await getDoc(doc(db, "manutencao_5s", "dados_sistema"));
        const configSnap = await getDoc(doc(db, "manutencao_5s", "config"));

        if (!legadoSnap.exists() || configSnap.exists()) {
            localStorage.setItem('5s_migrado_v2', 'true'); 
            return;
        }

        console.log("Migrando dados legados para nova estrutura...");
        const legado    = legadoSnap.data();
        const db_legado = legado.database || {};

        await setDoc(doc(db, "manutencao_5s", "config"), {
            drawers:  db_legado.drawers  || [...GAVETAS_PADRAO],
            usuarios: legado.usuarios || []
        });

        await setDoc(doc(db, "manutencao_5s", "historico"), {
            logs: legado.historico || []
        });

        for (const gaveta of GAVETAS_PADRAO) {
            const itens = ((db_legado.items || {})[gaveta.id] || []).map(p => ({
                ...p, image: null, position: 999
            }));
            await setDoc(doc(db, "manutencao_5s", `itens_g${gaveta.id}`), { items: itens });
        }

        localStorage.setItem('5s_migrado_v2', 'true'); 
        console.log("Migração concluída.");
    } catch (e) {
        console.warn("Aviso na migração:", e);
    }
}

// =========================================================================
// EVENTOS E AUTORIZAÇÃO
// =========================================================================
function configurarEventosEnter() {
    const map = [
        { inputId: 'input-device-key',  btnAcao: autorizarDispositivo },
        { inputId: 'input-login-id',    btnAcao: realizarLogin        },
        { inputId: 'input-login-senha', btnAcao: realizarLogin        },
        { inputId: 'reg-senha',         btnAcao: registrarUsuario     },
        { inputId: 'conf-qtd-atual',    btnAcao: salvarConferencia    },
        { inputId: 'edit-gaveta-nome',  btnAcao: salvarNomeGaveta     },
        { inputId: 'novo-atual',        btnAcao: salvarNovoItem       },
        { inputId: 'edit-peca-atual',   btnAcao: salvarEdicaoPeca     }
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
        mostrarAlerta('Acesso Negado', 'Chave mestre incorreta. Solicite autorização ao Administrador da Manutenção.');
    }
}

// =========================================================================
// BACKUP E PLANILHAS CSV
// =========================================================================
function fazerBackup() {
    const data    = { database, usuarios: usuariosSalvos, historico: historicoLogs };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const a       = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "backup_5s_manutencao_" + new Date().getTime() + ".json");
    document.body.appendChild(a); a.click(); a.remove();
    registrarLog("fez o download do arquivo de backup do sistema");
}

async function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const c = JSON.parse(e.target.result);
            if (c.database)  database       = c.database;
            if (c.usuarios)  usuariosSalvos = c.usuarios;
            if (c.historico) historicoLogs  = c.historico;
            await salvarConfig();
            await salvarHistorico();
            for (const g of database.drawers) await salvarItensDaGaveta(g.id);
            mostrarAlerta('Sucesso', 'Backup restaurado com sucesso para a nuvem!');
            registrarLog("restaurou um arquivo de backup no sistema");
            atualizarDashboard();
        } catch { mostrarAlerta('Erro', 'O arquivo selecionado é inválido ou está corrompido.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function exportarEstoqueCSV() {
    let csv = "data:text/csv;charset=utf-8,\uFEFF";
    csv += "Gaveta,Codigo_Local,Peca,Posicao,Padrao_5S,Fisica_Atual,Status\n";
    database.drawers.forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(peca => {
            const s = getStatusText(getPecaStatus(peca));
            const pos = (peca.position && peca.position !== 999) ? peca.position : "-";
            csv += `"${gaveta.label} - ${gaveta.title}","${peca.code || ''}","${peca.name}",${pos},${peca.expected},${peca.current},"${s}"\n`;
        });
    });
    baixarArquivoCSV(csv, "estoque_atual_5s.csv");
    registrarLog("exportou a planilha Excel de Estoque");
}

function exportarHistoricoCSV() {
    let csv = "data:text/csv;charset=utf-8,\uFEFF";
    csv += "Data_Hora,Usuario,Acao\n";
    historicoLogs.forEach(log => {
        csv += `"${log.data}","${log.usuario}","${log.acao.replace(/"/g, '""')}"\n`;
    });
    baixarArquivoCSV(csv, "historico_atividades_5s.csv");
    registrarLog("exportou a planilha Excel do Histórico");
}

function baixarArquivoCSV(content, filename) {
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(content));
    link.setAttribute("download", filename);
    document.body.appendChild(link); link.click(); link.remove();
}

// =========================================================================
// LOGS
// =========================================================================
function registrarLog(acao) {
    const dataAtual = new Date();
    const dataFormatada = dataAtual.toLocaleDateString('pt-BR') + ' às ' + dataAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    historicoLogs.unshift({ id: Date.now(), usuario: usuarioLogado ? usuarioLogado.nome : 'Sistema', acao, data: dataFormatada });
    if (historicoLogs.length > 500) historicoLogs.pop();
    salvarHistorico();
}

function renderizarHistorico() {
    const container = document.getElementById('lista-historico');
    if (!container) return;
    container.innerHTML = '';
    if (historicoLogs.length === 0) {
        container.innerHTML = '<p style="color:#64748b;text-align:center;padding:20px;">Nenhum registro encontrado ainda.</p>';
        return;
    }
    historicoLogs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'log-item';
        div.innerHTML = `<div class="log-time"><i class="fa-regular fa-calendar"></i> ${log.data}</div><div class="log-text"><strong>${log.usuario}</strong> ${log.acao}</div>`;
        container.appendChild(div);
    });
}

// =========================================================================
// NOTIFICAÇÕES
// =========================================================================
function solicitarPermissaoNotificacao() {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}
function enviarNotificacao(titulo, mensagem) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(titulo, { body: mensagem, icon: "https://cdn-icons-png.flaticon.com/512/825/825503.png" });
    }
}

// =========================================================================
// MENU MOBILE E CORES
// =========================================================================
function toggleMenuMobile() {
    document.getElementById('sidebar-menu').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('open');
}

function getPecaStatus(peca) {
    if (peca.requested)               return 'amarelo';
    if (peca.current === 0)           return 'vermelho';
    if (peca.current < peca.expected) return 'laranja';
    return 'verde';
}

function getGavetaStatus(pecas) {
    if (!pecas || pecas.length === 0) return 'verde';
    let v = false, l = false, a = false;
    pecas.forEach(p => {
        const s = getPecaStatus(p);
        if (s === 'vermelho') v = true;
        if (s === 'laranja')  l = true;
        if (s === 'amarelo')  a = true;
    });
    if (v) return 'vermelho';
    if (l) return 'laranja';
    if (a) return 'amarelo';
    return 'verde';
}

function getStatusText(status) {
    return { verde: 'Estoque Cheio', amarelo: 'Requisitado', laranja: 'Poucas Peças', vermelho: 'Sem Estoque' }[status] || '';
}

// =========================================================================
// LOGIN E USUÁRIOS
// =========================================================================
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
    if (usuariosSalvos.find(u => u.cracha === cracha)) return mostrarAlerta('Erro', 'Crachá já cadastrado! Volte ao login.');
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
    if (user) aplicarLogin(user);
    else mostrarAlerta('Acesso Negado', 'Crachá ou Senha incorretos. Tente novamente.');
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
    document.getElementById('reg-senha').value = '';
    solicitarPermissaoNotificacao();
    atualizarDashboard();
}

// =========================================================================
// NAVEGAÇÃO
// =========================================================================
function mostrarTela(id) {
    ['view-gavetas','view-compartimentos','view-historico','view-config'].forEach(v => {
        document.getElementById(v).classList.replace('view-active', 'view-hidden');
    });
    document.getElementById(id).classList.replace('view-hidden', 'view-active');
    document.getElementById('sidebar-menu').classList.remove('open');
    document.getElementById('mobile-overlay').classList.remove('open');
    if (id === 'view-gavetas')   gavetaAtualAberta = null;
    if (id === 'view-historico') renderizarHistorico();
    window.scrollTo(0, 0);
}

function voltarParaGavetas() { mostrarTela('view-gavetas'); }
function sairDoSistema()     { location.reload(); }

// =========================================================================
// DASHBOARD E RENDERIZAÇÃO
// =========================================================================
function atualizarDashboard() {
    renderArmarioVertical();
    calcularKPIs();
    verificarEstoqueZerado();
    renderizarHistorico();
    if (gavetaAtualAberta !== null) renderizarPecasDaGaveta(gavetaAtualAberta);
}

function verificarEstoqueZerado() {
    let qtdZerados = 0;
    database.drawers.forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(p => { if (p.current === 0) qtdZerados++; });
    });
    const banner = document.getElementById('alerta-global-zerado');
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
    lista.innerHTML = '';
    database.drawers.forEach(gaveta => {
        const pecas  = database.items[gaveta.id] || [];
        const status = getGavetaStatus(pecas);
        const div    = document.createElement('div');
        div.className = `kpi-status-item ${status}`;
        div.innerHTML = `<i class="fa-solid fa-circle-${status === 'verde' ? 'check' : 'exclamation'}"></i> ${gaveta.label}: ${getStatusText(status)}`;
        lista.appendChild(div);
        if (status !== 'verde') alerts++;
    });
    document.getElementById('kpi-pendencias-count').innerText = alerts;
}

function renderArmarioVertical() {
    const chassi = document.getElementById('menu-gavetas');
    chassi.innerHTML = '';
    database.drawers.forEach(gaveta => {
        const status = getGavetaStatus(database.items[gaveta.id] || []);
        const div    = document.createElement('button');
        div.className = 'btn-gaveta';
        div.onclick   = () => abrirGaveta(gaveta.id);
        div.innerHTML = `
            <div class="gaveta-content">
                <span class="gnumber">${gaveta.label}</span>
                <span class="glabel">${gaveta.title}</span>
                <button class="btn-edit-gaveta admin-only" onclick="window.abrirModalEditarGaveta(event, ${gaveta.id})" title="Renomear Gaveta">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <div class="gstatus-light ${status}"></div>
            </div>`;
        chassi.appendChild(div);
    });
}

function abrirModalEditarGaveta(eventoClick, idGaveta) {
    eventoClick.stopPropagation();
    gavetaSendoEditadaId = idGaveta;
    const gaveta = database.drawers.find(d => d.id === idGaveta);
    document.getElementById('edit-gaveta-nome').value = gaveta.title;
    document.getElementById('modal-editar-gaveta').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('edit-gaveta-nome').focus(), 100);
}
function fecharModalEditarGaveta() { document.getElementById('modal-editar-gaveta').classList.add('view-hidden'); }

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

// =========================================================================
// DENTRO DA GAVETA (RENDERIZAÇÃO COM ORDENAÇÃO)
// =========================================================================
function abrirGaveta(idGaveta) {
    gavetaAtualAberta = idGaveta;
    const gaveta = database.drawers.find(d => d.id === idGaveta);
    document.getElementById('titulo-gaveta-aberta').innerText = `${gaveta.label}: ${gaveta.title}`;
    renderizarPecasDaGaveta(idGaveta);
    mostrarTela('view-compartimentos');
}

function renderizarPecasDaGaveta(idGaveta) {
    const grid  = document.getElementById('grid-pecas');
    grid.innerHTML = '';
    const pecasBrutas = database.items[idGaveta] || [];

    if (pecasBrutas.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#64748b;font-size:1.1rem;padding:40px;">Nenhuma peça cadastrada nesta gaveta.</p>';
        return;
    }

    // ORDENAÇÃO PERFECCIONISTA: Organiza pelo número da posição que você definir no campo.
    const pecasOrdenadas = [...pecasBrutas].sort((a, b) => (a.position || 999) - (b.position || 999));

    pecasOrdenadas.forEach(peca => {
        const statusPeca   = getPecaStatus(peca);
        const corQtd       = statusPeca === 'verde' ? 'var(--status-verde)' : 'var(--text-primary)';
        const imgHtml      = peca.image ? `<img src="${peca.image}" alt="${peca.name}">` : `<i class="fa-solid fa-microchip"></i>`;
        const retiradaHtml = peca.lastTakenBy
            ? `<div class="last-taken-info"><i class="fa-solid fa-clock-rotate-left"></i> Último a retirar: <strong>${peca.lastTakenBy}</strong></div>` : '';
            
        // Indicador visual de posição na gaveta para facilitar o check visual
        const displayPosition = (peca.position && peca.position !== 999) ? peca.position : '-';

        const div = document.createElement('div');
        div.className = 'compartimento-card';
        div.innerHTML = `
            <div class="card-top">
                <div>
                    <span class="card-local" title="Posição exata no gaveteiro">📌 Pos: ${displayPosition} | ${peca.code || 'S/N'}</span>
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
                <button class="btn-conferir" onclick="window.abrirModalConferencia(${peca.id})">
                    <i class="fa-solid fa-clipboard-check"></i> Definir Contagem Exata
                </button>
                <button class="btn-requisitado ${peca.requested ? 'ativo' : ''}" onclick="window.alternarStatusRequisitado(${peca.id})">
                    <i class="fa-solid fa-cart-arrow-down"></i> ${peca.requested ? 'Já Requisitado' : 'Marcar como Requisitado'}
                </button>
                <button class="btn-mover admin-only" onclick="window.abrirModalMoverPeca(${peca.id})">
                    <i class="fa-solid fa-right-left"></i> Mover para outra Gaveta
                </button>
            </div>`;
        grid.appendChild(div);
    });
}

function ajusteRapidoEstoque(idPeca, delta) {
    const peca  = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    let novaQtd = Math.max(0, peca.current + delta);
    if (delta < 0 && peca.current > 0) {
        peca.lastTakenBy = usuarioLogado.nome;
        registrarLog(`retirou 1 unidade da peça "${peca.name}" (Local: ${peca.code})`);
        enviarNotificacao("Peça Retirada", `Você retirou 1x ${peca.name}. Restaram ${novaQtd} peça(s).`);
    } else if (delta > 0) {
        registrarLog(`adicionou 1 unidade da peça "${peca.name}" (Local: ${peca.code})`);
    }
    peca.current = novaQtd;
    if (peca.current >= peca.expected) peca.requested = false;
    salvarItensDaGaveta(gavetaAtualAberta);
}

function alternarStatusRequisitado(idPeca) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    peca.requested = !peca.requested;
    registrarLog(`${peca.requested ? 'marcou como REQUISITADO' : 'removeu o status requisitado de'} a peça "${peca.name}"`);
    salvarItensDaGaveta(gavetaAtualAberta);
}

function excluirPeca(idPeca) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
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
    database.drawers.forEach(gaveta => {
        if (gaveta.id === gavetaAtualAberta) return;
        const option = document.createElement('option');
        option.value    = gaveta.id;
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
    const destinoId      = parseInt(document.getElementById('mover-destino-select').value);
    const gavetaOrigem   = database.drawers.find(d => d.id === gavetaAtualAberta);
    const gavetaDestino  = database.drawers.find(d => d.id === destinoId);
    const peca           = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoMovidaId);

    database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== pecaSendoMovidaId);
    if (!database.items[destinoId]) database.items[destinoId] = [];
    database.items[destinoId].push(peca);

    registrarLog(`moveu a peça "${peca.name}" da ${gavetaOrigem.label} para ${gavetaDestino.label} (${gavetaDestino.title})`);

    await salvarItensDaGaveta(gavetaAtualAberta);
    await salvarItensDaGaveta(destinoId);

    fecharModalMoverPeca();
}

// =========================================================================
// GERENCIAMENTO DE PEÇAS E POSIÇÃO
// =========================================================================
function abrirModalCadastro() {
    ['novo-codigo','novo-nome', 'novo-posicao'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('novo-esperado').value = '1';
    document.getElementById('novo-atual').value    = '0';
    document.getElementById('novo-imagem').value   = '';
    document.getElementById('modal-cadastro').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('novo-nome').focus(), 100);
}
function fecharModalCadastro() { document.getElementById('modal-cadastro').classList.add('view-hidden'); }

async function salvarNovoItem() {
    const codigo   = document.getElementById('novo-codigo').value.trim();
    const nome     = document.getElementById('novo-nome').value.trim();
    const esperado = parseInt(document.getElementById('novo-esperado').value);
    const atual    = parseInt(document.getElementById('novo-atual').value);
    const posicao  = parseInt(document.getElementById('novo-posicao').value) || 999;
    const imgInput = document.getElementById('novo-imagem');

    if (!nome) return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');

    const btnSalvar = document.querySelector('#modal-cadastro .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const novaPeca = {
        id: Date.now(),
        code: codigo || `G${gavetaAtualAberta}-P${(database.items[gavetaAtualAberta] || []).length + 1}`,
        name: nome, expected: esperado, current: atual,
        position: posicao,
        requested: false, lastTakenBy: null, image: null
    };

    if (imgInput.files && imgInput.files[0]) {
        try {
            novaPeca.image = await uploadImagemCloudinary(imgInput.files[0]);
        } catch (err) {
            console.error("Erro Cloudinary:", err);
            mostrarAlerta('Aviso', 'Não foi possível enviar a foto. A peça será salva sem imagem.');
        }
    }

    database.items[gavetaAtualAberta].push(novaPeca);
    registrarLog(`cadastrou a nova peça "${novaPeca.name}" (Local: ${novaPeca.code}) na Posição ${posicao === 999 ? 'Livre' : posicao}.`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    fecharModalCadastro();

    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Peça'; }
}

function abrirModalEditarPeca(idPeca) {
    pecaSendoEditadaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    document.getElementById('edit-peca-codigo').value   = peca.code || '';
    document.getElementById('edit-peca-nome').value     = peca.name;
    document.getElementById('edit-peca-esperado').value = peca.expected;
    document.getElementById('edit-peca-atual').value    = peca.current;
    
    // Carrega a posição para edição (ou vazio se for 999/livre)
    document.getElementById('edit-peca-posicao').value  = (peca.position && peca.position !== 999) ? peca.position : '';
    
    document.getElementById('edit-peca-imagem').value   = '';
    document.getElementById('modal-editar-peca').classList.remove('view-hidden');
    setTimeout(() => document.getElementById('edit-peca-nome').focus(), 100);
}
function fecharModalEditarPeca() { document.getElementById('modal-editar-peca').classList.add('view-hidden'); }

async function salvarEdicaoPeca() {
    const novoCodigo   = document.getElementById('edit-peca-codigo').value.trim();
    const novoNome     = document.getElementById('edit-peca-nome').value.trim();
    const novoEsperado = parseInt(document.getElementById('edit-peca-esperado').value);
    const novoAtual    = parseInt(document.getElementById('edit-peca-atual').value);
    const novaPosicao  = parseInt(document.getElementById('edit-peca-posicao').value) || 999;
    const imgInput     = document.getElementById('edit-peca-imagem');

    if (!novoNome) return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');
    if (isNaN(novoEsperado) || isNaN(novoAtual)) return mostrarAlerta('Erro', 'Valores numéricos inválidos.');

    const btnSalvar = document.querySelector('#modal-editar-peca .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const peca    = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoEditadaId);
    peca.code     = novoCodigo;
    peca.name     = novoNome;
    peca.expected = novoEsperado;
    peca.current  = novoAtual;
    peca.position = novaPosicao;
    
    if (peca.current >= peca.expected) peca.requested = false;

    if (imgInput.files && imgInput.files[0]) {
        try {
            peca.image = await uploadImagemCloudinary(imgInput.files[0]);
        } catch (err) {
            console.error("Erro Cloudinary:", err);
            mostrarAlerta('Aviso', 'Não foi possível enviar a nova foto. A imagem anterior foi mantida.');
        }
    }

    registrarLog(`editou as informações da peça "${peca.name}"`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    fecharModalEditarPeca();

    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Alterações'; }
}

function abrirModalConferencia(idPeca) {
    pecaSendoConferidaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
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
// GERADOR DE PEDIDO
// =========================================================================
function gerarEmailPedido() {
    const itens = [];
    database.drawers.forEach(gaveta => {
        (database.items[gaveta.id] || []).forEach(peca => {
            if (peca.current < peca.expected)
                itens.push(`- ${peca.expected - peca.current} un. | ${peca.name} (Local: ${peca.code})`);
        });
    });
    if (!itens.length) return mostrarAlerta("Tudo em Ordem", "Não há peças faltando no gaveteiro neste momento.");
    const nome = usuarioLogado ? usuarioLogado.nome : 'Manutenção';
    document.getElementById('texto-pedido-gerado').value =
        `Olá,\n\nPor favor, solicito a compra/reposição dos seguintes materiais faltantes para o nosso gaveteiro elétrico:\n\n${itens.join('\n')}\n\nFico no aguardo.\nObrigado,\n${nome}`;
    document.getElementById('modal-pedido').classList.remove('view-hidden');
}
function fecharModalPedido() { document.getElementById('modal-pedido').classList.add('view-hidden'); }

function copiarTextoPedido() {
    const ta = document.getElementById('texto-pedido-gerado');
    ta.select();
    document.execCommand('copy');
    const btn  = event.currentTarget;
    const orig = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
    btn.style.backgroundColor = 'var(--status-verde)';
    registrarLog(`copiou a lista de pedido de peças para envio.`);
    setTimeout(() => { btn.innerHTML = orig; btn.style.backgroundColor = 'var(--drawer-blue)'; }, 2000);
}

// =========================================================================
// EXPOSIÇÃO GLOBAL DE FUNÇÕES (MÓDULO)
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
window.fecharModalEditarPeca     = fecharModalEditarPeca;
window.salvarEdicaoPeca          = salvarEdicaoPeca;
window.fecharModalConferencia    = fecharModalConferencia;
window.salvarConferencia         = salvarConferencia;
window.fecharModalEditarGaveta   = fecharModalEditarGaveta;
window.salvarNomeGaveta          = salvarNomeGaveta;
window.fecharModalPedido         = fecharModalPedido;
window.copiarTextoPedido         = copiarTextoPedido;
window.fecharAlerta              = fecharAlerta;
window.abrirModalEditarGaveta    = abrirModalEditarGaveta;
window.abrirGaveta               = abrirGaveta;
window.ajusteRapidoEstoque       = ajusteRapidoEstoque;
window.alternarStatusRequisitado = alternarStatusRequisitado;
window.abrirModalConferencia     = abrirModalConferencia;
window.excluirPeca               = excluirPeca;
window.abrirModalEditarPeca      = abrirModalEditarPeca;
window.abrirModalMoverPeca       = abrirModalMoverPeca;
window.fecharModalMoverPeca      = fecharModalMoverPeca;
window.confirmarMoverPeca        = confirmarMoverPeca;

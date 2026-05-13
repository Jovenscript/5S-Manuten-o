// =========================================================================
// FIREBASE IMPORTS E CONFIGURAÇÃO
// =========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBRddH3U2K6DAW8gAQZC1gZu7XUVSWgebE",
    authDomain: "fir-manut.firebaseapp.com",
    projectId: "fir-manut",
    storageBucket: "fir-manut.firebasestorage.app",
    messagingSenderId: "509518361914",
    appId: "1:509518361914:web:456e0eb1f3d97cdf8ccc03"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// =========================================================================
// CLOUDINARY CONFIG
// =========================================================================
const CLOUDINARY_CLOUD_NAME = 'dxc1zmhbj';
const CLOUDINARY_UPLOAD_PRESET = '5s_manutencao';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// =========================================================================
// CONSTANTES E CREDENCIAIS DO SISTEMA
// =========================================================================
const ADMIN_CREDENTIALS = {
    login: 'admin@weg.net',
    senha: 'admin123'
};

const DEVICE_MASTER_KEY = 'WEG2026';

const defaultDatabase = {
    drawers: [
        { id: 1, label: "G1", title: "Sensores M12" },
        { id: 2, label: "G2", title: "Botões e LED's" },
        { id: 3, label: "G3", title: "Fusíveis" },
        { id: 4, label: "G4", title: "Contatoras" },
        { id: 5, label: "G5", title: "Prensas Cabos" },
        { id: 6, label: "G6", title: "Bornes e Relés" },
        { id: 7, label: "G7", title: "Abraçadeiras" },
        { id: 8, label: "G8", title: "Anilhas" },
        { id: 9, label: "G9", title: "Lâmpadas" },
        { id: 10, label: "G10", title: "Miscelânea 1" },
        { id: 11, label: "G11", title: "Miscelânea 2" },
        { id: 12, label: "G12", title: "Outros" }
    ],
    items: {
        2: [
            { id: 201, code: "G2-01", name: "Botão Emergência Vermelho", expected: 3, current: 3, requested: false, image: null, lastTakenBy: null },
            { id: 202, code: "G2-02", name: "Botão Emergência Amarelo", expected: 2, current: 1, requested: false, image: null, lastTakenBy: null },
            { id: 203, code: "G2-03", name: "LED Verde Sinaleiro", expected: 5, current: 0, requested: false, image: null, lastTakenBy: null }
        ]
    }
};

// =========================================================================
// VARIÁVEIS GLOBAIS
// =========================================================================
let database = {};
let usuariosSalvos = [];
let historicoLogs = [];
let usuarioLogado = null;

let gavetaAtualAberta = null;
let pecaSendoConferidaId = null;
let gavetaSendoEditadaId = null;
let pecaSendoEditadaId = null;

// =========================================================================
// UTILITÁRIO: UPLOAD DE IMAGEM PARA O CLOUDINARY
// Retorna a URL pública da imagem após o upload.
// O Firestore só guarda essa URL curta — nunca mais base64.
// =========================================================================
async function uploadImagemCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(CLOUDINARY_URL, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Erro no upload: ${response.statusText}`);
    }

    const data = await response.json();
    return data.secure_url; // URL pública HTTPS da imagem
}

// =========================================================================
// INICIALIZAÇÃO E SINCRONIZAÇÃO FIREBASE (ONSNAPSHOT)
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

function iniciarSincronizacaoFirebase() {
    const docRef = doc(db, "manutencao_5s", "dados_sistema");

    onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
            const dados = snapshot.data();
            database = dados.database || defaultDatabase;
            usuariosSalvos = dados.usuarios || [];
            historicoLogs = dados.historico || [];

            database.drawers.forEach(d => {
                if (!database.items[d.id]) database.items[d.id] = [];
                database.items[d.id].forEach(peca => {
                    if (peca.requested === undefined) peca.requested = false;
                    if (peca.lastTakenBy === undefined) peca.lastTakenBy = null;
                });
            });

            if (document.getElementById('app-container').classList.contains('view-active')) {
                atualizarDashboard();
            }
        } else {
            database = JSON.parse(JSON.stringify(defaultDatabase));
            salvarDadosFirebase();
        }
    });
}

async function salvarDadosFirebase() {
    const docRef = doc(db, "manutencao_5s", "dados_sistema");
    try {
        await setDoc(docRef, {
            database: database,
            usuarios: usuariosSalvos,
            historico: historicoLogs
        });
    } catch (error) {
        console.error("Erro ao salvar no Firebase:", error);
        mostrarAlerta("Erro de Conexão", "Não foi possível salvar os dados na nuvem.");
    }
}

// =========================================================================
// EVENTOS E AUTORIZAÇÃO
// =========================================================================
function configurarEventosEnter() {
    const mapeamentoEnter = [
        { inputId: 'input-device-key', btnAcao: autorizarDispositivo },
        { inputId: 'input-login-id', btnAcao: realizarLogin },
        { inputId: 'input-login-senha', btnAcao: realizarLogin },
        { inputId: 'reg-senha', btnAcao: registrarUsuario },
        { inputId: 'conf-qtd-atual', btnAcao: salvarConferencia },
        { inputId: 'edit-gaveta-nome', btnAcao: salvarNomeGaveta },
        { inputId: 'novo-atual', btnAcao: salvarNovoItem },
        { inputId: 'edit-peca-atual', btnAcao: salvarEdicaoPeca }
    ];

    mapeamentoEnter.forEach(item => {
        const elemento = document.getElementById(item.inputId);
        if (elemento) {
            elemento.addEventListener('keypress', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    item.btnAcao();
                }
            });
        }
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
// SISTEMA DE BACKUP E PLANILHAS CSV
// =========================================================================
function fazerBackup() {
    const data = { database: database, usuarios: usuariosSalvos, historico: historicoLogs };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const downloadNode = document.createElement('a');
    downloadNode.setAttribute("href", dataStr);
    downloadNode.setAttribute("download", "backup_5s_manutencao_" + new Date().getTime() + ".json");
    document.body.appendChild(downloadNode);
    downloadNode.click();
    downloadNode.remove();

    registrarLog("fez o download do arquivo de backup do sistema");
}

function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const contents = JSON.parse(e.target.result);
            if (contents.database) database = contents.database;
            if (contents.usuarios) usuariosSalvos = contents.usuarios;
            if (contents.historico) historicoLogs = contents.historico;

            salvarDadosFirebase();
            mostrarAlerta('Sucesso', 'Backup restaurado com sucesso para a nuvem!');
            registrarLog("restaurou um arquivo de backup no sistema");
            atualizarDashboard();
        } catch (err) {
            mostrarAlerta('Erro', 'O arquivo selecionado é inválido ou está corrompido.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function exportarEstoqueCSV() {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Gaveta,Codigo_Local,Peca,Padrao_5S,Fisica_Atual,Status\n";

    database.drawers.forEach(gaveta => {
        const pecas = database.items[gaveta.id] || [];
        pecas.forEach(peca => {
            const status = getStatusText(getPecaStatus(peca));
            const gavetaNome = `"${gaveta.label} - ${gaveta.title}"`;
            const pecaNome = `"${peca.name}"`;
            const codigo = `"${peca.code || ''}"`;
            csvContent += `${gavetaNome},${codigo},${pecaNome},${peca.expected},${peca.current},"${status}"\n`;
        });
    });

    baixarArquivoCSV(csvContent, "estoque_atual_5s.csv");
    registrarLog("exportou a planilha Excel de Estoque");
}

function exportarHistoricoCSV() {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Data_Hora,Usuario,Acao\n";

    historicoLogs.forEach(log => {
        const acao = `"${log.acao.replace(/"/g, '""')}"`;
        csvContent += `"${log.data}","${log.usuario}",${acao}\n`;
    });

    baixarArquivoCSV(csvContent, "historico_atividades_5s.csv");
    registrarLog("exportou a planilha Excel do Histórico");
}

function baixarArquivoCSV(content, filename) {
    const encodedUri = encodeURI(content);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
}

// =========================================================================
// SISTEMA DE LOGS E RASTREABILIDADE
// =========================================================================
function registrarLog(acao) {
    const dataAtual = new Date();
    const dataFormatada = dataAtual.toLocaleDateString('pt-BR') + ' às ' + dataAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const novoLog = {
        id: Date.now(),
        usuario: usuarioLogado ? usuarioLogado.nome : 'Sistema',
        acao: acao,
        data: dataFormatada
    };

    historicoLogs.unshift(novoLog);
    if (historicoLogs.length > 500) { historicoLogs.pop(); }

    salvarDadosFirebase();
}

function renderizarHistorico() {
    const container = document.getElementById('lista-historico');
    if (!container) return;

    container.innerHTML = '';

    if (historicoLogs.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Nenhum registro encontrado ainda.</p>';
        return;
    }

    historicoLogs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'log-item';
        div.innerHTML = `
            <div class="log-time"><i class="fa-regular fa-calendar"></i> ${log.data}</div>
            <div class="log-text"><strong>${log.usuario}</strong> ${log.acao}</div>
        `;
        container.appendChild(div);
    });
}

// =========================================================================
// SISTEMA DE NOTIFICAÇÕES NATIVAS
// =========================================================================
function solicitarPermissaoNotificacao() {
    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }
}

function enviarNotificacao(titulo, mensagem) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(titulo, {
            body: mensagem,
            icon: "https://cdn-icons-png.flaticon.com/512/825/825503.png"
        });
    }
}

// =========================================================================
// MENU MOBILE E REGRAS DE CORES
// =========================================================================
function toggleMenuMobile() {
    document.getElementById('sidebar-menu').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('open');
}

function getPecaStatus(peca) {
    if (peca.requested) return 'amarelo';
    if (peca.current === 0) return 'vermelho';
    if (peca.current < peca.expected) return 'laranja';
    return 'verde';
}

function getGavetaStatus(pecas) {
    if (pecas.length === 0) return 'verde';

    let hasAmarelo = false;
    let hasLaranja = false;
    let hasVermelho = false;

    pecas.forEach(p => {
        const s = getPecaStatus(p);
        if (s === 'vermelho') hasVermelho = true;
        if (s === 'laranja') hasLaranja = true;
        if (s === 'amarelo') hasAmarelo = true;
    });

    if (hasVermelho) return 'vermelho';
    if (hasLaranja) return 'laranja';
    if (hasAmarelo) return 'amarelo';
    return 'verde';
}

function getStatusText(status) {
    switch (status) {
        case 'verde': return 'Estoque Cheio';
        case 'amarelo': return 'Requisitado';
        case 'laranja': return 'Poucas Peças';
        case 'vermelho': return 'Sem Estoque';
    }
}

// =========================================================================
// CONTROLE DE LOGIN E USUÁRIOS
// =========================================================================
function alternarTelaLogin() {
    const formEntrar = document.getElementById('form-entrar');
    const formRegistrar = document.getElementById('form-registrar');

    if (formEntrar.classList.contains('view-hidden')) {
        formEntrar.classList.replace('view-hidden', 'view-active');
        formRegistrar.classList.replace('view-active', 'view-hidden');
    } else {
        formEntrar.classList.replace('view-active', 'view-hidden');
        formRegistrar.classList.replace('view-hidden', 'view-active');
    }
}

function registrarUsuario() {
    const nome = document.getElementById('reg-nome').value.trim();
    const cracha = document.getElementById('reg-cracha').value.trim();
    const senha = document.getElementById('reg-senha').value.trim();

    if (!nome || !cracha || !senha) return mostrarAlerta('Erro', 'Preencha todos os campos!');

    if (usuariosSalvos.find(u => u.cracha === cracha)) {
        return mostrarAlerta('Erro', 'Crachá já cadastrado! Volte ao login.');
    }

    const novoUser = { nome, cracha, senha, role: 'USER' };
    usuariosSalvos.push(novoUser);

    salvarDadosFirebase();
    aplicarLogin(novoUser);
}

function realizarLogin() {
    const idAcesso = document.getElementById('input-login-id').value.trim();
    const senhaAcesso = document.getElementById('input-login-senha').value.trim();

    if (!idAcesso || !senhaAcesso) return mostrarAlerta('Erro', 'Preencha os dados de acesso.');

    if (idAcesso === ADMIN_CREDENTIALS.login && senhaAcesso === ADMIN_CREDENTIALS.senha) {
        aplicarLogin({ nome: 'Administrador', cracha: 'Admin', role: 'ADMIN' });
        return;
    }

    const user = usuariosSalvos.find(u => u.cracha === idAcesso && u.senha === senhaAcesso);
    if (user) aplicarLogin(user);
    else mostrarAlerta('Acesso Negado', 'Crachá ou Senha incorretos. Tente novamente.');
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
    document.getElementById('reg-senha').value = '';

    solicitarPermissaoNotificacao();
    atualizarDashboard();
}

// =========================================================================
// NAVEGAÇÃO
// =========================================================================
function mostrarTela(id) {
    document.getElementById('view-gavetas').classList.replace('view-active', 'view-hidden');
    document.getElementById('view-compartimentos').classList.replace('view-active', 'view-hidden');
    document.getElementById('view-historico').classList.replace('view-active', 'view-hidden');
    document.getElementById('view-config').classList.replace('view-active', 'view-hidden');

    document.getElementById(id).classList.replace('view-hidden', 'view-active');

    document.getElementById('sidebar-menu').classList.remove('open');
    document.getElementById('mobile-overlay').classList.remove('open');

    if (id === 'view-gavetas') gavetaAtualAberta = null;
    if (id === 'view-historico') renderizarHistorico();

    window.scrollTo(0, 0);
}

function voltarParaGavetas() { mostrarTela('view-gavetas'); }
function sairDoSistema() { location.reload(); }

// =========================================================================
// DASHBOARD
// =========================================================================
function atualizarDashboard() {
    renderArmarioVertical();
    calcularKPIs();
    verificarEstoqueZerado();
    renderizarHistorico();

    if (gavetaAtualAberta !== null) {
        renderizarPecasDaGaveta(gavetaAtualAberta);
    }
}

function verificarEstoqueZerado() {
    let qtdZerados = 0;
    database.drawers.forEach(gaveta => {
        database.items[gaveta.id].forEach(peca => { if (peca.current === 0) qtdZerados++; });
    });

    const alertaBanner = document.getElementById('alerta-global-zerado');
    if (qtdZerados > 0) {
        alertaBanner.classList.remove('view-hidden');
        document.getElementById('texto-alerta-zerado').innerHTML = `<strong>Atenção:</strong> Existem <strong>${qtdZerados} item(ns)</strong> com estoque ZERADO no armário!`;
    } else alertaBanner.classList.add('view-hidden');
}

function calcularKPIs() {
    let gavetasComAlertas = 0;
    const listaHtml = document.getElementById('kpi-lista-gavetas');
    listaHtml.innerHTML = '';

    database.drawers.forEach(gaveta => {
        const pecas = database.items[gaveta.id];
        const statusGaveta = getGavetaStatus(pecas);
        const textoStatus = getStatusText(statusGaveta);

        const div = document.createElement('div');
        div.className = `kpi-status-item ${statusGaveta}`;
        const icone = statusGaveta === 'verde' ? 'check' : 'exclamation';

        div.innerHTML = `<i class="fa-solid fa-circle-${icone}"></i> ${gaveta.label}: ${textoStatus}`;
        listaHtml.appendChild(div);
        if (statusGaveta !== 'verde') gavetasComAlertas++;
    });

    document.getElementById('kpi-pendencias-count').innerText = gavetasComAlertas;
}

function renderArmarioVertical() {
    const chassi = document.getElementById('menu-gavetas');
    chassi.innerHTML = '';

    database.drawers.forEach(gaveta => {
        const pecas = database.items[gaveta.id];
        const statusGaveta = getGavetaStatus(pecas);

        const div = document.createElement('button');
        div.className = 'btn-gaveta';
        div.onclick = () => abrirGaveta(gaveta.id);

        div.innerHTML = `
            <div class="gaveta-content">
                <span class="gnumber">${gaveta.label}</span>
                <span class="glabel">${gaveta.title}</span>
                <button class="btn-edit-gaveta admin-only" onclick="abrirModalEditarGaveta(event, ${gaveta.id})" title="Renomear Gaveta">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <div class="gstatus-light ${statusGaveta}"></div>
            </div>
        `;
        chassi.appendChild(div);
    });
}

// =========================================================================
// EDIÇÃO DE GAVETA
// =========================================================================
function abrirModalEditarGaveta(eventoClick, idGaveta) {
    eventoClick.stopPropagation();
    gavetaSendoEditadaId = idGaveta;
    const gaveta = database.drawers.find(d => d.id === idGaveta);

    document.getElementById('edit-gaveta-nome').value = gaveta.title;
    document.getElementById('modal-editar-gaveta').classList.remove('view-hidden');
    setTimeout(() => { document.getElementById('edit-gaveta-nome').focus(); }, 100);
}

function fecharModalEditarGaveta() { document.getElementById('modal-editar-gaveta').classList.add('view-hidden'); }

function salvarNomeGaveta() {
    const novoNome = document.getElementById('edit-gaveta-nome').value.trim();
    if (!novoNome) return mostrarAlerta('Atenção', 'O nome da gaveta não pode ficar vazio.');

    const gaveta = database.drawers.find(d => d.id === gavetaSendoEditadaId);
    const nomeAntigo = gaveta.title;
    gaveta.title = novoNome;

    registrarLog(`alterou o nome da gaveta ${gaveta.label} de "${nomeAntigo}" para "${novoNome}"`);
    salvarDadosFirebase();
    fecharModalEditarGaveta();
}

// =========================================================================
// DENTRO DA GAVETA
// =========================================================================
function abrirGaveta(idGaveta) {
    gavetaAtualAberta = idGaveta;
    const gaveta = database.drawers.find(d => d.id === idGaveta);
    document.getElementById('titulo-gaveta-aberta').innerText = `${gaveta.label}: ${gaveta.title}`;

    renderizarPecasDaGaveta(idGaveta);
    mostrarTela('view-compartimentos');
}

function renderizarPecasDaGaveta(idGaveta) {
    const grid = document.getElementById('grid-pecas');
    grid.innerHTML = '';
    const pecas = database.items[idGaveta];

    if (pecas.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #64748b; font-size: 1.1rem; padding: 40px;">Nenhuma peça cadastrada nesta gaveta.</p>';
        return;
    }

    pecas.forEach(peca => {
        const statusPeca = getPecaStatus(peca);
        const textoStatus = getStatusText(statusPeca);
        const corTextoQtd = statusPeca === 'verde' ? 'var(--status-verde)' : 'var(--text-primary)';

        const imagemHtml = peca.image
            ? `<img src="${peca.image}" alt="${peca.name}">`
            : `<i class="fa-solid fa-microchip"></i>`;
        const infoRetiradaHtml = peca.lastTakenBy
            ? `<div class="last-taken-info"><i class="fa-solid fa-clock-rotate-left"></i> Último a retirar: <strong>${peca.lastTakenBy}</strong></div>`
            : '';

        const div = document.createElement('div');
        div.className = 'compartimento-card';
        div.innerHTML = `
            <div class="card-top">
                <div>
                    <span class="card-local">${peca.code || 'S/N'}</span>
                    <button class="btn-edit-peca admin-only" onclick="window.abrirModalEditarPeca(${peca.id})" title="Editar Peça"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-excluir admin-only" onclick="window.excluirPeca(${peca.id})" title="Excluir Peça"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="badge-status ${statusPeca}">${textoStatus}</div>
            </div>
            <div class="card-title">${peca.name}</div>
            <div class="card-image-box">${imagemHtml}</div>
            <div class="card-data-row">
                <div class="data-box"><span>Padrão 5S</span><strong>${peca.expected}</strong></div>
                <div class="data-box">
                    <span>Física Atual</span>
                    <div class="quick-control">
                        <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, -1)"><i class="fa-solid fa-minus"></i></button>
                        <strong style="color: ${corTextoQtd}">${peca.current}</strong>
                        <button class="btn-quick" onclick="window.ajusteRapidoEstoque(${peca.id}, 1)"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </div>
            </div>
            ${infoRetiradaHtml}
            <div class="botoes-acao-card">
                <button class="btn-conferir" onclick="window.abrirModalConferencia(${peca.id})"><i class="fa-solid fa-clipboard-check"></i> Definir Contagem Exata</button>
                <button class="btn-requisitado ${peca.requested ? 'ativo' : ''}" onclick="window.alternarStatusRequisitado(${peca.id})"><i class="fa-solid fa-cart-arrow-down"></i> ${peca.requested ? 'Já Requisitado' : 'Marcar como Requisitado'}</button>
                <button class="btn-mover admin-only" onclick="window.abrirModalMoverPeca(${peca.id})"><i class="fa-solid fa-right-left"></i> Mover para outra Gaveta</button>
            </div>
        `;
        grid.appendChild(div);
    });
}

function ajusteRapidoEstoque(idPeca, delta) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    let novaQtd = peca.current + delta;
    if (novaQtd < 0) novaQtd = 0;

    if (delta < 0 && peca.current > 0) {
        peca.lastTakenBy = usuarioLogado.nome;
        registrarLog(`retirou 1 unidade da peça "${peca.name}" (Local: ${peca.code})`);
        enviarNotificacao("Peça Retirada", `Você retirou 1x ${peca.name}. Estoque restou com ${novaQtd} peça(s).`);
    } else if (delta > 0) {
        registrarLog(`adicionou 1 unidade da peça "${peca.name}" (Local: ${peca.code})`);
    }

    peca.current = novaQtd;
    if (peca.current >= peca.expected) peca.requested = false;

    salvarDadosFirebase();
}

function alternarStatusRequisitado(idPeca) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    peca.requested = !peca.requested;
    const statusTexto = peca.requested ? 'marcou como REQUISITADO' : 'removeu o status requisitado de';
    registrarLog(`${statusTexto} a peça "${peca.name}"`);
    salvarDadosFirebase();
}

function excluirPeca(idPeca) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (confirm(`Tem certeza que deseja excluir a peça "${peca.name}" da gaveta?`)) {
        database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== idPeca);
        registrarLog(`excluiu a peça "${peca.name}" do sistema`);
        salvarDadosFirebase();
    }
}

// =========================================================================
// MOVER PEÇA ENTRE GAVETAS
// =========================================================================
let pecaSendoMovidaId = null;

function abrirModalMoverPeca(idPeca) {
    pecaSendoMovidaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);

    document.getElementById('mover-peca-nome').innerText = peca.name;

    const select = document.getElementById('mover-destino-select');
    select.innerHTML = '';

    database.drawers.forEach(gaveta => {
        if (gaveta.id === gavetaAtualAberta) return; // pula gaveta atual
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

function confirmarMoverPeca() {
    const select = document.getElementById('mover-destino-select');
    const destinoId = parseInt(select.value);

    const gavetaOrigem = database.drawers.find(d => d.id === gavetaAtualAberta);
    const gavetaDestino = database.drawers.find(d => d.id === destinoId);
    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoMovidaId);

    // Move a peça
    database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== pecaSendoMovidaId);
    if (!database.items[destinoId]) database.items[destinoId] = [];
    database.items[destinoId].push(peca);

    registrarLog(`moveu a peça "${peca.name}" da ${gavetaOrigem.label} (${gavetaOrigem.title}) para ${gavetaDestino.label} (${gavetaDestino.title})`);
    salvarDadosFirebase();
    fecharModalMoverPeca();
}

// =========================================================================
// GERENCIAMENTO DE PEÇAS
// =========================================================================
function abrirModalCadastro() {
    document.getElementById('novo-codigo').value = '';
    document.getElementById('novo-nome').value = '';
    document.getElementById('novo-esperado').value = '1';
    document.getElementById('novo-atual').value = '0';
    document.getElementById('novo-imagem').value = '';
    document.getElementById('modal-cadastro').classList.remove('view-hidden');
    setTimeout(() => { document.getElementById('novo-nome').focus(); }, 100);
}

function fecharModalCadastro() { document.getElementById('modal-cadastro').classList.add('view-hidden'); }

// ----- SALVAR NOVA PEÇA (upload para Cloudinary) -----
async function salvarNovoItem() {
    const codigo = document.getElementById('novo-codigo').value.trim();
    const nome = document.getElementById('novo-nome').value.trim();
    const esperado = parseInt(document.getElementById('novo-esperado').value);
    const atual = parseInt(document.getElementById('novo-atual').value);
    const imagemInput = document.getElementById('novo-imagem');

    if (nome === '') return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');

    const btnSalvar = document.querySelector('#modal-cadastro .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const novaPeca = {
        id: Date.now(),
        code: codigo || `G${gavetaAtualAberta}-P${database.items[gavetaAtualAberta].length + 1}`,
        name: nome,
        expected: esperado,
        current: atual,
        requested: false,
        lastTakenBy: null,
        image: null
    };

    if (imagemInput.files && imagemInput.files[0]) {
        try {
            novaPeca.image = await uploadImagemCloudinary(imagemInput.files[0]);
        } catch (err) {
            console.error("Erro no upload Cloudinary:", err);
            mostrarAlerta('Aviso', 'Não foi possível enviar a foto. A peça será salva sem imagem.');
        }
    }

    database.items[gavetaAtualAberta].push(novaPeca);
    registrarLog(`cadastrou a nova peça "${novaPeca.name}" (Local: ${novaPeca.code}) com ${atual} un. iniciais.`);
    salvarDadosFirebase();
    fecharModalCadastro();

    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Peça'; }
}

function abrirModalEditarPeca(idPeca) {
    pecaSendoEditadaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);

    document.getElementById('edit-peca-codigo').value = peca.code || '';
    document.getElementById('edit-peca-nome').value = peca.name;
    document.getElementById('edit-peca-esperado').value = peca.expected;
    document.getElementById('edit-peca-atual').value = peca.current;
    document.getElementById('edit-peca-imagem').value = '';
    document.getElementById('modal-editar-peca').classList.remove('view-hidden');
    setTimeout(() => { document.getElementById('edit-peca-nome').focus(); }, 100);
}

function fecharModalEditarPeca() { document.getElementById('modal-editar-peca').classList.add('view-hidden'); }

// ----- SALVAR EDIÇÃO (upload para Cloudinary) -----
async function salvarEdicaoPeca() {
    const novoCodigo = document.getElementById('edit-peca-codigo').value.trim();
    const novoNome = document.getElementById('edit-peca-nome').value.trim();
    const novoEsperado = parseInt(document.getElementById('edit-peca-esperado').value);
    const novoAtual = parseInt(document.getElementById('edit-peca-atual').value);
    const imagemInput = document.getElementById('edit-peca-imagem');

    if (novoNome === '') return mostrarAlerta('Erro', 'O nome da peça é obrigatório!');
    if (isNaN(novoEsperado) || isNaN(novoAtual)) return mostrarAlerta('Erro', 'Valores numéricos inválidos.');

    const btnSalvar = document.querySelector('#modal-editar-peca .btn-save');
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...'; }

    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoEditadaId);
    peca.code = novoCodigo;
    peca.name = novoNome;
    peca.expected = novoEsperado;
    peca.current = novoAtual;
    if (peca.current >= peca.expected) peca.requested = false;

    if (imagemInput.files && imagemInput.files[0]) {
        try {
            peca.image = await uploadImagemCloudinary(imagemInput.files[0]);
        } catch (err) {
            console.error("Erro no upload Cloudinary:", err);
            mostrarAlerta('Aviso', 'Não foi possível enviar a nova foto. A imagem anterior foi mantida.');
        }
    }

    registrarLog(`editou as informações da peça "${peca.name}"`);
    salvarDadosFirebase();
    fecharModalEditarPeca();

    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Alterações'; }
}

function abrirModalConferencia(idPeca) {
    pecaSendoConferidaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    document.getElementById('conf-nome-peca').innerText = peca.name;
    document.getElementById('conf-qtd-atual').value = peca.current;
    document.getElementById('modal-conferencia').classList.remove('view-hidden');
    setTimeout(() => { document.getElementById('conf-qtd-atual').focus(); }, 100);
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

    salvarDadosFirebase();
    fecharModalConferencia();
}

function mostrarAlerta(titulo, mensagem) {
    document.getElementById('alerta-titulo').innerText = titulo;
    document.getElementById('alerta-mensagem').innerText = mensagem;
    document.getElementById('modal-alerta').classList.remove('view-hidden');
}
function fecharAlerta() { document.getElementById('modal-alerta').classList.add('view-hidden'); }

// =========================================================================
// GERADOR DE PEDIDO
// =========================================================================
function gerarEmailPedido() {
    let itensFaltando = [];
    database.drawers.forEach(gaveta => {
        database.items[gaveta.id].forEach(peca => {
            if (peca.current < peca.expected) {
                let falta = peca.expected - peca.current;
                itensFaltando.push(`- ${falta} un. | ${peca.name} (Local: ${peca.code})`);
            }
        });
    });

    if (itensFaltando.length === 0) return mostrarAlerta("Tudo em Ordem", "Não há peças faltando no gaveteiro neste momento.");

    const nomeSolicitante = usuarioLogado ? usuarioLogado.nome : 'Manutenção';
    const corpoMensagem = `Olá,\n\nPor favor, solicito a compra/reposição dos seguintes materiais faltantes para o nosso gaveteiro elétrico:\n\n${itensFaltando.join('\n')}\n\nFico no aguardo.\nObrigado,\n${nomeSolicitante}`;

    document.getElementById('texto-pedido-gerado').value = corpoMensagem;
    document.getElementById('modal-pedido').classList.remove('view-hidden');
}

function fecharModalPedido() { document.getElementById('modal-pedido').classList.add('view-hidden'); }

function copiarTextoPedido() {
    const textoArea = document.getElementById('texto-pedido-gerado');
    textoArea.select();
    document.execCommand('copy');

    const btn = event.currentTarget;
    const conteudoOriginal = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
    btn.style.backgroundColor = 'var(--status-verde)';

    registrarLog(`copiou a lista de pedido de peças para envio.`);

    setTimeout(() => {
        btn.innerHTML = conteudoOriginal;
        btn.style.backgroundColor = 'var(--drawer-blue)';
    }, 2000);
}

// =========================================================================
// EXPOSIÇÃO GLOBAL DE FUNÇÕES (MÓDULO)
// =========================================================================
window.toggleMenuMobile = toggleMenuMobile;
window.autorizarDispositivo = autorizarDispositivo;
window.realizarLogin = realizarLogin;
window.alternarTelaLogin = alternarTelaLogin;
window.registrarUsuario = registrarUsuario;
window.mostrarTela = mostrarTela;
window.gerarEmailPedido = gerarEmailPedido;
window.sairDoSistema = sairDoSistema;
window.fazerBackup = fazerBackup;
window.restaurarBackup = restaurarBackup;
window.exportarEstoqueCSV = exportarEstoqueCSV;
window.exportarHistoricoCSV = exportarHistoricoCSV;
window.voltarParaGavetas = voltarParaGavetas;
window.abrirModalCadastro = abrirModalCadastro;
window.fecharModalCadastro = fecharModalCadastro;
window.salvarNovoItem = salvarNovoItem;
window.fecharModalEditarPeca = fecharModalEditarPeca;
window.salvarEdicaoPeca = salvarEdicaoPeca;
window.fecharModalConferencia = fecharModalConferencia;
window.salvarConferencia = salvarConferencia;
window.fecharModalEditarGaveta = fecharModalEditarGaveta;
window.salvarNomeGaveta = salvarNomeGaveta;
window.fecharModalPedido = fecharModalPedido;
window.copiarTextoPedido = copiarTextoPedido;
window.fecharAlerta = fecharAlerta;
window.abrirModalEditarGaveta = abrirModalEditarGaveta;
window.abrirGaveta = abrirGaveta;
window.ajusteRapidoEstoque = ajusteRapidoEstoque;
window.alternarStatusRequisitado = alternarStatusRequisitado;
window.abrirModalConferencia = abrirModalConferencia;
window.excluirPeca = excluirPeca;
window.abrirModalEditarPeca = abrirModalEditarPeca;
window.abrirModalMoverPeca = abrirModalMoverPeca;
window.fecharModalMoverPeca = fecharModalMoverPeca;
window.confirmarMoverPeca = confirmarMoverPeca;

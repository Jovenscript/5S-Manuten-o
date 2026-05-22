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
const db  = getFirestore(app);

const CLOUDINARY_CLOUD_NAME    = 'dxc1zmhbj';
const CLOUDINARY_UPLOAD_PRESET = '5s_manutencao';
const CLOUDINARY_URL           = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const ADMIN_CREDENTIALS = { login: 'admin@weg.net', senha: 'admin123' };
const DEVICE_MASTER_KEY = 'WEG2026';

const GAVETAS_PADRAO = [
    { id: 1,  label: "G1",  title: "Sensores M12"   }, { id: 2,  label: "G2",  title: "Botões e LED's" },
    { id: 3,  label: "G3",  title: "Fusíveis"       }, { id: 4,  label: "G4",  title: "Contatoras"     },
    { id: 5,  label: "G5",  title: "Prensas Cabos"  }, { id: 6,  label: "G6",  title: "Bornes e Relés" },
    { id: 7,  label: "G7",  title: "Abraçadeiras"   }, { id: 8,  label: "G8",  title: "Anilhas"        },
    { id: 9,  label: "G9",  title: "Lâmpadas"       }, { id: 10, label: "G10", title: "Miscelânea 1"   },
    { id: 11, label: "G11", title: "Miscelânea 2"   }, { id: 12, label: "G12", title: "Outros"         }
];

let database = { drawers: [...GAVETAS_PADRAO], items: {} };
GAVETAS_PADRAO.forEach(d => { database.items[d.id] = []; });

let usuariosSalvos  = []; let historicoLogs = []; let usuarioLogado = null;
let gavetaAtualAberta = null; let pecaEmFocoId = null; let draggedDrawerIndex = null; let draggedPecaId = null;

window.onload = () => {
    iniciarPWA(); iniciarSincronizacaoFirebase(); configurarEventosEnter();
    if (localStorage.getItem('5s_device_authorized') === 'true') {
        document.getElementById('view-device-auth').classList.replace('view-active', 'view-hidden');
        document.getElementById('view-login').classList.replace('view-hidden', 'view-active');
    }
};

function iniciarPWA() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
function validarSenhaForte(senha) { return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(senha); }
function getPecaStatus(peca) { if (peca.current === 0) return 'vermelho'; if (peca.current < peca.expected * 0.25) return 'laranja'; if (peca.current < peca.expected) return 'amarelo'; return 'verde'; }
function getStatusText(status) { const map = { verde: 'OK', amarelo: 'Atenção', laranja: 'Crítico', vermelho: 'Zerado' }; return map[status] || 'OK'; }
function getGavetaStatus(pecas) {
    if (!pecas || pecas.length === 0) return 'verde';
    const hasZerado = pecas.some(p => p.current === 0);
    const hasCritico = pecas.some(p => p.current > 0 && p.current < p.expected * 0.25);
    if (hasZerado) return 'vermelho'; if (hasCritico) return 'laranja';
    if (pecas.some(p => p.current < p.expected)) return 'amarelo'; return 'verde';
}

function registrarLog(acao) {
    const data = new Date().toLocaleDateString('pt-BR');
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nome = usuarioLogado ? usuarioLogado.nome : 'Sistema';
    historicoLogs.unshift({ data, hora, nome, acao });
    if (historicoLogs.length > 200) historicoLogs = historicoLogs.slice(0, 200);
    salvarHistorico();
}

function renderizarHistorico() {
    const lista = document.getElementById('lista-historico'); if (!lista) return;
    lista.innerHTML = historicoLogs.length === 0 ? '<p style="text-align:center; padding:30px;">Nenhum registro.</p>' : '';
    historicoLogs.forEach(log => {
        const div = document.createElement('div'); div.className = 'log-item';
        div.innerHTML = `<span class="log-time">${log.data} ${log.hora}</span><span class="log-text"><strong>${log.nome}</strong> ${log.acao}</span>`;
        lista.appendChild(div);
    });
}

function toggleMenuMobile() { document.getElementById('sidebar-menu').classList.toggle('open'); document.getElementById('mobile-overlay').classList.toggle('open'); }

async function uploadImagemCloudinary(file) {
    const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Cloudinary Error`);
    return (await res.json()).secure_url;
}

async function salvarConfig() { try { await setDoc(doc(db, "manutencao_5s", "config"), { drawers: database.drawers, usuarios: usuariosSalvos }); } catch (e) {} }
async function salvarHistorico() { try { await setDoc(doc(db, "manutencao_5s", "historico"), { logs: historicoLogs }); } catch (e) {} }
async function salvarItensDaGaveta(idGaveta) { try { await setDoc(doc(db, "manutencao_5s", `itens_g${idGaveta}`), { items: database.items[idGaveta] || [] }); } catch (e) {} }

async function iniciarSincronizacaoFirebase() {
    onSnapshot(doc(db, "manutencao_5s", "config"), (snap) => {
        if (snap.exists()) {
            const d = snap.data(); database.drawers = d.drawers || [...GAVETAS_PADRAO]; usuariosSalvos = d.usuarios || [];
            database.drawers.forEach(g => { if (!database.items[g.id]) database.items[g.id] = []; });
            registrarListenersGavetas();
        } else { salvarConfig(); registrarListenersGavetas(); }
        if(document.getElementById('view-dashboard').classList.contains('view-active')) atualizarDashboard();
    });
    onSnapshot(doc(db, "manutencao_5s", "historico"), (snap) => { if (snap.exists()) historicoLogs = snap.data().logs || []; renderizarHistorico(); });
}

function registrarListenersGavetas() {
    database.drawers.forEach(gaveta => {
        onSnapshot(doc(db, "manutencao_5s", `itens_g${gaveta.id}`), (snap) => {
            database.items[gaveta.id] = snap.exists() ? (snap.data().items || []) : [];
            // Migração silenciosa de variáveis antigas para o modelo matriz
            database.items[gaveta.id].forEach(p => {
                if (p.coluna === undefined) p.coluna = 1;
                if (p.linha === undefined && p.position !== undefined) p.linha = p.position; // Migra position para linha
                if (p.linha === undefined) p.linha = 'auto';
                if (p.altura === undefined && p.size !== undefined) p.altura = p.size; // Migra size para altura
                if (p.altura === undefined) p.altura = 1;
            });
            if (gavetaAtualAberta === gaveta.id) renderizarPecasDaGaveta(gavetaAtualAberta);
        });
    });
}

function configurarEventosEnter() { /* Mantido */ }
function autorizarDispositivo() {
    if (document.getElementById('input-device-key').value === DEVICE_MASTER_KEY) {
        localStorage.setItem('5s_device_authorized', 'true');
        document.getElementById('view-device-auth').classList.replace('view-active', 'view-hidden');
        document.getElementById('view-login').classList.replace('view-hidden', 'view-active');
    } else { alert('Chave incorreta.'); }
}

function alternarTelaLogin() {
    const fe = document.getElementById('form-entrar'); const fr = document.getElementById('form-registrar');
    fe.classList.toggle('view-hidden'); fe.classList.toggle('view-active');
    fr.classList.toggle('view-hidden'); fr.classList.toggle('view-active');
}

function registrarUsuario() {
    const nome = document.getElementById('reg-nome').value.trim(); const cracha = document.getElementById('reg-cracha').value.trim(); const senha = document.getElementById('reg-senha').value.trim();
    if (!nome || !cracha || !senha) return alert('Preencha tudo!');
    if (!validarSenhaForte(senha)) return alert('Senha Fraca!');
    const novoUser = { nome, cracha, senha, role: 'USER' };
    usuariosSalvos.push(novoUser); salvarConfig(); aplicarLogin(novoUser);
}

function realizarLogin() {
    const id = document.getElementById('input-login-id').value.trim(); const senha = document.getElementById('input-login-senha').value.trim();
    if (id === ADMIN_CREDENTIALS.login && senha === ADMIN_CREDENTIALS.senha) return aplicarLogin({ nome: 'Administrador', cracha: 'Admin', role: 'ADMIN' });
    const user = usuariosSalvos.find(u => u.cracha === id && u.senha === senha);
    if (!user) return alert('Dados incorretos.');
    aplicarLogin(user);
}

function aplicarLogin(user) {
    usuarioLogado = user;
    document.getElementById('usuario-logado-nome').innerText = user.nome;
    document.getElementById('usuario-logado-codigo').innerText = `Crachá: ${user.cracha}`;
    if (user.role === 'ADMIN') { document.body.classList.add('is-admin'); document.getElementById('badge-admin').classList.remove('view-hidden'); } 
    else { document.body.classList.remove('is-admin'); document.getElementById('badge-admin').classList.add('view-hidden'); }
    document.getElementById('view-login').classList.replace('view-active', 'view-hidden');
    document.getElementById('app-container').classList.replace('view-hidden', 'view-active');
    atualizarDashboard(); mostrarTela('view-dashboard');
}

function mostrarTela(id) {
    ['view-dashboard', 'view-gavetas', 'view-compartimentos', 'view-historico', 'view-config'].forEach(v => {
        const el = document.getElementById(v); if (el) el.classList.replace('view-active', 'view-hidden');
    });
    document.getElementById(id).classList.replace('view-hidden', 'view-active');
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    if (event && event.currentTarget && event.currentTarget.classList) event.currentTarget.classList.add('active');
    document.getElementById('sidebar-menu').classList.remove('open'); document.getElementById('mobile-overlay').classList.remove('open');
    if (id === 'view-gavetas' || id === 'view-dashboard') gavetaAtualAberta = null;
}

function voltarParaGavetas() { mostrarTela('view-gavetas'); }
function sairDoSistema() { location.reload(); }

function atualizarDashboard() {
    renderArmarioVertical(); calcularKPIs();
    if (gavetaAtualAberta !== null) renderizarPecasDaGaveta(gavetaAtualAberta);
}

function calcularKPIs() {
    let alerts = 0; const lista = document.getElementById('kpi-lista-gavetas'); if (!lista) return; lista.innerHTML = '';
    database.drawers.forEach(gaveta => {
        const status = getGavetaStatus(database.items[gaveta.id] || []);
        const div = document.createElement('div'); div.className = `kpi-status-item ${status}`;
        div.innerHTML = `<i class="fa-solid fa-circle-${status === 'verde' ? 'check' : 'exclamation'}"></i> ${gaveta.label}: ${getStatusText(status)}`;
        lista.appendChild(div); if (status !== 'verde') alerts++;
    });
    document.getElementById('kpi-pendencias-count').innerText = alerts;
}

function renderArmarioVertical() {
    const chassi = document.getElementById('menu-gavetas'); if (!chassi) return; chassi.innerHTML = '';
    database.drawers.forEach((gaveta, index) => {
        const status = getGavetaStatus(database.items[gaveta.id] || []);
        const div = document.createElement('div'); div.className = 'btn-gaveta';
        div.innerHTML = `
            <div class="gaveta-content">
                <i class="fa-solid fa-grip-vertical drag-handle admin-only" title="Arraste"></i>
                <span class="gnumber">${gaveta.label}</span><span class="glabel">${gaveta.title}</span>
                <button class="btn-edit-gaveta admin-only" onclick="window.abrirModalEditarGaveta(event, ${gaveta.id})"><i class="fa-solid fa-pen"></i></button>
                <div class="gstatus-light ${status}"></div>
            </div>`;
        div.onclick = (e) => { if (!e.target.closest('.btn-edit-gaveta') && !e.target.closest('.drag-handle')) abrirGaveta(gaveta.id); };
        
        // Drag Drop Gavetas (simplificado)
        if (usuarioLogado && usuarioLogado.role === 'ADMIN') {
            div.draggable = true;
            div.ondragstart = (e) => { draggedDrawerIndex = index; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', index); div.classList.add('dragging'); };
            div.ondragover = (e) => { e.preventDefault(); div.classList.add('drag-over'); };
            div.ondragleave = () => div.classList.remove('drag-over');
            div.ondrop = async (e) => {
                e.preventDefault(); div.classList.remove('drag-over');
                if (draggedDrawerIndex !== null && draggedDrawerIndex !== index) {
                    const gavetaArrastada = database.drawers[draggedDrawerIndex];
                    database.drawers.splice(draggedDrawerIndex, 1); database.drawers.splice(index, 0, gavetaArrastada);
                    registrarLog(`reordenou a ${gavetaArrastada.label}`); await salvarConfig(); renderArmarioVertical(); 
                }
            };
            div.ondragend = () => { div.classList.remove('dragging'); draggedDrawerIndex = null; };
        }
        chassi.appendChild(div);
    });
}

// =========================================================================
// O CORAÇÃO DO GAVETEIRO: A COLMEIA EXCEL GRID
// =========================================================================
function abrirGaveta(idGaveta) {
    gavetaAtualAberta = idGaveta;
    const gaveta = database.drawers.find(d => d.id === idGaveta);
    document.getElementById('titulo-gaveta-aberta').innerText = `${gaveta.label}: ${gaveta.title}`;
    renderizarPecasDaGaveta(idGaveta);
    mostrarTela('view-compartimentos');
}

function renderizarPecasDaGaveta(idGaveta) {
    const mainContainer = document.getElementById('matriz-gaveta');
    if (!mainContainer) return;
    mainContainer.innerHTML = '';
    
    const pecas = database.items[idGaveta] || [];

    if (pecas.length === 0) {
        mainContainer.innerHTML = '<div style="grid-column: span 5; text-align:center; padding:40px; color:#94a3b8;">Nenhuma peça cadastrada nesta gaveta.</div>';
        return;
    }

    pecas.forEach(peca => {
        const div = document.createElement('div');
        div.className = 'compartimento-card';
        
        // CSS GRID MÁGICO: Posicionamento exato tipo Excel
        const col = parseInt(peca.coluna) || 1;
        const linha = peca.linha && peca.linha !== 'auto' ? parseInt(peca.linha) : 'auto';
        const span = parseInt(peca.altura) || 1;

        div.style.gridColumn = String(col);
        div.style.gridRow = linha !== 'auto' ? `${linha} / span ${span}` : `span ${span}`;

        const status = getPecaStatus(peca);
        const imgHtml = peca.image 
            ? `<img src="${peca.image}" class="peca-img" draggable="false">` 
            : `<i class="fa-solid fa-microchip peca-icon-placeholder"></i>`;

        // Card Visível
        div.innerHTML = `
            <div class="card-padrao">
                <div class="card-header-clean">
                    <span class="pos-badge">Col ${col} | Linha ${linha !== 'auto' ? linha : '-'}</span>
                    <span class="status-indicator ${status}"></span>
                </div>
                <div class="card-image-clean">${imgHtml}</div>
                <div class="card-info-clean">
                    <div class="codigo-clean">${peca.code || 'S/N'}</div>
                    <div class="nome-clean">${peca.name}</div>
                </div>
            </div>
        `;

        // Clique abre o Drawer/Modal de Detalhes
        div.onclick = () => abrirModalAcoesPeca(peca);

        // Drag and Drop (SWAP CÉLULAS EXCEL)
        if (usuarioLogado && usuarioLogado.role === 'ADMIN') {
            div.draggable = true;
            div.ondragstart = (e) => { draggedPecaId = peca.id; e.dataTransfer.setData('text/plain', peca.id); setTimeout(() => div.classList.add('dragging'), 0); };
            div.ondragover = (e) => { e.preventDefault(); div.classList.add('drag-over'); };
            div.ondragleave = (e) => { if (!div.contains(e.relatedTarget)) div.classList.remove('drag-over'); };
            div.ondrop = async (e) => {
                e.preventDefault(); div.classList.remove('drag-over');
                if (!draggedPecaId || draggedPecaId === peca.id) return;
                
                const pecaArrastada = pecas.find(p => p.id === draggedPecaId);
                const pecaAlvo = peca; 

                // TROCA (SWAP) DE POSIÇÃO ENTRE AS CÉLULAS
                const tempCol = pecaArrastada.coluna;
                const tempLinha = pecaArrastada.linha;
                pecaArrastada.coluna = pecaAlvo.coluna;
                pecaArrastada.linha = pecaAlvo.linha;
                pecaAlvo.coluna = tempCol;
                pecaAlvo.linha = tempLinha;

                registrarLog(`trocou a posição de "${pecaArrastada.name}" com "${pecaAlvo.name}"`);
                await salvarItensDaGaveta(gavetaAtualAberta);
                renderizarPecasDaGaveta(gavetaAtualAberta); 
            };
            div.ondragend = () => { div.classList.remove('dragging'); draggedPecaId = null; };
        }

        mainContainer.appendChild(div);
    });
}

// =========================================================================
// O NOVO DRAWER/MODAL DE DETALHES (SUBSTITUI O HOVER OVERLAY)
// =========================================================================
function abrirModalAcoesPeca(peca) {
    pecaEmFocoId = peca.id;
    const status = getPecaStatus(peca);
    
    document.getElementById('drawer-posicao').innerText = `Col ${peca.coluna || 1} | L. ${peca.linha !== 'auto' ? peca.linha : '-'}`;
    
    const statusBadge = document.getElementById('drawer-status');
    statusBadge.innerText = getStatusText(status).toUpperCase();
    statusBadge.className = `badge-status-color status-indicator ${status}`; // reusa a cor
    statusBadge.style.boxShadow = 'none';

    if (peca.image) {
        document.getElementById('drawer-img').src = peca.image;
        document.getElementById('drawer-img').style.display = 'block';
        document.getElementById('drawer-img-placeholder').style.display = 'none';
    } else {
        document.getElementById('drawer-img').style.display = 'none';
        document.getElementById('drawer-img-placeholder').style.display = 'block';
    }

    document.getElementById('drawer-codigo').innerText = peca.code || 'SEM CÓDIGO';
    document.getElementById('drawer-nome').innerText = peca.name;
    document.getElementById('drawer-qtd-atual').innerText = peca.current;
    document.getElementById('drawer-qtd-ideal').innerText = peca.expected;
    
    document.getElementById('drawer-last-taken').innerText = peca.lastTakenBy ? `Última retirada por: ${peca.lastTakenBy}` : '';

    const btnReq = document.getElementById('drawer-btn-requisitar');
    if (peca.requested) { btnReq.innerHTML = `<i class="fa-solid fa-cart-arrow-down"></i> Já Requisitado`; btnReq.classList.add('ativo'); } 
    else { btnReq.innerHTML = `<i class="fa-solid fa-cart-arrow-down"></i> Requisitar Compra`; btnReq.classList.remove('ativo'); }

    document.getElementById('modal-acoes-peca').classList.remove('view-hidden');
}

function fecharModalAcoesPeca() {
    pecaEmFocoId = null;
    document.getElementById('modal-acoes-peca').classList.add('view-hidden');
}

// Funções acionadas de dentro do Drawer:
window.drawerAjusteRapido = (delta) => {
    ajusteRapidoEstoque(pecaEmFocoId, delta);
    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaEmFocoId);
    document.getElementById('drawer-qtd-atual').innerText = peca.current; // Atualiza a tela na hora
    renderizarPecasDaGaveta(gavetaAtualAberta); // Atualiza o fundo
};

window.drawerAbrirConferencia = () => { fecharModalAcoesPeca(); abrirModalConferencia(pecaEmFocoId); };
window.drawerAlternarRequisitado = () => { 
    alternarStatusRequisitado(pecaEmFocoId); 
    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaEmFocoId);
    const btnReq = document.getElementById('drawer-btn-requisitar');
    if (peca.requested) { btnReq.innerHTML = `<i class="fa-solid fa-cart-arrow-down"></i> Já Requisitado`; btnReq.classList.add('ativo'); } 
    else { btnReq.innerHTML = `<i class="fa-solid fa-cart-arrow-down"></i> Requisitar Compra`; btnReq.classList.remove('ativo'); }
    renderizarPecasDaGaveta(gavetaAtualAberta);
};
window.drawerAbrirMover = () => { fecharModalAcoesPeca(); abrirModalMoverPeca(pecaEmFocoId); };
window.drawerAbrirEditar = () => { fecharModalAcoesPeca(); abrirModalEditarPeca(pecaEmFocoId); };
window.drawerExcluir = () => { fecharModalAcoesPeca(); excluirPeca(pecaEmFocoId); };


// =========================================================================
// CRUD DE PEÇAS (ATUALIZADO PARA EXCEL GRID)
// =========================================================================
function ajusteRapidoEstoque(idPeca, delta) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (!peca) return;
    let novaQtd = Math.max(0, peca.current + delta);
    if (delta < 0 && peca.current > 0) {
        peca.lastTakenBy = usuarioLogado.nome;
        registrarLog(`retirou 1x "${peca.name}"`);
        enviarNotificacao("Peça Retirada", `Você retirou 1x ${peca.name}. Restam ${novaQtd}.`);
    } else if (delta > 0) registrarLog(`adicionou 1x "${peca.name}"`);
    peca.current = novaQtd;
    if (peca.current >= peca.expected) peca.requested = false;
    salvarItensDaGaveta(gavetaAtualAberta);
}

function alternarStatusRequisitado(idPeca) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    peca.requested = !peca.requested;
    registrarLog(`${peca.requested ? 'marcou REQUISITADO' : 'removeu requisitado'} de "${peca.name}"`);
    salvarItensDaGaveta(gavetaAtualAberta);
}

function excluirPeca(idPeca) {
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    if (confirm(`Excluir "${peca.name}" permanentemente?`)) {
        database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== idPeca);
        registrarLog(`excluiu "${peca.name}"`);
        salvarItensDaGaveta(gavetaAtualAberta);
        renderizarPecasDaGaveta(gavetaAtualAberta);
    }
}

function abrirModalCadastro() {
    ['novo-codigo', 'novo-nome', 'novo-posicao'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('novo-esperado').value  = '1';
    document.getElementById('novo-atual').value     = '0';
    document.getElementById('novo-coluna').value    = '1';
    document.getElementById('novo-tamanho').value   = '1'; 
    document.getElementById('novo-imagem').value    = '';
    document.getElementById('modal-cadastro').classList.remove('view-hidden');
}

function fecharModalCadastro() { document.getElementById('modal-cadastro').classList.add('view-hidden'); }

async function salvarNovoItem() {
    const nome = document.getElementById('novo-nome').value.trim();
    if (!nome) return alert('O nome da peça é obrigatório!');
    const btnSalvar = document.querySelector('#modal-cadastro .btn-save'); btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...';

    const novaPeca = {
        id:          Date.now(),
        code:        document.getElementById('novo-codigo').value.trim() || `G${gavetaAtualAberta}-P${Date.now().toString().slice(-4)}`,
        name:        nome, 
        expected:    parseInt(document.getElementById('novo-esperado').value), 
        current:     parseInt(document.getElementById('novo-atual').value), 
        coluna:      parseInt(document.getElementById('novo-coluna').value) || 1,
        linha:       document.getElementById('novo-posicao').value.trim() ? parseInt(document.getElementById('novo-posicao').value) : 'auto',
        altura:      parseInt(document.getElementById('novo-tamanho').value) || 1, 
        requested:   false, 
        lastTakenBy: null, 
        image:       null
    };

    const imgInput = document.getElementById('novo-imagem');
    if (imgInput.files && imgInput.files[0]) {
        try { novaPeca.image = await uploadImagemCloudinary(imgInput.files[0]); } catch (err) {}
    }

    database.items[gavetaAtualAberta].push(novaPeca);
    registrarLog(`cadastrou "${novaPeca.name}".`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    fecharModalCadastro(); btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Peça';
}

function abrirModalEditarPeca(idPeca) {
    pecaSendoEditadaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    document.getElementById('edit-peca-codigo').value    = peca.code || '';
    document.getElementById('edit-peca-nome').value      = peca.name;
    document.getElementById('edit-peca-esperado').value  = peca.expected;
    document.getElementById('edit-peca-atual').value     = peca.current;
    document.getElementById('edit-peca-coluna').value    = peca.coluna || 1;
    document.getElementById('edit-peca-posicao').value   = peca.linha !== 'auto' ? peca.linha : '';
    document.getElementById('edit-peca-tamanho').value   = peca.altura || 1;
    document.getElementById('edit-peca-imagem').value    = '';
    document.getElementById('modal-editar-peca').classList.remove('view-hidden');
}

function fecharModalEditarPeca() { document.getElementById('modal-editar-peca').classList.add('view-hidden'); }

async function salvarEdicaoPeca() {
    const nome = document.getElementById('edit-peca-nome').value.trim();
    if (!nome) return alert('O nome da peça é obrigatório!');
    const btnSalvar = document.querySelector('#modal-editar-peca .btn-save'); btnSalvar.disabled = true; btnSalvar.innerText = 'Aguarde...';

    const peca    = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoEditadaId);
    peca.code     = document.getElementById('edit-peca-codigo').value.trim();
    peca.name     = nome;
    peca.expected = parseInt(document.getElementById('edit-peca-esperado').value);
    peca.current  = parseInt(document.getElementById('edit-peca-atual').value);
    peca.coluna   = parseInt(document.getElementById('edit-peca-coluna').value) || 1;
    peca.linha    = document.getElementById('edit-peca-posicao').value.trim() ? parseInt(document.getElementById('edit-peca-posicao').value) : 'auto';
    peca.altura   = parseInt(document.getElementById('edit-peca-tamanho').value) || 1;

    if (peca.current >= peca.expected) peca.requested = false;

    const imgInput = document.getElementById('edit-peca-imagem');
    if (imgInput.files && imgInput.files[0]) {
        try { peca.image = await uploadImagemCloudinary(imgInput.files[0]); } catch (err) {}
    }

    registrarLog(`editou "${peca.name}"`);
    await salvarItensDaGaveta(gavetaAtualAberta);
    fecharModalEditarPeca(); btnSalvar.disabled = false; btnSalvar.innerText = 'Salvar Alterações';
}

// =========================================================================
// OUTROS MODAIS EXISTENTES (Conferência, Mover, Exportar...)
// =========================================================================
function abrirModalConferencia(idPeca) {
    pecaSendoConferidaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    document.getElementById('conf-nome-peca').innerText = peca.name;
    document.getElementById('conf-qtd-atual').value     = peca.current;
    document.getElementById('modal-conferencia').classList.remove('view-hidden');
}
function fecharModalConferencia() { document.getElementById('modal-conferencia').classList.add('view-hidden'); }
function salvarConferencia() {
    const novaQtd = parseInt(document.getElementById('conf-qtd-atual').value);
    if (isNaN(novaQtd) || novaQtd < 0) return alert('Valor Inválido');
    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoConferidaId);
    if (novaQtd !== peca.current) registrarLog(`contagem de "${peca.name}": ${novaQtd}`);
    if (novaQtd < peca.current) peca.lastTakenBy = usuarioLogado.nome;
    peca.current = novaQtd;
    if (peca.current >= peca.expected) peca.requested = false;
    salvarItensDaGaveta(gavetaAtualAberta); fecharModalConferencia(); renderizarPecasDaGaveta(gavetaAtualAberta);
}

function abrirModalMoverPeca(idPeca) {
    pecaSendoMovidaId = idPeca;
    const peca = database.items[gavetaAtualAberta].find(p => p.id === idPeca);
    document.getElementById('mover-peca-nome').innerText = peca.name;
    const select = document.getElementById('mover-destino-select'); select.innerHTML = '';
    database.drawers.forEach(gaveta => {
        if (gaveta.id === gavetaAtualAberta) return;
        const option = document.createElement('option'); option.value = gaveta.id; option.innerText = `${gaveta.label} — ${gaveta.title}`; select.appendChild(option);
    });
    document.getElementById('modal-mover-peca').classList.remove('view-hidden');
}
function fecharModalMoverPeca() { document.getElementById('modal-mover-peca').classList.add('view-hidden'); }
async function confirmarMoverPeca() {
    const destinoId = parseInt(document.getElementById('mover-destino-select').value);
    const peca = database.items[gavetaAtualAberta].find(p => p.id === pecaSendoMovidaId);
    database.items[gavetaAtualAberta] = database.items[gavetaAtualAberta].filter(p => p.id !== pecaSendoMovidaId);
    if (!database.items[destinoId]) database.items[destinoId] = []; database.items[destinoId].push(peca);
    registrarLog(`moveu a peça "${peca.name}"`);
    await salvarItensDaGaveta(gavetaAtualAberta); await salvarItensDaGaveta(destinoId); fecharModalMoverPeca(); renderizarPecasDaGaveta(gavetaAtualAberta);
}

function abrirModalEditarGaveta(eventoClick, idGaveta) {
    eventoClick.stopPropagation(); gavetaSendoEditadaId = idGaveta;
    document.getElementById('edit-gaveta-nome').value = database.drawers.find(d => d.id === idGaveta).title;
    document.getElementById('modal-editar-gaveta').classList.remove('view-hidden');
}
function fecharModalEditarGaveta() { document.getElementById('modal-editar-gaveta').classList.add('view-hidden'); }
function salvarNomeGaveta() {
    const novoNome = document.getElementById('edit-gaveta-nome').value.trim();
    if (!novoNome) return alert('O nome da gaveta não pode ficar vazio.');
    const gaveta = database.drawers.find(d => d.id === gavetaSendoEditadaId);
    registrarLog(`alterou o nome da gaveta ${gaveta.label}`); gaveta.title = novoNome;
    salvarConfig(); fecharModalEditarGaveta();
}

function fecharModalPedido() { document.getElementById('modal-pedido').classList.add('view-hidden'); }
function mostrarAlerta(titulo, mensagem) { alert(titulo + ": " + mensagem); }
function fecharAlerta() {} // fallback

// EXPORTAÇÕES GLOBAIS
window.toggleMenuMobile = toggleMenuMobile; window.autorizarDispositivo = autorizarDispositivo; window.realizarLogin = realizarLogin;
window.alternarTelaLogin = alternarTelaLogin; window.registrarUsuario = registrarUsuario; window.mostrarTela = mostrarTela;
window.sairDoSistema = sairDoSistema; window.fazerBackup = fazerBackup; window.restaurarBackup = restaurarBackup;
window.exportarEstoqueCSV = exportarEstoqueCSV; window.exportarHistoricoCSV = exportarHistoricoCSV; window.voltarParaGavetas = voltarParaGavetas;
window.abrirModalCadastro = abrirModalCadastro; window.fecharModalCadastro = fecharModalCadastro; window.salvarNovoItem = salvarNovoItem;
window.abrirModalEditarPeca = abrirModalEditarPeca; window.fecharModalEditarPeca = fecharModalEditarPeca; window.salvarEdicaoPeca = salvarEdicaoPeca;
window.abrirModalConferencia = abrirModalConferencia; window.fecharModalConferencia = fecharModalConferencia; window.salvarConferencia = salvarConferencia;
window.abrirModalEditarGaveta = abrirModalEditarGaveta; window.fecharModalEditarGaveta = fecharModalEditarGaveta; window.salvarNomeGaveta = salvarNomeGaveta;
window.abrirModalMoverPeca = abrirModalMoverPeca; window.fecharModalMoverPeca = fecharModalMoverPeca; window.confirmarMoverPeca = confirmarMoverPeca;
window.ajusteRapidoEstoque = ajusteRapidoEstoque; window.alternarStatusRequisitado = alternarStatusRequisitado; window.excluirPeca = excluirPeca;
window.fecharModalAcoesPeca = fecharModalAcoesPeca;

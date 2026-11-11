// ================================================================
//  ADMIN — Cardápio Dolla
// ================================================================

// --- Definição das abas ---
const CATEGORIAS = [
    { id: 'pastel_tradicional', label: '🥟 Pastéis Trad.' },
    { id: 'pastel_especial',    label: '⭐ Pastéis Esp.'  },
    { id: 'pizza',              label: '🍕 Pizzas'         },
    { id: 'pizza_tamanho',      label: '📏 Tamanhos'       },
    { id: 'esfirra_salgada',    label: '🥙 Esf. Salgadas' },
    { id: 'esfirra_doce',       label: '🍯 Esf. Doces'    },
    { id: 'refrigerante',       label: '🥤 Refrigerantes'  },
    { id: 'config',             label: '⚙️ Config'         },
];

// Categorias que têm preço individual por item
const TEM_PRECO_PROPRIO = new Set(['pizza_tamanho', 'refrigerante']);

// Mapeamento categoria → chave no menu_config (preço compartilhado)
const PRECO_CONFIG = {
    pastel_tradicional: 'pastel_tradicional',
    pastel_especial:    'pastel_especial',
    esfirra_salgada:    'esfirra_salgada',
    esfirra_doce:       'esfirra_doce',
};

// --- Estado global ---
let tabAtual      = 'pastel_tradicional';
let unsubProdutos = null;
let produtos      = [];
let configData    = {};
let modalMode     = 'add';   // 'add' | 'edit'
let modalProdId   = null;

// ================================================================
//  BOOT
// ================================================================
auth.onAuthStateChanged(user => {
    if (!user) { location.href = 'admin-login.html'; return; }
    iniciar();
});

function iniciar() {
    construirTabs();
    carregarConfig();
    trocarTab('pastel_tradicional');

    document.getElementById('btn-logout').onclick = () =>
        auth.signOut().then(() => { location.href = 'admin-login.html'; });

    document.getElementById('btn-add').onclick = () => abrirModalAdd();
    document.getElementById('modal-cancelar').onclick = fecharModal;
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-overlay')) fecharModal();
    });
    document.getElementById('modal-salvar').onclick = salvarModal;
    document.getElementById('modal-nome').addEventListener('keydown', e => {
        if (e.key === 'Enter') salvarModal();
    });

    document.getElementById('btn-salvar-config').onclick = salvarConfig;
    document.getElementById('btn-seed').onclick = seedProdutos;
}

// ================================================================
//  TABS
// ================================================================
function construirTabs() {
    const nav = document.getElementById('tab-nav');
    CATEGORIAS.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = cat.label;
        btn.dataset.tab = cat.id;
        btn.className = 'tab-btn';
        btn.onclick = () => trocarTab(cat.id);
        nav.appendChild(btn);
    });
}

function trocarTab(id) {
    tabAtual = id;

    document.querySelectorAll('.tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === id));

    if (unsubProdutos) { unsubProdutos(); unsubProdutos = null; }

    const isConfig = id === 'config';
    document.getElementById('produtos-section').style.display = isConfig ? 'none' : 'block';
    document.getElementById('config-section').style.display   = isConfig ? 'block' : 'none';
    document.getElementById('btn-add').style.display          = isConfig ? 'none' : 'flex';

    if (!isConfig) {
        exibirInfoCategoria(id);
        carregarProdutos(id);
    } else {
        renderizarConfig();
    }
}

// ================================================================
//  PRODUTOS — leitura em tempo real
// ================================================================
function carregarProdutos(cat) {
    document.getElementById('lista-produtos').innerHTML =
        '<li class="lista-loading">Carregando...</li>';

    unsubProdutos = db.collection('menu')
        .where('categoria', '==', cat)
        .onSnapshot(snap => {
            produtos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            produtos.sort((a, b) => (a.ordem || 999) - (b.ordem || 999));
            renderizarLista(produtos);
        });
}

function renderizarLista(lista) {
    const ul = document.getElementById('lista-produtos');
    ul.innerHTML = '';

    if (!lista.length) {
        ul.innerHTML = `<li class="lista-vazia">
            Nenhum produto nesta categoria.<br>
            Clique em <strong>+ Adicionar produto</strong> ou use <em>Importar cardápio padrão</em> em Config.
        </li>`;
        return;
    }

    lista.forEach(p => {
        const li = document.createElement('li');
        li.className = 'prod-item' + (p.ativo ? '' : ' inativo');

        const precoStr = p.preco != null
            ? `R$ ${Number(p.preco).toFixed(2).replace('.', ',')}`
            : '';

        li.innerHTML = `
            <span class="prod-status">${p.ativo ? '🟢' : '🔴'}</span>
            <div class="prod-info">
                <div class="prod-nome" title="${p.nome}">${p.nome}</div>
                ${precoStr ? `<div class="prod-preco">${precoStr}</div>` : ''}
            </div>
            <div class="prod-acoes">
                <button class="btn-toggle-${p.ativo ? 'on' : 'off'}" data-id="${p.id}">
                    ${p.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button class="btn-editar" data-id="${p.id}">✏️</button>
                <button class="btn-remover" data-id="${p.id}" title="Remover">🗑️</button>
            </div>`;

        li.querySelector('.btn-toggle-' + (p.ativo ? 'on' : 'off')).onclick = () =>
            toggleProduto(p.id, !p.ativo);
        li.querySelector('.btn-editar').onclick  = () => abrirModalEditar(p);
        li.querySelector('.btn-remover').onclick = () => confirmarRemover(p);

        ul.appendChild(li);
    });
}

// ================================================================
//  CRUD
// ================================================================
async function toggleProduto(id, novoEstado) {
    try {
        await db.collection('menu').doc(id).update({ ativo: novoEstado });
    } catch (e) { alert('Erro: ' + e.message); }
}

async function confirmarRemover(prod) {
    if (!confirm(`Remover "${prod.nome}"?\nEsta ação não pode ser desfeita.`)) return;
    try {
        await db.collection('menu').doc(prod.id).delete();
    } catch (e) { alert('Erro: ' + e.message); }
}

// ================================================================
//  MODAL — adicionar / editar
// ================================================================
function abrirModalAdd() {
    modalMode = 'add';
    modalProdId = null;
    document.getElementById('modal-titulo').textContent = 'Adicionar Produto';
    document.getElementById('modal-nome').value  = '';
    document.getElementById('modal-preco').value = '';
    document.getElementById('modal-ativo').checked = true;
    document.getElementById('campo-preco').style.display =
        TEM_PRECO_PROPRIO.has(tabAtual) ? 'block' : 'none';
    abrirModal();
    document.getElementById('modal-nome').focus();
}

function abrirModalEditar(prod) {
    modalMode = 'edit';
    modalProdId = prod.id;
    document.getElementById('modal-titulo').textContent = 'Editar Produto';
    document.getElementById('modal-nome').value  = prod.nome;
    document.getElementById('modal-preco').value = prod.preco != null ? prod.preco : '';
    document.getElementById('modal-ativo').checked = prod.ativo !== false;
    document.getElementById('campo-preco').style.display =
        TEM_PRECO_PROPRIO.has(tabAtual) ? 'block' : 'none';
    abrirModal();
    document.getElementById('modal-nome').focus();
}

function abrirModal() {
    document.getElementById('modal-overlay').classList.add('aberto');
}

function fecharModal() {
    document.getElementById('modal-overlay').classList.remove('aberto');
}

async function salvarModal() {
    const nome  = document.getElementById('modal-nome').value.trim();
    if (!nome) { alert('Informe o nome do produto.'); return; }

    const temPreco  = TEM_PRECO_PROPRIO.has(tabAtual);
    const precoRaw  = document.getElementById('modal-preco').value;
    const preco     = temPreco && precoRaw !== '' ? parseFloat(precoRaw) : null;
    const ativo     = document.getElementById('modal-ativo').checked;

    const dados = { nome, categoria: tabAtual, ativo };
    if (preco != null) dados.preco = preco;

    const btn = document.getElementById('modal-salvar');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        if (modalMode === 'add') {
            const maxOrdem = produtos.length
                ? Math.max(...produtos.map(p => p.ordem || 0))
                : 0;
            dados.ordem     = maxOrdem + 1;
            dados.criadoEm  = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('menu').add(dados);
        } else {
            await db.collection('menu').doc(modalProdId).update(dados);
        }
        fecharModal();
    } catch (e) {
        alert('Erro ao salvar: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

// ================================================================
//  BANNER de preço da categoria
// ================================================================
function exibirInfoCategoria(cat) {
    const banner = document.getElementById('categoria-info');
    const key    = PRECO_CONFIG[cat];
    if (key && configData[key] != null) {
        const preco = Number(configData[key]).toFixed(2).replace('.', ',');
        banner.innerHTML = `Preço da categoria: <span>R$ ${preco}</span> — altere em ⚙️ Config`;
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
}

// ================================================================
//  CONFIG — preços de categoria
// ================================================================
const CAMPOS_CONFIG = [
    { key: 'pastel_tradicional',           label: 'Pastéis Tradicionais (preço unitário)'       },
    { key: 'pastel_especial',              label: 'Pastéis Especiais (preço unitário)'           },
    { key: 'esfirra_salgada',              label: 'Esfirras Salgadas (preço unitário)'           },
    { key: 'esfirra_doce',                 label: 'Esfirras Doces (preço unitário)'              },
    { key: 'adicional_ingrediente_pastel', label: 'Acréscimo por ingrediente — Pastéis'          },
    { key: 'adicional_ingrediente_pizza',  label: 'Adicional de ingrediente — Pizza'             },
];

function carregarConfig() {
    db.collection('menu_config').doc('precos').onSnapshot(snap => {
        configData = snap.exists ? snap.data() : {};
        if (tabAtual === 'config') renderizarConfig();
        else exibirInfoCategoria(tabAtual);
    });
}

function renderizarConfig() {
    const form = document.getElementById('config-form');
    form.innerHTML = '';
    CAMPOS_CONFIG.forEach(campo => {
        const div = document.createElement('div');
        div.className = 'config-campo';
        div.innerHTML = `
            <label for="cfg-${campo.key}">${campo.label}</label>
            <div class="preco-wrap">
                <span>R$</span>
                <input id="cfg-${campo.key}" type="number" step="0.01" min="0"
                       value="${configData[campo.key] ?? ''}">
            </div>`;
        form.appendChild(div);
    });
}

async function salvarConfig() {
    const dados = {};
    CAMPOS_CONFIG.forEach(c => {
        const v = parseFloat(document.getElementById('cfg-' + c.key).value);
        if (!isNaN(v)) dados[c.key] = v;
    });
    const btn = document.getElementById('btn-salvar-config');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
        await db.collection('menu_config').doc('precos').set(dados, { merge: true });
        btn.textContent = '✅ Salvo!';
        setTimeout(() => { btn.textContent = '💾 Salvar configurações'; btn.disabled = false; }, 2000);
    } catch (e) {
        alert('Erro: ' + e.message);
        btn.disabled = false;
        btn.textContent = '💾 Salvar configurações';
    }
}

// ================================================================
//  SEED — importar cardápio padrão
// ================================================================
const SEED_PRODUTOS = [
    // Pastéis Tradicionais
    { nome: 'Pastel de Carne',                                              categoria: 'pastel_tradicional', ordem: 1  },
    { nome: 'Pastel de Queijo',                                             categoria: 'pastel_tradicional', ordem: 2  },
    { nome: 'Pastel de Frango',                                             categoria: 'pastel_tradicional', ordem: 3  },
    { nome: 'Pastel de Frango com Palmito',                                 categoria: 'pastel_tradicional', ordem: 4  },
    { nome: 'Pastel de Carne com Queijo',                                   categoria: 'pastel_tradicional', ordem: 5  },
    { nome: 'Pastel de Frango com Queijo',                                  categoria: 'pastel_tradicional', ordem: 6  },
    { nome: 'Pastel de Frango com Catupiry',                                categoria: 'pastel_tradicional', ordem: 7  },
    { nome: 'Pastel de Calabresa com Queijo',                               categoria: 'pastel_tradicional', ordem: 8  },
    { nome: 'Pastel de Bacon com Queijo',                                   categoria: 'pastel_tradicional', ordem: 9  },
    { nome: 'Pastel de Presunto e Queijo',                                  categoria: 'pastel_tradicional', ordem: 10 },
    { nome: 'PIZZA (Queijo, presunto, orégano e azeitona)',                 categoria: 'pastel_tradicional', ordem: 11 },
    { nome: 'BAURU (Queijo, presunto, tomate, orégano)',                    categoria: 'pastel_tradicional', ordem: 12 },
    { nome: 'ESPECIAL DA CASA (Calabresa, catupiry, alho frito e manjericão)', categoria: 'pastel_tradicional', ordem: 13 },
    { nome: 'ESPECIAL DA CASA 2 (Calabresa, catupiry, milho e orégano)',   categoria: 'pastel_tradicional', ordem: 14 },
    { nome: 'ESPECIAL DA CASA 3 (Frango, palmito e catupiry)',              categoria: 'pastel_tradicional', ordem: 15 },
    { nome: 'ESPECIAL DA CASA 4 (Frango, queijo e bacon)',                  categoria: 'pastel_tradicional', ordem: 16 },
    { nome: 'COWBOY CARNE (Carne, bacon e cheddar)',                        categoria: 'pastel_tradicional', ordem: 17 },
    { nome: 'COWBOY FRANGO (Frango, bacon e cheddar)',                      categoria: 'pastel_tradicional', ordem: 18 },
    { nome: 'CAPIXABA (Carne, ovo e azeitona)',                             categoria: 'pastel_tradicional', ordem: 19 },
    { nome: 'CAPIXABA 2 (Carne, ovo e azeitona e catupiry)',                categoria: 'pastel_tradicional', ordem: 20 },
    { nome: 'CAPIXABA 3 (Carne, ovo e azeitona e cheddar)',                 categoria: 'pastel_tradicional', ordem: 21 },
    { nome: 'CAPIXABA 4 (Carne, ovo e azeitona e queijo)',                  categoria: 'pastel_tradicional', ordem: 22 },
    { nome: 'MODINHA (Toscana, vinagrete e milho)',                         categoria: 'pastel_tradicional', ordem: 23 },

    // Pastéis Especiais
    { nome: 'CAIPIRA (Frango, catupiry, milho e ovo)',                                       categoria: 'pastel_especial', ordem: 1 },
    { nome: 'CAIPIRA 2 (Frango, queijo, milho, tomate, ovo e orégano)',                      categoria: 'pastel_especial', ordem: 2 },
    { nome: 'VEGETARIANO (Palmito, queijo, milho, azeitona e orégano)',                      categoria: 'pastel_especial', ordem: 3 },
    { nome: 'PORTUGUESA (Presunto, queijo, ovo, tomate e azeitona)',                         categoria: 'pastel_especial', ordem: 4 },
    { nome: 'A MODA CARNE (Carne, bacon, queijo, calabresa, milho e azeitona)',              categoria: 'pastel_especial', ordem: 5 },
    { nome: 'A MODA FRANGO (Frango, bacon, queijo, calabresa, milho e azeitona)',            categoria: 'pastel_especial', ordem: 6 },

    // Pizzas
    { nome: 'A MODA (mussarela, presunto, calabresa, bacon, milho, cebola, azeitona, cheddar, molho de tomate e orégano)',         categoria: 'pizza', ordem: 1  },
    { nome: 'PORTUGUESA (mussarela, presunto, calabresa, milho, ovo, azeitona, cebola, pimentão, molho de tomate e orégano)',      categoria: 'pizza', ordem: 2  },
    { nome: 'PRESUNTO (mussarela, presunto, milho, tomate, cebola, azeitona, molho de tomate e orégano)',                          categoria: 'pizza', ordem: 3  },
    { nome: 'CALABRESA (mussarela, calabresa, azeitona, cebola, molho de tomate e orégano)',                                       categoria: 'pizza', ordem: 4  },
    { nome: 'CALABRESA COM BACON (mussarela, calabresa, bacon, azeitona, cebola, molho de tomate e orégano)',                      categoria: 'pizza', ordem: 5  },
    { nome: 'FRANGO COM CATUPIRY (mussarela, frango, milho, azeitona, catupiry, molho de tomate e orégano)',                       categoria: 'pizza', ordem: 6  },
    { nome: 'BACON (mussarela, presunto, bacon, molho de tomate e orégano)',                                                       categoria: 'pizza', ordem: 7  },
    { nome: 'MUSSARELA (mussarela, tomate, milho, azeitona, molho de tomate e orégano)',                                           categoria: 'pizza', ordem: 8  },
    { nome: 'MINEIRA (mussarela, calabresa, catupiry, milho, molho de tomate e orégano)',                                          categoria: 'pizza', ordem: 9  },
    { nome: 'XERETA (mussarela, bacon, catupiry, milho, molho de tomate e orégano)',                                               categoria: 'pizza', ordem: 10 },
    { nome: 'KIRIDAN (mussarela, palmito, tomate, cebola, azeitona, molho de tomate e orégano)',                                   categoria: 'pizza', ordem: 11 },
    { nome: 'BANANA (mussarela, banana, açúcar e canela)',                                                                         categoria: 'pizza', ordem: 12 },

    // Tamanhos de Pizza
    { nome: 'P - 4 PEDAÇOS', preco: 31.99, categoria: 'pizza_tamanho', ordem: 1 },
    { nome: 'M - 6 PEDAÇOS', preco: 41.99, categoria: 'pizza_tamanho', ordem: 2 },
    { nome: 'G - 8 PEDAÇOS', preco: 51.99, categoria: 'pizza_tamanho', ordem: 3 },

    // Esfirras Salgadas
    { nome: 'Carne',                   categoria: 'esfirra_salgada', ordem: 1 },
    { nome: 'Carne e Queijo',          categoria: 'esfirra_salgada', ordem: 2 },
    { nome: 'Queijo e Presunto',       categoria: 'esfirra_salgada', ordem: 3 },
    { nome: 'Queijo Frango e Catupiry',categoria: 'esfirra_salgada', ordem: 4 },
    { nome: 'Queijo e Calabresa',      categoria: 'esfirra_salgada', ordem: 5 },
    { nome: 'Queijo e Bacon',          categoria: 'esfirra_salgada', ordem: 6 },
    { nome: 'Queijo e Palmito',        categoria: 'esfirra_salgada', ordem: 7 },

    // Esfirras Doces
    { nome: 'Romeu e Julieta',         categoria: 'esfirra_doce', ordem: 1 },
    { nome: 'Chocolate com Morango',   categoria: 'esfirra_doce', ordem: 2 },
    { nome: 'Doce de Leite com Banana',categoria: 'esfirra_doce', ordem: 3 },

    // Refrigerantes
    { nome: 'Juninho Sabores',      preco:  4.00, categoria: 'refrigerante', ordem: 1 },
    { nome: 'Lata Sabores 350ml',   preco:  6.50, categoria: 'refrigerante', ordem: 2 },
    { nome: 'Lata Coca-Cola 350ml', preco:  6.80, categoria: 'refrigerante', ordem: 3 },
    { nome: 'Guaraná 600ml',        preco:  7.50, categoria: 'refrigerante', ordem: 4 },
    { nome: 'CoCa-Cola 600ml',      preco:  8.50, categoria: 'refrigerante', ordem: 5 },
    { nome: 'Guaraná 1,5L',         preco: 11.00, categoria: 'refrigerante', ordem: 6 },
    { nome: 'Coca-Cola 1,5L',       preco: 13.00, categoria: 'refrigerante', ordem: 7 },
];

const SEED_CONFIG = {
    pastel_tradicional:           13.00,
    pastel_especial:              14.00,
    esfirra_salgada:              10.00,
    esfirra_doce:                 10.00,
    adicional_ingrediente_pastel:  1.50,
    adicional_ingrediente_pizza:   2.50,
};

async function seedProdutos() {
    const btn = document.getElementById('btn-seed');
    btn.disabled = true;
    btn.textContent = 'Importando...';

    try {
        // Busca nomes já existentes para evitar duplicatas
        const existSnap = await db.collection('menu').get();
        const existentes = new Set(existSnap.docs.map(d => d.data().nome?.toLowerCase().trim()));

        const novos = SEED_PRODUTOS.filter(p => !existentes.has(p.nome.toLowerCase().trim()));

        if (novos.length === 0) {
            alert('Todos os produtos já estão cadastrados. Nada foi importado.');
            return;
        }

        // Batch write (Firestore suporta até 500 por batch)
        const lotes = [];
        for (let i = 0; i < novos.length; i += 400) {
            lotes.push(novos.slice(i, i + 400));
        }

        for (const lote of lotes) {
            const batch = db.batch();
            lote.forEach(prod => {
                const ref = db.collection('menu').doc();
                batch.set(ref, {
                    ...prod,
                    ativo: true,
                    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                });
            });
            await batch.commit();
        }

        // Config inicial (só cria se ainda não existir)
        const configSnap = await db.collection('menu_config').doc('precos').get();
        if (!configSnap.exists) {
            await db.collection('menu_config').doc('precos').set(SEED_CONFIG);
        }

        alert(`✅ ${novos.length} produto(s) importado(s) com sucesso!`);
    } catch (e) {
        alert('Erro na importação: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '📦 Importar cardápio padrão (1ª vez)';
    }
}

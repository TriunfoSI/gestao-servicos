import {
  sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, fmtDataHora, fmtReais, botao, secao, cartao,
  abrirJanela, formulario, editarRegistro, confirmar, opcoesEquipe, opcoesCliente, opcoesLista, nomeEquipe,
  eGestor, eFinanceiro, perfil,
} from '../base.js';
import { editarPrazo, colunasPrazo } from './prazos.js';
import { editarTarefa, abrirTarefa } from './tarefas.js';
import { abaFinanceiro } from './financeiro.js';

export const SIT_TECNICA = ['Não iniciado', 'Em andamento', 'Paralisado', 'Finalizado', 'Cancelado'];
export const SIT_COMERCIAL = ['Em aberto', 'Paralisado', 'Encerrado'];
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

// ================================================================== lista
export async function paginaListaOS(el) {
  const todas = await q(sb.from('v_os').select('id,numero,titulo,cliente_curto,cliente_nome,local,municipio,responsavel_id,responsavel_iniciais,sit_tecnica,sit_comercial,sit_contrato,sit_tecnica_detalhe,data_aceite,revisar_migracao').order('id', { ascending: false }));
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const busca = h('input', { type: 'search', placeholder: 'Buscar por nº, título, cliente ou local' });
  const contrato = h('select', {}, ['Ativo', 'Paralisado', 'Encerrado', 'Todos'].map((s) => h('option', {}, s)));
  const resp = h('select', {}, h('option', { value: '' }, 'Todos os responsáveis'), opcoesEquipe().map(([v, t]) => h('option', { value: v }, t)));
  const revisar = h('input', { type: 'checkbox', checked: params.has('revisar') });
  if (params.has('revisar')) contrato.value = 'Todos';
  if (perfil() === 'tecnico') resp.value = st.eu.id;
  const area = h('div');

  function filtrar() {
    const b = busca.value.trim().toLowerCase();
    const linhas = todas.filter((o) =>
      (contrato.value === 'Todos' || o.sit_contrato === contrato.value) &&
      (!resp.value || String(o.responsavel_id) === resp.value) &&
      (!revisar.checked || o.revisar_migracao) &&
      (!b || [o.numero, o.titulo, o.cliente_curto, o.cliente_nome, o.local, o.municipio].some((x) => x && x.toLowerCase().includes(b))));
    limpar(area, h('p', { class: 'contagem' }, `${linhas.length} OS`), tabela([
      { rotulo: 'Nº', k: 'numero' },
      { rotulo: 'Cliente', k: 'cliente_curto' },
      { rotulo: 'Título', f: (o) => [o.titulo, o.revisar_migracao ? h('span', { class: 'etq roxo', title: o.revisar_migracao }, 'revisar') : null], classe: 'texto' },
      { rotulo: 'Resp.', k: 'responsavel_iniciais' },
      { rotulo: 'Técnica', f: (o) => etiqueta(o.sit_tecnica) },
      { rotulo: 'Comercial', f: (o) => etiqueta(o.sit_comercial) },
      { rotulo: 'Contrato', f: (o) => etiqueta(o.sit_contrato) },
    ], linhas, { aoClicar: (o) => { location.hash = `#/os/${o.id}`; } }));
  }
  [busca, contrato, resp, revisar].forEach((c) => c.addEventListener('input', filtrar));

  limpar(el,
    h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Ordens de serviço'), eGestor() ? botao('Nova OS', () => novaOS(), 'primario') : null),
    h('div', { class: 'filtros' }, busca, h('label', {}, 'Contrato ', contrato), resp,
      eGestor() ? h('label', { class: 'marcar' }, revisar, ' Só as que precisam de revisão') : null),
    area);
  filtrar();
}

// ================================================================== formulários da OS
async function contatosDoCliente(clienteId) {
  if (!clienteId) return [];
  return q(sb.from('contato').select('id,nome').eq('cliente_id', clienteId).order('nome'));
}

function camposDados(contatos, { tecnico = false } = {}) {
  return [
    { k: 'numero', rotulo: 'Nº da OS' },
    { k: 'proposta', rotulo: 'Nº da proposta' },
    { k: 'titulo', rotulo: 'Título', largura: 2, obrig: true },
    { k: 'cliente_id', rotulo: 'Cliente', tipo: 'opcoes', opcoes: opcoesCliente, obrig: true, largura: 2, desativado: tecnico },
    { k: 'contato_id', rotulo: 'Contato (representante)', tipo: 'opcoes', opcoes: contatos.map((c) => [c.id, c.nome]) },
    { k: 'responsavel_id', rotulo: 'Responsável técnico', tipo: 'opcoes', opcoes: opcoesEquipe, desativado: tecnico },
    { k: 'data_aceite', rotulo: 'Data do aceite', tipo: 'data' },
    { k: 'tipo_aceite', rotulo: 'Tipo de aceite', sugestoes: ['Contrato assinado', 'Pagamento aceite', 'Acordo diretoria'] },
    { k: 'data_termino', rotulo: 'Data de término', tipo: 'data' },
    { k: 'prazo_contratual', rotulo: 'Prazo contratual', ajuda: 'Ex.: 30 dias úteis' },
    { k: 'local', rotulo: 'Local / empreendimento', largura: 2 },
    { k: 'local_endereco', rotulo: 'Endereço do local', tipo: 'area', linhas: 2 },
    { k: 'municipio', rotulo: 'Município' },
    { k: 'uf', rotulo: 'UF', tipo: 'opcoes', opcoes: UFS, numerico: false, padrao: 'SP' },
    { k: 'codigo_cliente', rotulo: 'Código interno do cliente' },
    { k: 'dropbox_url', rotulo: 'Link da pasta no Dropbox', tipo: 'url', largura: 2 },
  ];
}

function ligarClienteContato(form) {
  const cli = form.ctrls.cliente_id, con = form.ctrls.contato_id;
  cli.addEventListener('change', async () => {
    const lista = await contatosDoCliente(Number(cli.value));
    limpar(con, h('option', { value: '' }, '—'), lista.map((c) => h('option', { value: c.id }, c.nome)));
  });
}

async function novaOS() {
  let fechar;
  const form = formulario([
    ...camposDados([]),
    { k: 'sit_tecnica', rotulo: 'Situação técnica', tipo: 'opcoes', opcoes: SIT_TECNICA, obrig: true, numerico: false, padrao: 'Não iniciado' },
    { k: 'sit_comercial', rotulo: 'Situação comercial', tipo: 'opcoes', opcoes: SIT_COMERCIAL, obrig: true, numerico: false, padrao: 'Em aberto' },
  ], {}, {
    aoSalvar: async (dados) => {
      const nova = await q(sb.from('os').insert(dados).select('id').single());
      aviso('OS criada.'); fechar(); location.hash = `#/os/${nova.id}`;
    },
  });
  ligarClienteContato(form);
  fechar = abrirJanela('Nova ordem de serviço', form, { largo: true });
}

// ================================================================== detalhe da OS
const ABAS = [
  ['dados', 'Dados'], ['escopo', 'Escopo'], ['prazos', 'Prazos'], ['andamento', 'Andamento'], ['tarefas', 'Tarefas'],
  ['financeiro', 'Financeiro', eFinanceiro], ['processos', 'Processos'], ['produtos', 'Produtos finais'],
  ['link', 'Link do cliente'], ['historico', 'Histórico'],
];

export async function paginaOS(el, id, aba = 'dados') {
  id = Number(id);
  const os = await q(sb.from('v_os').select('*').eq('id', id).maybeSingle());
  if (!os) { limpar(el, h('div', { class: 'alerta erro' }, 'OS não encontrada ou sem permissão de acesso.')); return; }
  const podeEditar = eGestor() || os.responsavel_id === st.eu.id;
  const ctx = { os, podeEditar, recarregar: () => paginaOS(el, id, aba) };
  const corpo = h('div', { class: 'aba-corpo' });

  limpar(el,
    h('div', { class: 'migalha' }, h('a', { href: '#/os' }, 'Ordens de serviço'), ' / ', os.numero || `#${os.id}`),
    h('div', { class: 'cabecalho-os' },
      h('div', {}, h('h1', {}, `OS ${os.numero || '#' + os.id}`), h('p', { class: 'subtitulo' }, os.titulo),
        h('p', { class: 'cliente-linha' }, h('a', { href: `#/clientes/${os.cliente_id}` }, os.cliente_nome),
          os.responsavel_nome ? ` · Responsável: ${os.responsavel_nome}` : '')),
      h('div', { class: 'situacoes' },
        h('div', {}, h('small', {}, 'Técnica'), etiqueta(os.sit_tecnica)),
        h('div', {}, h('small', {}, 'Comercial'), etiqueta(os.sit_comercial)),
        h('div', {}, h('small', {}, 'Contrato'), etiqueta(os.sit_contrato, 'forte')),
        (podeEditar || eFinanceiro()) ? botao('Alterar situação', () => alterarSituacao(os, ctx.recarregar), 'pequeno') : null)),
    os.revisar_migracao ? h('div', { class: 'alerta roxo' }, h('strong', {}, 'Revisar: '), os.revisar_migracao) : null,
    h('nav', { class: 'abas' }, ABAS.filter(([, , p]) => !p || p()).map(([k, t]) =>
      h('a', { href: `#/os/${id}/${k}`, class: k === aba ? 'ativa' : '' }, t))),
    corpo);

  const funcoes = { dados: abaDados, escopo: abaEscopo, prazos: abaPrazos, andamento: abaAndamento, tarefas: abaTarefas,
    financeiro: abaFinanceiro, processos: abaProcessos, produtos: abaProdutos, link: abaLink, historico: abaHistorico };
  await (funcoes[aba] || abaDados)(corpo, ctx);
}

function alterarSituacao(os, depois) {
  const tec = eGestor() || (perfil() === 'tecnico' && os.responsavel_id === st.eu.id);
  const com = eFinanceiro();
  let fechar;
  const form = formulario([
    { k: 'sit_tecnica', rotulo: 'Situação técnica', tipo: 'opcoes', opcoes: SIT_TECNICA, obrig: true, numerico: false, desativado: !tec },
    { k: 'sit_tecnica_detalhe_id', rotulo: 'Detalhe da situação técnica', tipo: 'opcoes', opcoes: () => opcoesLista('os_situacao_detalhe'), desativado: !tec },
    { k: 'sit_comercial', rotulo: 'Situação comercial', tipo: 'opcoes', opcoes: SIT_COMERCIAL, obrig: true, numerico: false, desativado: !com },
    { tipo: 'info', rotulo: 'A situação do contrato é calculada: fica "Encerrado" quando a técnica estiver Finalizada (ou Cancelada) e a comercial Encerrada.' },
    eGestor() && os.revisar_migracao ? { k: 'revisada', rotulo: 'Marcar como revisada (some o aviso da importação)', tipo: 'marcar' } : null,
  ].filter(Boolean), os, {
    aoSalvar: async (d) => {
      if (d.revisada) d.revisar_migracao = null;
      delete d.revisada;
      await q(sb.from('os').update(d).eq('id', os.id));
      aviso('Situação atualizada.'); fechar(); depois();
    },
  });
  fechar = abrirJanela('Alterar situação', form);
}

// ------------------------------------------------------------------ Dados
async function abaDados(el, { os, podeEditar, recarregar }) {
  const item = (rot, val) => val ? [h('dt', {}, rot), h('dd', {}, val)] : null;
  limpar(el, secao('Dados da OS',
    podeEditar ? botao('Editar dados', async () => {
      const contatos = await contatosDoCliente(os.cliente_id);
      const form = editarRegistro({ titulo: 'dados da OS', tabela: 'os', registro: os, podeExcluir: eGestor(),
        campos: camposDados(contatos, { tecnico: !eGestor() }), depois: recarregar });
      ligarClienteContato(form);
    }) : null,
    h('dl', { class: 'detalhes' },
      item('Nº da OS', os.numero), item('Proposta', os.proposta), item('Cliente', os.cliente_nome),
      item('Contato', os.contato_nome), item('Responsável técnico', os.responsavel_nome),
      item('Data do aceite', fmtData(os.data_aceite)), item('Tipo de aceite', os.tipo_aceite),
      item('Término', fmtData(os.data_termino)), item('Prazo contratual', os.prazo_contratual),
      item('Local', os.local), item('Endereço do local', os.local_endereco),
      item('Município/UF', [os.municipio, os.uf].filter(Boolean).join(' / ')), item('Código do cliente', os.codigo_cliente),
      item('Detalhe da situação técnica', os.sit_tecnica_detalhe),
      item('Situação atualizada em', fmtData(os.situacao_atualizada_em)),
      item('Pasta no Dropbox', os.dropbox_url ? h('a', { href: os.dropbox_url, target: '_blank', rel: 'noopener' }, 'Abrir pasta') : null))));
}

// ------------------------------------------------------------------ Escopo
async function abaEscopo(el, { os, podeEditar }) {
  const linhas = await q(sb.from('os_escopo').select('*, servico(descricao,area)').eq('os_id', os.id).order('ordem').order('id'));
  const editar = (r) => editarRegistro({ titulo: 'item do escopo', tabela: 'os_escopo', registro: r, extras: { os_id: os.id },
    campos: [
      { k: 'servico_id', rotulo: 'Serviço', tipo: 'opcoes', opcoes: () => opcoesLista('servico', (s) => `${s.descricao} (${s.area || '—'})`), obrig: true, largura: 2 },
      { k: 'ordem', rotulo: 'Ordem', tipo: 'numero', padrao: linhas.length + 1 },
      { k: 'descricao', rotulo: 'Descrição', tipo: 'area', linhas: 8 },
    ], depois: () => abaEscopo(el, { os, podeEditar }) });
  limpar(el, secao('Escopo técnico',
    podeEditar ? botao('Incluir item', () => editar(null), 'primario') : null,
    linhas.length ? h('ol', { class: 'escopo' }, linhas.map((l) => h('li', { onclick: podeEditar ? () => editar(l) : null, class: podeEditar ? 'clicavel' : '' },
      h('strong', {}, l.servico?.descricao || 'Serviço'), l.servico?.area ? h('small', {}, ' · ' + l.servico.area) : '',
      l.descricao ? h('p', { class: 'pre' }, l.descricao) : null))) : h('p', { class: 'vazio' }, 'Nenhum item de escopo cadastrado.')));
}

// ------------------------------------------------------------------ Prazos
async function abaPrazos(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = await q(sb.from('v_prazo').select('*').eq('os_id', os.id).order('data_termino', { nullsFirst: false }));
  const recarregar = () => abaPrazos(el, ctx);
  limpar(el, secao('Cronograma e prazos',
    podeEditar ? botao('Incluir prazo', () => editarPrazo(null, os.id, recarregar), 'primario') : null,
    tabela(colunasPrazo({ comOS: false }), linhas, {
      aoClicar: (p) => (podeEditar || p.responsavel_id === st.eu.id) && editarPrazo(p, os.id, recarregar),
      vazio: 'Nenhum prazo cadastrado.' })));
}

// ------------------------------------------------------------------ Andamento
async function abaAndamento(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = await q(sb.from('v_movimentacao').select('*').eq('os_id', os.id).order('data_inicio', { ascending: false }).order('id', { ascending: false }));
  const recarregar = () => abaAndamento(el, ctx);
  const editar = (r) => editarRegistro({ titulo: 'registro de andamento', tabela: 'movimentacao', registro: r, extras: { os_id: os.id },
    campos: [
      { k: 'data_inicio', rotulo: 'Data', tipo: 'data', obrig: true, padrao: new Date().toLocaleDateString('sv-SE') },
      { k: 'data_termino', rotulo: 'Data de término', tipo: 'data' },
      { k: 'detalhe_id', rotulo: 'Tipo de registro', tipo: 'opcoes', opcoes: () => opcoesLista('mov_detalhe') },
      { k: 'tipo_id', rotulo: 'Categoria', tipo: 'opcoes', opcoes: () => opcoesLista('mov_tipo') },
      { k: 'descricao', rotulo: 'Descrição', tipo: 'area', obrig: true, linhas: 5 },
      { k: 'observacao', rotulo: 'Observação interna', tipo: 'area', linhas: 3 },
      { k: 'situacao_id', rotulo: 'Situação', tipo: 'opcoes', opcoes: () => opcoesLista('mov_situacao') },
      { k: 'responsavel_id', rotulo: 'Responsável', tipo: 'opcoes', opcoes: opcoesEquipe, padrao: st.eu.id },
      { k: 'visibilidade', rotulo: 'Quem vê', tipo: 'opcoes', opcoes: [['Interna', 'Interna (só a empresa)'], ['Geral', 'Geral (aparece no link do cliente)']], obrig: true, numerico: false, padrao: 'Interna' },
      { k: 'executor', rotulo: 'Executor', padrao: 'Triunfo Ambiental' },
    ], depois: recarregar });
  limpar(el, secao('Andamento',
    podeEditar ? botao('Registrar andamento', () => editar(null), 'primario') : null,
    linhas.length ? h('ul', { class: 'linha-tempo' }, linhas.map((m) => h('li', { class: podeEditar ? 'clicavel' : '', onclick: podeEditar ? () => editar(m) : null },
      h('div', { class: 'lt-data' }, fmtData(m.data_inicio)),
      h('div', { class: 'lt-corpo' },
        h('div', { class: 'lt-topo' }, h('strong', {}, m.detalhe || m.tipo || 'Registro'), etiqueta(m.visibilidade), m.situacao ? h('span', { class: 'etq cinza' }, m.situacao) : null,
          m.responsavel_iniciais ? h('small', {}, ' · ' + m.responsavel_iniciais) : null),
        h('p', { class: 'pre' }, m.descricao), m.observacao ? h('p', { class: 'pre obs' }, m.observacao) : null))))
      : h('p', { class: 'vazio' }, 'Nenhum andamento registrado.')));
}

// ------------------------------------------------------------------ Tarefas
async function abaTarefas(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = await q(sb.from('v_tarefa').select('*').eq('os_id', os.id).order('situacao').order('prazo', { nullsFirst: false }));
  const recarregar = () => abaTarefas(el, ctx);
  limpar(el, secao('Tarefas',
    podeEditar ? botao('Nova tarefa', () => editarTarefa(null, recarregar, os.id), 'primario') : null,
    tabela([
      { rotulo: 'Tarefa', k: 'descricao', classe: 'texto' },
      { rotulo: 'Responsável', k: 'responsavel_nome' },
      { rotulo: 'Reunião', f: (t) => fmtData(t.data_reuniao) },
      { rotulo: 'Prazo', f: (t) => fmtData(t.prazo) },
      { rotulo: 'Situação', f: (t) => etiqueta(t.situacao) },
    ], linhas, { aoClicar: (t) => abrirTarefa(t.id, recarregar), vazio: 'Nenhuma tarefa para esta OS.' })));
}

// ------------------------------------------------------------------ Processos
async function abaProcessos(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = await q(sb.from('processo').select('*, processo_acesso(*)').eq('os_id', os.id).order('data_abertura', { nullsFirst: false }));
  const recarregar = () => abaProcessos(el, ctx);

  function editar(p) {
    const a = p?.processo_acesso || {};
    let fechar;
    const form = formulario([
      { k: 'instituicao', rotulo: 'Instituição', obrig: true, sugestoes: ['CETESB', 'CONDEPHAAT', 'Prefeitura Municipal de Guarujá', 'Prefeitura Municipal de Santos', 'DVTR-3', 'Ministério Público'] },
      { k: 'referencia', rotulo: 'Nº do processo' },
      { k: 'data_abertura', rotulo: 'Abertura', tipo: 'data' },
      { k: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', opcoes: ['Digital', 'Físico'], numerico: false },
      { k: 'objetivo', rotulo: 'Objetivo', largura: 2 },
      { k: 'observacao', rotulo: 'Observação', tipo: 'area', linhas: 2 },
      { tipo: 'info', rotulo: 'Acesso ao portal (só a equipe vê; nunca aparece no link do cliente)' },
      { k: 'plataforma', rotulo: 'Plataforma / site', largura: 2 },
      { k: 'login', rotulo: 'Login' },
      { k: 'senha', rotulo: 'Senha', tipo: 'senha' },
    ], { ...p, ...a }, {
      aoSalvar: async (d) => {
        const acesso = { plataforma: d.plataforma, login: d.login, senha: d.senha };
        delete d.plataforma; delete d.login; delete d.senha;
        let pid = p?.id;
        if (pid) await q(sb.from('processo').update(d).eq('id', pid));
        else pid = (await q(sb.from('processo').insert({ ...d, os_id: os.id }).select('id').single())).id;
        await q(sb.from('processo_acesso').upsert({ processo_id: pid, ...acesso }));
        aviso('Processo salvo.'); fechar(); recarregar();
      },
      aoExcluir: p ? async () => {
        if (!(await confirmar('Excluir este processo e seus dados de acesso?'))) return;
        await q(sb.from('processo').delete().eq('id', p.id)); fechar(); recarregar();
      } : null,
    });
    fechar = abrirJanela(p ? 'Alterar processo' : 'Incluir processo', form, { largo: true });
  }

  const senhaOculta = (s) => {
    if (!s) return '';
    const span = h('span', { class: 'senha' }, '••••••');
    return h('span', {}, span, h('button', { class: 'btn-link', onclick: (e) => {
      e.stopPropagation(); span.textContent = span.textContent === s ? '••••••' : s;
    } }, 'mostrar'), h('button', { class: 'btn-link', onclick: (e) => { e.stopPropagation(); navigator.clipboard?.writeText(s); aviso('Senha copiada.'); } }, 'copiar'));
  };
  const link = (u) => u && /^https?:\/\//.test(u) ? h('a', { href: u, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, 'abrir portal') : (u || '');

  limpar(el, secao('Processos em órgãos',
    podeEditar ? botao('Incluir processo', () => editar(null), 'primario') : null,
    tabela([
      { rotulo: 'Instituição', k: 'instituicao' },
      { rotulo: 'Nº do processo', k: 'referencia' },
      { rotulo: 'Abertura', f: (p) => fmtData(p.data_abertura) },
      { rotulo: 'Objetivo', k: 'objetivo', classe: 'texto' },
      { rotulo: 'Tipo', k: 'tipo' },
      { rotulo: 'Portal', f: (p) => link(p.processo_acesso?.plataforma) },
      { rotulo: 'Login', f: (p) => p.processo_acesso?.login || '' },
      { rotulo: 'Senha', f: (p) => senhaOculta(p.processo_acesso?.senha) },
    ], linhas, { aoClicar: podeEditar ? editar : null, vazio: 'Nenhum processo cadastrado.' })));
}

// ------------------------------------------------------------------ Produtos finais (arquivos)
async function abaProdutos(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = await q(sb.from('produto_final').select('*').eq('os_id', os.id).order('enviado_em'));
  const recarregar = () => abaProdutos(el, ctx);
  const arquivo = h('input', { type: 'file', multiple: true, onchange: async () => {
    for (const f of arquivo.files) {
      const nomeSeguro = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
      const caminho = `${os.id}/${Date.now()}_${nomeSeguro}`;
      const { error } = await sb.storage.from('produtos-finais').upload(caminho, f);
      if (error) { aviso('Não foi possível enviar ' + f.name + ': ' + error.message, 'erro'); continue; }
      await q(sb.from('produto_final').insert({ os_id: os.id, nome: f.name, arquivo_path: caminho, tamanho: f.size }));
    }
    aviso('Arquivo(s) enviado(s).'); recarregar();
  } });
  const baixar = async (p) => {
    const { data, error } = await sb.storage.from('produtos-finais').createSignedUrl(p.arquivo_path, 120);
    if (error) return aviso('Não foi possível abrir o arquivo: ' + error.message, 'erro');
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  const excluir = async (p) => {
    if (!(await confirmar(`Excluir o arquivo "${p.nome}"?`))) return;
    await sb.storage.from('produtos-finais').remove([p.arquivo_path]);
    await q(sb.from('produto_final').delete().eq('id', p.id)); recarregar();
  };
  limpar(el, secao('Produtos técnicos finais',
    h('p', { class: 'ajuda' }, 'Anexe aqui só os produtos finais que comprovam a conclusão do contrato. O restante do material fica na pasta do Dropbox',
      os.dropbox_url ? [' (', h('a', { href: os.dropbox_url, target: '_blank', rel: 'noopener' }, 'abrir pasta'), ').'] : '.'),
    podeEditar ? h('label', { class: 'btn primario arquivo' }, 'Enviar arquivo', arquivo) : null,
    tabela([
      { rotulo: 'Arquivo', f: (p) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); baixar(p); } }, p.nome) },
      { rotulo: 'Tamanho', f: (p) => p.tamanho ? (p.tamanho / 1048576).toFixed(1) + ' MB' : '' },
      { rotulo: 'Enviado em', f: (p) => fmtDataHora(p.enviado_em) },
      podeEditar && { rotulo: '', f: (p) => h('button', { class: 'btn-link perigo', onclick: () => excluir(p) }, 'excluir') },
    ].filter(Boolean), linhas, { vazio: 'Nenhum produto final anexado.' })));
}

// ------------------------------------------------------------------ Link do cliente
async function abaLink(el, ctx) {
  const { os, podeEditar } = ctx;
  const recarregar = () => abaLink(el, ctx);
  if (!podeEditar) { limpar(el, h('p', { class: 'vazio' }, 'Só a coordenação e o técnico responsável gerenciam o link do cliente.')); return; }
  const linhas = await q(sb.from('link_cliente').select('*').eq('os_id', os.id).order('criado_em', { ascending: false }));
  const base = new URL('cliente.html', location.href.split('#')[0]).href;
  const url = (l) => `${base}?t=${l.token}`;
  limpar(el, secao('Link de acompanhamento do cliente',
    botao('Gerar novo link', async () => {
      await q(sb.from('link_cliente').insert({ os_id: os.id }));
      aviso('Link gerado. Copie e envie ao cliente.'); recarregar();
    }, 'primario'),
    h('p', { class: 'ajuda' }, 'O cliente abre o link sem login e vê: dados da OS, escopo, cronograma, parcelas, processos e os andamentos marcados como "Geral". Andamentos internos e senhas nunca aparecem. Você pode cancelar o link a qualquer momento.'),
    tabela([
      { rotulo: 'Link', f: (l) => l.revogado_em ? h('span', { class: 'riscado' }, 'cancelado') : h('span', { class: 'link-cliente' },
        h('a', { href: url(l), target: '_blank', rel: 'noopener' }, 'abrir'),
        h('button', { class: 'btn-link', onclick: () => { navigator.clipboard?.writeText(url(l)); aviso('Link copiado.'); } }, 'copiar')) },
      { rotulo: 'Criado em', f: (l) => fmtDataHora(l.criado_em) },
      { rotulo: 'Acessos', k: 'acessos' },
      { rotulo: 'Último acesso', f: (l) => fmtDataHora(l.ultimo_acesso) },
      { rotulo: '', f: (l) => l.revogado_em ? `cancelado em ${fmtData(l.revogado_em)}` : h('button', { class: 'btn pequeno perigo', onclick: async () => {
        if (!(await confirmar('Cancelar este link? O cliente não conseguirá mais abrir o relatório por ele.'))) return;
        await q(sb.from('link_cliente').update({ revogado_em: new Date().toISOString() }).eq('id', l.id)); recarregar();
      } }, 'Cancelar link') },
    ], linhas, { vazio: 'Nenhum link gerado ainda.' })));
}

// ------------------------------------------------------------------ Histórico
async function abaHistorico(el, { os }) {
  const linhas = await q(sb.from('os_historico').select('*').eq('os_id', os.id).order('em', { ascending: false }));
  const quem = (uid) => st.listas.equipe.find((e) => e.user_id === uid)?.nome || '';
  limpar(el, secao('Histórico de situações', tabela([
    { rotulo: 'Quando', f: (l) => fmtDataHora(l.em) },
    { rotulo: 'O que mudou', k: 'campo' },
    { rotulo: 'De', f: (l) => etiqueta(l.de) || l.de },
    { rotulo: 'Para', f: (l) => etiqueta(l.para) || l.para },
    { rotulo: 'Quem', f: (l) => quem(l.usuario_id) },
  ], linhas, { vazio: 'Nenhuma mudança de situação registrada desde a importação.' })));
}

export { fmtReais, cartao, nomeEquipe };

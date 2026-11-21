import {
  sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, fmtDataHora, fmtReais, botao, secao, cartao,
  abrirJanela, formulario, editarRegistro, confirmar, opcoesEquipe, opcoesCliente, opcoesLista, nomeEquipe,
  eGestor, eFinanceiro, perfil,
} from '../base.js';
import { editarPrazo, colunasPrazo, ordenarPrazos, podeAbrirPrazo } from './prazos.js';
import { editarAtividade, colunasCronograma, editarCronogramaEmTabela, atividadesDaOS } from './cronograma.js';
import { editarTarefa, abrirTarefa } from './tarefas.js';
import { abaFinanceiro } from './financeiro.js';

export const SIT_TECNICA = ['Não iniciado', 'Em andamento', 'Paralisado', 'Finalizado', 'Cancelado'];
export const SIT_COMERCIAL = ['Em aberto', 'Paralisado', 'Encerrado'];
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

// ================================================================== lista
export async function paginaListaOS(el) {
  const todas = await q(sb.from('v_os').select('id,numero,titulo,cliente_curto,cliente_nome,local,municipio,responsavel_id,responsavel_iniciais,sit_tecnica,sit_comercial,sit_contrato,sit_tecnica_detalhe,data_aceite,revisar_migracao,categoria_id,subcategoria_id,categoria,subcategoria').order('id', { ascending: false }));
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const busca = h('input', { type: 'search', placeholder: 'Buscar por nº, título, cliente ou local' });
  const contrato = h('select', {}, ['Ativo', 'Paralisado', 'Encerrado', 'Todos'].map((s) => h('option', {}, s)));
  const resp = h('select', {}, h('option', { value: '' }, 'Todos os responsáveis'), opcoesEquipe().map(([v, t]) => h('option', { value: v }, t)));
  const revisar = h('input', { type: 'checkbox', checked: params.has('revisar') });
  const cat = h('select', {}, h('option', { value: '' }, 'Todas as categorias'), opcoesLista('os_categoria', 'descricao', false).map(([v, t]) => h('option', { value: v }, t)));
  const subcat = h('select', {}, h('option', { value: '' }, 'Todas as subcategorias'));
  cat.addEventListener('change', () => {
    limpar(subcat, h('option', { value: '' }, 'Todas as subcategorias'),
      (st.listas.os_subcategoria || []).filter((x) => String(x.categoria_id) === cat.value).map((x) => h('option', { value: x.id }, x.descricao)));
  });
  if (params.has('revisar')) contrato.value = 'Todos';
  if (perfil() === 'tecnico') resp.value = st.eu.id;
  const area = h('div');

  function filtrar() {
    const b = busca.value.trim().toLowerCase();
    const linhas = todas.filter((o) =>
      (contrato.value === 'Todos' || o.sit_contrato === contrato.value) &&
      (!resp.value || String(o.responsavel_id) === resp.value) &&
      (!revisar.checked || o.revisar_migracao) &&
      (!cat.value || String(o.categoria_id) === cat.value) &&
      (!subcat.value || String(o.subcategoria_id) === subcat.value) &&
      (!b || [o.numero, o.titulo, o.cliente_curto, o.cliente_nome, o.local, o.municipio, o.categoria, o.subcategoria].some((x) => x && x.toLowerCase().includes(b))));
    limpar(area, h('p', { class: 'contagem' }, `${linhas.length} OS`), tabela([
      { rotulo: 'Nº', k: 'numero' },
      { rotulo: 'Cliente', k: 'cliente_curto' },
      { rotulo: 'Título', k: 'titulo', f: (o) => [o.titulo, o.revisar_migracao ? h('span', { class: 'etq roxo', title: o.revisar_migracao }, 'revisar') : null], classe: 'texto' },
      { rotulo: 'Categoria', ord: (o) => [o.categoria, o.subcategoria].join(' '), f: (o) => o.categoria ? [o.categoria, o.subcategoria ? h('small', { class: 'bloco' }, o.subcategoria) : null] : '' },
      { rotulo: 'Resp.', k: 'responsavel_iniciais' },
      { rotulo: 'Técnica', f: (o) => etiqueta(o.sit_tecnica) },
      { rotulo: 'Comercial', f: (o) => etiqueta(o.sit_comercial) },
      { rotulo: 'Contrato', f: (o) => etiqueta(o.sit_contrato) },
    ], linhas, { aoClicar: (o) => { location.hash = `#/os/${o.id}`; } }));
  }
  [busca, contrato, resp, revisar, cat, subcat].forEach((c) => c.addEventListener('input', filtrar));
  cat.addEventListener('change', filtrar);

  limpar(el,
    h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Ordens de serviço'), eGestor() ? botao('Nova OS', () => novaOS(), 'primario') : null),
    h('div', { class: 'filtros' }, busca, h('label', {}, 'Contrato ', contrato), resp, cat, subcat,
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
    { k: 'categoria_id', rotulo: 'Categoria', tipo: 'opcoes', opcoes: () => opcoesLista('os_categoria'),
      ajuda: eGestor() ? 'Lista editável em Cadastros > Categorias e subcategorias de OS.' : null },
    { k: 'subcategoria_id', rotulo: 'Subcategoria', tipo: 'opcoes', opcoes: () => opcoesLista('os_subcategoria') },
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

// link do contrato: só coordenação/diretoria e financeiro veem (tabela os_contrato, protegida no banco)
const CAMPO_CONTRATO = { k: 'contrato_url', rotulo: 'Link do contrato no Dropbox', tipo: 'url', largura: 2,
  ajuda: 'Só a coordenação/diretoria e o financeiro veem este link.' };

function editarContrato(os, atual, depois) {
  let fechar;
  const form = formulario([CAMPO_CONTRATO], { contrato_url: atual }, {
    aoSalvar: async (d) => {
      await q(sb.from('os_contrato').upsert({ os_id: os.id, contrato_url: d.contrato_url, atualizado_em: new Date().toISOString() }));
      aviso('Link do contrato salvo.'); fechar(); depois();
    },
  });
  fechar = abrirJanela('Link do contrato', form);
}

// a subcategoria mostra só as opções da categoria escolhida
function ligarCategoria(form) {
  const cat = form.ctrls.categoria_id, sub = form.ctrls.subcategoria_id;
  const atualizar = () => {
    const atual = sub.value;
    const ops = (st.listas.os_subcategoria || []).filter((x) => String(x.categoria_id) === cat.value && (x.ativo !== false || String(x.id) === atual));
    limpar(sub, h('option', { value: '' }, cat.value ? (ops.length ? '—' : 'Nenhuma subcategoria cadastrada') : 'Escolha a categoria primeiro'),
      ops.map((x) => h('option', { value: x.id }, x.descricao)));
    sub.value = ops.some((x) => String(x.id) === atual) ? atual : '';
  };
  cat.addEventListener('change', atualizar);
  atualizar();
}

function ligarClienteContato(form) {
  ligarCategoria(form);
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
    eFinanceiro() ? CAMPO_CONTRATO : null,
  ].filter(Boolean), {}, {
    aoSalvar: async (dados) => {
      const contrato = dados.contrato_url; delete dados.contrato_url;
      const nova = await q(sb.from('os').insert(dados).select('id').single());
      if (contrato) await q(sb.from('os_contrato').upsert({ os_id: nova.id, contrato_url: contrato }));
      const { count } = await sb.from('cronograma').select('id', { count: 'exact', head: true }).eq('os_id', nova.id);
      aviso(count ? `OS criada com um cronograma preliminar de ${count} atividades. Confira na aba Cronograma.` : 'OS criada.');
      fechar(); location.hash = count ? `#/os/${nova.id}/cronograma` : `#/os/${nova.id}`;
    },
  });
  ligarClienteContato(form);
  fechar = abrirJanela('Nova ordem de serviço', form, { largo: true });
}

// ================================================================== detalhe da OS
const ABAS = [
  ['dados', 'Dados'], ['escopo', 'Escopo'], ['cronograma', 'Cronograma'], ['prazos', 'Prazos'], ['andamento', 'Andamento'], ['tarefas', 'Tarefas'],
  ['financeiro', 'Financeiro', eFinanceiro], ['processos', 'Processos/Documentos'], ['produtos', 'Produtos técnicos'],
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

  const funcoes = { dados: abaDados, escopo: abaEscopo, cronograma: abaCronograma, prazos: abaPrazos, andamento: abaAndamento, tarefas: abaTarefas,
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
  const contrato = eFinanceiro() ? (await q(sb.from('os_contrato').select('contrato_url').eq('os_id', os.id).maybeSingle()))?.contrato_url : null;
  const abrirLink = (u, txt) => /^https?:\/\//.test(u) ? h('a', { href: u, target: '_blank', rel: 'noopener' }, txt) : u;
  limpar(el, secao('Dados da OS',
    podeEditar ? botao('Editar dados', async () => {
      const contatos = await contatosDoCliente(os.cliente_id);
      const form = editarRegistro({ titulo: 'dados da OS', tabela: 'os', registro: os, podeExcluir: eGestor(),
        campos: camposDados(contatos, { tecnico: !eGestor() }), depois: recarregar });
      ligarClienteContato(form);
    }) : null,
    h('dl', { class: 'detalhes' },
      item('Nº da OS', os.numero), item('Proposta', os.proposta), item('Cliente', os.cliente_nome),
      item('Categoria', os.categoria), item('Subcategoria', os.subcategoria),
      item('Contato', os.contato_nome), item('Responsável técnico', os.responsavel_nome),
      item('Data do aceite', fmtData(os.data_aceite)), item('Tipo de aceite', os.tipo_aceite),
      item('Término', fmtData(os.data_termino)), item('Prazo contratual', os.prazo_contratual),
      item('Local', os.local), item('Endereço do local', os.local_endereco),
      item('Município/UF', [os.municipio, os.uf].filter(Boolean).join(' / ')), item('Código do cliente', os.codigo_cliente),
      item('Detalhe da situação técnica', os.sit_tecnica_detalhe),
      item('Situação atualizada em', fmtData(os.situacao_atualizada_em)),
      item('Pasta no Dropbox', os.dropbox_url ? h('a', { href: os.dropbox_url, target: '_blank', rel: 'noopener' }, 'Abrir pasta') : null),
      eFinanceiro() ? [h('dt', {}, 'Contrato (Dropbox)'), h('dd', {},
        contrato ? abrirLink(contrato, 'Abrir contrato') : h('span', { class: 'txt-cinza' }, 'não informado'), ' ',
        h('button', { class: 'btn-link', onclick: () => editarContrato(os, contrato, recarregar) }, contrato ? 'alterar' : 'incluir link'),
        h('small', { class: 'bloco txt-cinza' }, 'Visível só para coordenação/diretoria e financeiro.'))] : null)));
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

// ------------------------------------------------------------------ Cronograma
async function abaCronograma(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = await q(sb.from('v_cronograma').select('*').eq('os_id', os.id).order('data_inicio', { nullsFirst: false }).order('data_termino').order('id'));
  const recarregar = () => abaCronograma(el, ctx);
  const preliminares = linhas.filter((a) => a.preliminar).length;
  const gerar = async () => {
    const n = await q(sb.rpc('gerar_cronograma_preliminar', { p_os: os.id }));
    aviso(n ? `${n} atividades incluídas no cronograma preliminar.` : 'Nenhuma atividade do cadastro para incluir.'); recarregar();
  };
  const validarTudo = async () => {
    await q(sb.from('cronograma').update({ preliminar: false }).eq('os_id', os.id).eq('preliminar', true));
    aviso('Cronograma validado. As atividades já aparecem no link do cliente.'); recarregar();
  };
  limpar(el, secao('Cronograma',
    podeEditar ? botao('Editar em tabela', () => editarCronogramaEmTabela(os, linhas, recarregar), 'primario') : null,
    podeEditar ? botao('Incluir uma atividade', () => editarAtividade(null, os.id, recarregar)) : null,
    podeEditar && !linhas.length && atividadesDaOS(os).length ? botao('Gerar cronograma preliminar', gerar) : null,
    h('p', { class: 'ajuda' }, 'Atividades com período (início e término) para cumprir o escopo técnico desta OS, em ordem de início. ',
      '"Resp." mostra se a ação é da Triunfo ou do Cliente (o cliente vê isso no link dele). ',
      'Use "Editar em tabela" para incluir várias atividades do cadastro de uma vez e ajustar as datas.'),
    preliminares ? h('div', { class: 'alerta roxo' },
      h('span', {}, `${preliminares} atividade(s) preliminar(es), montada(s) automaticamente pela categoria da OS. Confira as datas e valide; enquanto forem preliminares, não aparecem no link do cliente.`),
      podeEditar ? h('button', { class: 'btn pequeno', onclick: validarTudo }, 'Validar cronograma') : null) : null,
    tabela(colunasCronograma({ comOS: false }), linhas, {
      aoClicar: (a) => (podeEditar || a.responsavel_id === st.eu.id) && editarAtividade(a, os.id, recarregar),
      vazio: 'Nenhuma atividade no cronograma.' })));
}

// ------------------------------------------------------------------ Prazos
async function abaPrazos(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = ordenarPrazos(await q(sb.from('v_prazo').select('*').eq('os_id', os.id)));
  const recarregar = () => abaPrazos(el, ctx);
  limpar(el, secao('Prazos',
    podeEditar ? botao('Incluir prazo', () => editarPrazo(null, os.id, recarregar), 'primario') : null,
    h('p', { class: 'ajuda' }, 'Datas únicas: prazos de órgãos, comunique-se, entrega de produtos, vencimento do contrato. Os prazos atendidos ficam no final.'),
    tabela(colunasPrazo({ comOS: false }), linhas, {
      aoClicar: (p) => podeAbrirPrazo(p) && editarPrazo(p, os.id, recarregar),
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
      { rotulo: 'Prioridade', f: (t) => etiqueta(t.prioridade), ord: (t) => t.prioridade_ordem },
      { rotulo: 'Data de criação', f: (t) => fmtData(t.data_reuniao), ord: (t) => t.data_reuniao },
      { rotulo: 'Prazo', f: (t) => fmtData(t.prazo), ord: (t) => t.prazo },
      { rotulo: 'Situação', f: (t) => etiqueta(t.situacao), k: 'situacao' },
    ], linhas, { aoClicar: (t) => abrirTarefa(t.id, recarregar), vazio: 'Nenhuma tarefa para esta OS.' })));
}

// ------------------------------------------------------------------ Processos / Documentos
const PERIODICIDADES = ['Semanal', 'Quinzenal', 'Mensal', 'Bimestral', 'Semestral', 'Nenhuma'];

// mesma regra da função calcula_proxima_verificacao do banco (só para mostrar enquanto edita)
function proximaVerificacao(verificado, periodicidade) {
  if (!verificado) return null;
  const [a, m, d] = verificado.split('-').map(Number);
  const somaMeses = (n) => {
    const fim = new Date(a, m - 1 + n + 1, 0).getDate();          // último dia do mês de destino
    return new Date(a, m - 1 + n, Math.min(d, fim));
  };
  const dt = { Semanal: new Date(a, m - 1, d + 7), Quinzenal: new Date(a, m - 1, d + 15),
    Mensal: somaMeses(1), Bimestral: somaMeses(2), Semestral: somaMeses(6) }[periodicidade];
  return dt ? dt.toLocaleDateString('sv-SE') : null;
}

// vermelho se já passou, amarelo se faltam até 10 dias
function dataVerificacao(data) {
  if (!data) return '';
  const dias = Math.round((new Date(data + 'T00:00') - new Date(new Date().toDateString())) / 864e5);
  return h('span', { class: dias < 0 ? 'txt-vermelho' : dias <= 10 ? 'txt-amarelo' : '' }, fmtData(data));
}

async function abaProcessos(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = await q(sb.from('processo').select('*, processo_acesso(*)').eq('os_id', os.id).order('data_abertura', { nullsFirst: false }));
  const recarregar = () => abaProcessos(el, ctx);

  function editar(p) {
    const a = p?.processo_acesso || {};
    let fechar;
    const form = formulario([
      { k: 'natureza', rotulo: 'É um processo ou um documento?', tipo: 'opcoes', opcoes: ['Processo', 'Documento'], obrig: true, numerico: false, padrao: 'Processo' },
      { k: 'instituicao', rotulo: 'Órgão / instituição', obrig: true, sugestoes: ['CETESB', 'CONDEPHAAT', 'Prefeitura Municipal de Guarujá', 'Prefeitura Municipal de Santos', 'DVTR-3', 'Ministério Público'] },
      { k: 'referencia', rotulo: 'Número', ajuda: 'Nº do processo, do documento, da licença, do ofício...' },
      { k: 'data_abertura', rotulo: 'Data (abertura ou emissão)', tipo: 'data' },
      { k: 'objetivo', rotulo: 'Assunto / objetivo', largura: 2 },
      { k: 'tipo', rotulo: 'Meio', tipo: 'opcoes', opcoes: ['Digital', 'Físico'], numerico: false },
      { k: 'verificado_em', rotulo: 'Verificado em', tipo: 'data', ajuda: 'Última vez que a situação foi conferida.' },
      { k: 'periodicidade', rotulo: 'Verificar com que regularidade?', tipo: 'opcoes', opcoes: PERIODICIDADES, obrig: true, numerico: false, padrao: 'Nenhuma' },
      { k: 'proxima_verificacao', rotulo: 'Próxima verificação', tipo: 'data', desativado: true, ajuda: 'Calculada automaticamente: "Verificado em" + regularidade.' },
      { k: 'situacao', rotulo: 'Situação', tipo: 'area', linhas: 3, ajuda: 'Descreva a situação atual. Aparece no link do cliente, junto com "Verificado em".' },
      { k: 'observacao', rotulo: 'Observação interna', tipo: 'area', linhas: 2 },
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
        aviso('Salvo.'); fechar(); recarregar();
      },
      aoExcluir: p ? async () => {
        if (!(await confirmar('Excluir este registro e seus dados de acesso?'))) return;
        await q(sb.from('processo').delete().eq('id', p.id)); fechar(); recarregar();
      } : null,
    });
    // ao mudar a situação, sugere a data de hoje em "Verificado em"
    const atualizarProxima = () => { form.ctrls.proxima_verificacao.value = proximaVerificacao(form.ctrls.verificado_em.value, form.ctrls.periodicidade.value) || ''; };
    form.ctrls.situacao.addEventListener('change', () => { form.ctrls.verificado_em.value = new Date().toLocaleDateString('sv-SE'); atualizarProxima(); });
    form.ctrls.verificado_em.addEventListener('change', atualizarProxima);
    form.ctrls.periodicidade.addEventListener('change', atualizarProxima);
    fechar = abrirJanela(p ? 'Alterar processo/documento' : 'Incluir processo/documento', form, { largo: true });
  }

  const senhaOculta = (s) => {
    if (!s) return '';
    const span = h('span', { class: 'senha' }, '••••••');
    return h('span', {}, span, h('button', { class: 'btn-link', onclick: (e) => {
      e.stopPropagation(); span.textContent = span.textContent === s ? '••••••' : s;
    } }, 'mostrar'), h('button', { class: 'btn-link', onclick: (e) => { e.stopPropagation(); navigator.clipboard?.writeText(s); aviso('Senha copiada.'); } }, 'copiar'));
  };
  const link = (u) => u && /^https?:\/\//.test(u) ? h('a', { href: u, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, 'abrir portal') : (u || '');

  // quem não edita a OS: abre só para consulta (inclui o acesso ao portal)
  function ver(p) {
    const a = p.processo_acesso || {};
    const item = (r, v) => v ? [h('dt', {}, r), h('dd', {}, v)] : null;
    abrirJanela(`${p.natureza || 'Processo'} ${p.referencia || ''}`, h('dl', { class: 'detalhes' },
      item('Órgão', p.instituicao), item('Número', p.referencia), item('Data', fmtData(p.data_abertura)), item('Assunto', p.objetivo),
      item('Meio', p.tipo), item('Verificado em', fmtData(p.verificado_em)), item('Regularidade', p.periodicidade !== 'Nenhuma' ? p.periodicidade : null),
      item('Próxima verificação', fmtData(p.proxima_verificacao)), item('Situação', p.situacao ? h('span', { class: 'pre' }, p.situacao) : null),
      item('Observação interna', p.observacao), item('Portal', link(a.plataforma)), item('Login', a.login), item('Senha', senhaOculta(a.senha))), { largo: true });
  }

  limpar(el, secao('Processos e documentos',
    podeEditar ? botao('Incluir processo/documento', () => editar(null), 'primario') : null,
    h('p', { class: 'ajuda' }, 'Clique numa linha para ver tudo, inclusive regularidade da verificação e o acesso ao portal (login e senha). "Verificado em" e "Situação" aparecem no link do cliente; login e senha nunca aparecem.'),
    tabela([
      { rotulo: 'Tipo', k: 'natureza', f: (p) => etiqueta(p.natureza) },
      { rotulo: 'Órgão', k: 'instituicao' },
      { rotulo: 'Número', k: 'referencia' },
      { rotulo: 'Data', f: (p) => fmtData(p.data_abertura), ord: (p) => p.data_abertura },
      { rotulo: 'Assunto', k: 'objetivo', classe: 'texto' },
      { rotulo: 'Verificado em', f: (p) => fmtData(p.verificado_em), ord: (p) => p.verificado_em },
      { rotulo: 'Próxima verificação', ord: (p) => p.proxima_verificacao, f: (p) => dataVerificacao(p.proxima_verificacao) },
      { rotulo: 'Situação', k: 'situacao', classe: 'texto', f: (p) => h('span', { class: 'pre' }, p.situacao || '') },
    ], linhas, { aoClicar: podeEditar ? editar : ver, vazio: 'Nenhum processo ou documento cadastrado.' })));
}

// ------------------------------------------------------------------ Produtos técnicos (cadastro com link do Dropbox)
export function editarProdutoTecnico(registro, osId, depois) {
  const form = editarRegistro({ titulo: 'produto técnico', tabela: 'produto_final', registro, depois,
    extras: registro ? {} : { os_id: osId },
    campos: [
      { k: 'tipo_id', rotulo: 'Tipo do produto técnico', tipo: 'opcoes', opcoes: () => opcoesLista('tipo_produto_tecnico'), obrig: true },
      { k: 'numero', rotulo: 'Número / versão', ajuda: 'Ex.: PT 012/2026 rev. 1' },
      { k: 'nome', rotulo: 'Título do produto', obrig: true, largura: 2 },
      { k: 'data_elaboracao', rotulo: 'Data de elaboração / entrega', tipo: 'data', padrao: new Date().toLocaleDateString('sv-SE') },
      { k: 'responsavel_id', rotulo: 'Responsável técnico', tipo: 'opcoes', opcoes: opcoesEquipe, padrao: st.eu.id },
      { k: 'dropbox_url', rotulo: 'Link do arquivo no Dropbox', tipo: 'url', largura: 2, ajuda: 'No Dropbox: clique em Compartilhar > Copiar link, e cole aqui.' },
      { k: 'descricao', rotulo: 'Descrição / observação', tipo: 'area', linhas: 3 },
    ] });
  // incluir um tipo novo sem sair da janela (coordenação)
  if (eGestor()) {
    const sel = form.ctrls.tipo_id;
    const novo = h('input', { type: 'text', placeholder: 'Novo tipo' });
    const incluir = async () => {
      const txt = novo.value.trim();
      if (!txt) return;
      const existe = st.listas.tipo_produto_tecnico.find((t) => t.descricao.toLowerCase() === txt.toLowerCase());
      const t = existe || await q(sb.from('tipo_produto_tecnico').insert({ descricao: txt }).select('*').single());
      if (!existe) { st.listas.tipo_produto_tecnico.push(t); sel.append(h('option', { value: t.id }, t.descricao)); }
      sel.value = t.id; novo.value = '';
    };
    novo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); incluir(); } });
    sel.closest('.campo').append(h('div', { class: 'novo-item' }, novo, h('button', { type: 'button', class: 'btn pequeno', onclick: incluir }, '+ Incluir tipo')));
  }
  return form;
}

async function abaProdutos(el, ctx) {
  const { os, podeEditar } = ctx;
  const linhas = await q(sb.from('v_produto_tecnico').select('*').eq('os_id', os.id).order('data_elaboracao', { nullsFirst: false }).order('enviado_em'));
  const recarregar = () => abaProdutos(el, ctx);
  // arquivos anexados antes da mudança continuam acessíveis
  const baixar = async (p) => {
    const { data, error } = await sb.storage.from('produtos-finais').createSignedUrl(p.arquivo_path, 120);
    if (error) return aviso('Não foi possível abrir o arquivo: ' + error.message, 'erro');
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  const abrir = (p) => {
    if (p.dropbox_url) return h('a', { href: p.dropbox_url, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, 'abrir no Dropbox');
    if (p.arquivo_path) return h('a', { href: '#', onclick: (e) => { e.preventDefault(); e.stopPropagation(); baixar(p); } }, 'arquivo anexado');
    return '';
  };
  limpar(el, secao('Produtos técnicos',
    podeEditar ? botao('Incluir produto técnico', () => editarProdutoTecnico(null, os.id, recarregar), 'primario') : null,
    h('p', { class: 'ajuda' }, 'Cadastre os produtos técnicos elaborados nesta OS. O arquivo fica no Dropbox: aqui guardamos só o link',
      os.dropbox_url ? [' (', h('a', { href: os.dropbox_url, target: '_blank', rel: 'noopener' }, 'pasta da OS'), ').'] : '.'),
    tabela([
      { rotulo: 'Tipo', k: 'tipo' },
      { rotulo: 'Número', k: 'numero' },
      { rotulo: 'Título', k: 'nome', classe: 'texto' },
      { rotulo: 'Data', f: (p) => fmtData(p.data_elaboracao), ord: (p) => p.data_elaboracao },
      { rotulo: 'Responsável', k: 'responsavel_iniciais' },
      { rotulo: 'Arquivo', f: abrir },
    ], linhas, { aoClicar: podeEditar ? (p) => editarProdutoTecnico(p, os.id, recarregar) : null, vazio: 'Nenhum produto técnico cadastrado.' })));
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
    h('p', { class: 'ajuda' }, 'O cliente abre o link sem login e vê: dados da OS, escopo, cronograma, prazos, parcelas, processos/documentos (com "Verificado em" e "Situação"), produtos técnicos e os andamentos marcados como "Geral". Andamentos internos e senhas nunca aparecem. Você pode cancelar o link a qualquer momento.'),
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

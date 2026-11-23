import { sb, st, h, limpar, q, tabela, etiqueta, fmtData, editarRegistro, opcoesEquipe, opcoesLista,
  somarDiasUteis, eGestor, perfil, botao, hoje } from '../base.js';

// Prazos são datas únicas (prazo de órgão, comunique-se, entrega de produto, vencimento de contrato...).
// A situação é automática:
//   não atendido: "A vencer" até a data e "Vencido" depois dela
//   atendido: "Atendido" (até a data do prazo) ou "Atendido fora do prazo" (depois dela)
export const SIT_PRAZO = ['A vencer', 'Vencido', 'Atendido', 'Atendido fora do prazo'];
const ATENDIDOS = ['Atendido', 'Atendido fora do prazo'];

export function situacaoPrazo(termino, atendido, dataAtendimento) {
  if (atendido) return termino && (dataAtendimento || termino) > termino ? 'Atendido fora do prazo' : 'Atendido';
  if (!termino) return 'Sem data';
  return termino < hoje() ? 'Vencido' : 'A vencer';
}

// Ordem das listas: pendentes primeiro (pela data) e atendidos no final
export function ordenarPrazos(linhas) {
  const peso = (p) => (ATENDIDOS.includes(p.situacao) ? 1 : 0);
  return [...linhas].sort((a, b) => peso(a) - peso(b) || String(a.data_termino || '9').localeCompare(String(b.data_termino || '9')));
}
const ORIGENS = ['CETESB', 'MP | Ofício', 'MP', 'Prefeitura', 'CONDEPHAAT', 'Cliente', 'CTR-3', 'Contrato', 'Planejamento'];
const TIPOS = ['Prazo de órgão', 'Comunique-se', 'Entrega de produto', 'Vencimento de contrato', 'Protocolo',
  'Produto técnico', 'Vencimento', 'Vistoria técnica', 'Reunião', 'Pagamento', 'Nota fiscal'];

const quando = (p) => {
  if (p.dias_restantes == null || ATENDIDOS.includes(p.situacao)) return '';
  if (p.dias_restantes === 0) return 'hoje';
  if (p.dias_restantes > 0) return p.dias_restantes === 1 ? 'amanhã' : `em ${p.dias_restantes} dias`;
  return p.dias_restantes === -1 ? 'há 1 dia' : `há ${-p.dias_restantes} dias`;
};

export function colunasPrazo({ comOS = true } = {}) {
  return [
    { rotulo: 'Data', ord: (p) => p.data_termino, f: (p) => h('span', { class: p.situacao === 'Vencido' ? 'txt-vermelho' : '' }, fmtData(p.data_termino)) },
    { rotulo: 'Quando', ord: (p) => p.dias_restantes, f: quando },
    comOS && { rotulo: 'OS', ord: (p) => p.os_numero, f: (p) => h('a', { href: `#/os/${p.os_id}/prazos`, onclick: (e) => e.stopPropagation() }, p.os_numero || '—') },
    comOS && { rotulo: 'Cliente', k: 'cliente_curto' },
    { rotulo: 'Descrição', k: 'descricao', classe: 'texto' },
    { rotulo: 'Tipo', k: 'tipo' },
    { rotulo: 'Origem', k: 'origem' },
    { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: 'Situação', k: 'situacao', f: (p) => etiqueta(p.situacao) },
    { rotulo: 'Atendido em', ord: (p) => p.data_atendimento, f: (p) => fmtData(p.data_atendimento) },
  ].filter(Boolean);
}

// Quem pode abrir o prazo: coordenação, responsável pela OS ou o responsável pelo prazo
export const podeAbrirPrazo = (p) => eGestor() || p.os_responsavel_id === st.eu.id || p.responsavel_id === st.eu.id;

export function editarPrazo(registro, osId, depois) {
  // o responsável pelo prazo que não cuida da OS só marca o atendimento
  const so = !!registro && !eGestor() && registro.os_responsavel_id !== st.eu.id;
  const campos = [
    { k: 'descricao', rotulo: 'Descrição do prazo', obrig: true, largura: 2, desativado: so },
    { k: 'tipo', rotulo: 'Tipo', sugestoes: TIPOS, ajuda: 'Escolha da lista ou escreva outro. Pagamento, Nota fiscal e Vencimento de contrato aparecem no Início do Financeiro.', desativado: so },
    { k: 'origem', rotulo: 'Origem', sugestoes: ORIGENS, desativado: so },
    { k: 'data_inicio', rotulo: 'Data de recebimento (opcional)', tipo: 'data', ajuda: 'Use junto com o prazo em dias para calcular a data.', desativado: so },
    { k: 'qtd_dias', rotulo: 'Prazo em dias', tipo: 'numero', desativado: so },
    { k: 'tipo_dia', rotulo: 'Contagem', tipo: 'opcoes', opcoes: [['úteis', 'Dias úteis'], ['corridos', 'Dias corridos']], numerico: false, desativado: so },
    { k: 'data_termino', rotulo: 'Data do prazo', tipo: 'data', obrig: true, ajuda: 'Calculada pela data de recebimento + dias (pode ajustar).', desativado: so },
    { k: 'responsavel_id', rotulo: 'Responsável', tipo: 'opcoes', opcoes: opcoesEquipe, desativado: so },
    { k: 'referencia', rotulo: 'Referência', ajuda: 'Nº do ofício, comunique-se, processo...', desativado: so },
    { tipo: 'info', rotulo: 'Atendimento do prazo' },
    { k: 'atendido', rotulo: 'Situação do atendimento', tipo: 'opcoes', obrig: true, numerico: false, padrao: 'false',
      opcoes: [['false', 'Pendente (ainda não atendido)'], ['true', 'Atendido']] },
    { k: 'data_atendimento', rotulo: 'Data do atendimento', tipo: 'data', ajuda: 'Dia em que o prazo foi cumprido.' },
  ];
  const form = editarRegistro({ titulo: 'prazo', tabela: 'prazo', registro, extras: registro ? {} : { os_id: osId }, campos, depois,
    podeExcluir: !so,
    antesDeSalvar: (d) => {
      d.atendido = d.atendido === 'true';
      if (d.atendido && !d.data_atendimento) d.data_atendimento = hoje();
      if (!d.atendido) d.data_atendimento = null;
      return d;
    } });
  const c = form.ctrls;
  const calcular = () => {
    const d = somarDiasUteis(c.data_inicio.value, Number(c.qtd_dias.value), c.tipo_dia.value !== 'corridos');
    if (d) c.data_termino.value = d;
  };
  [c.data_inicio, c.qtd_dias, c.tipo_dia].forEach((x) => x.addEventListener('change', calcular));

  // mostra como a situação vai ficar
  const previa = h('small', { class: 'previa-situacao' });
  c.data_atendimento.closest('.campo').append(previa);
  const atualizar = () => {
    const at = c.atendido.value === 'true';
    if (at && !c.data_atendimento.value) c.data_atendimento.value = hoje();
    c.data_atendimento.disabled = !at;
    limpar(previa, 'Situação: ', etiqueta(situacaoPrazo(c.data_termino.value, at, c.data_atendimento.value)));
  };
  [c.atendido, c.data_atendimento, c.data_termino].forEach((x) => x.addEventListener('change', atualizar));
  atualizar();
}

export async function paginaPrazos(el) {
  const tecnico = perfil() === 'tecnico';
  const resp = h('select', {}, h('option', { value: '' }, 'Todos os responsáveis'), opcoesEquipe().map(([v, t]) => h('option', { value: v }, t)));
  if (tecnico) resp.value = st.eu.id;
  const tipo = h('select', {}, h('option', { value: '' }, 'Todos os tipos'), TIPOS.map((t) => h('option', {}, t)));
  const sit = h('select', {}, h('option', { value: '' }, 'Todas as situações'), h('option', { value: 'pendentes' }, 'Pendentes (a vencer e vencidos)'),
    h('option', { value: 'atendidos' }, 'Atendidos (no prazo e fora)'), SIT_PRAZO.map((s) => h('option', {}, s)));
  const area = h('div');

  async function carregar() {
    let consulta = sb.from('v_prazo').select('*').order('data_termino', { nullsFirst: false });
    if (resp.value) consulta = consulta.eq('responsavel_id', resp.value);
    if (tipo.value) consulta = consulta.eq('tipo', tipo.value);
    if (sit.value === 'pendentes') consulta = consulta.eq('atendido', false);
    else if (sit.value === 'atendidos') consulta = consulta.eq('atendido', true);
    else if (sit.value) consulta = consulta.eq('situacao', sit.value);
    const linhas = await q(consulta);
    // atendidos vão para o final da lista
    const grupos = [
      ['A vencer', linhas.filter((p) => p.situacao === 'A vencer')],
      ['Vencidos', linhas.filter((p) => p.situacao === 'Vencido').reverse()],
      ['Sem data', linhas.filter((p) => p.situacao === 'Sem data')],
      ['Atendidos', linhas.filter((p) => ATENDIDOS.includes(p.situacao))
        .sort((a, b) => String(b.data_atendimento || '').localeCompare(String(a.data_atendimento || '')))],
    ];
    limpar(area, grupos.filter(([, ls]) => ls.length).map(([g, ls]) =>
      h('section', { class: 'secao' + (g === 'Atendidos' ? ' atendidos' : '') }, h('div', { class: 'secao-topo' }, h('h3', {}, g, ' ', h('span', { class: 'contador' }, ls.length))),
        tabela(colunasPrazo(), ls, { aoClicar: (p) => podeAbrirPrazo(p) && editarPrazo(p, p.os_id, carregar) }))));
    if (!area.children.length) limpar(area, h('p', { class: 'vazio' }, 'Nenhum prazo com estes filtros.'));
  }
  [resp, tipo, sit].forEach((x) => x.addEventListener('change', carregar));

  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Prazos')),
    h('p', { class: 'ajuda' }, 'Datas únicas a cumprir: prazos de órgãos, comunique-se, entrega de produtos, vencimento de contrato. A situação é automática: "A vencer" até a data e "Vencido" depois dela. Quando o prazo é marcado como atendido, fica "Atendido" (se a data do atendimento for até a data do prazo) ou "Atendido fora do prazo", e vai para o final da lista. As atividades com período ficam no ', h('a', { href: '#/cronograma' }, 'Cronograma'), '.'),
    h('div', { class: 'filtros' }, resp, tipo, sit), area);
  await carregar();
}

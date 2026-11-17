import { sb, st, h, limpar, q, tabela, etiqueta, fmtData, editarRegistro, opcoesEquipe, opcoesLista,
  somarDiasUteis, eGestor, perfil, botao } from '../base.js';

// Prazos são datas únicas (prazo de órgão, comunique-se, entrega de produto, vencimento de contrato...).
// A situação é calculada pela data: A vencer ou Vencido.
export const SIT_PRAZO = ['A vencer', 'Vencido'];
const ORIGENS = ['CETESB', 'MP | Ofício', 'MP', 'Prefeitura', 'CONDEPHAAT', 'Cliente', 'CTR-3', 'Contrato', 'Planejamento'];
const TIPOS = ['Prazo de órgão', 'Comunique-se', 'Entrega de produto', 'Vencimento de contrato', 'Protocolo',
  'Produto técnico', 'Vencimento', 'Vistoria técnica', 'Reunião'];

const quando = (p) => {
  if (p.dias_restantes == null) return '';
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
    { rotulo: 'Prazo', k: 'descricao', classe: 'texto' },
    { rotulo: 'Tipo', k: 'tipo' },
    { rotulo: 'Origem', k: 'origem' },
    { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: 'Situação', k: 'situacao', f: (p) => etiqueta(p.situacao) },
  ].filter(Boolean);
}

export function editarPrazo(registro, osId, depois) {
  const campos = [
    { k: 'descricao', rotulo: 'Descrição do prazo', obrig: true, largura: 2 },
    { k: 'tipo', rotulo: 'Tipo', sugestoes: TIPOS, ajuda: 'Escolha da lista ou escreva outro.' },
    { k: 'origem', rotulo: 'Origem', sugestoes: ORIGENS },
    { k: 'data_inicio', rotulo: 'Data de recebimento (opcional)', tipo: 'data', ajuda: 'Use junto com o prazo em dias para calcular a data.' },
    { k: 'qtd_dias', rotulo: 'Prazo em dias', tipo: 'numero' },
    { k: 'tipo_dia', rotulo: 'Contagem', tipo: 'opcoes', opcoes: [['úteis', 'Dias úteis'], ['corridos', 'Dias corridos']], numerico: false },
    { k: 'data_termino', rotulo: 'Data do prazo', tipo: 'data', obrig: true, ajuda: 'Calculada pela data de recebimento + dias (pode ajustar).' },
    { k: 'responsavel_id', rotulo: 'Responsável', tipo: 'opcoes', opcoes: opcoesEquipe },
    { k: 'referencia', rotulo: 'Referência', ajuda: 'Nº do ofício, comunique-se, processo...' },
  ];
  const form = editarRegistro({ titulo: 'prazo', tabela: 'prazo', registro, extras: registro ? {} : { os_id: osId }, campos, depois,
    podeExcluir: true });
  const c = form.ctrls;
  const calcular = () => {
    const d = somarDiasUteis(c.data_inicio.value, Number(c.qtd_dias.value), c.tipo_dia.value !== 'corridos');
    if (d) c.data_termino.value = d;
  };
  [c.data_inicio, c.qtd_dias, c.tipo_dia].forEach((x) => x.addEventListener('change', calcular));
}

export async function paginaPrazos(el) {
  const tecnico = perfil() === 'tecnico';
  const resp = h('select', {}, h('option', { value: '' }, 'Todos os responsáveis'), opcoesEquipe().map(([v, t]) => h('option', { value: v }, t)));
  if (tecnico) resp.value = st.eu.id;
  const tipo = h('select', {}, h('option', { value: '' }, 'Todos os tipos'), TIPOS.map((t) => h('option', {}, t)));
  const sit = h('select', {}, h('option', { value: '' }, 'A vencer e vencidos'), SIT_PRAZO.map((s) => h('option', {}, s)));
  const area = h('div');

  async function carregar() {
    let consulta = sb.from('v_prazo').select('*').order('data_termino', { nullsFirst: false });
    if (resp.value) consulta = consulta.eq('responsavel_id', resp.value);
    if (tipo.value) consulta = consulta.eq('tipo', tipo.value);
    if (sit.value) consulta = consulta.eq('situacao', sit.value);
    const linhas = await q(consulta);
    const grupos = [
      ['A vencer', linhas.filter((p) => p.situacao === 'A vencer')],
      ['Vencido', linhas.filter((p) => p.situacao === 'Vencido').reverse()],
      ['Sem data', linhas.filter((p) => p.situacao === 'Sem data')],
    ];
    limpar(area, grupos.filter(([, ls]) => ls.length).map(([g, ls]) =>
      h('section', { class: 'secao' }, h('div', { class: 'secao-topo' }, h('h3', {}, g === 'Vencido' ? 'Vencidos' : g, ' ', h('span', { class: 'contador' }, ls.length))),
        tabela(colunasPrazo(), ls, { aoClicar: (p) => (eGestor() || p.os_responsavel_id === st.eu.id) && editarPrazo(p, p.os_id, carregar) }))));
    if (!area.children.length) limpar(area, h('p', { class: 'vazio' }, 'Nenhum prazo com estes filtros.'));
  }
  [resp, tipo, sit].forEach((x) => x.addEventListener('change', carregar));

  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Prazos')),
    h('p', { class: 'ajuda' }, 'Datas únicas a cumprir: prazos de órgãos, comunique-se, entrega de produtos, vencimento de contrato. A situação é automática: "A vencer" até a data e "Vencido" depois dela. As atividades com período ficam no ', h('a', { href: '#/cronograma' }, 'Cronograma'), '.'),
    h('div', { class: 'filtros' }, resp, tipo, sit), area);
  await carregar();
}

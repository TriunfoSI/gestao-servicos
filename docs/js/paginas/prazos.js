import { sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, editarRegistro, opcoesEquipe, opcoesLista,
  somarDiasUteis, eGestor, perfil, botao } from '../base.js';

export const SIT_PRAZO = ['Não iniciado', 'Em andamento', 'Concluído', 'Não atendido', 'Cancelado'];
const ORIGENS = ['Planejamento', 'CETESB', 'MP | Ofício', 'MP', 'Prefeitura', 'CONDEPHAAT', 'Cliente', 'CTR-3'];
const TIPOS = ['Cronograma', 'Protocolo', 'Produto técnico', 'Vencimento', 'Vistoria técnica', 'Reunião'];

export function colunasPrazo({ comOS = true, acaoRapida } = {}) {
  return [
    { rotulo: 'Vence', f: (p) => h('span', { class: p.alerta === 'Vencido' ? 'txt-vermelho' : '' }, fmtData(p.data_termino)) },
    comOS && { rotulo: 'OS', f: (p) => h('a', { href: `#/os/${p.os_id}/prazos`, onclick: (e) => e.stopPropagation() }, p.os_numero || '—') },
    comOS && { rotulo: 'Cliente', k: 'cliente_curto' },
    { rotulo: 'Prazo', k: 'descricao', classe: 'texto' },
    { rotulo: 'Tipo', k: 'tipo' },
    { rotulo: 'Origem', k: 'origem' },
    { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: 'Situação', f: (p) => etiqueta(p.situacao) },
    { rotulo: 'Alerta', f: (p) => p.alerta !== 'Encerrado' ? etiqueta(p.alerta) : '' },
    acaoRapida && { rotulo: '', f: (p) => p.alerta !== 'Encerrado' ? h('button', { class: 'btn pequeno', onclick: (e) => { e.stopPropagation(); acaoRapida(p); } }, 'Concluir') : '' },
  ].filter(Boolean);
}

export function editarPrazo(registro, osId, depois) {
  const soSituacao = !!registro && !eGestor() && registro.os_responsavel_id !== st.eu.id;
  const campos = [
    { k: 'descricao', rotulo: 'Descrição do prazo', obrig: true, largura: 2, desativado: soSituacao },
    { k: 'tipo', rotulo: 'Tipo', sugestoes: TIPOS, desativado: soSituacao },
    { k: 'origem', rotulo: 'Origem', sugestoes: ORIGENS, desativado: soSituacao },
    { k: 'data_inicio', rotulo: 'Data de início / recebimento', tipo: 'data', desativado: soSituacao },
    { k: 'qtd_dias', rotulo: 'Prazo em dias', tipo: 'numero', desativado: soSituacao },
    { k: 'tipo_dia', rotulo: 'Contagem', tipo: 'opcoes', opcoes: [['úteis', 'Dias úteis'], ['corridos', 'Dias corridos']], numerico: false, desativado: soSituacao },
    { k: 'data_termino', rotulo: 'Data final', tipo: 'data', ajuda: 'Calculada pela data de início + dias (pode ajustar).', desativado: soSituacao },
    { k: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: SIT_PRAZO, obrig: true, numerico: false, padrao: 'Não iniciado' },
    { k: 'responsavel_id', rotulo: 'Responsável', tipo: 'opcoes', opcoes: opcoesEquipe, desativado: soSituacao },
    { k: 'periodo_id', rotulo: 'Período (bloco)', tipo: 'opcoes', opcoes: () => opcoesLista('periodo'), desativado: soSituacao },
    { k: 'referencia', rotulo: 'Referência', desativado: soSituacao },
  ];
  const form = editarRegistro({ titulo: 'prazo', tabela: 'prazo', registro, extras: registro ? {} : { os_id: osId }, campos, depois,
    podeExcluir: !soSituacao });
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
  const encerrados = h('input', { type: 'checkbox' });
  const area = h('div');

  async function carregar() {
    let consulta = sb.from('v_prazo').select('*').order('data_termino', { nullsFirst: false });
    if (resp.value) consulta = consulta.eq('responsavel_id', resp.value);
    if (tipo.value) consulta = consulta.eq('tipo', tipo.value);
    if (!encerrados.checked) consulta = consulta.neq('alerta', 'Encerrado');
    const linhas = await q(consulta);
    const grupos = ['Vencido', 'Próximos 7 dias', 'Próximos 30 dias', 'Mais adiante', 'Sem data', 'Encerrado'];
    const concluir = async (p) => {
      await q(sb.from('prazo').update({ situacao: 'Concluído' }).eq('id', p.id));
      aviso('Prazo concluído.'); carregar();
    };
    limpar(area, grupos.map((g) => {
      let ls = linhas.filter((p) => p.alerta === g);
      if (g === 'Vencido') ls = ls.reverse();
      if (!ls.length) return null;
      return h('section', { class: 'secao' }, h('div', { class: 'secao-topo' }, h('h3', {}, g, ' ', h('span', { class: 'contador' }, ls.length))),
        tabela(colunasPrazo({ acaoRapida: concluir }), ls, { aoClicar: (p) => editarPrazo(p, p.os_id, carregar) }));
    }).filter(Boolean));
    if (!area.children.length) limpar(area, h('p', { class: 'vazio' }, 'Nenhum prazo com estes filtros.'));
  }
  [resp, tipo, encerrados].forEach((x) => x.addEventListener('change', carregar));

  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Prazos')),
    h('p', { class: 'ajuda' }, 'Os prazos aparecem como vencidos enquanto não forem marcados como Concluído, Não atendido ou Cancelado.'),
    h('div', { class: 'filtros' }, resp, tipo, h('label', { class: 'marcar' }, encerrados, ' Mostrar encerrados')), area);
  await carregar();
}

export { botao };

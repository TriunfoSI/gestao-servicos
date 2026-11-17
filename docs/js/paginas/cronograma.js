import { sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, editarRegistro, opcoesEquipe, opcoesLista,
  eGestor, perfil, botao } from '../base.js';

// Cronograma: atividades com período para cumprir o escopo técnico da OS.
export const SIT_CRONO = ['Não iniciada', 'Em andamento', 'Concluída'];

const hoje = () => new Date().toLocaleDateString('sv-SE');
export function daquiDoisMeses() {
  const d = new Date(); d.setMonth(d.getMonth() + 2);
  return d.toLocaleDateString('sv-SE');
}

export function colunasCronograma({ comOS = true, comCliente = comOS } = {}) {
  return [
    { rotulo: 'Atividade', k: 'descricao', classe: 'texto' },
    comOS && { rotulo: 'OS', ord: (a) => a.os_numero, f: (a) => h('a', { href: `#/os/${a.os_id}/cronograma`, onclick: (e) => e.stopPropagation() }, a.os_numero || '—') },
    comCliente && { rotulo: 'Cliente', k: 'cliente_curto' },
    { rotulo: 'Início', ord: (a) => a.data_inicio, f: (a) => fmtData(a.data_inicio) },
    { rotulo: 'Término', ord: (a) => a.data_termino, f: (a) => h('span', { class: a.atrasada ? 'txt-vermelho' : '' }, fmtData(a.data_termino)) },
    { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: 'Situação', k: 'situacao', f: (a) => [etiqueta(a.situacao), a.atrasada ? [' ', etiqueta('Atrasada')] : null] },
  ].filter(Boolean);
}

export function editarAtividade(registro, osId, depois) {
  // técnico da atividade (sem ser responsável pela OS) só muda situação e observação
  const so = !!registro && !eGestor() && registro.os_responsavel_id !== st.eu.id;
  const campos = [
    { k: 'descricao', rotulo: 'Atividade', tipo: 'area', linhas: 2, obrig: true, largura: 2, desativado: so },
    { k: 'data_inicio', rotulo: 'Início', tipo: 'data', obrig: true, desativado: so },
    { k: 'data_termino', rotulo: 'Término', tipo: 'data', obrig: true, desativado: so },
    { k: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: SIT_CRONO, obrig: true, numerico: false, padrao: 'Não iniciada' },
    { k: 'responsavel_id', rotulo: 'Responsável', tipo: 'opcoes', opcoes: opcoesEquipe, desativado: so },
    { k: 'periodo_id', rotulo: 'Período (bloco)', tipo: 'opcoes', opcoes: () => opcoesLista('periodo'), desativado: so },
    { k: 'observacao', rotulo: 'Observação', tipo: 'area', linhas: 2, largura: 2 },
  ];
  return editarRegistro({ titulo: 'atividade do cronograma', tabela: 'cronograma', registro, campos, depois,
    extras: registro ? {} : { os_id: osId }, podeExcluir: !so,
    antesDeSalvar: (d) => {
      if (d.data_inicio && d.data_termino && d.data_termino < d.data_inicio) { aviso('O término não pode ser antes do início.', 'erro'); throw new Error('datas'); }
      return d;
    } });
}

const podeAbrir = (a) => eGestor() || a.os_responsavel_id === st.eu.id || a.responsavel_id === st.eu.id;

export async function paginaCronograma(el) {
  const tecnico = perfil() === 'tecnico';
  const resp = h('select', {}, h('option', { value: '' }, 'Todos os responsáveis'), opcoesEquipe().map(([v, t]) => h('option', { value: v }, t)));
  if (tecnico) resp.value = st.eu.id;
  const sit = h('select', {}, h('option', { value: 'abertas' }, 'Não concluídas'), h('option', { value: '' }, 'Todas'), SIT_CRONO.map((s) => h('option', {}, s)));
  const de = h('input', { type: 'date', value: hoje() }), ate = h('input', { type: 'date', value: daquiDoisMeses() });
  const atrasadas = h('input', { type: 'checkbox' });
  const area = h('div');

  async function carregar() {
    let c = sb.from('v_cronograma').select('*').order('data_inicio', { nullsFirst: false }).order('data_termino');
    if (resp.value) c = c.eq('responsavel_id', resp.value);
    if (sit.value === 'abertas') c = c.neq('situacao', 'Concluída');
    else if (sit.value) c = c.eq('situacao', sit.value);
    if (atrasadas.checked) c = c.eq('atrasada', true);
    else {
      // atividades que acontecem (ao menos em parte) dentro do período
      if (ate.value) c = c.lte('data_inicio', ate.value);
      if (de.value) c = c.gte('data_termino', de.value);
    }
    const linhas = await q(c);
    limpar(area, h('p', { class: 'contagem' }, `${linhas.length} atividades`),
      tabela(colunasCronograma(), linhas, { aoClicar: (a) => podeAbrir(a) && editarAtividade(a, a.os_id, carregar),
        vazio: 'Nenhuma atividade com estes filtros.' }));
  }
  [resp, sit, de, ate, atrasadas].forEach((x) => x.addEventListener('change', carregar));
  const todoPeriodo = botao('Todo o período', () => { de.value = ''; ate.value = ''; carregar(); });

  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Cronograma')),
    h('p', { class: 'ajuda' }, 'Atividades com período para cumprir o escopo técnico das OS. O período começa nos próximos dois meses; mude as datas ou clique em "Todo o período". Para incluir uma atividade, abra a OS na aba Cronograma.'),
    h('div', { class: 'filtros' }, resp, sit, h('span', { class: 'periodo' }, h('span', {}, 'De'), de, h('span', {}, 'a'), ate), todoPeriodo,
      h('label', { class: 'marcar' }, atrasadas, ' Só atrasadas (qualquer data)')), area);
  await carregar();
}

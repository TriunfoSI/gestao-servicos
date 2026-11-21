import { sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, editarRegistro, opcoesEquipe, opcoesLista,
  eGestor, perfil, botao, abrirJanela, somarDiasUteis } from '../base.js';

// Cronograma: atividades com período para cumprir o escopo técnico da OS.
export const SIT_CRONO = ['Não iniciada', 'Em andamento', 'Concluída'];
export const RESP_PARTE = ['Triunfo', 'Cliente'];

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
    { rotulo: 'Resp.', ord: (a) => a.responsavel_parte, f: (a) => [etiqueta(a.responsavel_parte),
      a.responsavel_parte === 'Triunfo' && a.responsavel_iniciais ? h('small', { class: 'txt-cinza' }, a.responsavel_iniciais) : null] },
    { rotulo: 'Situação', k: 'situacao', f: (a) => [etiqueta(a.situacao), a.atrasada ? [' ', etiqueta('Atrasada')] : null, a.preliminar ? [' ', etiqueta('Preliminar')] : null] },
  ].filter(Boolean);
}

export function editarAtividade(registro, osId, depois) {
  // técnico da atividade (sem ser responsável pela OS) só muda situação e observação
  const so = !!registro && !eGestor() && registro.os_responsavel_id !== st.eu.id;
  const campos = [
    { k: 'descricao', rotulo: 'Atividade', obrig: true, largura: 2, desativado: so,
      sugestoes: [...new Set(opcoesLista('atividade_padrao').map(([, t]) => t))], ajuda: so ? null : 'Comece a digitar para escolher uma atividade do cadastro, ou escreva uma nova.' },
    { k: 'data_inicio', rotulo: 'Início', tipo: 'data', obrig: true, desativado: so },
    { k: 'data_termino', rotulo: 'Término', tipo: 'data', obrig: true, desativado: so },
    { k: 'responsavel_parte', rotulo: 'Responsável', tipo: 'opcoes', opcoes: RESP_PARTE, obrig: true, numerico: false, padrao: 'Triunfo', desativado: so,
      ajuda: 'Aparece no link do cliente, para ele saber o que depende dele.' },
    { k: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: SIT_CRONO, obrig: true, numerico: false, padrao: 'Não iniciada' },
    { k: 'responsavel_id', rotulo: 'Técnico da Triunfo (opcional)', tipo: 'opcoes', opcoes: opcoesEquipe, desativado: so },
    { k: 'periodo_id', rotulo: 'Período (bloco)', tipo: 'opcoes', opcoes: () => opcoesLista('periodo'), desativado: so },
    { k: 'observacao', rotulo: 'Observação', tipo: 'area', linhas: 2, largura: 2 },
  ];
  return editarRegistro({ titulo: 'atividade do cronograma', tabela: 'cronograma', registro, campos, depois,
    extras: registro ? {} : { os_id: osId }, podeExcluir: !so,
    antesDeSalvar: (d) => {
      if (d.data_inicio && d.data_termino && d.data_termino < d.data_inicio) { aviso('O término não pode ser antes do início.', 'erro'); throw new Error('datas'); }
      if (!so) {
        d.preliminar = false;   // alterada pelo técnico = validada
        const padrao = (st.listas.atividade_padrao || []).find((x) => x.descricao.toLowerCase() === (d.descricao || '').toLowerCase());
        if (padrao && !registro) d.atividade_id = padrao.id;
      }
      return d;
    } });
}

// Atividades do cadastro que valem para a OS: Gerais + as da categoria (e subcategoria) dela
export function atividadesDaOS(os, todas = false) {
  return (st.listas.atividade_padrao || []).filter((a) => a.ativo !== false && (todas || !a.categoria_id ||
    (a.categoria_id === os.categoria_id && (!a.subcategoria_id || a.subcategoria_id === os.subcategoria_id))))
    .sort((x, y) => x.ordem - y.ordem || x.id - y.id);
}

const proximoDiaUtil = (d) => {
  const x = new Date(d + 'T12:00:00');
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x.toLocaleDateString('sv-SE');
};

// ------------------------------------------------------------------ edição em tabela
// Mostra todas as atividades da OS numa tabela editável. Em cima, uma caixa com as
// atividades do cadastro: cada clique inclui uma linha, com datas já sugeridas
// (logo depois da última atividade, pela duração cadastrada).
export function editarCronogramaEmTabela(os, existentes, depois) {
  let fechar;
  let linhas = existentes.map((a) => ({ ...a, _orig: a }));
  const removidas = [];
  const corpo = h('tbody');
  const todas = h('input', { type: 'checkbox' });
  const caixa = h('div', { class: 'caixa-atividades' });
  const validar = h('input', { type: 'checkbox', checked: true });

  const ultimaData = () => linhas.map((l) => l.data_termino).filter(Boolean).sort().pop();
  function novaLinha(dados = {}) {
    const ult = ultimaData();
    const inicio = proximoDiaUtil(ult ? somarDiasUteis(ult, 1, true) : (os.data_aceite && os.data_aceite > hoje() ? os.data_aceite : hoje()));
    const dur = dados.duracao_dias || 1;
    linhas.push({ descricao: dados.descricao || '', data_inicio: inicio, data_termino: dur > 1 ? somarDiasUteis(inicio, dur - 1, true) : inicio,
      responsavel_parte: dados.responsavel || 'Triunfo', situacao: 'Não iniciada', atividade_id: dados.id || null });
    desenhar();
    if (!dados.id) setTimeout(() => corpo.querySelector('tr:last-child input')?.focus(), 20);
  }

  function desenharCaixa() {
    const usadas = new Set(linhas.map((l) => l.atividade_id).filter(Boolean));
    const nomes = new Set(linhas.map((l) => (l.descricao || '').toLowerCase()));
    const lista = atividadesDaOS(os, todas.checked);
    limpar(caixa, lista.length ? lista.map((a) => {
      const ja = usadas.has(a.id) || nomes.has(a.descricao.toLowerCase());
      return h('button', { type: 'button', class: 'chip' + (ja ? ' usado' : ''), title: ja ? 'Já está no cronograma (clique para incluir de novo)' : `${a.responsavel} · ${a.duracao_dias} dia(s) útil(eis)`,
        onclick: () => novaLinha(a) }, ja ? '✓ ' : '+ ', a.descricao, h('small', {}, ' · ' + a.responsavel));
    }) : h('p', { class: 'vazio' }, eGestor() ? 'Nenhuma atividade cadastrada para esta categoria. Cadastre em Cadastros > Atividades do cronograma.' : 'Nenhuma atividade cadastrada para esta categoria.'));
  }

  const ctrl = (l, k, el) => { el.addEventListener('change', () => { l[k] = el.value.trim() || null; if (k === 'descricao') desenharCaixa(); }); return el; };
  function desenhar() {
    limpar(corpo, linhas.map((l, i) => h('tr', { class: l.preliminar ? 'preliminar' : '' },
      h('td', { 'data-rotulo': 'Atividade', class: 'texto' }, ctrl(l, 'descricao', h('input', { type: 'text', value: l.descricao || '', list: 'dl-atividades', required: true }))),
      h('td', { 'data-rotulo': 'Início' }, ctrl(l, 'data_inicio', h('input', { type: 'date', value: l.data_inicio || '' }))),
      h('td', { 'data-rotulo': 'Término' }, ctrl(l, 'data_termino', h('input', { type: 'date', value: l.data_termino || '' }))),
      h('td', { 'data-rotulo': 'Resp.' }, ctrl(l, 'responsavel_parte', h('select', {}, RESP_PARTE.map((r) => h('option', { selected: r === l.responsavel_parte }, r))))),
      h('td', { 'data-rotulo': 'Situação' }, ctrl(l, 'situacao', h('select', {}, SIT_CRONO.map((r) => h('option', { selected: r === l.situacao }, r))))),
      h('td', {}, h('button', { type: 'button', class: 'btn-icone', title: 'Tirar do cronograma', 'aria-label': 'Tirar do cronograma', onclick: () => {
        if (l.id) removidas.push(l.id);
        linhas.splice(i, 1); desenhar();
      } }, '×')))));
    desenharCaixa();
  }
  const ordenar = () => {
    linhas.sort((a, b) => (a.data_inicio || '9999').localeCompare(b.data_inicio || '9999') || (a.data_termino || '').localeCompare(b.data_termino || ''));
    desenhar();
  };
  todas.addEventListener('change', desenharCaixa);

  async function salvar(btn) {
    for (const l of linhas) {
      if (!l.descricao || !l.data_inicio || !l.data_termino) return aviso('Preencha atividade, início e término em todas as linhas (ou tire a linha com ×).', 'erro');
      if (l.data_termino < l.data_inicio) return aviso(`"${l.descricao}": o término não pode ser antes do início.`, 'erro');
    }
    btn.disabled = true;
    try {
      const campos = ['descricao', 'data_inicio', 'data_termino', 'responsavel_parte', 'situacao'];
      const ops = [];
      if (removidas.length) ops.push(q(sb.from('cronograma').delete().in('id', removidas)));
      for (const l of linhas.filter((x) => x.id)) {
        const mud = {};
        campos.forEach((k) => { if ((l[k] ?? null) !== (l._orig[k] ?? null)) mud[k] = l[k]; });
        if (validar.checked && l._orig.preliminar) mud.preliminar = false;
        if (Object.keys(mud).length) ops.push(q(sb.from('cronograma').update(mud).eq('id', l.id)));
      }
      const novas = linhas.filter((x) => !x.id).map((l) => {
        const padrao = l.atividade_id || (st.listas.atividade_padrao || []).find((x) => x.descricao.toLowerCase() === l.descricao.toLowerCase())?.id || null;
        return { os_id: os.id, descricao: l.descricao, data_inicio: l.data_inicio, data_termino: l.data_termino, responsavel_parte: l.responsavel_parte,
          situacao: l.situacao, atividade_id: padrao, preliminar: !validar.checked,
          responsavel_id: l.responsavel_parte === 'Triunfo' ? os.responsavel_id || null : null };
      });
      if (novas.length) ops.push(q(sb.from('cronograma').insert(novas)));
      await Promise.all(ops);
      aviso('Cronograma salvo.'); fechar(); depois && depois();
    } catch (e) { console.error(e); } finally { btn.disabled = false; }
  }

  const temPreliminar = existentes.some((a) => a.preliminar);
  const conteudo = h('div', { class: 'editor-cronograma' },
    h('datalist', { id: 'dl-atividades' }, [...new Set((st.listas.atividade_padrao || []).filter((a) => a.ativo !== false).map((a) => a.descricao))].map((d) => h('option', { value: d }))),
    h('div', { class: 'caixa-topo' }, h('strong', {}, 'Atividades do cadastro'), h('small', {}, ' — clique para incluir no cronograma'),
      h('label', { class: 'marcar direita' }, todas, ' Mostrar de todas as categorias')),
    caixa,
    h('div', { class: 'acoes esquerda' },
      botao('+ Atividade nova (fora do cadastro)', () => novaLinha()),
      botao('Ordenar por data de início', ordenar)),
    h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela tabela-edicao' },
      h('thead', {}, h('tr', {}, ['Atividade', 'Início', 'Término', 'Resp.', 'Situação', ''].map((t) => h('th', {}, t)))), corpo)),
    h('label', { class: 'marcar' }, validar, temPreliminar
      ? ' Validar o cronograma (as atividades preliminares deixam de ser preliminares e passam a aparecer no link do cliente)'
      : ' Atividades validadas (aparecem no link do cliente)'),
    h('div', { class: 'acoes' },
      h('button', { type: 'button', class: 'btn', onclick: () => fechar() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primario', onclick: (e) => salvar(e.currentTarget) }, 'Salvar cronograma')));
  ordenar();
  fechar = abrirJanela(`Cronograma da OS ${os.numero || '#' + os.id}`, conteudo, { largo: true, extraLargo: true });
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

import { sb, st, h, limpar, q, cartao, tabela, etiqueta, fmtData, fmtReais, eGestor, eFinanceiro, perfil } from '../base.js';
import { abrirTarefa } from './tarefas.js';
import { daquiDoisMeses } from './cronograma.js';

export async function paginaPainel(el) {
  const meuId = st.eu.id;
  const soMeu = perfil() === 'tecnico';

  const hojeStr = new Date().toLocaleDateString('sv-SE');
  let prazosQ = sb.from('v_prazo').select('*').order('data_termino', { nullsFirst: false });
  if (soMeu) prazosQ = prazosQ.eq('responsavel_id', meuId);
  // cronograma: atividades não concluídas que acontecem nos próximos dois meses
  let cronoQ = sb.from('v_cronograma').select('*').neq('situacao', 'Concluída')
    .lte('data_inicio', daquiDoisMeses()).gte('data_termino', hojeStr).order('data_inicio').order('data_termino');
  if (soMeu) cronoQ = cronoQ.eq('responsavel_id', meuId);
  let atrasQ = sb.from('v_cronograma').select('id', { count: 'exact', head: true }).eq('atrasada', true);
  if (soMeu) atrasQ = atrasQ.eq('responsavel_id', meuId);
  let tarefasQ = sb.from('v_tarefa').select('*').not('situacao', 'in', '("Concluída","Cancelada")').order('prioridade_ordem').order('prazo', { nullsFirst: false });
  if (soMeu) tarefasQ = tarefasQ.eq('responsavel_id', meuId);
  let osQ = sb.from('os').select('id,sit_contrato,revisar_migracao,responsavel_id');

  const [prazos, crono, atrasadasCrono, tarefas, oss, parcelas] = await Promise.all([
    q(prazosQ), q(cronoQ), atrasQ.then((r) => r.count || 0), q(tarefasQ), q(osQ),
    eFinanceiro() ? q(sb.from('v_parcela').select('valor,alerta').neq('alerta', 'Encerrada')) : [],
  ]);

  const ativas = oss.filter((o) => o.sit_contrato !== 'Encerrado' && (!soMeu || o.responsavel_id === meuId)).length;
  const aVencer = prazos.filter((p) => p.situacao === 'A vencer');
  const vencidos = prazos.filter((p) => p.situacao === 'Vencido').reverse();
  const semana = aVencer.filter((p) => p.dias_restantes <= 7);
  const revisar = oss.filter((o) => o.revisar_migracao).length;
  const atrasadas = parcelas.filter((p) => p.alerta === 'Atrasada');

  const cartoes = h('div', { class: 'cartoes' },
    cartao(soMeu ? 'Minhas OS ativas' : 'OS ativas', ativas, 'contrato não encerrado', '', '#/os'),
    cartao('Prazos em 7 dias', semana.length, `total a vencer: ${aVencer.length}`, semana.length ? 'laranja' : '', '#/prazos'),
    cartao(soMeu ? 'Minhas atividades atrasadas' : 'Atividades atrasadas', atrasadasCrono, 'cronograma com término vencido', atrasadasCrono ? 'vermelho' : '', '#/cronograma'),
    cartao(soMeu ? 'Minhas tarefas abertas' : 'Tarefas abertas', tarefas.length, null, '', '#/tarefas'),
    eFinanceiro() ? cartao('A receber', fmtReais(parcelas.reduce((s, p) => s + Number(p.valor), 0)),
      `${atrasadas.length} parcelas com previsão vencida`, atrasadas.length ? 'laranja' : '', '#/financeiro') : null,
    eGestor() && revisar ? cartao('OS para revisar', revisar, 'situação mudou na importação do Access', 'roxo', '#/os?revisar') : null,
  );

  const colPrazo = [
    { rotulo: 'Data', ord: (p) => p.data_termino, f: (p) => h('span', { class: p.situacao === 'Vencido' ? 'txt-vermelho' : '' }, fmtData(p.data_termino)) },
    { rotulo: 'OS', ord: (p) => p.os_numero, f: (p) => h('a', { href: `#/os/${p.os_id}/prazos`, onclick: (e) => e.stopPropagation() }, p.os_numero || '—') },
    { rotulo: 'Prazo', k: 'descricao', classe: 'texto' },
    !soMeu && { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: 'Situação', k: 'situacao', f: (p) => etiqueta(p.situacao) },
  ].filter(Boolean);
  const colCrono = [
    { rotulo: 'Atividade', k: 'descricao', classe: 'texto' },
    { rotulo: 'OS', ord: (a) => a.os_numero, f: (a) => h('a', { href: `#/os/${a.os_id}/cronograma`, onclick: (e) => e.stopPropagation() }, a.os_numero || '—') },
    { rotulo: 'Período', ord: (a) => a.data_inicio, f: (a) => h('span', { class: 'nowrap' }, fmtData(a.data_inicio), h('br'), 'a ', fmtData(a.data_termino)) },
    !soMeu && { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: 'Situação', k: 'situacao', f: (a) => etiqueta(a.situacao) },
  ].filter(Boolean);

  limpar(el,
    h('h1', {}, `Olá, ${st.eu.nome.split(' ')[0]}`),
    cartoes,
    h('div', { class: 'duas-colunas iguais' },
      h('section', { class: 'secao' }, h('div', { class: 'secao-topo' }, h('h3', {}, 'Cronograma ', h('small', {}, '· próximos 2 meses')), h('a', { href: '#/cronograma' }, 'Ver tudo')),
        h('div', { class: 'caixa-rolagem' }, tabela(colCrono, crono, { vazio: 'Nenhuma atividade prevista para os próximos dois meses.' }))),
      h('section', { class: 'secao' }, h('div', { class: 'secao-topo' }, h('h3', {}, 'Prazos ', h('small', {}, `· ${aVencer.length} a vencer, ${vencidos.length} vencidos`)), h('a', { href: '#/prazos' }, 'Ver tudo')),
        h('div', { class: 'caixa-rolagem' }, tabela(colPrazo, [...aVencer, ...vencidos, ...prazos.filter((p) => p.situacao === 'Sem data')], { vazio: 'Nenhum prazo cadastrado.' })))),
    h('section', { class: 'secao' }, h('div', { class: 'secao-topo' }, h('h3', {}, soMeu ? 'Minhas tarefas' : 'Tarefas abertas'), h('a', { href: '#/tarefas' }, 'Ver todas')),
      tabela([
        { rotulo: 'Tarefa', k: 'descricao', classe: 'texto' },
        { rotulo: 'OS', k: 'os_numero' },
        { rotulo: 'Prioridade', f: (t) => etiqueta(t.prioridade), ord: (t) => t.prioridade_ordem },
        !soMeu && { rotulo: 'Resp.', k: 'responsavel_iniciais' },
        { rotulo: 'Situação', f: (t) => etiqueta(t.situacao), k: 'situacao' },
      ].filter(Boolean), tarefas.slice(0, 10), { aoClicar: (t) => abrirTarefa(t.id, () => paginaPainel(el)), vazio: 'Nenhuma tarefa aberta.' })),
  );
}

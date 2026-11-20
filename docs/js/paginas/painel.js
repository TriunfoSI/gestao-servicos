import { sb, st, h, limpar, q, tabela, etiqueta, fmtData, perfil } from '../base.js';
import { abrirTarefa } from './tarefas.js';

// Situação automática da OS (calculada no banco pela visão v_os_situacao):
//   Pendência (vermelho)       -> alguma data vencida
//   Prazos a vencer (amarelo)  -> algo vence em até 10 dias
//   Em conformidade (verde)    -> nada vencido nem vencendo em 10 dias
const SITUACOES = [
  ['Pendência', 'vermelho'],
  ['Prazos a vencer', 'amarelo'],
  ['Em conformidade', 'verde'],
];
const COR_SITUACAO = Object.fromEntries(SITUACOES);
const ORDEM_SITUACAO = Object.fromEntries(SITUACOES.map(([s], i) => [s, i]));
const etqSituacao = (s) => h('span', { class: `etq ${COR_SITUACAO[s] || 'cinza'}` }, s);

// lista curta dos itens que explicam a situação (vencidos primeiro)
function motivos(o) {
  const itens = [...(o.itens || [])].sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'Vencido' ? -1 : 1));
  if (!itens.length) return h('span', { class: 'txt-cinza' }, 'Nenhuma data vencida ou vencendo em 10 dias');
  const mostrar = itens.slice(0, 3);
  return h('div', { class: 'motivos' },
    mostrar.map((i) => h('div', {},
      h('span', { class: i.estado === 'Vencido' ? 'txt-vermelho' : 'txt-amarelo' }, fmtData(i.data)), ' · ',
      h('b', {}, i.origem), ': ', i.descricao || '')),
    itens.length > mostrar.length ? h('div', { class: 'txt-cinza' }, `+ ${itens.length - mostrar.length} outros`) : null);
}

export async function paginaPainel(el) {
  const meuId = st.eu.id;
  const soMeu = perfil() === 'tecnico';

  let osQ = sb.from('v_os_situacao').select('*');
  if (soMeu) osQ = osQ.eq('responsavel_id', meuId);
  let prazosQ = sb.from('v_prazo').select('*').order('data_termino', { nullsFirst: false });
  if (soMeu) prazosQ = prazosQ.eq('responsavel_id', meuId);
  let tarefasQ = sb.from('v_tarefa').select('*').not('situacao', 'in', '("Concluída","Cancelada")').order('prioridade_ordem').order('prazo', { nullsFirst: false });
  if (soMeu) tarefasQ = tarefasQ.eq('responsavel_id', meuId);

  const [oss, prazos, tarefas] = await Promise.all([q(osQ), q(prazosQ), q(tarefasQ)]);

  // ------------------------------------------------ quadro 1: Ordens de Serviço
  oss.sort((a, b) => (ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao])
    || String(a.data_mais_proxima || '9999').localeCompare(String(b.data_mais_proxima || '9999'))
    || String(a.os_numero).localeCompare(String(b.os_numero), 'pt-BR', { numeric: true }));
  const conta = Object.fromEntries(SITUACOES.map(([s]) => [s, oss.filter((o) => o.situacao === s).length]));

  let filtro = '';
  const caixaOs = h('div', { class: 'caixa-rolagem' });
  const colOs = [
    { rotulo: 'OS', ord: (o) => o.os_numero, f: (o) => h('a', { href: `#/os/${o.os_id}`, onclick: (e) => e.stopPropagation() }, o.os_numero || '—') },
    { rotulo: 'Cliente', k: 'cliente_curto', classe: 'texto' },
    !soMeu && { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: 'Situação', ord: (o) => ORDEM_SITUACAO[o.situacao], f: (o) => etqSituacao(o.situacao) },
    { rotulo: 'O que vence', classe: 'texto', ord: (o) => o.data_mais_proxima, f: motivos },
  ].filter(Boolean);
  const desenharOs = () => limpar(caixaOs, tabela(colOs, filtro ? oss.filter((o) => o.situacao === filtro) : oss,
    { aoClicar: (o) => { location.hash = `#/os/${o.os_id}`; }, vazio: filtro ? 'Nenhuma OS nesta situação.' : 'Nenhuma OS em andamento.' }));
  const botoesFiltro = h('div', { class: 'filtro-situacao' });
  const desenharBotoes = () => limpar(botoesFiltro,
    [['', `Todas (${oss.length})`], ...SITUACOES.map(([s]) => [s, `${s} (${conta[s]})`])].map(([s, txt]) =>
      h('button', { class: 'btn pequeno' + (filtro === s ? ' ativo' : ''), onclick: () => { filtro = s; desenharBotoes(); desenharOs(); } }, txt)));
  desenharBotoes(); desenharOs();

  // ------------------------------------------------ quadro 2: Prazos
  const aVencer = prazos.filter((p) => p.situacao === 'A vencer');
  const vencidos = prazos.filter((p) => p.situacao === 'Vencido').reverse();
  const colPrazo = [
    { rotulo: 'Data', ord: (p) => p.data_termino, f: (p) => h('span', { class: p.situacao === 'Vencido' ? 'txt-vermelho' : '' }, fmtData(p.data_termino)) },
    { rotulo: 'OS', ord: (p) => p.os_numero, f: (p) => h('a', { href: `#/os/${p.os_id}/prazos`, onclick: (e) => e.stopPropagation() }, p.os_numero || '—') },
    { rotulo: 'Prazo', k: 'descricao', classe: 'texto' },
    !soMeu && { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: 'Situação', k: 'situacao', f: (p) => etiqueta(p.situacao) },
  ].filter(Boolean);

  limpar(el,
    h('h1', {}, `Olá, ${st.eu.nome.split(' ')[0]}`),
    h('section', { class: 'secao' },
      h('div', { class: 'secao-topo' },
        h('h3', {}, soMeu ? 'Minhas ordens de serviço' : 'Ordens de serviço', h('small', {}, ' · situação automática (prazos, cronograma, verificações e tarefas; amarelo = vence em até 10 dias)')),
        h('a', { href: '#/os' }, 'Ver todas')),
      botoesFiltro, caixaOs),
    h('section', { class: 'secao' },
      h('div', { class: 'secao-topo' }, h('h3', {}, 'Prazos ', h('small', {}, `· ${aVencer.length} a vencer, ${vencidos.length} vencidos`)), h('a', { href: '#/prazos' }, 'Ver tudo')),
      h('div', { class: 'caixa-rolagem' }, tabela(colPrazo, [...aVencer, ...vencidos, ...prazos.filter((p) => p.situacao === 'Sem data'), ...prazos.filter((p) => p.atendido).reverse()], { vazio: 'Nenhum prazo cadastrado.' }))),
    h('section', { class: 'secao' }, h('div', { class: 'secao-topo' }, h('h3', {}, soMeu ? 'Minhas tarefas' : 'Tarefas abertas', h('small', {}, ` · ${tarefas.length}`)), h('a', { href: '#/tarefas' }, 'Ver todas')),
      h('div', { class: 'caixa-rolagem' }, tabela([
        { rotulo: 'Tarefa', k: 'descricao', classe: 'texto' },
        { rotulo: 'OS', k: 'os_numero' },
        { rotulo: 'Prazo', f: (t) => fmtData(t.prazo), ord: (t) => t.prazo },
        { rotulo: 'Prioridade', f: (t) => etiqueta(t.prioridade), ord: (t) => t.prioridade_ordem },
        !soMeu && { rotulo: 'Resp.', k: 'responsavel_iniciais' },
        { rotulo: 'Situação', f: (t) => etiqueta(t.situacao), k: 'situacao' },
      ].filter(Boolean), tarefas, { aoClicar: (t) => abrirTarefa(t.id, () => paginaPainel(el)), vazio: 'Nenhuma tarefa aberta.' }))),
  );
}

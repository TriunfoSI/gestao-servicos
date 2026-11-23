import { sb, st, h, limpar, q, tabela, etiqueta, fmtData, perfil, cartao } from '../base.js';
import { abrirTarefa, etiquetaTarefa } from './tarefas.js';

// Situação automática da OS (calculada no banco pela visão v_os_situacao):
//   Pendência (vermelho)       -> algo técnico vencido (prazo, cronograma, verificação, tarefa, ART)
//   Pendência Comercial (laranja) -> só parcela de pagamento vencida
//   Prazos a vencer (amarelo)  -> algo vence em até 10 dias
//   Em conformidade (verde)    -> nada vencido nem vencendo em 10 dias
//   Paralisado (cinza)         -> contrato paralisado (fica no fim da lista)
// OS encerrada com ART ainda não baixada aparece como Pendência.
const SITUACOES = [
  ['Pendência', 'vermelho'],
  ['Pendência Comercial', 'laranja'],
  ['Prazos a vencer', 'amarelo'],
  ['Em conformidade', 'verde'],
  ['Paralisado', 'cinza'],
];
const COR_SITUACAO = Object.fromEntries(SITUACOES);
const ORDEM_SITUACAO = Object.fromEntries(SITUACOES.map(([s], i) => [s, i]));
const etqSituacao = (s) => h('span', { class: `etq ${COR_SITUACAO[s] || 'cinza'}` }, s);

// lista curta dos itens que explicam a situação (vencidos primeiro)
function motivos(o) {
  const itens = [...(o.itens || [])].sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'Vencido' ? -1 : 1));
  const aviso = o.situacao === 'Paralisado' ? h('div', { class: 'txt-cinza' }, 'Contrato paralisado.') : null;
  if (!itens.length) return aviso || h('span', { class: 'txt-cinza' }, 'Nenhuma data vencida ou vencendo em 10 dias');
  const mostrar = itens.slice(0, 3);
  return h('div', { class: 'motivos' }, aviso,
    mostrar.map((i) => h('div', {},
      h('span', { class: i.estado === 'Vencido' ? 'txt-vermelho' : 'txt-amarelo' }, fmtData(i.data)), ' · ',
      h('b', {}, i.origem), ': ', i.descricao || '')),
    itens.length > mostrar.length ? h('div', { class: 'txt-cinza' }, `+ ${itens.length - mostrar.length} outros`) : null);
}

// Tabela das OS com linhas retráteis: clicar na linha mostra/esconde "O que vence"
function tabelaOs(oss, soMeu, vazio) {
  if (!oss.length) return h('p', { class: 'vazio' }, vazio);
  const ncol = soMeu ? 3 : 4;
  const corpo = h('tbody');
  for (const o of oss) {
    const detalhe = h('tr', { class: 'detalhe-os', hidden: true },
      h('td', { colSpan: ncol }, h('div', { class: 'rotulo-detalhe' }, 'O que vence'), motivos(o),
        h('a', { href: `#/os/${o.os_id}`, class: 'abrir-os' }, 'Abrir a OS →')));
    const seta = h('span', { class: 'seta-retratil' }, '▸');
    const alternar = () => { detalhe.hidden = !detalhe.hidden; seta.textContent = detalhe.hidden ? '▸' : '▾'; };
    corpo.append(h('tr', { tabIndex: 0, title: 'Clique para ver o que vence', onclick: alternar,
      onkeydown: (e) => { if (e.key === 'Enter') alternar(); } },
      h('td', { 'data-rotulo': 'OS', class: 'nowrap' }, seta, ' ', o.os_numero || '—'),
      h('td', { 'data-rotulo': 'Cliente', class: 'texto' }, h('div', { class: 'resumo-3' }, o.cliente_curto || '')),
      soMeu ? null : h('td', { 'data-rotulo': 'Resp.' }, o.responsavel_iniciais || ''),
      h('td', { 'data-rotulo': 'Situação' }, etqSituacao(o.situacao))), detalhe);
  }
  return h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela clicavel tabela-os' },
    h('thead', {}, h('tr', {}, h('th', {}, 'OS'), h('th', {}, 'Cliente'), soMeu ? null : h('th', { class: 'col-resp' }, 'Resp.'), h('th', { class: 'col-sit' }, 'Situação'))),
    corpo));
}

// Tabela das tarefas com linhas retráteis: só Tarefa e Situação; clicar mostra OS, prioridade e prazo
function tabelaTarefas(tarefas, soMeu, recarregar) {
  if (!tarefas.length) return h('p', { class: 'vazio' }, 'Nenhuma tarefa aberta ou concluída nos últimos 15 dias.');
  const corpo = h('tbody');
  const item = (rotulo, valor) => h('div', { class: 'item-detalhe' }, h('span', { class: 'rotulo-detalhe' }, rotulo), valor);
  for (const t of tarefas) {
    const detalhe = h('tr', { class: 'detalhe-os', hidden: true },
      h('td', { colSpan: 2 },
        h('div', { class: 'itens-detalhe' },
          item('OS', t.os_id ? h('a', { href: `#/os/${t.os_id}/tarefas` }, t.os_numero || '—') : 'sem OS'),
          item('Cliente', t.cliente_curto || '—'),
          item('Prioridade', etiqueta(t.prioridade) || '—'),
          item('Prazo', t.prazo ? fmtData(t.prazo) : '—'),
          item('Atendida em', t.data_atendimento ? fmtData(t.data_atendimento) : '—'),
          soMeu ? null : item('Resp.', t.responsavel_iniciais || '—')),
        h('a', { href: '#/', class: 'abrir-os', onclick: (e) => { e.preventDefault(); abrirTarefa(t.id, recarregar); } }, 'Abrir a tarefa →')));
    const seta = h('span', { class: 'seta-retratil' }, '▸');
    const texto = h('div', { class: 'resumo-3', title: t.descricao || '' }, t.descricao || '');
    // aberta: mostra o texto inteiro da tarefa
    const alternar = () => { detalhe.hidden = !detalhe.hidden; seta.textContent = detalhe.hidden ? '▸' : '▾'; texto.classList.toggle('resumo-3', detalhe.hidden); };
    corpo.append(h('tr', { class: t.situacao === 'Concluída' ? 'concluida' : null, tabIndex: 0, title: 'Clique para ver OS, cliente e prioridade', onclick: alternar,
      onkeydown: (e) => { if (e.key === 'Enter') alternar(); } },
      h('td', { 'data-rotulo': 'Tarefa', class: 'texto' }, h('div', { class: 'com-seta' }, seta, texto)),
      h('td', { 'data-rotulo': 'Situação' }, etiquetaTarefa(t))), detalhe);
  }
  return h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela clicavel tabela-os tabela-tarefas' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Tarefa'), h('th', { class: 'col-sit' }, 'Situação'))),
    corpo));
}

export async function paginaPainel(el) {
  const meuId = st.eu.id;
  const soMeu = perfil() === 'tecnico';

  let osQ = sb.from('v_os_situacao').select('*');
  if (soMeu) osQ = osQ.eq('responsavel_id', meuId);
  let prazosQ = sb.from('v_prazo').select('*').order('data_termino', { nullsFirst: false });
  if (soMeu) prazosQ = prazosQ.eq('responsavel_id', meuId);
  // tarefas abertas + concluídas nos últimos 15 dias (para a reunião semanal)
  const ha15dias = new Date(Date.now() - 15 * 864e5).toLocaleDateString('sv-SE');
  let tarefasQ = sb.from('v_tarefa').select('*').neq('situacao', 'Cancelada')
    .or(`situacao.neq.Concluída,data_atendimento.gte.${ha15dias}`)
    .order('prioridade_ordem').order('prazo', { nullsFirst: false });
  if (soMeu) tarefasQ = tarefasQ.eq('responsavel_id', meuId);

  const [oss, prazos, todasTarefas] = await Promise.all([q(osQ), q(prazosQ), q(tarefasQ)]);
  const tarefas = todasTarefas.filter((t) => t.situacao !== 'Concluída');
  const concluidas = todasTarefas.filter((t) => t.situacao === 'Concluída')
    .sort((a, b) => String(b.data_atendimento).localeCompare(String(a.data_atendimento)));

  oss.sort((a, b) => (ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao])
    || String(a.data_mais_proxima || '9999').localeCompare(String(b.data_mais_proxima || '9999'))
    || String(a.os_numero).localeCompare(String(b.os_numero), 'pt-BR', { numeric: true }));
  const comPendencia = oss.filter((o) => o.situacao === 'Pendência' || o.situacao === 'Pendência Comercial');
  const pendComercial = comPendencia.filter((o) => o.situacao === 'Pendência Comercial').length;
  const ativas = oss.filter((o) => o.sit_contrato !== 'Encerrado');   // encerradas só aparecem se a ART não foi baixada
  const paralisadas = oss.filter((o) => o.situacao === 'Paralisado');
  const aVencer = prazos.filter((p) => p.situacao === 'A vencer');
  const vencidos = prazos.filter((p) => p.situacao === 'Vencido').reverse();
  const em10dias = aVencer.filter((p) => p.dias_restantes <= 10);
  const altas = tarefas.filter((t) => t.prioridade === 'Alta');

  // ------------------------------------------------ quadro OS (com filtro pelo cartão "Pendências")
  let soPendencia = false;
  const caixaOs = h('div', { class: 'caixa-rolagem' });
  const tituloOs = h('small');
  const desenharOs = () => {
    tituloOs.textContent = soPendencia ? ' · só com pendência' : ` · ${oss.length}`;
    limpar(caixaOs, tabelaOs(soPendencia ? comPendencia : oss, soMeu, soPendencia ? 'Nenhuma OS com pendência.' : 'Nenhuma OS em andamento.'));
  };
  desenharOs();

  const cartaoPendencias = cartao('Pendências', comPendencia.length, `${comPendencia.length - pendComercial} técnicas · ${pendComercial} comerciais · clique para filtrar`, comPendencia.length ? 'vermelho' : 'verde');
  cartaoPendencias.classList.add('clicavel');
  cartaoPendencias.title = 'Mostrar só as OS com pendência';
  cartaoPendencias.addEventListener('click', () => {
    soPendencia = !soPendencia; cartaoPendencias.classList.toggle('ativo', soPendencia); desenharOs();
  });

  const cartoes = h('div', { class: 'cartoes quatro' },
    cartao(soMeu ? 'Minhas OS ativas' : 'OS ativas', ativas.length, `contrato não encerrado · ${paralisadas.length} paralisadas`, 'azul', '#/os'),
    cartao('Prazos a vencer', em10dias.length, `nos próximos 10 dias · ${vencidos.length} vencidos`, em10dias.length ? 'amarelo' : '', '#/prazos'),
    cartaoPendencias,
    cartao(soMeu ? 'Minhas tarefas' : 'Tarefas abertas', tarefas.length, `${altas.length} de prioridade alta`, '', '#/tarefas'),
  );

  // ------------------------------------------------ quadros Prazos e Tarefas
  const colPrazo = [
    { rotulo: 'Data', ord: (p) => p.data_termino, f: (p) => h('span', { class: p.situacao === 'Vencido' ? 'txt-vermelho nowrap' : 'nowrap' }, fmtData(p.data_termino)) },
    { rotulo: 'OS', ord: (p) => p.os_numero, f: (p) => h('a', { href: `#/os/${p.os_id}/prazos`, class: 'nowrap' }, p.os_numero || '—') },
    { rotulo: 'Descrição', k: 'descricao', classe: 'texto', f: (p) => h('div', { class: 'resumo-3', title: p.descricao || '' }, p.descricao || '') },
    { rotulo: 'Situação', k: 'situacao', f: (p) => etiqueta(p.situacao) },
  ];
  const quadro = (titulo, detalhe, href, conteudo) => h('section', { class: 'secao quadro-inicio' },
    h('div', { class: 'secao-topo' }, h('h3', {}, titulo, detalhe), h('a', { href }, 'Ver tudo')),
    conteudo);

  limpar(el,
    h('h1', {}, `Olá, ${st.eu.nome.split(' ')[0]}`),
    cartoes,
    h('div', { class: 'tres-quadros' },
      quadro(soMeu ? 'Minhas OS' : 'Ordens de serviço', tituloOs, '#/os', caixaOs),
      quadro('Prazos', h('small', {}, ` · ${aVencer.length} a vencer, ${vencidos.length} vencidos`), '#/prazos',
        h('div', { class: 'caixa-rolagem' }, tabela(colPrazo, [...aVencer, ...vencidos, ...prazos.filter((p) => p.situacao === 'Sem data')], { vazio: 'Nenhum prazo em aberto.' }))),
      quadro(soMeu ? 'Minhas tarefas' : 'Tarefas', h('small', {}, ` · ${tarefas.length} abertas, ${concluidas.length} concluídas (15 dias)`), '#/tarefas',
        h('div', { class: 'caixa-rolagem' }, tabelaTarefas([...tarefas, ...concluidas], soMeu, () => paginaPainel(el))))),
  );
}

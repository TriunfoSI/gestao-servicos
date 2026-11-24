import { sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, fmtDataHora, editarRegistro, abrirJanela, formulario,
  opcoesEquipe, eGestor, perfil, botao } from '../base.js';

export const SIT_TAREFA = ['A fazer', 'Em andamento', 'Apoio técnico', 'Aguardando terceiros', 'Subtarefas', 'Concluída', 'Cancelada'];
// "Subtarefas" é automática (o banco coloca quando a tarefa tem subtarefas em aberto e tira quando todas terminam):
// só aparece na lista de escolha quando a tarefa já está nessa situação
const situacoesEscolha = (atual) => SIT_TAREFA.filter((s) => s !== 'Subtarefas' || atual === 'Subtarefas');
export const PRIORIDADES = ['Alta', 'Média', 'Baixa'];

// Situação da tarefa comparada ao prazo (mesma lógica dos prazos):
// concluída mostra "Concluída" ou "Concluída fora do prazo"; aberta com prazo passado ganha "Vencida"
export function etiquetaTarefa(t) {
  if (t.situacao === 'Concluída') return etiqueta(t.situacao_prazo || 'Concluída');
  return h('span', { class: 'etiquetas' }, etiqueta(t.situacao), t.situacao_prazo === 'Vencida' ? etiqueta('Vencida') : null);
}

// Texto da tarefa nas listas, com o vínculo: "↳ subtarefa de ..." e/ou "2 de 3 subtarefas concluídas"
export function textoTarefa(t) {
  const sub = t.tarefa_pai_id ? h('small', { class: 'vinculo' }, '↳ Subtarefa de: ', resumo(t.tarefa_pai_descricao, 60)) : null;
  const cont = t.subtarefas_total ? h('small', { class: 'vinculo' }, `${t.subtarefas_concluidas} de ${t.subtarefas_total} subtarefas concluídas`) : null;
  return sub || cont ? h('div', {}, t.descricao, sub, cont) : t.descricao;
}

async function opcoesOS() {
  const lista = await q(sb.from('v_os').select('id,numero,cliente_curto,titulo').not('sit_contrato', 'in', '("Encerrado","Cancelado")').order('id', { ascending: false }));
  return lista.map((o) => [o.id, `${o.numero || '#' + o.id} — ${o.cliente_curto} — ${(o.titulo || '').slice(0, 50)}`]);
}

// Opções de "Tarefa de origem": outras tarefas da mesma OS (ou tarefas gerais, se não tiver OS)
async function opcoesTarefaOrigem(t) {
  let c = sb.from('tarefa').select('id,descricao,situacao').neq('id', t.id).neq('situacao', 'Cancelada').order('id', { ascending: false });
  c = t.os_id ? c.eq('os_id', t.os_id) : c.is('os_id', null);
  const lista = await q(c);
  return lista.map((x) => [x.id, `${resumo(x.descricao, 90)}${x.situacao === 'Concluída' ? ' (concluída)' : ''}`]);
}

const resumo = (txt, n = 70) => { const s = (txt || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Nova tarefa, edição de tarefa ou, com `pai`, nova subtarefa (tarefa vinculada) da tarefa `pai`
export async function editarTarefa(registro, depois, osId, pai) {
  if (pai) osId = pai.os_id || null;
  const listaOS = osId || pai ? [] : await opcoesOS();
  const listaOrigem = registro?.id ? await opcoesTarefaOrigem(registro) : [];
  const extras = pai ? { tarefa_pai_id: pai.id, os_id: pai.os_id || null } : osId && !registro ? { os_id: osId } : {};
  return editarRegistro({ titulo: pai ? 'tarefa vinculada' : 'tarefa', tabela: 'tarefa', registro, depois, podeExcluir: eGestor(),
    extras,
    campos: [
      pai ? { tipo: 'info', rotulo: h('span', {}, 'Tarefa de origem: ', h('strong', {}, resumo(pai.descricao, 120)), pai.os_numero ? ` · OS ${pai.os_numero}` : ' · Tarefa geral') } : null,
      osId || pai ? null : { k: 'os_id', rotulo: 'OS (deixe em branco para tarefa geral)', tipo: 'opcoes', opcoes: listaOS, largura: 2 },
      registro?.id ? { k: 'tarefa_pai_id', rotulo: 'Tarefa de origem (deixe em branco se não for subtarefa)', tipo: 'opcoes', opcoes: listaOrigem, largura: 2 } : null,
      { k: 'descricao', rotulo: 'Tarefa', tipo: 'area', obrig: true, linhas: 3 },
      { k: 'responsavel_id', rotulo: 'Responsável', tipo: 'opcoes', opcoes: opcoesEquipe, obrig: true },
      { k: 'prioridade', rotulo: 'Prioridade', tipo: 'opcoes', opcoes: PRIORIDADES, obrig: true, numerico: false, padrao: 'Média' },
      { k: 'data_reuniao', rotulo: 'Data de criação', tipo: 'data', padrao: new Date().toLocaleDateString('sv-SE') },
      { k: 'prazo', rotulo: 'Prazo', tipo: 'data' },
      { k: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: situacoesEscolha(registro?.situacao), obrig: true, numerico: false, padrao: 'A fazer',
        ajuda: registro?.situacao === 'Subtarefas' ? 'Fica em "Subtarefas" até que todas as subtarefas sejam concluídas ou canceladas.' : null },
      { k: 'data_atendimento', rotulo: 'Data de atendimento', tipo: 'data', ajuda: 'Preenchida sozinha quando a tarefa é concluída. Pode ser corrigida aqui.' },
      { k: 'orientacao_tecnica', rotulo: 'Orientação técnica', tipo: 'area', linhas: 4, ajuda: 'Orientação da coordenação para o técnico executar a tarefa.' },
      { k: 'observacao', rotulo: 'Observação', tipo: 'area', linhas: 2 },
    ].filter(Boolean) });
}

// Janela da tarefa: detalhes, histórico e atualização de situação pelo técnico
export async function abrirTarefa(id, depois) {
  const [t, hist, subs] = await Promise.all([
    q(sb.from('v_tarefa').select('*').eq('id', id).single()),
    q(sb.from('tarefa_atualizacao').select('*').eq('tarefa_id', id).order('em', { ascending: false })),
    q(sb.from('v_tarefa').select('*').eq('tarefa_pai_id', id).order('data_reuniao').order('id')),
  ]);
  const subsAbertas = subs.filter((s) => !['Concluída', 'Cancelada'].includes(s.situacao));
  // quem pode criar tarefa vinculada: coordenação ou o responsável pela OS (mesma regra da "Nova tarefa")
  const podeVincular = !['Concluída', 'Cancelada'].includes(t.situacao) && (eGestor() || (t.os_id && t.os_responsavel_id === st.eu.id));
  const reabrir = () => { fechar(); abrirTarefa(id, depois); };
  const quem = (uid) => st.listas.equipe.find((e) => e.user_id === uid)?.nome || '';
  let fechar;
  const atualizar = formulario([
    { k: 'situacao', rotulo: 'Nova situação', tipo: 'opcoes', opcoes: situacoesEscolha(t.situacao), obrig: true, numerico: false },
    { k: 'comentario', rotulo: 'Comentário do técnico', tipo: 'area', linhas: 3 },
  ], { situacao: t.situacao }, {
    rotuloSalvar: 'Atualizar',
    aoSalvar: async (d) => {
      if (!['Subtarefas', 'Cancelada'].includes(d.situacao) && t.situacao !== d.situacao && subsAbertas.length) {
        aviso(`Esta tarefa tem ${subsAbertas.length} subtarefa(s) em aberto. Ela fica em "Subtarefas" até que todas sejam concluídas ou canceladas.`, 'erro');
        return;
      }
      if (d.situacao !== t.situacao) await q(sb.from('tarefa').update({ situacao: d.situacao }).eq('id', id));
      if (d.comentario) await q(sb.from('tarefa_atualizacao').insert({ tarefa_id: id, situacao: d.situacao, comentario: d.comentario }));
      aviso('Tarefa atualizada.'); fechar(); depois && depois();
    },
  });
  fechar = abrirJanela('Tarefa', h('div', {},
    h('p', { class: 'pre tarefa-desc' }, t.descricao),
    h('dl', { class: 'detalhes compacto' },
      h('dt', {}, 'OS'), h('dd', {}, t.os_id ? h('a', { href: `#/os/${t.os_id}/tarefas`, onclick: () => fechar() }, `${t.os_numero} — ${t.cliente_curto}`) : 'Tarefa geral'),
      t.tarefa_pai_id ? [h('dt', {}, 'Tarefa de origem'), h('dd', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); fechar(); abrirTarefa(t.tarefa_pai_id, depois); } }, resumo(t.tarefa_pai_descricao, 120) || 'Abrir'))] : null,
      h('dt', {}, 'Responsável'), h('dd', {}, t.responsavel_nome || '—'),
      h('dt', {}, 'Prioridade'), h('dd', {}, etiqueta(t.prioridade)),
      h('dt', {}, 'Data de criação'), h('dd', {}, fmtData(t.data_reuniao) || '—'),
      h('dt', {}, 'Prazo'), h('dd', {}, fmtData(t.prazo) || '—'),
      h('dt', {}, 'Situação'), h('dd', {}, etiquetaTarefa(t)),
      t.data_atendimento ? [h('dt', {}, 'Data de atendimento'), h('dd', {}, fmtData(t.data_atendimento))] : null,
      t.orientacao_tecnica ? [h('dt', {}, 'Orientação técnica'), h('dd', { class: 'pre' }, t.orientacao_tecnica)] : null,
      t.observacao ? [h('dt', {}, 'Observação'), h('dd', { class: 'pre' }, t.observacao)] : null),
    eGestor() || podeVincular ? h('div', { class: 'acoes esquerda' },
      eGestor() ? botao('Editar tarefa', () => { fechar(); editarTarefa(t, depois); }) : null,
      podeVincular ? botao('Criar tarefa vinculada', () => { fechar(); editarTarefa(null, () => { reabrir(); depois && depois(); }, null, t); }) : null) : null,
    subs.length ? [
      h('h3', {}, 'Subtarefas ', h('small', {}, `· ${t.subtarefas_concluidas} de ${t.subtarefas_total} concluídas`)),
      subsAbertas.length && t.situacao !== 'Concluída'
        ? h('p', { class: 'ajuda' }, 'A situação desta tarefa fica em "Subtarefas" até que todas as subtarefas sejam concluídas ou canceladas. Depois ela volta sozinha para "Em andamento" e você pode concluí-la.') : null,
      tabela([
        { rotulo: 'Subtarefa', k: 'descricao', classe: 'texto' },
        { rotulo: 'Responsável', k: 'responsavel_nome' },
        { rotulo: 'Prazo', f: (s) => fmtData(s.prazo), ord: (s) => s.prazo },
        { rotulo: 'Situação', f: etiquetaTarefa, k: 'situacao' },
      ], subs, { aoClicar: (s) => { fechar(); abrirTarefa(s.id, depois); } }),
    ] : null,
    h('h3', {}, 'Atualizar'), atualizar,
    hist.length ? [h('h3', {}, 'Histórico'), h('ul', { class: 'historico' }, hist.map((a) => h('li', {},
      h('small', {}, fmtDataHora(a.em), ' · ', quem(a.usuario_id) || 'sistema'), a.situacao ? [' ', etiqueta(a.situacao)] : null,
      a.comentario ? h('p', { class: 'pre' }, a.comentario) : null)))] : null), { largo: true });
}

export async function paginaTarefas(el) {
  const tecnico = perfil() === 'tecnico';
  const resp = h('select', {}, h('option', { value: '' }, 'Todos os responsáveis'), opcoesEquipe().map(([v, t]) => h('option', { value: v }, t)));
  if (tecnico) resp.value = st.eu.id;
  const sit = h('select', {}, h('option', { value: 'abertas' }, 'Abertas'), h('option', { value: '' }, 'Todas'), SIT_TAREFA.map((s) => h('option', {}, s)));
  const prio = h('select', {}, h('option', { value: '' }, 'Todas as prioridades'), PRIORIDADES.map((p) => h('option', {}, p)));
  const data = () => h('input', { type: 'date' });
  const criadoDe = data(), criadoAte = data(), atualDe = data(), atualAte = data();
  const periodo = (rotulo, de, ate) => h('span', { class: 'periodo' }, h('span', {}, rotulo), de, h('span', {}, 'a'), ate);
  const diaSeguinte = (d) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1); return x.toLocaleDateString('sv-SE'); };
  const area = h('div');

  async function carregar() {
    let c = sb.from('v_tarefa').select('*').order('prazo', { nullsFirst: false }).order('data_reuniao', { ascending: false });
    if (resp.value) c = c.eq('responsavel_id', resp.value);
    if (sit.value === 'abertas') c = c.not('situacao', 'in', '("Concluída","Cancelada")');
    else if (sit.value) c = c.eq('situacao', sit.value);
    if (prio.value) c = c.eq('prioridade', prio.value);
    if (criadoDe.value) c = c.gte('data_reuniao', criadoDe.value);
    if (criadoAte.value) c = c.lte('data_reuniao', criadoAte.value);
    if (atualDe.value) c = c.gte('ultima_atualizacao', atualDe.value);
    if (atualAte.value) c = c.lt('ultima_atualizacao', diaSeguinte(atualAte.value));
    const linhas = await q(c);
    const hojeStr = new Date().toLocaleDateString('sv-SE');
    limpar(area, h('p', { class: 'contagem' }, `${linhas.length} tarefas`), tabela([
      { rotulo: 'Tarefa', f: textoTarefa, k: 'descricao', classe: 'texto' },
      { rotulo: 'OS', f: (t) => t.os_numero ? `${t.os_numero} · ${t.cliente_curto}` : 'Geral', ord: (t) => t.os_numero || '' },
      { rotulo: 'Resp.', k: 'responsavel_iniciais' },
      { rotulo: 'Prioridade', f: (t) => etiqueta(t.prioridade), ord: (t) => t.prioridade_ordem },
      { rotulo: 'Data de criação', f: (t) => fmtData(t.data_reuniao), ord: (t) => t.data_reuniao },
      { rotulo: 'Prazo', f: (t) => h('span', { class: t.prazo && t.prazo < hojeStr && !['Concluída', 'Cancelada'].includes(t.situacao) ? 'txt-vermelho' : '' }, fmtData(t.prazo)), ord: (t) => t.prazo },
      { rotulo: 'Situação', f: etiquetaTarefa, k: 'situacao' },
      { rotulo: 'Atualizada', f: (t) => fmtData(t.ultima_atualizacao || t.atualizado_em), ord: (t) => t.ultima_atualizacao || t.atualizado_em },
    ], linhas, { aoClicar: (t) => abrirTarefa(t.id, carregar), vazio: 'Nenhuma tarefa com estes filtros.' }));
  }
  [resp, sit, prio, criadoDe, criadoAte, atualDe, atualAte].forEach((x) => x.addEventListener('change', carregar));
  const limparFiltros = botao('Limpar filtros', () => { [criadoDe, criadoAte, atualDe, atualAte].forEach((x) => { x.value = ''; }); prio.value = ''; carregar(); });
  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Tarefas'),
    eGestor() ? botao('Nova tarefa', () => editarTarefa(null, carregar), 'primario') : null),
  h('p', { class: 'ajuda' }, 'Tarefas definidas nas reuniões técnicas. Clique numa tarefa para ver a orientação técnica, atualizar a situação e deixar o comentário do técnico. Clique no título de uma coluna para ordenar (clique de novo para inverter).'),
  h('div', { class: 'filtros' }, resp, sit, prio, periodo('Criada de', criadoDe, criadoAte), periodo('Atualizada de', atualDe, atualAte), limparFiltros), area);
  await carregar();
}

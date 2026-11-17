import { sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, fmtDataHora, editarRegistro, abrirJanela, formulario,
  opcoesEquipe, eGestor, perfil, botao } from '../base.js';

export const SIT_TAREFA = ['A fazer', 'Em andamento', 'Aguardando terceiros', 'Concluída', 'Cancelada'];

async function opcoesOS() {
  const lista = await q(sb.from('v_os').select('id,numero,cliente_curto,titulo').neq('sit_contrato', 'Encerrado').order('id', { ascending: false }));
  return lista.map((o) => [o.id, `${o.numero || '#' + o.id} — ${o.cliente_curto} — ${(o.titulo || '').slice(0, 50)}`]);
}

export async function editarTarefa(registro, depois, osId) {
  const listaOS = osId ? [] : await opcoesOS();
  return editarRegistro({ titulo: 'tarefa', tabela: 'tarefa', registro, depois, podeExcluir: eGestor(),
    extras: osId && !registro ? { os_id: osId } : {},
    campos: [
      osId ? null : { k: 'os_id', rotulo: 'OS (deixe em branco para tarefa geral)', tipo: 'opcoes', opcoes: listaOS, largura: 2 },
      { k: 'descricao', rotulo: 'Tarefa', tipo: 'area', obrig: true, linhas: 3 },
      { k: 'responsavel_id', rotulo: 'Responsável', tipo: 'opcoes', opcoes: opcoesEquipe, obrig: true },
      { k: 'data_reuniao', rotulo: 'Data da reunião', tipo: 'data', padrao: new Date().toLocaleDateString('sv-SE') },
      { k: 'prazo', rotulo: 'Prazo', tipo: 'data' },
      { k: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: SIT_TAREFA, obrig: true, numerico: false, padrao: 'A fazer' },
      { k: 'observacao', rotulo: 'Observação', tipo: 'area', linhas: 2 },
    ].filter(Boolean) });
}

// Janela da tarefa: detalhes, histórico e atualização de situação pelo técnico
export async function abrirTarefa(id, depois) {
  const [t, hist] = await Promise.all([
    q(sb.from('v_tarefa').select('*').eq('id', id).single()),
    q(sb.from('tarefa_atualizacao').select('*').eq('tarefa_id', id).order('em', { ascending: false })),
  ]);
  const quem = (uid) => st.listas.equipe.find((e) => e.user_id === uid)?.nome || '';
  let fechar;
  const atualizar = formulario([
    { k: 'situacao', rotulo: 'Nova situação', tipo: 'opcoes', opcoes: SIT_TAREFA, obrig: true, numerico: false },
    { k: 'comentario', rotulo: 'Comentário para a coordenação', tipo: 'area', linhas: 3 },
  ], { situacao: t.situacao }, {
    rotuloSalvar: 'Atualizar',
    aoSalvar: async (d) => {
      if (d.situacao !== t.situacao) await q(sb.from('tarefa').update({ situacao: d.situacao }).eq('id', id));
      if (d.comentario) await q(sb.from('tarefa_atualizacao').insert({ tarefa_id: id, situacao: d.situacao, comentario: d.comentario }));
      aviso('Tarefa atualizada.'); fechar(); depois && depois();
    },
  });
  fechar = abrirJanela('Tarefa', h('div', {},
    h('p', { class: 'pre tarefa-desc' }, t.descricao),
    h('dl', { class: 'detalhes compacto' },
      h('dt', {}, 'OS'), h('dd', {}, t.os_id ? h('a', { href: `#/os/${t.os_id}/tarefas`, onclick: () => fechar() }, `${t.os_numero} — ${t.cliente_curto}`) : 'Tarefa geral'),
      h('dt', {}, 'Responsável'), h('dd', {}, t.responsavel_nome || '—'),
      h('dt', {}, 'Reunião'), h('dd', {}, fmtData(t.data_reuniao) || '—'),
      h('dt', {}, 'Prazo'), h('dd', {}, fmtData(t.prazo) || '—'),
      h('dt', {}, 'Situação'), h('dd', {}, etiqueta(t.situacao)),
      t.observacao ? [h('dt', {}, 'Observação'), h('dd', { class: 'pre' }, t.observacao)] : null),
    eGestor() ? h('div', { class: 'acoes esquerda' }, botao('Editar tarefa', () => { fechar(); editarTarefa(t, depois); })) : null,
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
  const area = h('div');

  async function carregar() {
    let c = sb.from('v_tarefa').select('*').order('prazo', { nullsFirst: false }).order('data_reuniao', { ascending: false });
    if (resp.value) c = c.eq('responsavel_id', resp.value);
    if (sit.value === 'abertas') c = c.not('situacao', 'in', '("Concluída","Cancelada")');
    else if (sit.value) c = c.eq('situacao', sit.value);
    const linhas = await q(c);
    const hojeStr = new Date().toLocaleDateString('sv-SE');
    limpar(area, h('p', { class: 'contagem' }, `${linhas.length} tarefas`), tabela([
      { rotulo: 'Tarefa', k: 'descricao', classe: 'texto' },
      { rotulo: 'OS', f: (t) => t.os_numero ? `${t.os_numero} · ${t.cliente_curto}` : 'Geral' },
      { rotulo: 'Resp.', k: 'responsavel_iniciais' },
      { rotulo: 'Reunião', f: (t) => fmtData(t.data_reuniao) },
      { rotulo: 'Prazo', f: (t) => h('span', { class: t.prazo && t.prazo < hojeStr && !['Concluída', 'Cancelada'].includes(t.situacao) ? 'txt-vermelho' : '' }, fmtData(t.prazo)) },
      { rotulo: 'Situação', f: (t) => etiqueta(t.situacao) },
      { rotulo: 'Atualizada', f: (t) => fmtData(t.ultima_atualizacao || t.atualizado_em) },
    ], linhas, { aoClicar: (t) => abrirTarefa(t.id, carregar), vazio: 'Nenhuma tarefa com estes filtros.' }));
  }
  [resp, sit].forEach((x) => x.addEventListener('change', carregar));
  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Tarefas'),
    eGestor() ? botao('Nova tarefa', () => editarTarefa(null, carregar), 'primario') : null),
  h('p', { class: 'ajuda' }, 'Tarefas definidas nas reuniões técnicas. Clique numa tarefa para atualizar a situação e deixar um comentário para a coordenação.'),
  h('div', { class: 'filtros' }, resp, sit), area);
  await carregar();
}

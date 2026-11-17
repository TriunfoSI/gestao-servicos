import { sb, st, h, limpar, q, cartao, tabela, etiqueta, fmtData, fmtReais, eGestor, eFinanceiro, perfil } from '../base.js';
import { abrirTarefa } from './tarefas.js';

export async function paginaPainel(el) {
  const meuId = st.eu.id;
  const soMeu = perfil() === 'tecnico';

  let prazosQ = sb.from('v_prazo').select('*').in('alerta', ['Vencido', 'Próximos 7 dias', 'Próximos 30 dias']).order('data_termino');
  if (soMeu) prazosQ = prazosQ.eq('responsavel_id', meuId);
  let tarefasQ = sb.from('v_tarefa').select('*').not('situacao', 'in', '("Concluída","Cancelada")').order('prazo', { nullsFirst: false });
  if (soMeu) tarefasQ = tarefasQ.eq('responsavel_id', meuId);
  let osQ = sb.from('os').select('id,sit_contrato,revisar_migracao,responsavel_id');

  const [prazos, tarefas, oss, parcelas] = await Promise.all([
    q(prazosQ), q(tarefasQ), q(osQ),
    eFinanceiro() ? q(sb.from('v_parcela').select('valor,alerta').neq('alerta', 'Encerrada')) : [],
  ]);

  const ativas = oss.filter((o) => o.sit_contrato !== 'Encerrado' && (!soMeu || o.responsavel_id === meuId)).length;
  const vencidos = prazos.filter((p) => p.alerta === 'Vencido');
  const semana = prazos.filter((p) => p.alerta === 'Próximos 7 dias');
  const revisar = oss.filter((o) => o.revisar_migracao).length;
  const atrasadas = parcelas.filter((p) => p.alerta === 'Atrasada');

  const cartoes = h('div', { class: 'cartoes' },
    cartao(soMeu ? 'Minhas OS ativas' : 'OS ativas', ativas, 'contrato não encerrado', '', '#/os'),
    cartao(soMeu ? 'Meus prazos vencidos' : 'Prazos vencidos', vencidos.length, 'sem conclusão registrada', vencidos.length ? 'vermelho' : '', '#/prazos'),
    cartao('Vencem em 7 dias', semana.length, 'prazos', semana.length ? 'laranja' : '', '#/prazos'),
    cartao(soMeu ? 'Minhas tarefas abertas' : 'Tarefas abertas', tarefas.length, null, '', '#/tarefas'),
    eFinanceiro() ? cartao('A receber', fmtReais(parcelas.reduce((s, p) => s + Number(p.valor), 0)),
      `${atrasadas.length} parcelas com previsão vencida`, atrasadas.length ? 'laranja' : '', '#/financeiro') : null,
    eGestor() && revisar ? cartao('OS para revisar', revisar, 'situação mudou na importação do Access', 'roxo', '#/os?revisar') : null,
  );

  const colPrazo = [
    { rotulo: 'Vence', f: (p) => fmtData(p.data_termino) },
    { rotulo: 'OS', f: (p) => h('a', { href: `#/os/${p.os_id}/prazos`, onclick: (e) => e.stopPropagation() }, p.os_numero || '—') },
    { rotulo: 'Cliente', k: 'cliente_curto' },
    { rotulo: 'Prazo', k: 'descricao', classe: 'texto' },
    !soMeu && { rotulo: 'Resp.', k: 'responsavel_iniciais' },
    { rotulo: '', f: (p) => etiqueta(p.alerta) },
  ].filter(Boolean);

  limpar(el,
    h('h1', {}, `Olá, ${st.eu.nome.split(' ')[0]}`),
    cartoes,
    h('div', { class: 'duas-colunas' },
      h('section', { class: 'secao' }, h('div', { class: 'secao-topo' }, h('h3', {}, 'Prazos que pedem atenção'), h('a', { href: '#/prazos' }, 'Ver todos')),
        tabela(colPrazo, [...vencidos.slice(-8).reverse(), ...semana].slice(0, 12), { vazio: 'Nenhum prazo vencido ou para esta semana.' })),
      h('section', { class: 'secao' }, h('div', { class: 'secao-topo' }, h('h3', {}, soMeu ? 'Minhas tarefas' : 'Tarefas abertas'), h('a', { href: '#/tarefas' }, 'Ver todas')),
        tabela([
          { rotulo: 'Tarefa', k: 'descricao', classe: 'texto' },
          { rotulo: 'OS', k: 'os_numero' },
          !soMeu && { rotulo: 'Resp.', k: 'responsavel_iniciais' },
          { rotulo: 'Situação', f: (t) => etiqueta(t.situacao) },
        ].filter(Boolean), tarefas.slice(0, 10), { aoClicar: (t) => abrirTarefa(t.id, () => paginaPainel(el)), vazio: 'Nenhuma tarefa aberta.' }))),
  );
}

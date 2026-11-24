import { sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, fmtReais, editarRegistro, opcoesLista, cartao, botao,
  secao, abrirJanela, formulario, hoje } from '../base.js';

export const SIT_PARCELA = ['Em aberto', 'Nota fiscal emitida', 'Pendência', 'Pago', 'Cancelada'];
const BANCOS = ['Santander', 'Bradesco', 'Itaú', 'Banco do Brasil', 'Caixa', 'Inter', 'Nubank'];
const TIPOS_CUSTO = ['Terceiros', 'Deslocamento', 'Taxa de órgão', 'Material', 'Laboratório', 'Outro'];

export function editarParcela(registro, osId, depois) {
  editarRegistro({ titulo: 'parcela', tabela: 'parcela', registro, extras: registro ? {} : { os_id: osId }, depois,
    antesDeSalvar: (d) => { if (d.situacao === 'Pago' && !d.data_pagamento) d.data_pagamento = hoje(); if (registro?.revisar_migracao) d.revisar_migracao = null; return d; },
    campos: [
      { k: 'numero', rotulo: 'Parcela nº', tipo: 'numero' },
      { k: 'total_parcelas', rotulo: 'de (total)', tipo: 'numero' },
      { k: 'referencia', rotulo: 'Referência', largura: 2, ajuda: 'Ex.: 50% no aceite da proposta' },
      { k: 'valor', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrig: true },
      { k: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: SIT_PARCELA, obrig: true, numerico: false, padrao: 'Em aberto' },
      { k: 'data_prevista', rotulo: 'Data prevista / vencimento', tipo: 'data' },
      { k: 'periodo_previsto_id', rotulo: 'Ou período previsto', tipo: 'opcoes', opcoes: () => opcoesLista('periodo') },
      { k: 'data_pagamento', rotulo: 'Data do pagamento', tipo: 'data' },
      { k: 'nota_fiscal', rotulo: 'Nota fiscal' },
      { k: 'banco', rotulo: 'Banco', sugestoes: BANCOS },
      { k: 'observacao', rotulo: 'Observação', tipo: 'area', linhas: 2 },
    ] });
}

async function marcarPago(p, depois) {
  let fechar;
  const form = formulario([
    { k: 'data_pagamento', rotulo: 'Data do pagamento', tipo: 'data', obrig: true, padrao: hoje() },
    { k: 'banco', rotulo: 'Banco', sugestoes: BANCOS },
    { k: 'nota_fiscal', rotulo: 'Nota fiscal' },
  ], p, { rotuloSalvar: 'Confirmar pagamento', aoSalvar: async (d) => {
    await q(sb.from('parcela').update({ ...d, situacao: 'Pago' }).eq('id', p.id));
    aviso('Pagamento registrado.'); fechar(); depois();
  } });
  fechar = abrirJanela(`Registrar pagamento — ${fmtReais(p.valor)}`, form);
}

// ------------------------------------------------------------------ aba Financeiro dentro da OS
export async function abaFinanceiro(el, ctx) {
  const { os } = ctx;
  const recarregar = () => abaFinanceiro(el, ctx);
  const [resumo, parcelas, ajustes, custos] = await Promise.all([
    q(sb.from('v_os_financeiro').select('*').eq('os_id', os.id).maybeSingle()),
    q(sb.from('v_parcela').select('*').eq('os_id', os.id).order('numero', { nullsFirst: false }).order('id')),
    q(sb.from('ajuste_comercial').select('*').eq('os_id', os.id).order('data')),
    q(sb.from('v_custo').select('*').eq('os_id', os.id).order('data', { nullsFirst: false })),
  ]);
  const r = resumo || {};
  const tudoPago = parcelas.length > 0 && parcelas.every((p) => ['Pago', 'Cancelada'].includes(p.situacao));

  const editarAjuste = (a) => editarRegistro({ titulo: 'ajuste comercial', tabela: 'ajuste_comercial', registro: a, extras: a ? {} : { os_id: os.id }, depois: recarregar,
    campos: [
      { k: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', opcoes: ['Desconto', 'Acréscimo', 'Cancelamento de parcela', 'Renegociação', 'Outro'], obrig: true, numerico: false },
      { k: 'valor', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrig: true, ajuda: 'Desconto: valor negativo (ex.: -500). Acréscimo: positivo.' },
      { k: 'data', rotulo: 'Data', tipo: 'data', obrig: true, padrao: hoje() },
      { k: 'aprovado_por', rotulo: 'Aprovado por' },
      { k: 'motivo', rotulo: 'Motivo / tratativa', tipo: 'area', obrig: true },
    ] });
  const editarCusto = (c) => {
    const form = editarRegistro({ titulo: 'custo', tabela: 'custo', registro: c, extras: c ? {} : { os_id: os.id }, depois: recarregar,
      antesDeSalvar: (d) => {
        if (d.fornecedor_id) d.fornecedor = null;   // o nome vem do cadastro de fornecedores
        return d;
      },
      campos: [
        { k: 'tipo', rotulo: 'Tipo de custo', sugestoes: TIPOS_CUSTO, obrig: true },
        { k: 'valor', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrig: true },
        { k: 'fornecedor_id', rotulo: 'Fornecedor', tipo: 'opcoes', largura: 2,
          opcoes: () => (st.listas.fornecedor || []).filter((f) => f.ativo !== false || f.id === c?.fornecedor_id)
            .map((f) => [f.id, f.nome_fantasia ? `${f.nome_fantasia} (${f.nome})` : f.nome]),
          ajuda: c?.fornecedor && !c?.fornecedor_id ? `Escrito antes: "${c.fornecedor}". Escolha o fornecedor cadastrado.` : 'Não está na lista? Cadastre em Fornecedores.' },
        { k: 'tipo_servico_id', rotulo: 'Tipo de serviço executado', tipo: 'opcoes', opcoes: () => opcoesLista('tipo_servico_fornecedor'), largura: 2 },
        { k: 'descricao', rotulo: 'Descrição', largura: 2 },
        { k: 'data', rotulo: 'Data', tipo: 'data' },
        { k: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: ['Previsto', 'Pago'], obrig: true, numerico: false, padrao: 'Previsto' },
      ] });
    // tipos de serviço: primeiro os do fornecedor escolhido
    const fc = form.ctrls.fornecedor_id, tc = form.ctrls.tipo_servico_id;
    const filtrarTipos = () => {
      const f = (st.listas.fornecedor || []).find((x) => String(x.id) === fc.value);
      const dele = new Set((f?.tipos_servico_ids || []).map(String));
      const atual = tc.value;
      const todos = opcoesLista('tipo_servico_fornecedor');
      const prim = todos.filter(([id]) => dele.has(String(id))), resto = todos.filter(([id]) => !dele.has(String(id)));
      limpar(tc, h('option', { value: '' }, '—'),
        prim.length ? h('optgroup', { label: 'Serviços deste fornecedor' }, prim.map(([v, t]) => h('option', { value: v }, t))) : null,
        h('optgroup', { label: prim.length ? 'Outros' : 'Tipos de serviço' }, resto.map(([v, t]) => h('option', { value: v }, t))));
      tc.value = atual;
      if (!tc.value && prim.length === 1) tc.value = prim[0][0];
    };
    fc.addEventListener('change', filtrarTipos);
    filtrarTipos();
  };

  limpar(el,
    h('div', { class: 'cartoes' },
      cartao('Parcelas', fmtReais(r.valor_parcelas || 0), `${r.qtd_parcelas || 0} parcelas`),
      cartao('Ajustes', fmtReais(r.ajustes || 0), 'descontos e acréscimos'),
      cartao('Valor final', fmtReais(r.valor_final || 0)),
      cartao('Recebido', fmtReais(r.recebido || 0), null, 'verde'),
      cartao('A receber', fmtReais(r.a_receber || 0), `${r.qtd_abertas || 0} parcelas abertas`, r.a_receber ? 'amarelo' : ''),
      cartao('Custos', fmtReais(r.custos || 0)),
      cartao('Resultado previsto', fmtReais(r.resultado_previsto || 0), 'valor final − custos', (r.resultado_previsto || 0) < 0 ? 'vermelho' : 'azul')),
    tudoPago && !['Encerrado', 'Cancelado'].includes(os.sit_comercial) ? h('div', { class: 'alerta verde' },
      'Todas as parcelas estão pagas. ', h('button', { class: 'btn pequeno', onclick: async () => {
        await q(sb.from('os').update({ sit_comercial: 'Encerrado' }).eq('id', os.id));
        aviso('Parte comercial encerrada.'); ctx.recarregar();
      } }, 'Encerrar a parte comercial')) : null,
    secao('Parcelas', botao('Incluir parcela', () => editarParcela(null, os.id, recarregar), 'primario'),
      tabela([
        { rotulo: 'Parcela', f: (p) => p.numero ? `${p.numero}/${p.total_parcelas || '?'}` : '—' },
        { rotulo: 'Referência', k: 'referencia', classe: 'texto' },
        { rotulo: 'Valor', f: (p) => fmtReais(p.valor), classe: 'num' },
        { rotulo: 'Previsão', f: (p) => fmtData(p.data_prevista) || p.periodo_previsto || '' },
        { rotulo: 'Pagamento', f: (p) => fmtData(p.data_pagamento) },
        { rotulo: 'NF', k: 'nota_fiscal' },
        { rotulo: 'Situação', f: (p) => [etiqueta(p.situacao), p.revisar_migracao ? h('span', { class: 'etq roxo', title: p.revisar_migracao }, 'conferir') : null] },
        { rotulo: '', f: (p) => !['Pago', 'Cancelada'].includes(p.situacao) ? h('button', { class: 'btn pequeno', onclick: (e) => { e.stopPropagation(); marcarPago(p, recarregar); } }, 'Pago') : '' },
      ], parcelas, { aoClicar: (p) => editarParcela(p, os.id, recarregar), vazio: 'Nenhuma parcela cadastrada.' })),
    secao('Ajustes comerciais', botao('Incluir ajuste', () => editarAjuste(null), 'primario'),
      h('p', { class: 'ajuda' }, 'Registre descontos e mudanças negociadas com o cliente, com o motivo, para explicar o valor final do contrato.'),
      tabela([
        { rotulo: 'Data', f: (a) => fmtData(a.data) }, { rotulo: 'Tipo', k: 'tipo' },
        { rotulo: 'Valor', f: (a) => fmtReais(a.valor), classe: 'num' }, { rotulo: 'Motivo', k: 'motivo', classe: 'texto' },
        { rotulo: 'Aprovado por', k: 'aprovado_por' },
      ], ajustes, { aoClicar: editarAjuste, vazio: 'Nenhum ajuste registrado.' })),
    secao('Custos', botao('Incluir custo', () => editarCusto(null), 'primario'),
      tabela([
        { rotulo: 'Data', f: (c) => fmtData(c.data), ord: (c) => c.data }, { rotulo: 'Tipo', k: 'tipo' },
        { rotulo: 'Fornecedor', ord: (c) => c.fornecedor_nome, f: (c) => c.fornecedor_id
          ? h('a', { href: `#/fornecedores/${c.fornecedor_id}`, onclick: (e) => e.stopPropagation() }, c.fornecedor_nome) : (c.fornecedor_nome || '') },
        { rotulo: 'Serviço executado', k: 'tipo_servico' },
        { rotulo: 'Descrição', k: 'descricao', classe: 'texto' }, { rotulo: 'Valor', f: (c) => fmtReais(c.valor), classe: 'num', ord: (c) => Number(c.valor) },
        { rotulo: 'Situação', f: (c) => etiqueta(c.situacao) },
      ], custos, { aoClicar: editarCusto, vazio: 'Nenhum custo registrado.' })));
}

// ------------------------------------------------------------------ períodos rápidos
const iso = (d) => d.toLocaleDateString('sv-SE');
const somarDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
export const PERIODOS = [
  ['', 'Qualquer data'],
  ['mes', 'Mês vigente'],
  ['proximo_mes', 'Próximo mês'],
  ['60', 'Próximos 60 dias'],
  ['90', 'Próximos 90 dias'],
  ['semestre', 'Próximo semestre'],
  ['personalizado', 'Período escolhido (de / até)'],
];
export function datasDoPeriodo(chave) {
  const d = new Date(), a = d.getFullYear(), m = d.getMonth();
  switch (chave) {
    case 'mes': return [iso(new Date(a, m, 1)), iso(new Date(a, m + 1, 0))];
    case 'proximo_mes': return [iso(new Date(a, m + 1, 1)), iso(new Date(a, m + 2, 0))];
    case '60': return [hoje(), somarDias(60)];
    case '90': return [hoje(), somarDias(90)];
    case 'semestre': return m < 6 ? [iso(new Date(a, 6, 1)), iso(new Date(a, 11, 31))] : [iso(new Date(a + 1, 0, 1)), iso(new Date(a + 1, 5, 30))];
    default: return ['', ''];
  }
}

// ------------------------------------------------------------------ tela Financeiro (contas a receber)
export async function paginaFinanceiro(el) {
  const filtro = h('select', {}, h('option', { value: 'abertas' }, 'Parcelas em aberto'), h('option', { value: 'atrasadas' }, 'Só com previsão vencida'),
    h('option', { value: 'pagas' }, 'Pagas'), h('option', { value: 'todas' }, 'Todas (abertas e pagas)'), h('option', { value: 'conferir' }, 'A conferir (importação)'));
  const periodo = h('select', { title: 'Período' }, PERIODOS.map(([v, t]) => h('option', { value: v }, t)));
  const de = h('input', { type: 'date', title: 'De' }), ate = h('input', { type: 'date', title: 'Até' });
  const busca = h('input', { type: 'search', placeholder: 'Buscar por OS ou cliente' });
  const explica = h('p', { class: 'ajuda' });
  const area = h('div');
  let linhas = [];

  // em aberto: filtra pela data prevista; pagas: pela data do pagamento; todas: pela data do pagamento ou, se não pagou, a prevista
  const campoData = () => (filtro.value === 'pagas' ? 'data_pagamento' : 'data_prevista');

  async function carregar() {
    let c = sb.from('v_parcela').select('*');
    if (filtro.value === 'pagas') c = c.eq('situacao', 'Pago').order('data_pagamento', { ascending: false });
    else if (filtro.value === 'conferir') c = c.not('revisar_migracao', 'is', null).order('os_id');
    else if (filtro.value === 'atrasadas') c = c.eq('alerta', 'Atrasada').order('data_prevista');
    else if (filtro.value === 'todas') c = c.neq('situacao', 'Cancelada').order('data_prevista', { nullsFirst: false });
    else c = c.neq('alerta', 'Encerrada').order('data_prevista', { nullsFirst: false });
    if (filtro.value !== 'todas') {
      if (de.value) c = c.gte(campoData(), de.value);
      if (ate.value) c = c.lte(campoData(), ate.value);
    }
    linhas = await q(c);
    if (filtro.value === 'todas' && (de.value || ate.value)) {
      linhas = linhas.filter((p) => {
        const d = p.situacao === 'Pago' ? (p.data_pagamento || p.data_prevista) : p.data_prevista;
        return d && (!de.value || d >= de.value) && (!ate.value || d <= ate.value);
      });
    }
    const quais = { abertas: 'parcelas em aberto', atrasadas: 'parcelas com previsão vencida', pagas: 'parcelas pagas', todas: 'parcelas', conferir: 'parcelas a conferir' }[filtro.value];
    limpar(explica, de.value || ate.value
      ? `Mostrando ${quais} com ${filtro.value === 'pagas' ? 'pagamento' : filtro.value === 'todas' ? 'pagamento (ou previsão, se não pagas)' : 'previsão'} `
        + (de.value && ate.value ? `de ${fmtData(de.value)} a ${fmtData(ate.value)}.` : de.value ? `a partir de ${fmtData(de.value)}.` : `até ${fmtData(ate.value)}.`)
        + ' Parcelas sem data (só com período previsto) não entram no filtro de datas.'
      : '');
    mostrar();
  }
  function mostrar() {
    const b = busca.value.trim().toLowerCase();
    const ls = linhas.filter((p) => !b || [p.os_numero, p.cliente_curto, p.os_titulo].some((x) => x && x.toLowerCase().includes(b)));
    const total = ls.reduce((s, p) => s + Number(p.valor), 0);
    const pagas = filtro.value === 'pagas';
    const porMes = {};
    ls.forEach((p) => {
      const d = pagas ? p.data_pagamento : p.data_prevista;
      const k = d ? d.slice(0, 7) : (p.periodo_previsto || 'Sem previsão');
      porMes[k] = (porMes[k] || 0) + Number(p.valor);
    });
    limpar(area,
      h('div', { class: 'cartoes' }, cartao(pagas ? 'Recebido' : 'Total', fmtReais(total), `${ls.length} parcelas`, pagas ? 'verde' : 'amarelo'),
        Object.entries(porMes).sort().slice(0, 6).map(([k, v]) => cartao(/^\d{4}-\d{2}$/.test(k) ? new Date(k + '-15').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : k, fmtReais(v), pagas ? 'recebido' : 'previsto'))),
      tabela([
        { rotulo: 'OS', ord: (p) => p.os_numero, f: (p) => h('a', { href: `#/os/${p.os_id}/financeiro`, onclick: (e) => e.stopPropagation() }, p.os_numero || '#' + p.os_id) },
        { rotulo: 'Cliente', k: 'cliente_curto' },
        { rotulo: 'Parcela', f: (p) => p.numero ? `${p.numero}/${p.total_parcelas || '?'}` : '' },
        { rotulo: 'Referência', k: 'referencia', classe: 'texto' },
        { rotulo: 'Valor', f: (p) => fmtReais(p.valor), classe: 'num', ord: (p) => Number(p.valor) },
        { rotulo: 'Previsão', f: (p) => fmtData(p.data_prevista) || p.periodo_previsto || '', ord: (p) => p.data_prevista },
        { rotulo: 'Pagamento', f: (p) => fmtData(p.data_pagamento), ord: (p) => p.data_pagamento },
        { rotulo: 'Situação', f: (p) => [etiqueta(p.situacao), p.alerta === 'Atrasada' ? etiqueta('Atrasada') : null, p.revisar_migracao ? h('span', { class: 'etq roxo', title: p.revisar_migracao }, 'conferir') : null] },
        { rotulo: '', f: (p) => !['Pago', 'Cancelada'].includes(p.situacao) ? h('button', { class: 'btn pequeno', onclick: (e) => { e.stopPropagation(); marcarPago(p, carregar); } }, 'Pago') : '' },
      ], ls, { aoClicar: (p) => editarParcela(p, p.os_id, carregar), vazio: 'Nenhuma parcela com estes filtros.' }));
  }
  periodo.addEventListener('change', () => {
    if (periodo.value !== 'personalizado') [de.value, ate.value] = datasDoPeriodo(periodo.value);
    else de.focus();
    carregar();
  });
  [de, ate].forEach((x) => x.addEventListener('change', () => { periodo.value = de.value || ate.value ? 'personalizado' : ''; carregar(); }));
  filtro.addEventListener('change', carregar);
  busca.addEventListener('input', mostrar);
  const limparFiltros = botao('Limpar filtros', () => { filtro.value = 'abertas'; periodo.value = ''; de.value = ''; ate.value = ''; busca.value = ''; carregar(); });
  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Financeiro — contas a receber')),
    h('div', { class: 'filtros' }, filtro, periodo, h('span', { class: 'periodo' }, h('span', {}, 'De'), de, h('span', {}, 'até'), ate), busca, limparFiltros),
    explica, area);
  await carregar();
}

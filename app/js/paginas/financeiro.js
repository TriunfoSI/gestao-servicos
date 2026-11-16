import { sb, h, limpar, q, aviso, tabela, etiqueta, fmtData, fmtReais, editarRegistro, opcoesLista, cartao, botao,
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
    q(sb.from('custo').select('*').eq('os_id', os.id).order('data', { nullsFirst: false })),
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
  const editarCusto = (c) => editarRegistro({ titulo: 'custo', tabela: 'custo', registro: c, extras: c ? {} : { os_id: os.id }, depois: recarregar,
    campos: [
      { k: 'tipo', rotulo: 'Tipo', sugestoes: TIPOS_CUSTO, obrig: true },
      { k: 'fornecedor', rotulo: 'Fornecedor / prestador' },
      { k: 'descricao', rotulo: 'Descrição', largura: 2 },
      { k: 'valor', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrig: true },
      { k: 'data', rotulo: 'Data', tipo: 'data' },
      { k: 'situacao', rotulo: 'Situação', tipo: 'opcoes', opcoes: ['Previsto', 'Pago'], obrig: true, numerico: false, padrao: 'Previsto' },
    ] });

  limpar(el,
    h('div', { class: 'cartoes' },
      cartao('Parcelas', fmtReais(r.valor_parcelas || 0), `${r.qtd_parcelas || 0} parcelas`),
      cartao('Ajustes', fmtReais(r.ajustes || 0), 'descontos e acréscimos'),
      cartao('Valor final', fmtReais(r.valor_final || 0)),
      cartao('Recebido', fmtReais(r.recebido || 0), null, 'verde'),
      cartao('A receber', fmtReais(r.a_receber || 0), `${r.qtd_abertas || 0} parcelas abertas`, r.a_receber ? 'amarelo' : ''),
      cartao('Custos', fmtReais(r.custos || 0)),
      cartao('Resultado previsto', fmtReais(r.resultado_previsto || 0), 'valor final − custos', (r.resultado_previsto || 0) < 0 ? 'vermelho' : 'azul')),
    tudoPago && os.sit_comercial !== 'Encerrado' ? h('div', { class: 'alerta verde' },
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
        { rotulo: 'Data', f: (c) => fmtData(c.data) }, { rotulo: 'Tipo', k: 'tipo' }, { rotulo: 'Fornecedor', k: 'fornecedor' },
        { rotulo: 'Descrição', k: 'descricao', classe: 'texto' }, { rotulo: 'Valor', f: (c) => fmtReais(c.valor), classe: 'num' },
        { rotulo: 'Situação', f: (c) => etiqueta(c.situacao) },
      ], custos, { aoClicar: editarCusto, vazio: 'Nenhum custo registrado.' })));
}

// ------------------------------------------------------------------ tela Financeiro (contas a receber)
export async function paginaFinanceiro(el) {
  const filtro = h('select', {}, h('option', { value: 'abertas' }, 'Parcelas em aberto'), h('option', { value: 'atrasadas' }, 'Só com previsão vencida'),
    h('option', { value: 'pagas' }, 'Pagas nos últimos 90 dias'), h('option', { value: 'conferir' }, 'A conferir (importação)'));
  const busca = h('input', { type: 'search', placeholder: 'Buscar por OS ou cliente' });
  const area = h('div');
  let linhas = [];

  async function carregar() {
    let c = sb.from('v_parcela').select('*');
    if (filtro.value === 'pagas') {
      const d = new Date(); d.setDate(d.getDate() - 90);
      c = c.eq('situacao', 'Pago').gte('data_pagamento', d.toLocaleDateString('sv-SE')).order('data_pagamento', { ascending: false });
    } else if (filtro.value === 'conferir') c = c.not('revisar_migracao', 'is', null).order('os_id');
    else if (filtro.value === 'atrasadas') c = c.eq('alerta', 'Atrasada').order('data_prevista');
    else c = c.neq('alerta', 'Encerrada').order('data_prevista', { nullsFirst: false });
    linhas = await q(c);
    mostrar();
  }
  function mostrar() {
    const b = busca.value.trim().toLowerCase();
    const ls = linhas.filter((p) => !b || [p.os_numero, p.cliente_curto, p.os_titulo].some((x) => x && x.toLowerCase().includes(b)));
    const total = ls.reduce((s, p) => s + Number(p.valor), 0);
    const porMes = {};
    if (filtro.value !== 'pagas') ls.forEach((p) => {
      const k = p.data_prevista ? p.data_prevista.slice(0, 7) : (p.periodo_previsto || 'Sem previsão');
      porMes[k] = (porMes[k] || 0) + Number(p.valor);
    });
    limpar(area,
      h('div', { class: 'cartoes' }, cartao(filtro.value === 'pagas' ? 'Recebido' : 'Total', fmtReais(total), `${ls.length} parcelas`, filtro.value === 'pagas' ? 'verde' : 'amarelo'),
        Object.entries(porMes).sort().slice(0, 6).map(([k, v]) => cartao(/^\d{4}-\d{2}$/.test(k) ? new Date(k + '-15').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : k, fmtReais(v), 'previsto'))),
      tabela([
        { rotulo: 'OS', f: (p) => h('a', { href: `#/os/${p.os_id}/financeiro`, onclick: (e) => e.stopPropagation() }, p.os_numero || '#' + p.os_id) },
        { rotulo: 'Cliente', k: 'cliente_curto' },
        { rotulo: 'Parcela', f: (p) => p.numero ? `${p.numero}/${p.total_parcelas || '?'}` : '' },
        { rotulo: 'Referência', k: 'referencia', classe: 'texto' },
        { rotulo: 'Valor', f: (p) => fmtReais(p.valor), classe: 'num' },
        { rotulo: 'Previsão', f: (p) => fmtData(p.data_prevista) || p.periodo_previsto || '' },
        { rotulo: 'Pagamento', f: (p) => fmtData(p.data_pagamento) },
        { rotulo: 'Situação', f: (p) => [etiqueta(p.situacao), p.alerta === 'Atrasada' ? etiqueta('Atrasada') : null, p.revisar_migracao ? h('span', { class: 'etq roxo', title: p.revisar_migracao }, 'conferir') : null] },
        { rotulo: '', f: (p) => !['Pago', 'Cancelada'].includes(p.situacao) ? h('button', { class: 'btn pequeno', onclick: (e) => { e.stopPropagation(); marcarPago(p, carregar); } }, 'Pago') : '' },
      ], ls, { aoClicar: (p) => editarParcela(p, p.os_id, carregar), vazio: 'Nenhuma parcela.' }));
  }
  filtro.addEventListener('change', carregar);
  busca.addEventListener('input', mostrar);
  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Financeiro — contas a receber')),
    h('div', { class: 'filtros' }, filtro, busca), area);
  await carregar();
}

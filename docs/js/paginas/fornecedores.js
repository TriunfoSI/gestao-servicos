import { sb, st, h, limpar, q, aviso, tabela, etiqueta, fmtData, fmtReais, formulario, abrirJanela, confirmar,
  opcoesLista, botao, secao, cartao, eFinanceiro, carregarListas } from '../base.js';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

const camposFornecedor = () => [
  { k: 'nome', rotulo: 'Nome / razão social', obrig: true, largura: 2 },
  { k: 'nome_fantasia', rotulo: 'Nome fantasia' },
  { k: 'cpf_cnpj', rotulo: 'CPF / CNPJ' },
  { k: 'contato', rotulo: 'Pessoa de contato' },
  { k: 'telefone', rotulo: 'Telefone' },
  { k: 'whatsapp', rotulo: 'WhatsApp' },
  { k: 'email', rotulo: 'E-mail', tipo: 'email' },
  { k: 'site', rotulo: 'Site' },
  { k: 'endereco', rotulo: 'Endereço', tipo: 'area', linhas: 2 },
  { k: 'municipio', rotulo: 'Município' },
  { k: 'uf', rotulo: 'UF', tipo: 'opcoes', opcoes: UFS, numerico: false, padrao: 'SP' },
  { k: 'tipos', rotulo: 'Tipos de serviço (marque quantos precisar)', tipo: 'varios', opcoes: () => opcoesLista('tipo_servico_fornecedor') },
  { k: 'dados_bancarios', rotulo: 'Dados bancários / PIX', tipo: 'area', linhas: 2 },
  { k: 'observacao', rotulo: 'Observação', tipo: 'area', linhas: 2 },
  { k: 'ativo', rotulo: 'Ativo', tipo: 'marcar', padrao: true },
];

// Inclui ou altera um fornecedor, com os tipos de serviço que ele presta
export function editarFornecedor(registro, depois) {
  let fechar;
  const novo = !registro?.id;
  const form = formulario(camposFornecedor(), { ...registro, tipos: registro?.tipos_servico_ids || [] }, {
    aoSalvar: async (d) => {
      const tipos = d.tipos || [];
      delete d.tipos;
      let id = registro?.id;
      if (novo) id = (await q(sb.from('fornecedor').insert(d).select('id').single())).id;
      else await q(sb.from('fornecedor').update(d).eq('id', id));
      await q(sb.from('fornecedor_tipo_servico').delete().eq('fornecedor_id', id));
      if (tipos.length) await q(sb.from('fornecedor_tipo_servico').insert(tipos.map((t) => ({ fornecedor_id: id, tipo_servico_id: t }))));
      await carregarListas();
      aviso(novo ? 'Fornecedor cadastrado.' : 'Alterações salvas.');
      fechar(); depois && depois(id);
    },
    aoExcluir: !novo ? async () => {
      if (!(await confirmar('Excluir este fornecedor? Os custos ligados a ele continuam nas OS, mas sem o fornecedor.'))) return;
      await q(sb.from('fornecedor').delete().eq('id', registro.id));
      await carregarListas();
      aviso('Excluído.'); fechar(); location.hash = '#/fornecedores';
    } : null,
  });

  // incluir um tipo de serviço novo sem sair da janela
  const caixa = form.ctrls.tipos;
  const novoTipo = h('input', { type: 'text', placeholder: 'Novo tipo de serviço' });
  const incluirTipo = async () => {
    const txt = novoTipo.value.trim();
    if (!txt) return;
    const existe = (st.listas.tipo_servico_fornecedor || []).find((t) => t.descricao.toLowerCase() === txt.toLowerCase());
    const t = existe || await q(sb.from('tipo_servico_fornecedor').insert({ descricao: txt }).select('*').single());
    if (!existe) st.listas.tipo_servico_fornecedor.push(t);
    let cb = caixa.querySelector(`input[value="${t.id}"]`);
    if (!cb) { cb = h('input', { type: 'checkbox', value: t.id }); caixa.append(h('label', { class: 'marcar' }, cb, ' ', t.descricao)); }
    cb.checked = true; novoTipo.value = '';
  };
  novoTipo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); incluirTipo(); } });
  caixa.after(h('div', { class: 'novo-item' }, novoTipo, h('button', { type: 'button', class: 'btn pequeno', onclick: incluirTipo }, '+ Incluir tipo')));

  fechar = abrirJanela(novo ? 'Novo fornecedor' : 'Alterar fornecedor', form, { largo: true });
}

// ================================================================== lista
export async function paginaFornecedores(el) {
  const todos = await q(sb.from('v_fornecedor').select('*').order('nome'));
  const busca = h('input', { type: 'search', placeholder: 'Buscar por nome, CNPJ, município ou tipo de serviço' });
  const tipo = h('select', {}, h('option', { value: '' }, 'Todos os tipos de serviço'),
    opcoesLista('tipo_servico_fornecedor').map(([v, t]) => h('option', { value: v }, t)));
  const inativos = h('input', { type: 'checkbox' });
  const area = h('div');
  const semAcento = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function mostrar() {
    const b = semAcento(busca.value.trim());
    const ls = todos.filter((f) => (inativos.checked || f.ativo) &&
      (!tipo.value || (f.tipos_servico_ids || []).map(String).includes(tipo.value)) &&
      (!b || semAcento([f.nome, f.nome_fantasia, f.cpf_cnpj, f.municipio, f.contato, f.tipos_servico].join(' ')).includes(b)));
    limpar(area, h('p', { class: 'contagem' }, `${ls.length} fornecedores`), tabela([
      { rotulo: 'Fornecedor', ord: (f) => f.nome_fantasia || f.nome, f: (f) => [h('strong', {}, f.nome_fantasia || f.nome), f.nome_fantasia ? h('small', { class: 'bloco' }, f.nome) : null], classe: 'texto' },
      { rotulo: 'Tipos de serviço', k: 'tipos_servico', classe: 'texto' },
      { rotulo: 'Contato', f: (f) => [f.contato, f.telefone || f.whatsapp].filter(Boolean).join(' · ') },
      { rotulo: 'Município', f: (f) => [f.municipio, f.uf].filter(Boolean).join(' / ') },
      { rotulo: 'Ativo', f: (f) => f.ativo ? '' : etiqueta('Inativo') },
    ], ls, { aoClicar: (f) => { location.hash = `#/fornecedores/${f.id}`; }, vazio: 'Nenhum fornecedor encontrado.' }));
  }
  [busca, tipo, inativos].forEach((x) => x.addEventListener('input', mostrar));
  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Fornecedores'),
    eFinanceiro() ? botao('Novo fornecedor', () => editarFornecedor(null, (id) => { location.hash = `#/fornecedores/${id}`; }), 'primario') : null),
  h('p', { class: 'ajuda' }, 'Prestadores de serviço e fornecedores. Para ligar um fornecedor a uma OS, lance o custo na OS (aba Financeiro > Custos) escolhendo o fornecedor e o tipo de serviço executado.'),
  h('div', { class: 'filtros' }, busca, tipo, h('label', { class: 'marcar' }, inativos, ' Mostrar inativos')), area);
  mostrar();
}

// ================================================================== ficha do fornecedor
export async function paginaFornecedor(el, id) {
  id = Number(id);
  const [f, custos] = await Promise.all([
    q(sb.from('v_fornecedor').select('*').eq('id', id).maybeSingle()),
    eFinanceiro() ? q(sb.from('v_custo').select('*').eq('fornecedor_id', id).order('data', { ascending: false, nullsFirst: false })) : [],
  ]);
  if (!f) { limpar(el, h('div', { class: 'alerta erro' }, 'Fornecedor não encontrado.')); return; }
  const recarregar = () => paginaFornecedor(el, id);
  const item = (r, v) => v ? [h('dt', {}, r), h('dd', {}, v)] : null;
  const total = custos.reduce((s, c) => s + Number(c.valor), 0);
  const pago = custos.filter((c) => c.situacao === 'Pago').reduce((s, c) => s + Number(c.valor), 0);
  const qtdOS = new Set(custos.map((c) => c.os_id)).size;
  limpar(el,
    h('div', { class: 'migalha' }, h('a', { href: '#/fornecedores' }, 'Fornecedores'), ' / ', f.nome_fantasia || f.nome),
    h('h1', {}, f.nome_fantasia || f.nome, f.ativo ? '' : [' ', etiqueta('Inativo')]),
    secao('Dados do fornecedor', eFinanceiro() ? botao('Editar', () => editarFornecedor(f, recarregar)) : null,
      h('dl', { class: 'detalhes' },
        item('Razão social', f.nome_fantasia ? f.nome : null), item('CPF/CNPJ', f.cpf_cnpj),
        item('Tipos de serviço', (f.tipos_servico || '') ? h('span', {}, f.tipos_servico.split(', ').map((t) => h('span', { class: 'etq azul' }, t))) : null),
        item('Contato', f.contato), item('Telefone', f.telefone), item('WhatsApp', f.whatsapp), item('E-mail', f.email),
        item('Site', f.site ? h('a', { href: /^https?:/.test(f.site) ? f.site : 'https://' + f.site, target: '_blank', rel: 'noopener' }, f.site) : null),
        item('Endereço', f.endereco), item('Município/UF', [f.municipio, f.uf].filter(Boolean).join(' / ')),
        item('Dados bancários', f.dados_bancarios), item('Observação', f.observacao))),
    eFinanceiro() ? secao('OS em que trabalhou',
      h('div', { class: 'cartoes' }, cartao('OS', qtdOS), cartao('Total contratado', fmtReais(total)), cartao('Pago', fmtReais(pago), null, 'verde'),
        cartao('A pagar', fmtReais(total - pago), null, total - pago ? 'amarelo' : '')),
      tabela([
        { rotulo: 'OS', ord: (c) => c.os_numero, f: (c) => h('a', { href: `#/os/${c.os_id}/financeiro`, onclick: (e) => e.stopPropagation() }, c.os_numero || '#' + c.os_id) },
        { rotulo: 'Cliente', k: 'cliente_curto' },
        { rotulo: 'Título da OS', k: 'os_titulo', classe: 'texto' },
        { rotulo: 'Serviço executado', f: (c) => c.tipo_servico || c.tipo, ord: (c) => c.tipo_servico || c.tipo },
        { rotulo: 'Descrição', k: 'descricao', classe: 'texto' },
        { rotulo: 'Data', f: (c) => fmtData(c.data), ord: (c) => c.data },
        { rotulo: 'Valor', f: (c) => fmtReais(c.valor), classe: 'num', ord: (c) => Number(c.valor) },
        { rotulo: 'Situação', f: (c) => etiqueta(c.situacao), k: 'situacao' },
      ], custos, { aoClicar: (c) => { location.hash = `#/os/${c.os_id}/financeiro`; }, vazio: 'Nenhum custo lançado para este fornecedor ainda. Lance na OS, aba Financeiro > Custos.' }))
      : null);
}

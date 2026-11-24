import { sb, h, limpar, q, tabela, etiqueta, editarRegistro, botao, secao, eFinanceiro, carregarListas } from '../base.js';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

const camposCliente = [
  { k: 'nome', rotulo: 'Nome / razão social', obrig: true, largura: 2 },
  { k: 'nome_reduzido', rotulo: 'Nome curto' },
  { k: 'cpf_cnpj', rotulo: 'CPF / CNPJ' },
  { k: 'telefone', rotulo: 'Telefone' },
  { k: 'email', rotulo: 'E-mail', tipo: 'email' },
  { k: 'endereco', rotulo: 'Endereço', tipo: 'area', linhas: 2 },
  { k: 'municipio', rotulo: 'Município' },
  { k: 'uf', rotulo: 'UF', tipo: 'opcoes', opcoes: UFS, numerico: false, padrao: 'SP' },
];
const camposContato = [
  { k: 'nome', rotulo: 'Nome', obrig: true, largura: 2 },
  { k: 'telefone', rotulo: 'Telefone' },
  { k: 'whatsapp', rotulo: 'WhatsApp' },
  { k: 'email', rotulo: 'E-mail', tipo: 'email' },
  { k: 'documentos', rotulo: 'Documentos (CPF/RG)' },
  { k: 'endereco', rotulo: 'Endereço', tipo: 'area', linhas: 2 },
  { k: 'municipio', rotulo: 'Município' },
  { k: 'uf', rotulo: 'UF', tipo: 'opcoes', opcoes: UFS, numerico: false },
];

export function editarCliente(registro, depois) {
  editarRegistro({ titulo: 'cliente', tabela: 'cliente', registro, campos: camposCliente,
    depois: async () => { await carregarListas(); depois && depois(); } });
}

export async function paginaClientes(el) {
  const [clientes, oss] = await Promise.all([
    q(sb.from('cliente').select('*').order('nome')),
    q(sb.from('os').select('cliente_id,sit_contrato')),
  ]);
  const ativas = {}, total = {};
  oss.forEach((o) => { total[o.cliente_id] = (total[o.cliente_id] || 0) + 1; if (!['Encerrado', 'Cancelado'].includes(o.sit_contrato)) ativas[o.cliente_id] = (ativas[o.cliente_id] || 0) + 1; });
  const busca = h('input', { type: 'search', placeholder: 'Buscar por nome, CNPJ ou município' });
  const area = h('div');
  const mostrar = () => {
    const b = busca.value.trim().toLowerCase();
    const ls = clientes.filter((c) => !b || [c.nome, c.nome_reduzido, c.cpf_cnpj, c.municipio].some((x) => x && x.toLowerCase().includes(b)));
    limpar(area, h('p', { class: 'contagem' }, `${ls.length} clientes`), tabela([
      { rotulo: 'Cliente', f: (c) => [h('strong', {}, c.nome_reduzido || c.nome), c.nome_reduzido ? h('small', { class: 'bloco' }, c.nome) : null], classe: 'texto' },
      { rotulo: 'CPF/CNPJ', k: 'cpf_cnpj' },
      { rotulo: 'Município', f: (c) => [c.municipio, c.uf].filter(Boolean).join(' / ') },
      { rotulo: 'Telefone', k: 'telefone' },
      { rotulo: 'OS ativas', f: (c) => ativas[c.id] || '', classe: 'num' },
      { rotulo: 'OS total', f: (c) => total[c.id] || '', classe: 'num' },
    ], ls, { aoClicar: (c) => { location.hash = `#/clientes/${c.id}`; } }));
  };
  busca.addEventListener('input', mostrar);
  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Clientes'),
    eFinanceiro() ? botao('Novo cliente', () => editarCliente(null, () => paginaClientes(el)), 'primario') : null),
  h('div', { class: 'filtros' }, busca), area);
  mostrar();
}

export async function paginaCliente(el, id) {
  id = Number(id);
  const [c, contatos, oss] = await Promise.all([
    q(sb.from('cliente').select('*').eq('id', id).single()),
    q(sb.from('contato').select('*').eq('cliente_id', id).order('nome')),
    q(sb.from('v_os').select('id,numero,titulo,sit_tecnica,sit_comercial,sit_contrato,responsavel_iniciais').eq('cliente_id', id).order('id', { ascending: false })),
  ]);
  const recarregar = () => paginaCliente(el, id);
  const item = (r, v) => v ? [h('dt', {}, r), h('dd', {}, v)] : null;
  limpar(el,
    h('div', { class: 'migalha' }, h('a', { href: '#/clientes' }, 'Clientes'), ' / ', c.nome_reduzido || c.nome),
    h('h1', {}, c.nome),
    secao('Dados do cliente', eFinanceiro() ? botao('Editar', () => editarCliente(c, recarregar)) : null,
      h('dl', { class: 'detalhes' }, item('Nome curto', c.nome_reduzido), item('CPF/CNPJ', c.cpf_cnpj), item('Telefone', c.telefone),
        item('E-mail', c.email), item('Endereço', c.endereco), item('Município/UF', [c.municipio, c.uf].filter(Boolean).join(' / ')))),
    secao('Contatos', eFinanceiro() ? botao('Incluir contato', () => editarRegistro({ titulo: 'contato', tabela: 'contato', campos: camposContato, extras: { cliente_id: id }, depois: recarregar }), 'primario') : null,
      tabela([
        { rotulo: 'Nome', k: 'nome' }, { rotulo: 'Telefone', k: 'telefone' }, { rotulo: 'WhatsApp', k: 'whatsapp' }, { rotulo: 'E-mail', k: 'email' },
      ], contatos, { aoClicar: eFinanceiro() ? (r) => editarRegistro({ titulo: 'contato', tabela: 'contato', campos: camposContato, registro: r, depois: recarregar }) : null,
        vazio: 'Nenhum contato cadastrado.' })),
    secao('Ordens de serviço', tabela([
      { rotulo: 'Nº', k: 'numero' }, { rotulo: 'Título', k: 'titulo', classe: 'texto' }, { rotulo: 'Resp.', k: 'responsavel_iniciais' },
      { rotulo: 'Técnica', f: (o) => etiqueta(o.sit_tecnica) }, { rotulo: 'Comercial', f: (o) => etiqueta(o.sit_comercial) },
      { rotulo: 'Contrato', f: (o) => etiqueta(o.sit_contrato) },
    ], oss, { aoClicar: (o) => { location.hash = `#/os/${o.id}`; }, vazio: 'Nenhuma OS que você possa ver.' })));
}

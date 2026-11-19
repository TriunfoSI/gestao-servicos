import { sb, h, limpar, q, tabela, editarRegistro, botao, secao, carregarListas, NOME_PERFIL, etiqueta } from '../base.js';

const LISTAS = [
  ['servico', 'Serviços (catálogo do escopo)', [{ k: 'descricao', rotulo: 'Serviço', obrig: true, largura: 2 }, { k: 'area', rotulo: 'Área' }]],
  ['tipo_produto_tecnico', 'Tipos de produto técnico', [{ k: 'descricao', rotulo: 'Tipo', obrig: true, largura: 2 }]],
  ['tipo_servico_fornecedor', 'Tipos de serviço de fornecedores', [{ k: 'descricao', rotulo: 'Tipo de serviço', obrig: true, largura: 2 }]],
  ['os_situacao_detalhe', 'Detalhes da situação técnica da OS', [{ k: 'descricao', rotulo: 'Descrição', obrig: true, largura: 2 }]],
  ['mov_detalhe', 'Tipos de registro de andamento', [{ k: 'descricao', rotulo: 'Descrição', obrig: true, largura: 2 }]],
  ['mov_tipo', 'Categorias de andamento', [{ k: 'descricao', rotulo: 'Descrição', obrig: true, largura: 2 }]],
  ['mov_situacao', 'Situações do andamento', [{ k: 'descricao', rotulo: 'Descrição', obrig: true, largura: 2 }]],
];

export async function paginaCadastros(el, aba) {
  const recarregar = async () => { await carregarListas(); paginaCadastros(el); };
  const equipe = await q(sb.from('equipe').select('*').order('ativo', { ascending: false }).order('nome'));
  const camposEquipe = [
    { k: 'nome', rotulo: 'Nome', obrig: true, largura: 2 },
    { k: 'iniciais', rotulo: 'Iniciais' },
    { k: 'email', rotulo: 'E-mail de acesso', tipo: 'email', ajuda: 'A pessoa usa este e-mail em "Primeiro acesso" para criar a senha.' },
    { k: 'perfil', rotulo: 'Perfil de acesso', tipo: 'opcoes', numerico: false,
      opcoes: [['tecnico', 'Técnico — vê só as próprias OS'], ['financeiro', 'Financeiro — valores e parcelas'], ['coordenacao', 'Coordenação/Diretoria — acesso total']],
      ajuda: 'Sem perfil = sem acesso ao sistema.' },
    { k: 'ativo', rotulo: 'Ativo', tipo: 'marcar', padrao: true },
    { k: 'formacao', rotulo: 'Formação' },
    { k: 'registro_conselho', rotulo: 'Registro no conselho' },
    { k: 'cpf', rotulo: 'CPF' },
    { k: 'rg', rotulo: 'RG' },
  ];
  const listas = await Promise.all(LISTAS.map(([t]) => q(sb.from(t).select('*').order('descricao'))));

  const [cats, subs] = await Promise.all([
    q(sb.from('os_categoria').select('*').order('descricao')),
    q(sb.from('os_subcategoria').select('*').order('descricao')),
  ]);
  const campoAtivo = (padrao) => ({ k: 'ativo', rotulo: 'Ativo', tipo: 'marcar', padrao });
  const editarCat = (r) => editarRegistro({ titulo: 'categoria de OS', tabela: 'os_categoria', registro: r, depois: recarregar,
    campos: [{ k: 'descricao', rotulo: 'Categoria', obrig: true, largura: 2 }, campoAtivo(true)] });
  const editarSub = (r, categoriaId) => editarRegistro({ titulo: 'subcategoria', tabela: 'os_subcategoria', registro: r, depois: recarregar,
    extras: r ? {} : { categoria_id: categoriaId },
    campos: [
      { k: 'categoria_id', rotulo: 'Categoria', tipo: 'opcoes', obrig: true, opcoes: cats.map((c) => [c.id, c.descricao]), padrao: categoriaId, desativado: !r },
      { k: 'descricao', rotulo: 'Subcategoria', obrig: true, largura: 2 }, campoAtivo(true)] });
  const secaoCategorias = h('details', { class: 'secao recolhivel', open: true },
    h('summary', {}, 'Categorias e subcategorias de OS ', h('span', { class: 'contador' }, cats.length)),
    h('p', { class: 'ajuda' }, 'Ex.: categoria "Licenciamento Ambiental", subcategoria "Autorização de Supressão de Vegetação". Clique num nome para alterar.'),
    h('div', { class: 'acoes esquerda' }, botao('Incluir categoria', () => editarCat(null), 'primario')),
    cats.length ? cats.map((c) => h('div', { class: 'categoria-linha' },
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); editarCat(c); } }, h('strong', {}, c.descricao)), c.ativo ? '' : [' ', etiqueta('Inativo')],
      h('ul', { class: 'subcats' },
        subs.filter((x) => x.categoria_id === c.id).map((x) => h('li', {}, h('a', { href: '#', class: 'etq ' + (x.ativo ? 'azul' : 'cinza'), onclick: (e) => { e.preventDefault(); editarSub(x, c.id); } }, x.descricao))),
        h('li', {}, h('button', { class: 'btn pequeno', onclick: () => editarSub(null, c.id) }, '+ subcategoria')))))
      : h('p', { class: 'vazio' }, 'Nenhuma categoria cadastrada.'));

  limpar(el, h('h1', {}, 'Cadastros'),
    secao('Equipe e acessos', botao('Incluir pessoa', () => editarRegistro({ titulo: 'pessoa da equipe', tabela: 'equipe', campos: camposEquipe, depois: recarregar, podeExcluir: false }), 'primario'),
      h('p', { class: 'ajuda' }, 'Para liberar o acesso: cadastre o e-mail e o perfil. A pessoa entra no sistema, clica em "Primeiro acesso" e cria a senha. Para bloquear, desmarque "Ativo" ou tire o perfil.'),
      tabela([
        { rotulo: 'Nome', k: 'nome' }, { rotulo: 'Iniciais', k: 'iniciais' }, { rotulo: 'E-mail', k: 'email' },
        { rotulo: 'Perfil', f: (e) => NOME_PERFIL[e.perfil] || h('span', { class: 'txt-cinza' }, 'sem acesso') },
        { rotulo: 'Login', f: (e) => e.user_id ? h('span', { class: 'etq verde' }, 'criado') : (e.email ? h('span', { class: 'etq amarelo' }, 'aguardando') : '') },
        { rotulo: 'Ativo', f: (e) => e.ativo ? 'Sim' : 'Não' },
      ], equipe, { aoClicar: (r) => editarRegistro({ titulo: 'pessoa da equipe', tabela: 'equipe', campos: camposEquipe, registro: r, depois: recarregar, podeExcluir: false }) })),
    secaoCategorias,
    LISTAS.map(([t, titulo, campos], i) => h('details', { class: 'secao recolhivel' }, h('summary', {}, titulo, ' ', h('span', { class: 'contador' }, listas[i].length)),
      h('div', { class: 'acoes esquerda' }, botao('Incluir', () => editarRegistro({ titulo: 'item', tabela: t, campos: [...campos, { k: 'ativo', rotulo: 'Ativo', tipo: 'marcar', padrao: true }], depois: recarregar }))),
      tabela([...campos.map((c) => ({ rotulo: c.rotulo, k: c.k, classe: 'texto' })), { rotulo: 'Ativo', f: (r) => r.ativo === false ? 'Não' : 'Sim' }], listas[i],
        { aoClicar: (r) => editarRegistro({ titulo: 'item', tabela: t, registro: r, campos: [...campos, { k: 'ativo', rotulo: 'Ativo', tipo: 'marcar' }], depois: recarregar }) }))));
}

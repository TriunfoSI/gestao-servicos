import { sb, st, h, limpar, q, tabela, editarRegistro, botao, secao, carregarListas, NOME_PERFIL, etiqueta, abrirJanela, aviso } from '../base.js';

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
  // Excluir pessoa (só Coordenação/Diretoria; a tela Cadastros já é só dela e o banco confere de novo).
  // Antes de excluir, mostra do que a pessoa é responsável e pergunta para quem passar.
  async function excluirPessoa(p, fecharCadastro) {
    const v = await q(sb.rpc('vinculos_equipe', { p_id: p.id }));
    const partes = [
      [v.os, 'OS', `(${v.os_ativas} não encerradas)`], [v.tarefas, 'tarefa(s)'], [v.prazos, 'prazo(s)'],
      [v.cronograma, 'atividade(s) de cronograma'], [v.andamentos, 'andamento(s)'], [v.produtos, 'produto(s) técnico(s)'],
    ].filter(([n]) => n > 0);
    const outros = equipe.filter((e) => e.id !== p.id && e.ativo);
    const para = h('select', {}, h('option', { value: '' }, 'Ninguém: ficam "sem responsável"'),
      outros.map((e) => h('option', { value: e.id }, e.nome)));
    let fechar;
    const confirmarExclusao = async () => {
      const r = await q(sb.rpc('excluir_membro_equipe', { p_id: p.id, p_para: para.value ? Number(para.value) : null }));
      fechar(); fecharCadastro();
      aviso(`${r.nome} foi excluído(a) da equipe.`);
      recarregar();
    };
    fechar = abrirJanela('Excluir pessoa da equipe', h('div', {},
      h('p', {}, h('strong', {}, p.nome), ' sai do cadastro e perde o acesso ao sistema. Isso não pode ser desfeito.'),
      partes.length ? [
        h('p', {}, 'Esta pessoa é responsável por: ', partes.map(([n, t, extra]) => `${n} ${t}${extra ? ' ' + extra : ''}`).join(', '), '.'),
        h('label', { class: 'campo largo' }, h('span', {}, 'Passar essas responsabilidades para'), para,
          h('small', {}, 'Se escolher "Ninguém", os registros continuam no sistema, mas sem responsável.')),
      ] : h('p', { class: 'txt-cinza' }, 'Ela não é responsável por nenhuma OS, tarefa, prazo, atividade, andamento ou produto técnico.'),
      h('p', { class: 'txt-cinza' }, 'Se quiser só bloquear o acesso e manter o histórico com o nome dela, use "Ativo" (desmarcado) em vez de excluir.'),
      h('div', { class: 'acoes' },
        h('button', { class: 'btn', onclick: () => fechar() }, 'Cancelar'),
        h('button', { class: 'btn perigo', onclick: async (e) => { e.target.disabled = true; try { await confirmarExclusao(); } catch { e.target.disabled = false; } } }, 'Excluir'))));
  }
  const editarPessoa = (r) => editarRegistro({ titulo: 'pessoa da equipe', tabela: 'equipe', campos: camposEquipe, registro: r, depois: recarregar,
    podeExcluir: false, excluir: r && r.id !== st.eu.id ? (fechar) => excluirPessoa(r, fechar) : null });

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

  // ---------------------------------------------------------------- atividades do cronograma
  const ativs = await q(sb.from('atividade_padrao').select('*').order('ordem').order('id'));
  const nomeSub = (id) => subs.find((c) => c.id === id)?.descricao;
  const editarAtiv = (r, categoriaId) => {
    const form = editarRegistro({ titulo: 'atividade do cronograma', tabela: 'atividade_padrao', registro: r, depois: recarregar,
      campos: [
        { k: 'descricao', rotulo: 'Atividade', obrig: true, largura: 2 },
        { k: 'categoria_id', rotulo: 'Categoria da OS', tipo: 'opcoes', opcoes: cats.map((c) => [c.id, c.descricao]), padrao: categoriaId,
          ajuda: '"Geral" = entra no cronograma de todas as OS.' },
        { k: 'subcategoria_id', rotulo: 'Subcategoria (opcional)', tipo: 'opcoes', opcoes: subs.map((c) => [c.id, c.descricao]),
          ajuda: 'Deixe em branco para valer para a categoria toda.' },
        { k: 'responsavel', rotulo: 'Responsável', tipo: 'opcoes', opcoes: ['Triunfo', 'Cliente'], obrig: true, numerico: false, padrao: 'Triunfo' },
        { k: 'duracao_dias', rotulo: 'Duração (dias úteis)', tipo: 'numero', obrig: true, padrao: 5 },
        { k: 'ordem', rotulo: 'Ordem no cronograma', tipo: 'numero', obrig: true, padrao: categoriaId ? 500 : 50,
          ajuda: 'Número menor vem antes. Sugestão: Gerais do começo 10–90, da categoria 100–800, Gerais do fim 900–990.' },
        { k: 'ativo', rotulo: 'Ativa', tipo: 'marcar', padrao: true },
      ] });
    // "Geral" no lugar do traço; subcategoria só da categoria escolhida
    const cat = form.ctrls.categoria_id, sub = form.ctrls.subcategoria_id;
    cat.options[0].textContent = 'Geral (todas as OS)';
    const atualizar = () => {
      const atual = sub.value;
      limpar(sub, h('option', { value: '' }, cat.value ? 'Toda a categoria' : '—'),
        subs.filter((x) => String(x.categoria_id) === cat.value).map((x) => h('option', { value: x.id }, x.descricao)));
      sub.value = [...sub.options].some((o) => o.value === atual) ? atual : '';
      sub.disabled = !cat.value;
    };
    cat.addEventListener('change', atualizar); atualizar();
    return form;
  };
  const grupos = [[null, 'Geral (todas as OS)'], ...cats.map((c) => [c.id, c.descricao])];
  const secaoAtividades = h('details', { class: 'secao recolhivel', open: true },
    h('summary', {}, 'Atividades do cronograma ', h('span', { class: 'contador' }, ativs.length)),
    h('p', { class: 'ajuda' }, 'Quando a OS recebe uma categoria, o sistema monta um cronograma preliminar com as atividades Gerais + as da categoria (e da subcategoria), na ordem abaixo e com a duração informada. Depois o técnico confere e valida. Clique numa atividade para alterar.'),
    grupos.map(([cid, titulo]) => {
      const lista = ativs.filter((a) => (a.categoria_id ?? null) === cid);
      if (cid && !lista.length && !cats.find((c) => c.id === cid)?.ativo) return null;
      return h('div', { class: 'categoria-linha' },
        h('div', { class: 'secao-topo' }, h('strong', {}, titulo), h('button', { class: 'btn pequeno', onclick: () => editarAtiv(null, cid) }, '+ atividade')),
        lista.length ? tabela([
          { rotulo: 'Ordem', k: 'ordem' },
          { rotulo: 'Atividade', k: 'descricao', classe: 'texto' },
          cid ? { rotulo: 'Subcategoria', f: (a) => nomeSub(a.subcategoria_id) || 'Toda a categoria' } : null,
          { rotulo: 'Resp.', f: (a) => etiqueta(a.responsavel), k: 'responsavel' },
          { rotulo: 'Duração', f: (a) => `${a.duracao_dias} dia(s) útil(eis)`, ord: (a) => a.duracao_dias },
          { rotulo: 'Ativa', f: (a) => a.ativo ? 'Sim' : 'Não' },
        ].filter(Boolean), lista, { aoClicar: (a) => editarAtiv(a, a.categoria_id) }) : h('p', { class: 'vazio' }, 'Nenhuma atividade.'));
    }));

  limpar(el, h('h1', {}, 'Cadastros'),
    secao('Equipe e acessos', botao('Incluir pessoa', () => editarRegistro({ titulo: 'pessoa da equipe', tabela: 'equipe', campos: camposEquipe, depois: recarregar, podeExcluir: false }), 'primario'),
      h('p', { class: 'ajuda' }, 'Para liberar o acesso: cadastre o e-mail e o perfil. A pessoa entra no sistema, clica em "Primeiro acesso" e cria a senha. Para bloquear, desmarque "Ativo" ou tire o perfil. Para excluir, clique na pessoa e use "Excluir" (o sistema pergunta para quem passar as OS, tarefas e prazos dela).'),
      tabela([
        { rotulo: 'Nome', k: 'nome' }, { rotulo: 'Iniciais', k: 'iniciais' }, { rotulo: 'E-mail', k: 'email' },
        { rotulo: 'Perfil', f: (e) => NOME_PERFIL[e.perfil] || h('span', { class: 'txt-cinza' }, 'sem acesso') },
        { rotulo: 'Login', f: (e) => e.user_id ? h('span', { class: 'etq verde' }, 'criado') : (e.email ? h('span', { class: 'etq amarelo' }, 'aguardando') : '') },
        { rotulo: 'Ativo', f: (e) => e.ativo ? 'Sim' : 'Não' },
      ], equipe, { aoClicar: editarPessoa })),
    secaoCategorias,
    secaoAtividades,
    LISTAS.map(([t, titulo, campos], i) => h('details', { class: 'secao recolhivel' }, h('summary', {}, titulo, ' ', h('span', { class: 'contador' }, listas[i].length)),
      h('div', { class: 'acoes esquerda' }, botao('Incluir', () => editarRegistro({ titulo: 'item', tabela: t, campos: [...campos, { k: 'ativo', rotulo: 'Ativo', tipo: 'marcar', padrao: true }], depois: recarregar }))),
      tabela([...campos.map((c) => ({ rotulo: c.rotulo, k: c.k, classe: 'texto' })), { rotulo: 'Ativo', f: (r) => r.ativo === false ? 'Não' : 'Sim' }], listas[i],
        { aoClicar: (r) => editarRegistro({ titulo: 'item', tabela: t, registro: r, campos: [...campos, { k: 'ativo', rotulo: 'Ativo', tipo: 'marcar' }], depois: recarregar }) }))));
}

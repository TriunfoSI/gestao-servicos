import { sb, h, limpar, q, fmtData } from '../base.js';
import { abrirTarefa } from './tarefas.js';

// Áreas onde a busca procura (a chave é a mesma usada no banco, função busca_geral)
export const AREAS = [
  ['os', 'Ordens de serviço', 'nº, título, cliente, local, categoria e escopo'],
  ['processos', 'Documentos|Processos', 'origem, número, assunto e situação'],
  ['produtos', 'Produtos técnicos', 'título, número, tipo e descrição'],
  ['tarefas', 'Tarefas', 'tarefa, orientação técnica, observação e comentários'],
  ['andamento', 'Andamento', 'descrição e observação'],
  ['prazos', 'Prazos', 'descrição, referência, tipo e origem'],
  ['cronograma', 'Cronograma', 'atividade e observação'],
  ['clientes', 'Clientes', 'nome, CNPJ, município e contatos'],
  ['fornecedores', 'Fornecedores', 'nome, CNPJ, município e tipos de serviço'],
];
const NOME_AREA = Object.fromEntries(AREAS.map(([k, t]) => [k, t]));
const ABA = { os: 'dados', processos: 'processos', produtos: 'produtos', tarefas: 'tarefas', andamento: 'andamento', prazos: 'prazos', cronograma: 'cronograma' };

function linkDe(r) {
  if (r.area === 'clientes') return `#/clientes/${r.id}`;
  if (r.area === 'fornecedores') return `#/fornecedores/${r.id}`;
  if (r.os_id) return `#/os/${r.os_id}/${ABA[r.area] || 'dados'}`;
  return null;
}

// realça o termo procurado no texto (sem diferenciar acentos e maiúsculas)
function realcar(txt, termo) {
  if (!txt) return '';
  const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const alvo = norm(termo.trim());
  if (!alvo) return txt;
  const base = norm(txt);
  const partes = [];
  let i = 0, j;
  while ((j = base.indexOf(alvo, i)) >= 0) {
    partes.push(txt.slice(i, j), h('mark', {}, txt.slice(j, j + alvo.length)));
    i = j + alvo.length;
  }
  partes.push(txt.slice(i));
  return partes;
}

export async function paginaBusca(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const termo = h('input', { type: 'search', placeholder: 'Digite uma palavra-chave (ex.: supressão, CETESB, nº do processo, nome do cliente)', value: params.get('q') || '' });
  const escolhidas = new Set((params.get('a') || AREAS.map(([k]) => k).join(',')).split(','));
  const caixas = AREAS.map(([k, t, ajuda]) => [k, h('input', { type: 'checkbox', checked: escolhidas.has(k) }), t, ajuda]);
  const area = h('div');

  async function buscar() {
    const txt = termo.value.trim();
    const areas = caixas.filter(([, c]) => c.checked).map(([k]) => k);
    const hashNovo = `#/busca?q=${encodeURIComponent(txt)}` + (areas.length < AREAS.length ? `&a=${areas.join(',')}` : '');
    if (location.hash !== hashNovo) history.replaceState(null, '', hashNovo);
    if (txt.length < 2) { limpar(area, h('p', { class: 'vazio' }, 'Digite pelo menos 2 letras e tecle Enter.')); return; }
    if (!areas.length) { limpar(area, h('p', { class: 'vazio' }, 'Marque pelo menos um lugar para procurar.')); return; }
    limpar(area, h('p', { class: 'carregando' }, 'Buscando…'));
    const res = await q(sb.rpc('busca_geral', { p_termo: txt, p_areas: areas }));
    if (!res.length) { limpar(area, h('p', { class: 'vazio' }, `Nada encontrado para "${txt}".`)); return; }
    const grupos = AREAS.map(([k]) => [k, res.filter((r) => r.area === k)]).filter(([, ls]) => ls.length);
    limpar(area,
      h('p', { class: 'contagem' }, `${res.length} resultado(s) em ${grupos.length} lugar(es). `, grupos.map(([k, ls]) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); document.getElementById('busca-' + k)?.scrollIntoView({ behavior: 'smooth' }); } }, `${NOME_AREA[k]} (${ls.length}${ls.length === 50 ? '+' : ''})`)).flatMap((a, i) => i ? [' · ', a] : [a])),
      grupos.map(([k, ls]) => h('section', { class: 'secao', id: 'busca-' + k },
        h('div', { class: 'secao-topo' }, h('h3', {}, NOME_AREA[k], ' ', h('span', { class: 'contador' }, ls.length))),
        ls.length === 50 ? h('p', { class: 'ajuda' }, 'Mostrando os 50 primeiros. Use uma palavra mais específica para refinar.') : null,
        h('ul', { class: 'resultados' }, ls.map((r) => {
          const href = linkDe(r);
          const abrir = r.area === 'tarefas' ? (e) => { e.preventDefault(); abrirTarefa(r.id, buscar); } : null;
          return h('li', {},
            h('a', { href: href || '#', onclick: abrir }, realcar(r.titulo, txt)),
            r.data ? h('small', { class: 'txt-cinza' }, ' · ', fmtData(r.data)) : null,
            r.detalhe ? h('div', { class: 'txt-cinza' }, realcar(r.detalhe, txt)) : null);
        })))));
  }

  termo.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
  caixas.forEach(([, c]) => c.addEventListener('change', buscar));
  const marcarTodas = (v) => { caixas.forEach(([, c]) => { c.checked = v; }); buscar(); };

  limpar(el, h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Busca geral')),
    h('div', { class: 'busca-grande' }, termo, h('button', { class: 'btn primario', onclick: buscar }, 'Buscar')),
    h('div', {}, h('small', { class: 'txt-cinza' }, 'Procurar em: '),
      h('button', { class: 'btn-link', onclick: () => marcarTodas(true) }, 'todos'),
      h('button', { class: 'btn-link', onclick: () => marcarTodas(false) }, 'nenhum')),
    h('div', { class: 'busca-areas' }, caixas.map(([, c, t, ajuda]) => h('label', { title: 'Procura em: ' + ajuda }, c, t))),
    h('p', { class: 'ajuda' }, 'A busca ignora acentos e maiúsculas e mostra só o que você tem permissão para ver.'),
    area);
  termo.focus();
  if (termo.value) await buscar();
  else limpar(area, h('p', { class: 'vazio' }, 'Digite uma palavra-chave e tecle Enter.'));
}

// Funções de apoio usadas por todas as telas
/* global supabase */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado da sessão: quem está logado e listas de apoio
export const st = { eu: null, listas: {} };

export const perfil = () => st.eu?.perfil;
export const eGestor = () => perfil() === 'coordenacao';
export const eFinanceiro = () => ['financeiro', 'coordenacao'].includes(perfil());
export const NOME_PERFIL = { tecnico: 'Técnico', financeiro: 'Financeiro', coordenacao: 'Coordenação/Diretoria' };

// ------------------------------------------------------------------ DOM
export function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}
export const limpar = (el, ...filhos) => { el.replaceChildren(); el.append(...filhos.flat().filter(Boolean)); return el; };

// ------------------------------------------------------------------ formatos
export const fmtData = (d) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '';
export const fmtDataHora = (d) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
export const fmtReais = (v) => v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const hoje = () => new Date().toLocaleDateString('sv-SE');

export function somarDiasUteis(inicio, dias, uteis) {
  if (!inicio || !dias) return null;
  const d = new Date(inicio + 'T12:00:00');
  let n = 0;
  while (n < dias) {
    d.setDate(d.getDate() + 1);
    if (!uteis || (d.getDay() !== 0 && d.getDay() !== 6)) n++;
  }
  return d.toLocaleDateString('sv-SE');
}

const CORES = {
  'Em andamento': 'azul', 'Ativo': 'azul', 'Em aberto': 'amarelo', 'A fazer': 'amarelo', 'Não iniciado': 'cinza',
  'Paralisado': 'laranja', 'Aguardando terceiros': 'laranja', 'Pendência': 'laranja', 'Nota fiscal emitida': 'roxo',
  'Finalizado': 'verde', 'Encerrado': 'verde', 'Concluído': 'verde', 'Concluída': 'verde', 'Pago': 'verde', 'Quitado': 'verde',
  'Cancelado': 'cinza', 'Cancelada': 'cinza', 'Não atendido': 'cinza',
  'Vencido': 'vermelho', 'Atrasada': 'vermelho', 'Próximos 7 dias': 'laranja', 'Próximos 30 dias': 'amarelo',
  'Mais adiante': 'cinza', 'Sem data': 'cinza', 'A vencer': 'amarelo', 'Interna': 'cinza', 'Geral': 'azul',
  'Previsto': 'amarelo',
};
export const etiqueta = (txt, extra) => txt ? h('span', { class: `etq ${CORES[txt] || 'cinza'} ${extra || ''}` }, txt) : '';

// ------------------------------------------------------------------ avisos
export function aviso(msg, tipo = 'ok') {
  const el = h('div', { class: `toast ${tipo}` }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 3500);
}

export function traduzErro(e) {
  const m = e?.message || String(e);
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/violates foreign key/i.test(m)) return 'Este registro está sendo usado em outro lugar e não pode ser excluído.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  return m;
}

// Executa uma consulta do Supabase e mostra o erro, se houver
export async function q(promessa) {
  const { data, error } = await promessa;
  if (error) { aviso(traduzErro(error), 'erro'); throw error; }
  return data;
}

// ------------------------------------------------------------------ listas de apoio
export async function carregarListas() {
  const tabelas = {
    equipe: sb.from('equipe').select('id,nome,iniciais,perfil,ativo,email,user_id').order('nome'),
    servico: sb.from('servico').select('*').order('descricao'),
    os_situacao_detalhe: sb.from('os_situacao_detalhe').select('*').order('id'),
    periodo: sb.from('periodo').select('*').order('id'),
    mov_tipo: sb.from('mov_tipo').select('*').order('descricao'),
    mov_detalhe: sb.from('mov_detalhe').select('*').order('descricao'),
    mov_situacao: sb.from('mov_situacao').select('*').order('id'),
    cliente: sb.from('cliente').select('id,nome,nome_reduzido').order('nome'),
  };
  const res = await Promise.all(Object.values(tabelas));
  Object.keys(tabelas).forEach((k, i) => { st.listas[k] = res[i].data || []; });
}

export const opcoesLista = (lista, rotulo = 'descricao', soAtivos = true) =>
  (st.listas[lista] || []).filter((x) => !soAtivos || x.ativo !== false).map((x) => [x.id, typeof rotulo === 'function' ? rotulo(x) : x[rotulo]]);
export const opcoesEquipe = () => opcoesLista('equipe', (e) => e.nome + (e.iniciais ? ` (${e.iniciais})` : ''));
export const opcoesCliente = () => opcoesLista('cliente', (c) => c.nome_reduzido ? `${c.nome_reduzido} — ${c.nome}` : c.nome, false);
export const nomeEquipe = (id) => st.listas.equipe?.find((e) => e.id === id)?.nome || '';

// ------------------------------------------------------------------ janela (modal)
export function abrirJanela(titulo, conteudo, { largo = false } = {}) {
  const fundo = h('div', { class: 'fundo-janela', onclick: (e) => { if (e.target === fundo) fechar(); } });
  const janela = h('div', { class: 'janela' + (largo ? ' larga' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'janela-topo' }, h('h2', {}, titulo), h('button', { class: 'btn-icone', 'aria-label': 'Fechar', onclick: () => fechar() }, '×')),
    h('div', { class: 'janela-corpo' }, conteudo));
  fundo.append(janela);
  const esc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  function fechar() { fundo.remove(); document.removeEventListener('keydown', esc); }
  document.body.append(fundo);
  setTimeout(() => janela.querySelector('input,select,textarea')?.focus(), 30);
  return fechar;
}

export function confirmar(msg) {
  return new Promise((ok) => {
    const fechar = abrirJanela('Confirmar', h('div', {},
      h('p', {}, msg),
      h('div', { class: 'acoes' },
        h('button', { class: 'btn', onclick: () => { fechar(); ok(false); } }, 'Cancelar'),
        h('button', { class: 'btn perigo', onclick: () => { fechar(); ok(true); } }, 'Confirmar'))));
  });
}

// ------------------------------------------------------------------ formulário genérico
// campos: [{k, rotulo, tipo: texto|area|data|numero|dinheiro|opcoes|email|url|senha|marcar, opcoes, obrig, largura: 1|2, ajuda, desativado}]
export function formulario(campos, valores = {}, { aoSalvar, aoExcluir, rotuloSalvar = 'Salvar' } = {}) {
  const ctrls = {};
  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    const dados = {};
    for (const c of campos) {
      if (c.tipo === 'info' || c.desativado) continue;
      const el = ctrls[c.k];
      let v = c.tipo === 'marcar' ? el.checked : el.value.trim();
      if (v === '' ) v = null;
      if (v != null && ['numero', 'dinheiro'].includes(c.tipo)) v = Number(String(v).replace(',', '.'));
      if (v != null && c.tipo === 'opcoes' && c.numerico !== false && /^\d+$/.test(v)) v = Number(v);
      dados[c.k] = v;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try { await aoSalvar(dados); } catch (err) { console.error(err); } finally { btn.disabled = false; }
  } });
  const grade = h('div', { class: 'grade-form' });
  for (const c of campos) {
    const v = valores[c.k];
    let el;
    if (c.tipo === 'info') { grade.append(h('div', { class: 'campo largo info' }, c.rotulo)); continue; }
    if (c.tipo === 'area') el = h('textarea', { rows: c.linhas || 3 }, v ?? '');
    else if (c.tipo === 'opcoes') {
      el = h('select', {}, c.obrig ? null : h('option', { value: '' }, '—'),
        (typeof c.opcoes === 'function' ? c.opcoes() : c.opcoes).map((o) => {
          const [val, txt] = Array.isArray(o) ? o : [o, o];
          return h('option', { value: val, selected: String(val) === String(v ?? c.padrao ?? '') }, txt);
        }));
    } else if (c.tipo === 'marcar') el = h('input', { type: 'checkbox', checked: v ?? c.padrao ?? false });
    else {
      const tipos = { data: 'date', numero: 'number', dinheiro: 'number', email: 'email', url: 'url', senha: 'text' };
      el = h('input', { type: tipos[c.tipo] || 'text', value: v ?? c.padrao ?? '', step: c.tipo === 'dinheiro' ? '0.01' : null });
      if (c.sugestoes) {
        const id = 'dl-' + c.k + Math.random().toString(36).slice(2, 7);
        el.setAttribute('list', id);
        grade.append(h('datalist', { id }, c.sugestoes.map((s) => h('option', { value: s }))));
      }
    }
    if (c.obrig) el.required = true;
    if (c.desativado) el.disabled = true;
    ctrls[c.k] = el;
    grade.append(h('label', { class: 'campo' + (c.largura === 2 || c.tipo === 'area' ? ' largo' : '') },
      h('span', {}, c.rotulo, c.obrig ? ' *' : ''), el, c.ajuda ? h('small', {}, c.ajuda) : null));
  }
  form.append(grade, h('div', { class: 'acoes' },
    aoExcluir ? h('button', { type: 'button', class: 'btn perigo esquerda', onclick: aoExcluir }, 'Excluir') : null,
    h('button', { type: 'submit', class: 'btn primario' }, rotuloSalvar)));
  form.ctrls = ctrls;
  return form;
}

// Abre um formulário em janela para incluir/alterar um registro de uma tabela
export function editarRegistro({ titulo, tabela, campos, registro, extras = {}, depois, podeExcluir = true, antesDeSalvar }) {
  let fechar;
  const novo = !registro?.id;
  const form = formulario(campos, registro || {}, {
    aoSalvar: async (dados) => {
      Object.assign(dados, extras);
      if (antesDeSalvar) dados = (await antesDeSalvar(dados, form)) || dados;
      if (novo) await q(sb.from(tabela).insert(dados));
      else await q(sb.from(tabela).update(dados).eq('id', registro.id));
      aviso(novo ? 'Incluído.' : 'Alterações salvas.');
      fechar(); depois && depois();
    },
    aoExcluir: !novo && podeExcluir ? async () => {
      if (!(await confirmar('Excluir este registro? Isso não pode ser desfeito.'))) return;
      await q(sb.from(tabela).delete().eq('id', registro.id));
      aviso('Excluído.'); fechar(); depois && depois();
    } : null,
  });
  fechar = abrirJanela((novo ? 'Incluir ' : 'Alterar ') + titulo, form, { largo: campos.length > 6 });
  return form;
}

// ------------------------------------------------------------------ tabela genérica
// colunas: [{k, rotulo, f: (linha) => conteúdo, classe}]
export function tabela(colunas, linhas, { aoClicar, vazio = 'Nada encontrado.' } = {}) {
  if (!linhas?.length) return h('p', { class: 'vazio' }, vazio);
  return h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' + (aoClicar ? ' clicavel' : '') },
    h('thead', {}, h('tr', {}, colunas.map((c) => h('th', { class: c.classe }, c.rotulo)))),
    h('tbody', {}, linhas.map((l) => h('tr', { onclick: aoClicar ? () => aoClicar(l) : null, tabIndex: aoClicar ? 0 : null,
      onkeydown: aoClicar ? (e) => { if (e.key === 'Enter') aoClicar(l); } : null },
      colunas.map((c) => h('td', { class: c.classe, 'data-rotulo': c.rotulo }, c.f ? c.f(l) : (l[c.k] ?? '')))))),
  ));
}

export const cartao = (titulo, valor, detalhe, cor, href) =>
  h(href ? 'a' : 'div', { class: `cartao ${cor || ''}`, href }, h('div', { class: 'cartao-titulo' }, titulo),
    h('div', { class: 'cartao-valor' }, valor), detalhe ? h('div', { class: 'cartao-det' }, detalhe) : null);

export const secao = (titulo, ...conteudo) => h('section', { class: 'secao' },
  h('div', { class: 'secao-topo' }, h('h3', {}, titulo), conteudo.filter((c) => c?.classList?.contains('btn'))),
  conteudo.filter((c) => !c?.classList?.contains('btn')));

export const botao = (txt, onclick, cls = '') => h('button', { class: 'btn ' + cls, onclick }, txt);

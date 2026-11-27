// Entrada do sistema: login, menu e navegação entre telas
import { sb, st, h, limpar, aviso, traduzErro, carregarListas, NOME_PERFIL, eGestor, eFinanceiro } from './base.js';
import { paginaPainel } from './paginas/painel.js';
import { paginaListaOS, paginaOS } from './paginas/os.js';
import { paginaPrazos } from './paginas/prazos.js';
import { paginaCronograma } from './paginas/cronograma.js';
import { paginaTarefas } from './paginas/tarefas.js';
import { paginaFinanceiro } from './paginas/financeiro.js';
import { paginaClientes, paginaCliente } from './paginas/clientes.js';
import { paginaCadastros } from './paginas/cadastros.js';
import { paginaFornecedores, paginaFornecedor } from './paginas/fornecedores.js';
import { paginaBusca } from './paginas/busca.js';
import { paginaPropostas } from './paginas/propostas.js';

const raiz = document.getElementById('app');

const ROTAS = [
  [/^#?\/?$/, paginaPainel],
  [/^#\/os$/, paginaListaOS],
  [/^#\/os\/(\d+)(?:\/(\w+))?$/, paginaOS],
  [/^#\/cronograma$/, paginaCronograma],
  [/^#\/prazos$/, paginaPrazos],
  [/^#\/tarefas$/, paginaTarefas],
  [/^#\/financeiro$/, paginaFinanceiro, eFinanceiro],
  [/^#\/clientes$/, paginaClientes],
  [/^#\/clientes\/(\d+)$/, paginaCliente],
  [/^#\/fornecedores$/, paginaFornecedores],
  [/^#\/fornecedores\/(\d+)$/, paginaFornecedor],
  [/^#\/propostas$/, paginaPropostas],
  [/^#\/busca$/, paginaBusca],
  [/^#\/cadastros$/, paginaCadastros, eGestor],
];

function menu() {
  const itens = [
    ['#/', 'Início'], ['#/os', 'Ordens de serviço'], ['#/cronograma', 'Cronograma'], ['#/prazos', 'Prazos'], ['#/tarefas', 'Tarefas'],
    eFinanceiro() && ['#/financeiro', 'Financeiro'], ['#/propostas', 'Propostas'], ['#/clientes', 'Clientes'], ['#/fornecedores', 'Fornecedores'],
    eGestor() && ['#/cadastros', 'Cadastros'],
  ].filter(Boolean);
  const nav = h('nav', { class: 'menu', id: 'menu' }, itens.map(([href, txt]) => h('a', { href }, txt,
    href === '#/propostas' ? h('span', { class: 'contador', id: 'contador-propostas', hidden: true, title: 'Pedidos de proposta novos' }) : null)));
  const termo = h('input', { type: 'search', placeholder: '🔍 Busca geral…', 'aria-label': 'Busca geral' });
  const busca = h('form', { class: 'busca-topo', onsubmit: (e) => {
    e.preventDefault();
    if (!termo.value.trim()) return;
    const destino = `#/busca?q=${encodeURIComponent(termo.value.trim())}`;
    termo.value = '';
    if (location.hash === destino) navegar(); else location.hash = destino;
  } }, termo);
  return h('header', { class: 'topo' },
    h('a', { class: 'marca', href: '#/', title: 'Início' }, h('img', { class: 'marca-logo', src: 'img/logo-triunfo-branca.png', alt: 'Triunfo Engenharia Ambiental' }), h('span', { class: 'marca-nome' }, 'Gestão de Serviços')),
    h('button', { class: 'btn-icone menu-botao', 'aria-label': 'Menu', onclick: () => nav.classList.toggle('aberto') }, '☰'),
    nav, busca,
    h('div', { class: 'usuario' },
      h('span', { class: 'usuario-nome' }, st.eu.nome, h('small', {}, NOME_PERFIL[st.eu.perfil])),
      h('button', { class: 'btn pequeno', onclick: async () => { await sb.auth.signOut(); location.hash = '#/'; iniciar(); } }, 'Sair')));
}

// número de pedidos de proposta com situação "Nova", ao lado de "Propostas" no menu
async function atualizarContadorPropostas() {
  const el = document.getElementById('contador-propostas');
  if (!el) return;
  const { count } = await sb.from('solicitacao_proposta').select('id', { count: 'exact', head: true }).eq('situacao', 'Nova');
  el.textContent = count || '';
  el.hidden = !count;
}

async function navegar() {
  const conteudo = document.getElementById('conteudo');
  if (!conteudo) return;
  const hash = (location.hash || '#/').split('?')[0];
  document.querySelectorAll('.menu a').forEach((a) => {
    const alvo = a.getAttribute('href');
    a.classList.toggle('ativo', alvo === '#/' ? hash === '#/' || hash === '' : hash.startsWith(alvo));
  });
  document.getElementById('menu')?.classList.remove('aberto');
  atualizarContadorPropostas();
  for (const [re, pagina, permitido] of ROTAS) {
    const m = hash.match(re);
    if (!m) continue;
    if (permitido && !permitido()) break;
    limpar(conteudo, h('p', { class: 'carregando' }, 'Carregando…'));
    try { await pagina(conteudo, ...m.slice(1)); } catch (e) {
      console.error(e);
      limpar(conteudo, h('div', { class: 'alerta erro' }, 'Não foi possível abrir esta tela: ' + traduzErro(e)));
    }
    window.scrollTo(0, 0);
    return;
  }
  limpar(conteudo, h('p', {}, 'Página não encontrada. ', h('a', { href: '#/' }, 'Voltar ao início')));
}

// ------------------------------------------------------------------ login
function telaLogin(msg) {
  const email = h('input', { type: 'email', required: true, autocomplete: 'username' });
  const senha = h('input', { type: 'password', required: true, autocomplete: 'current-password', minLength: 6 });
  const status = h('p', { class: 'login-msg' }, msg || '');
  let modo = 'entrar';
  const titulo = h('h1', {}, 'Entrar');
  const btn = h('button', { class: 'btn primario largo', type: 'submit' }, 'Entrar');
  const trocar = h('a', { href: '#', onclick: (e) => { e.preventDefault(); modo = modo === 'entrar' ? 'criar' : 'entrar'; atualizar(); } });
  function atualizar() {
    titulo.textContent = modo === 'entrar' ? 'Entrar' : 'Primeiro acesso';
    btn.textContent = modo === 'entrar' ? 'Entrar' : 'Criar minha senha';
    trocar.textContent = modo === 'entrar' ? 'Primeiro acesso? Crie sua senha' : 'Já tenho senha';
    status.textContent = modo === 'criar' ? 'Use o e-mail que a coordenação cadastrou para você na equipe.' : (msg || '');
  }
  atualizar();
  const form = h('form', { class: 'login-caixa', onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true;
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: senha.value });
        if (error) throw error;
        await iniciar();
      } else {
        const { data, error } = await sb.auth.signUp({ email: email.value.trim(), password: senha.value,
          options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (data.session) await iniciar();
        else { status.textContent = 'Enviamos um e-mail de confirmação. Clique no link e depois entre com sua senha.'; }
      }
    } catch (err) { status.textContent = traduzErro(err); } finally { btn.disabled = false; }
  } },
    h('div', { class: 'marca grande' }, h('img', { class: 'marca-logo', src: 'img/logo-triunfo-verde.png', alt: 'Triunfo Engenharia Ambiental' }), h('span', { class: 'marca-nome' }, 'Gestão de Serviços')),
    titulo,
    h('label', { class: 'campo' }, h('span', {}, 'E-mail'), email),
    h('label', { class: 'campo' }, h('span', {}, 'Senha'), senha),
    btn, status,
    h('div', { class: 'login-links' }, trocar,
      h('a', { href: '#', onclick: async (e) => {
        e.preventDefault();
        if (!email.value) { status.textContent = 'Digite seu e-mail acima para receber o link de nova senha.'; return; }
        const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
        status.textContent = error ? traduzErro(error) : 'Se o e-mail estiver cadastrado, você receberá um link para criar nova senha.';
      } }, 'Esqueci minha senha')));
  limpar(raiz, h('div', { class: 'login' }, form));
}

function telaNovaSenha() {
  const senha = h('input', { type: 'password', required: true, minLength: 6, autocomplete: 'new-password' });
  const status = h('p', { class: 'login-msg' });
  limpar(raiz, h('div', { class: 'login' }, h('form', { class: 'login-caixa', onsubmit: async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: senha.value });
    if (error) { status.textContent = traduzErro(error); return; }
    aviso('Senha alterada.'); history.replaceState(null, '', location.pathname); iniciar();
  } }, h('h1', {}, 'Criar nova senha'), h('label', { class: 'campo' }, h('span', {}, 'Nova senha (mínimo 6 caracteres)'), senha),
    h('button', { class: 'btn primario largo' }, 'Salvar senha'), status)));
}

// ------------------------------------------------------------------ início
async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaLogin();
  const { data: eu } = await sb.from('equipe').select('*').eq('user_id', session.user.id).maybeSingle();
  if (!eu || !eu.perfil || !eu.ativo) {
    await sb.auth.signOut();
    return telaLogin(`O e-mail ${session.user.email} ainda não foi liberado. Peça à coordenação para cadastrá-lo na equipe com um perfil.`);
  }
  st.eu = eu;
  await carregarListas();
  limpar(raiz, menu(), h('main', { id: 'conteudo', class: 'conteudo' }));
  navegar();
}

window.addEventListener('hashchange', navegar);
window.addEventListener('propostas-alteradas', atualizarContadorPropostas);
sb.auth.onAuthStateChange((evento) => { if (evento === 'PASSWORD_RECOVERY') telaNovaSenha(); });
if (/type=recovery/.test(location.hash)) { /* o Supabase dispara PASSWORD_RECOVERY */ } else iniciar();

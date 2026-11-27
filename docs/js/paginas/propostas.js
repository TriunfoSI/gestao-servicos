// Solicitações de proposta recebidas pelo formulário público (proposta.html)
import { sb, h, limpar, q, aviso, tabela, etiqueta, fmtDataHora, abrirJanela, confirmar, botao, secao, eGestor } from '../base.js';

const BALDE = 'solicitacoes-proposta';
const SITUACOES = ['Nova', 'Em análise', 'Proposta enviada', 'Arquivada'];
const GRUPOS = [['demanda', 'Documentação que gerou a demanda'], ['delimitacao', 'Delimitação da área (KMZ, mapa ou DWG)'], ['area', 'Matrícula ou outro documento da área']];
const linkFormulario = () => new URL('proposta.html', location.href.split('#')[0]).href;

async function copiarLink() {
  try { await navigator.clipboard.writeText(linkFormulario()); aviso('Link do formulário copiado. Cole na mensagem para o cliente.'); }
  catch { abrirJanela('Link do formulário', h('div', {}, h('p', {}, 'Copie o endereço abaixo e envie ao cliente:'), h('input', { value: linkFormulario(), readonly: true, onfocus: (e) => e.target.select() }))); }
}

// arquivos enviados pelo cliente, separados por grupo
async function arquivosDaSolicitacao(s) {
  const caixa = h('div', {}, h('p', { class: 'carregando' }, 'Carregando arquivos…'));
  (async () => {
    const grupos = await Promise.all(GRUPOS.map(async ([g, rotulo]) => {
      const { data } = await sb.storage.from(BALDE).list(`${s.token}/${g}`, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
      return [g, rotulo, (data || []).filter((a) => a.id)];
    }));
    const total = grupos.reduce((n, [, , ls]) => n + ls.length, 0);
    if (!total) { limpar(caixa, h('p', { class: 'vazio' }, 'O cliente não enviou arquivos.')); return; }
    limpar(caixa, grupos.filter(([, , ls]) => ls.length).map(([g, rotulo, ls]) => h('div', { class: 'grupo-arquivos' },
      h('strong', {}, rotulo),
      h('ul', {}, ls.map((a) => h('li', {}, h('a', { href: '#', onclick: async (e) => {
        e.preventDefault();
        const { data, error } = await sb.storage.from(BALDE).createSignedUrl(`${s.token}/${g}/${a.name}`, 300, { download: a.name });
        if (error) { aviso('Não foi possível baixar o arquivo.', 'erro'); return; }
        location.href = data.signedUrl;
      } }, a.name), ' ', h('small', { class: 'txt-cinza' }, a.metadata?.size ? `(${(a.metadata.size / 1048576).toFixed(1).replace('.', ',')} MB)` : '')))))));
  })();
  return caixa;
}

async function abrirSolicitacao(s, depois) {
  const situacao = h('select', {}, SITUACOES.map((t) => h('option', { selected: t === s.situacao }, t)));
  const obs = h('textarea', { rows: 3 }, s.observacao || '');
  const linha = (rotulo, valor) => valor ? [h('dt', {}, rotulo), h('dd', { class: 'pre' }, valor)] : null;
  let fechar;
  const conteudo = h('div', {},
    h('p', { class: 'ajuda' }, `Recebida em ${fmtDataHora(s.criado_em)}`),
    h('h3', {}, 'Contratante'),
    h('dl', { class: 'detalhes' }, linha('Nome / Razão social', s.contratante_nome), linha('Endereço', s.contratante_endereco),
      linha('CPF / CNPJ', s.contratante_cpf_cnpj), linha('E-mail', s.contratante_email), linha('Telefone / Celular', s.contratante_telefone)),
    h('h3', {}, 'Local do serviço'),
    h('dl', { class: 'detalhes' }, linha('Denominação', s.local_denominacao), linha('Endereço completo', s.local_endereco),
      s.local_link_mapa ? [h('dt', {}, 'Localização'), h('dd', {}, h('a', { href: s.local_link_mapa, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir no mapa'))] : null),
    h('h3', {}, 'Serviço solicitado'),
    h('p', { class: 'pre' }, s.descricao),
    h('h3', {}, 'Arquivos enviados'),
    await arquivosDaSolicitacao(s),
    h('h3', { style: 'margin-top:1rem' }, 'Acompanhamento interno'),
    h('div', { class: 'grade-form' },
      h('label', { class: 'campo' }, h('span', {}, 'Situação'), situacao),
      h('label', { class: 'campo largo' }, h('span', {}, 'Observação interna (o cliente não vê)'), obs)),
    h('div', { class: 'acoes' },
      eGestor() ? h('button', { class: 'btn perigo esquerda', onclick: async () => {
        if (!(await confirmar('Excluir esta solicitação e os arquivos enviados? Isso não pode ser desfeito.'))) return;
        const nomes = [];
        for (const [g] of GRUPOS) {
          const { data } = await sb.storage.from(BALDE).list(`${s.token}/${g}`, { limit: 100 });
          (data || []).filter((a) => a.id).forEach((a) => nomes.push(`${s.token}/${g}/${a.name}`));
        }
        if (nomes.length) await sb.storage.from(BALDE).remove(nomes);
        await q(sb.from('solicitacao_proposta').delete().eq('id', s.id));
        aviso('Excluída.'); fechar(); depois();
      } }, 'Excluir') : null,
      h('button', { class: 'btn primario', onclick: async () => {
        await q(sb.from('solicitacao_proposta').update({ situacao: situacao.value, observacao: obs.value.trim() || null }).eq('id', s.id));
        aviso('Alterações salvas.'); fechar(); depois();
      } }, 'Salvar')));
  fechar = abrirJanela(`Solicitação ${s.protocolo || ''}`, conteudo, { largo: true });
}

export async function paginaPropostas(el) {
  const todas = await q(sb.from('solicitacao_proposta').select('*').order('criado_em', { ascending: false }));
  const filtro = h('select', {}, h('option', { value: 'abertas' }, 'Em aberto (Nova e Em análise)'), h('option', { value: '' }, 'Todas'),
    SITUACOES.map((t) => h('option', { value: t }, t)));
  const busca = h('input', { type: 'search', placeholder: 'Buscar por protocolo, contratante, local ou CPF/CNPJ' });
  const area = h('div');
  const semAcento = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const recarregar = () => paginaPropostas(el);
  function mostrar() {
    const b = semAcento(busca.value.trim());
    const ls = todas.filter((s) => (filtro.value === 'abertas' ? ['Nova', 'Em análise'].includes(s.situacao) : !filtro.value || s.situacao === filtro.value) &&
      (!b || semAcento([s.protocolo, s.contratante_nome, s.contratante_cpf_cnpj, s.local_denominacao, s.local_endereco].join(' ')).includes(b)));
    limpar(area, h('p', { class: 'contagem' }, `${ls.length} solicitação(ões)`),
      tabela([
        { k: 'protocolo', rotulo: 'Protocolo' },
        { k: 'criado_em', rotulo: 'Recebida em', f: (s) => fmtDataHora(s.criado_em) },
        { k: 'contratante_nome', rotulo: 'Contratante' },
        { k: 'local_denominacao', rotulo: 'Local' },
        { k: 'contratante_telefone', rotulo: 'Telefone' },
        { k: 'situacao', rotulo: 'Situação', f: (s) => etiqueta(s.situacao) },
      ], ls, { aoClicar: (s) => abrirSolicitacao(s, recarregar), vazio: 'Nenhuma solicitação encontrada.' }));
  }
  filtro.onchange = mostrar; busca.oninput = mostrar;
  limpar(el,
    h('div', { class: 'titulo-pagina' }, h('h1', {}, 'Propostas'),
      h('div', { class: 'acoes-topo' }, botao('Copiar link do formulário', copiarLink, 'primario'), ' ',
        h('a', { class: 'btn', href: 'proposta.html', target: '_blank', rel: 'noopener' }, 'Ver formulário'))),
    h('p', { class: 'ajuda' }, 'Solicitações enviadas pelos clientes no formulário de solicitação de proposta. Clique em uma linha para ver os dados e os arquivos.'),
    secao('Solicitações recebidas', h('div', { class: 'filtros' }, busca, filtro), area));
  mostrar();
}

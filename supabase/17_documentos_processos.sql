-- =====================================================================
-- Ajuste 26/11/2026: aba "Documentos|Processos" da OS
--   - Tipo ganha a opção "Docs. Contratuais" (documentos que o cliente
--     precisa entregar).
--   - "Órgão / instituição" passa a se chamar "Origem" na tela (a coluna
--     no banco continua instituicao) e ganha a sugestão "Cliente".
--   - O texto que já existia em "Situação" continua guardado na mesma
--     coluna (situacao) e passa a aparecer como "Detalhamento da situação".
--     Nenhum dado é apagado.
--   - Nova coluna status = a nova "Situação" (lista): Em andamento,
--     Encerrado, Pendente, Ativa, Baixada, Emitida.
--   - Toda OS NOVA já nasce com 5 documentos do cliente (Docs. Contratuais,
--     Origem Cliente, Situação Pendente): Procuração, Matrícula do imóvel,
--     IPTU, CNH ou RG/CPF, Levantamento Planialtimétrico com ART (PDF/DWG).
--     As OS que já existem não recebem nada.
--   - Link do cliente passa a mostrar a nova Situação e o Detalhamento.
-- Rodar depois do 16_apoio_tecnico_retorno. Pode ser rodado mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipo "Docs. Contratuais" e a nova Situação (lista)
-- ---------------------------------------------------------------------
alter table processo drop constraint if exists processo_natureza_check;
alter table processo add constraint processo_natureza_check
  check (natureza in ('Processo','Documento','ART','Docs. Contratuais'));

alter table processo add column if not exists status text;
alter table processo drop constraint if exists processo_status_check;
alter table processo add constraint processo_status_check
  check (status in ('Em andamento','Encerrado','Pendente','Ativa','Baixada','Emitida'));

comment on column processo.instituicao is 'Na tela: "Origem" (órgão, instituição ou Cliente).';
comment on column processo.situacao    is 'Na tela: "Detalhamento da situação" (texto livre).';
comment on column processo.status      is 'Na tela: "Situação" (lista: Em andamento, Encerrado, Pendente, Ativa, Baixada, Emitida).';

-- ---------------------------------------------------------------------
-- 2. Documentos padrão em toda OS nova
-- ---------------------------------------------------------------------
create or replace function os_documentos_padrao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into processo (os_id, natureza, instituicao, objetivo, status)
  select new.id, 'Docs. Contratuais', 'Cliente', d.nome, 'Pendente'
    from unnest(array['Procuração', 'Matrícula do imóvel', 'IPTU', 'CNH ou RG/CPF',
                      'Levantamento Planialtimétrico com ART (PDF/DWG)']) with ordinality as d(nome, ordem)
   order by d.ordem;
  return new;
end $$;
revoke all on function os_documentos_padrao() from public;

drop trigger if exists os_documentos_padrao on os;
create trigger os_documentos_padrao after insert on os
  for each row execute function os_documentos_padrao();

-- ---------------------------------------------------------------------
-- 3. Link do cliente: Situação (lista) e Detalhamento
-- ---------------------------------------------------------------------
create or replace function relatorio_cliente(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_os bigint; r jsonb;
begin
  select os_id into v_os from link_cliente
   where token = p_token and revogado_em is null;
  if v_os is null then
    return jsonb_build_object('erro', 'Link inválido ou cancelado.');
  end if;
  update link_cliente set ultimo_acesso = now(), acessos = acessos + 1 where token = p_token;

  select jsonb_build_object(
    'os', (select jsonb_build_object(
              'numero', o.numero, 'titulo', o.titulo, 'proposta', o.proposta,
              'cliente', c.nome, 'local', o.local, 'local_endereco', o.local_endereco,
              'municipio', o.municipio, 'uf', o.uf, 'data_aceite', o.data_aceite,
              'data_termino', o.data_termino, 'prazo_contratual', o.prazo_contratual,
              'sit_tecnica', o.sit_tecnica, 'sit_tecnica_detalhe', d.descricao,
              'sit_comercial', o.sit_comercial, 'sit_contrato', o.sit_contrato,
              'responsavel', e.nome, 'atualizado', o.situacao_atualizada_em)
             from os o join cliente c on c.id = o.cliente_id
             left join equipe e on e.id = o.responsavel_id
             left join os_situacao_detalhe d on d.id = o.sit_tecnica_detalhe_id
            where o.id = v_os),
    'escopo', coalesce((select jsonb_agg(jsonb_build_object('servico', s.descricao, 'descricao', x.descricao) order by x.ordem, x.id)
             from os_escopo x left join servico s on s.id = x.servico_id where x.os_id = v_os), '[]'),
    'cronograma', coalesce((select jsonb_agg(jsonb_build_object('descricao', g.descricao,
                    'inicio', g.data_inicio, 'termino', g.data_termino, 'situacao', g.situacao,
                    'responsavel', g.responsavel_parte) order by g.data_inicio nulls last, g.data_termino, g.id)
             from cronograma g where g.os_id = v_os and not g.preliminar), '[]'),
    'prazos', coalesce((select jsonb_agg(jsonb_build_object('descricao', p.descricao, 'tipo', p.tipo, 'origem', p.origem,
                    'data', p.data_termino, 'atendimento', p.data_atendimento,
                    'situacao', prazo_situacao(p.data_termino, p.atendido, p.data_atendimento))
                    order by p.atendido, p.data_termino nulls last, p.id)
             from prazo p where p.os_id = v_os), '[]'),
    'andamento', coalesce((select jsonb_agg(jsonb_build_object('data', m.data_inicio, 'termino', m.data_termino,
                    'detalhe', de.descricao, 'descricao', m.descricao) order by m.data_inicio desc, m.id desc)
             from movimentacao m left join mov_detalhe de on de.id = m.detalhe_id
            where m.os_id = v_os and m.visibilidade = 'Geral'), '[]'),
    'financeiro', coalesce((select jsonb_agg(jsonb_build_object('parcela', concat_ws('/', p.numero, p.total_parcelas),
                    'referencia', p.referencia, 'valor', p.valor, 'situacao', p.situacao,
                    'prevista', p.data_prevista, 'paga', p.data_pagamento, 'nota_fiscal', p.nota_fiscal)
                    order by p.numero nulls last, p.id)
             from parcela p where p.os_id = v_os and p.situacao <> 'Cancelada'), '[]'),
    'processos', coalesce((select jsonb_agg(jsonb_build_object('natureza', pr.natureza, 'instituicao', pr.instituicao, 'referencia', pr.referencia,
                    'abertura', pr.data_abertura, 'objetivo', pr.objetivo, 'tipo', pr.tipo,
                    'verificado_em', pr.verificado_em, 'status', pr.status, 'situacao', pr.situacao)
                    order by pr.data_abertura nulls last, pr.id)
             from processo pr where pr.os_id = v_os), '[]'),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object('nome', f.nome, 'tipo', t.descricao, 'numero', f.numero,
                    'data', coalesce(f.data_elaboracao, f.enviado_em::date), 'enviado_em', f.enviado_em)
                    order by coalesce(f.data_elaboracao, f.enviado_em::date))
             from produto_final f left join tipo_produto_tecnico t on t.id = f.tipo_id where f.os_id = v_os), '[]')
  ) into r;
  return r;
end $$;

revoke all on function relatorio_cliente(text) from public;
grant execute on function relatorio_cliente(text) to anon, authenticated;

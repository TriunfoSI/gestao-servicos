-- =====================================================================
-- Visões usadas pelas telas e relatório do cliente
-- (security_invoker = as regras de acesso de cada usuário continuam valendo)
-- =====================================================================

create or replace function dias_uteis_somar(p_inicio date, p_dias int) returns date
language plpgsql immutable as $$
declare d date := p_inicio; n int := 0;
begin
  if p_inicio is null or p_dias is null then return null; end if;
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- Lista de OS com nomes já resolvidos
create or replace view v_os with (security_invoker = true) as
select o.*,
       c.nome            as cliente_nome,
       coalesce(c.nome_reduzido, c.nome) as cliente_curto,
       ct.nome           as contato_nome,
       e.nome            as responsavel_nome,
       e.iniciais        as responsavel_iniciais,
       d.descricao       as sit_tecnica_detalhe
  from os o
  join cliente c on c.id = o.cliente_id
  left join contato ct on ct.id = o.contato_id
  left join equipe e on e.id = o.responsavel_id
  left join os_situacao_detalhe d on d.id = o.sit_tecnica_detalhe_id;

-- Prazos com a situação de vencimento calculada
create or replace view v_prazo with (security_invoker = true) as
select p.*,
       o.numero  as os_numero,
       o.titulo  as os_titulo,
       o.responsavel_id as os_responsavel_id,
       coalesce(c.nome_reduzido, c.nome) as cliente_curto,
       e.nome    as responsavel_nome,
       e.iniciais as responsavel_iniciais,
       pe.descricao as periodo,
       case
         when p.situacao in ('Concluído','Cancelado','Não atendido') then 'Encerrado'
         when p.data_termino is null then 'Sem data'
         when p.data_termino <  current_date then 'Vencido'
         when p.data_termino <= current_date + 7 then 'Próximos 7 dias'
         when p.data_termino <= current_date + 30 then 'Próximos 30 dias'
         else 'Mais adiante'
       end as alerta,
       p.data_termino - current_date as dias_restantes
  from prazo p
  join os o on o.id = p.os_id
  join cliente c on c.id = o.cliente_id
  left join equipe e on e.id = p.responsavel_id
  left join periodo pe on pe.id = p.periodo_id;

create or replace view v_tarefa with (security_invoker = true) as
select t.*,
       o.numero as os_numero,
       o.titulo as os_titulo,
       coalesce(c.nome_reduzido, c.nome) as cliente_curto,
       e.nome as responsavel_nome,
       e.iniciais as responsavel_iniciais,
       (select max(em) from tarefa_atualizacao a where a.tarefa_id = t.id) as ultima_atualizacao
  from tarefa t
  left join os o on o.id = t.os_id
  left join cliente c on c.id = o.cliente_id
  left join equipe e on e.id = t.responsavel_id;

create or replace view v_movimentacao with (security_invoker = true) as
select m.*,
       ti.descricao as tipo, de.descricao as detalhe, si.descricao as situacao,
       e.nome as responsavel_nome, e.iniciais as responsavel_iniciais
  from movimentacao m
  left join mov_tipo ti on ti.id = m.tipo_id
  left join mov_detalhe de on de.id = m.detalhe_id
  left join mov_situacao si on si.id = m.situacao_id
  left join equipe e on e.id = m.responsavel_id;

-- Resumo financeiro por OS (só aparece para financeiro e coordenação)
create or replace view v_os_financeiro with (security_invoker = true) as
select o.id as os_id,
       coalesce(pa.contratado,0)  as valor_parcelas,
       coalesce(aj.ajustes,0)     as ajustes,
       coalesce(pa.contratado,0) + coalesce(aj.ajustes,0) as valor_final,
       coalesce(pa.recebido,0)    as recebido,
       coalesce(pa.a_receber,0)   as a_receber,
       coalesce(cu.custos,0)      as custos,
       coalesce(pa.recebido,0) - coalesce(cu.custos_pagos,0) as saldo_caixa,
       coalesce(pa.contratado,0) + coalesce(aj.ajustes,0) - coalesce(cu.custos,0) as resultado_previsto,
       coalesce(pa.qtd,0) as qtd_parcelas,
       coalesce(pa.qtd_abertas,0) as qtd_abertas
  from os o
  left join (select os_id, sum(valor) filter (where situacao <> 'Cancelada') contratado,
                    sum(valor) filter (where situacao = 'Pago') recebido,
                    sum(valor) filter (where situacao not in ('Pago','Cancelada')) a_receber,
                    count(*) qtd, count(*) filter (where situacao not in ('Pago','Cancelada')) qtd_abertas
               from parcela group by os_id) pa on pa.os_id = o.id
  left join (select os_id, sum(valor) ajustes from ajuste_comercial group by os_id) aj on aj.os_id = o.id
  left join (select os_id, sum(valor) custos, sum(valor) filter (where situacao='Pago') custos_pagos
               from custo group by os_id) cu on cu.os_id = o.id
 where exists (select 1 from parcela p where p.os_id = o.id)
    or exists (select 1 from custo k where k.os_id = o.id)
    or exists (select 1 from ajuste_comercial a where a.os_id = o.id);

create or replace view v_parcela with (security_invoker = true) as
select p.*, o.numero as os_numero, o.titulo as os_titulo,
       coalesce(c.nome_reduzido, c.nome) as cliente_curto,
       pe.descricao as periodo_previsto,
       case when p.situacao in ('Pago','Cancelada') then 'Encerrada'
            when p.data_prevista < current_date then 'Atrasada'
            else 'A vencer' end as alerta
  from parcela p
  join os o on o.id = p.os_id
  join cliente c on c.id = o.cliente_id
  left join periodo pe on pe.id = p.periodo_previsto_id;

grant select on v_os, v_prazo, v_tarefa, v_movimentacao, v_os_financeiro, v_parcela to authenticated;

-- ---------------------------------------------------------------------
-- Relatório do cliente (acessado pelo link, sem login)
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
    'prazos', coalesce((select jsonb_agg(jsonb_build_object('descricao', p.descricao, 'tipo', p.tipo, 'origem', p.origem,
                    'inicio', p.data_inicio, 'termino', p.data_termino, 'situacao', p.situacao) order by p.data_termino nulls last, p.id)
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
    'processos', coalesce((select jsonb_agg(jsonb_build_object('instituicao', pr.instituicao, 'referencia', pr.referencia,
                    'abertura', pr.data_abertura, 'objetivo', pr.objetivo, 'tipo', pr.tipo) order by pr.data_abertura nulls last)
             from processo pr where pr.os_id = v_os), '[]'),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object('nome', f.nome, 'enviado_em', f.enviado_em) order by f.enviado_em)
             from produto_final f where f.os_id = v_os), '[]')
  ) into r;
  return r;
end $$;

revoke all on function relatorio_cliente(text) from public;
grant execute on function relatorio_cliente(text) to anon, authenticated;

revoke all on v_os, v_prazo, v_tarefa, v_movimentacao, v_os_financeiro, v_parcela from anon;

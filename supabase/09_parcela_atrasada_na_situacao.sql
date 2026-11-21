-- =====================================================================
-- Ajuste 21/11/2026 (complemento do script de 20/11)
--   Situação automática da OS no Início: parcela do financeiro atrasada
--   (previsão de pagamento vencida e não paga) também deixa a OS como
--   "Pendência". Rode DEPOIS do script 08 (20/11).
-- Nenhum dado é alterado. Pode ser rodado mais de uma vez.
-- =====================================================================

drop view if exists v_os_situacao;
drop view if exists v_os_alerta;
create view v_os_alerta with (security_invoker = true) as
select p.os_id, 'Prazo'::text as origem, p.descricao, p.data_termino as data
  from prazo p
 where not p.atendido and p.data_termino is not null
union all
select g.os_id, 'Cronograma', g.descricao, g.data_termino
  from cronograma g
 where g.situacao <> 'Concluída' and g.data_termino is not null
union all
select pr.os_id, 'Verificação',
       concat_ws(' — ', pr.natureza, pr.instituicao, pr.referencia), pr.proxima_verificacao
  from processo pr
 where pr.proxima_verificacao is not null
union all
select t.os_id, 'Tarefa', t.descricao, t.prazo
  from tarefa t
 where t.os_id is not null and t.prazo is not null and t.situacao not in ('Concluída','Cancelada')
union all
-- parcelas do financeiro: só entram quando atrasadas (previsão vencida e não paga).
-- O técnico não vê parcelas, então para ele elas não contam.
select pa.os_id, 'Parcela',
       concat_ws(' ', 'Parcela', pa.numero::text || coalesce('/' || pa.total_parcelas::text, ''), nullif(pa.referencia, '')),
       pa.data_prevista
  from parcela pa
 where pa.situacao not in ('Pago','Cancelada') and pa.data_prevista < current_date;

-- Uma linha por OS não encerrada, com a situação e os itens que a explicam
create view v_os_situacao with (security_invoker = true) as
with itens as (
  select a.*,
         case when a.data < current_date then 'Vencido'
              when a.data <= current_date + 10 then 'A vencer' end as estado
    from v_os_alerta a
)
select o.id as os_id,
       o.numero as os_numero,
       o.titulo as os_titulo,
       o.responsavel_id,
       coalesce(c.nome_reduzido, c.nome) as cliente_curto,
       c.nome as cliente_nome,
       e.iniciais as responsavel_iniciais,
       count(i.*) filter (where i.estado = 'Vencido')  as qtd_vencidos,
       count(i.*) filter (where i.estado = 'A vencer') as qtd_a_vencer,
       case when count(i.*) filter (where i.estado = 'Vencido') > 0 then 'Pendência'
            when count(i.*) filter (where i.estado = 'A vencer') > 0 then 'Prazos a vencer'
            else 'Em conformidade' end as situacao,
       min(i.data) filter (where i.estado is not null) as data_mais_proxima,
       coalesce(jsonb_agg(jsonb_build_object('origem', i.origem, 'descricao', i.descricao, 'data', i.data, 'estado', i.estado)
                          order by i.data) filter (where i.estado is not null), '[]') as itens
  from os o
  join cliente c on c.id = o.cliente_id
  left join equipe e on e.id = o.responsavel_id
  left join itens i on i.os_id = o.id
 where o.sit_contrato is distinct from 'Encerrado'
 group by o.id, o.numero, o.titulo, o.responsavel_id, c.nome_reduzido, c.nome, e.iniciais;

grant select on v_os_alerta, v_os_situacao to authenticated;
revoke all on v_os_alerta, v_os_situacao from anon;

-- =====================================================================
-- Ajustes 20/11/2026
--   1. Processos/Documentos: periodicidade da verificação (Semanal,
--      Quinzenal, Mensal, Bimestral, Semestral ou Nenhuma) e
--      "Próxima verificação", calculada automaticamente a partir de
--      "Verificado em" + periodicidade.
--   2. Situação automática de cada OS para o painel Início:
--        Pendência        -> existe alguma data vencida
--        Prazos a vencer  -> nada vencido, mas algo vence em até 10 dias
--        Em conformidade  -> nada vencido nem vencendo em 10 dias
--      Considera: prazos não atendidos, atividades do cronograma não
--      concluídas, próximas verificações de processos/documentos e
--      tarefas abertas com prazo.
-- Nenhum dado existente é apagado. Pode ser rodado mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROCESSOS / DOCUMENTOS: periodicidade e próxima verificação
-- ---------------------------------------------------------------------
alter table processo add column if not exists periodicidade text not null default 'Nenhuma';
alter table processo drop constraint if exists processo_periodicidade_check;
alter table processo add constraint processo_periodicidade_check
  check (periodicidade in ('Semanal','Quinzenal','Mensal','Bimestral','Semestral','Nenhuma'));

create or replace function calcula_proxima_verificacao(p_verificado date, p_periodicidade text) returns date
language sql immutable as $$
  select case
    when p_verificado is null then null
    when p_periodicidade = 'Semanal'   then p_verificado + 7
    when p_periodicidade = 'Quinzenal' then p_verificado + 15
    when p_periodicidade = 'Mensal'    then (p_verificado + interval '1 month')::date
    when p_periodicidade = 'Bimestral' then (p_verificado + interval '2 months')::date
    when p_periodicidade = 'Semestral' then (p_verificado + interval '6 months')::date
    else null end
$$;

-- coluna calculada pelo banco: muda sozinha quando "Verificado em" ou a periodicidade mudam
alter table processo add column if not exists proxima_verificacao date
  generated always as (calcula_proxima_verificacao(verificado_em, periodicidade)) stored;

-- ---------------------------------------------------------------------
-- 2. SITUAÇÃO AUTOMÁTICA DA OS
-- ---------------------------------------------------------------------
-- Todas as datas que podem vencer, uma linha por item
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
 where t.os_id is not null and t.prazo is not null and t.situacao not in ('Concluída','Cancelada');

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

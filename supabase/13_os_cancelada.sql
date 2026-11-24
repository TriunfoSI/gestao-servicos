-- =====================================================================
-- Ajuste 24/11/2026 (pedido da Loretha): situação "Cancelado" da OS
--
--   1. Situação comercial ganha a opção "Cancelado".
--   2. A situação do contrato (calculada) passa a ser:
--        * Cancelado  -> técnica "Cancelado" E detalhe da situação técnica
--                        "Cancelada" E comercial "Cancelado"
--        * Encerrado  -> técnica Finalizado/Cancelado E comercial Encerrado
--                        (igual a antes)
--        * Paralisado -> técnica "Paralisado" OU detalhe "Paralisado ..."
--                        (temporariamente/permanentemente) OU comercial
--                        "Paralisado"
--        * Ativo      -> o resto
--      OS cancelada não é "encerrada": não entra na contagem de serviços
--      executados.
--   3. OS canceladas não aparecem no Início (nem as pendências, prazos e
--      parcelas delas).
--
-- Como a regra agora olha o "detalhe" (que fica em outra tabela), a
-- situação do contrato deixa de ser uma fórmula fixa da tabela e passa a
-- ser calculada por um gatilho sempre que a OS é criada ou alterada.
--
-- Como usar: copie tudo, cole no SQL Editor do Supabase e clique em Run.
-- Só recalcula a situação do contrato das OS (pela regra nova). No fim
-- mostra as OS com algo "Cancelado" para conferir. Pode ser rodado mais
-- de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SITUAÇÃO COMERCIAL: opção "Cancelado"
-- ---------------------------------------------------------------------
alter table os drop constraint if exists os_sit_comercial_check;
alter table os add constraint os_sit_comercial_check
  check (sit_comercial in ('Em aberto','Paralisado','Encerrado','Cancelado'));

-- ---------------------------------------------------------------------
-- 2. SITUAÇÃO DO CONTRATO
-- ---------------------------------------------------------------------
-- deixa de ser fórmula fixa (os valores atuais ficam) ...
alter table os alter column sit_contrato drop expression if exists;
alter table os drop constraint if exists os_sit_contrato_check;
alter table os add constraint os_sit_contrato_check
  check (sit_contrato in ('Ativo','Paralisado','Encerrado','Cancelado'));

-- ... e passa a ser calculada por esta função
create or replace function calcular_sit_contrato(p_tecnica text, p_detalhe_id bigint, p_comercial text)
returns text language sql stable security definer set search_path = public as $$
  with d as (select lower(coalesce((select descricao from os_situacao_detalhe where id = p_detalhe_id), '')) as det)
  select case
           when p_tecnica = 'Cancelado' and d.det like 'cancelad%' and p_comercial = 'Cancelado' then 'Cancelado'
           when p_tecnica in ('Finalizado','Cancelado') and p_comercial = 'Encerrado' then 'Encerrado'
           when p_tecnica = 'Paralisado' or d.det like 'paralisad%' or p_comercial = 'Paralisado' then 'Paralisado'
           else 'Ativo'
         end
    from d
$$;
revoke all on function calcular_sit_contrato(text, bigint, text) from public, anon;
grant execute on function calcular_sit_contrato(text, bigint, text) to authenticated;


create or replace function os_calcular_contrato() returns trigger
language plpgsql set search_path = public as $$
begin
  new.sit_contrato := calcular_sit_contrato(new.sit_tecnica, new.sit_tecnica_detalhe_id, new.sit_comercial);
  return new;
end $$;
drop trigger if exists os_situacao_contrato on os;
create trigger os_situacao_contrato before insert or update on os
  for each row execute function os_calcular_contrato();

-- Se alguém renomear um detalhe em Cadastros (ex.: para "Paralisado ..."),
-- as OS com esse detalhe são recalculadas.
create or replace function detalhe_recalcular_os() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update os set sit_contrato = calcular_sit_contrato(sit_tecnica, sit_tecnica_detalhe_id, sit_comercial)
   where sit_tecnica_detalhe_id = new.id
     and sit_contrato is distinct from calcular_sit_contrato(sit_tecnica, sit_tecnica_detalhe_id, sit_comercial);
  return null;
end $$;
drop trigger if exists detalhe_recalcular_os on os_situacao_detalhe;
create trigger detalhe_recalcular_os after update of descricao on os_situacao_detalhe
  for each row execute function detalhe_recalcular_os();

-- Cronograma preliminar: não gera para OS encerrada nem cancelada
create or replace function os_cronograma_preliminar() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.categoria_id is not null
     and (tg_op = 'INSERT' or new.categoria_id is distinct from old.categoria_id
          or new.subcategoria_id is distinct from old.subcategoria_id)
     and new.sit_contrato not in ('Encerrado','Cancelado')
     and not exists (select 1 from cronograma where os_id = new.id) then
    perform gerar_cronograma_preliminar(new.id);
  end if;
  return null;
end $$;

-- Equipe: "OS ativas" da pessoa não conta encerradas nem canceladas
create or replace function vinculos_equipe(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not e_gestor() then
    raise exception 'Só a Coordenação/Diretoria pode excluir pessoas da equipe.';
  end if;
  return jsonb_build_object(
    'os',            (select count(*) from os            where responsavel_id = p_id),
    'os_ativas',     (select count(*) from os            where responsavel_id = p_id and sit_contrato not in ('Encerrado','Cancelado')),
    'tarefas',       (select count(*) from tarefa        where responsavel_id = p_id),
    'prazos',        (select count(*) from prazo         where responsavel_id = p_id),
    'cronograma',    (select count(*) from cronograma    where responsavel_id = p_id),
    'andamentos',    (select count(*) from movimentacao  where responsavel_id = p_id),
    'produtos',      (select count(*) from produto_final where responsavel_id = p_id));
end $$;

-- ---------------------------------------------------------------------
-- 3. INÍCIO: OS canceladas não aparecem
--    (mesma visão do script de 23/11, só com o filtro novo no fim)
-- ---------------------------------------------------------------------
drop view if exists v_os_situacao;
create view v_os_situacao with (security_invoker = true) as
with itens as (
  select a.*,
         case when a.origem = 'ART' or a.data < current_date then 'Vencido'
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
       o.sit_contrato,
       count(i.*) filter (where i.estado = 'Vencido')  as qtd_vencidos,
       count(i.*) filter (where i.estado = 'A vencer') as qtd_a_vencer,
       case when o.sit_contrato = 'Paralisado' then 'Paralisado'
            when count(i.*) filter (where i.estado = 'Vencido' and i.origem <> 'Parcela') > 0 then 'Pendência'
            when count(i.*) filter (where i.estado = 'Vencido') > 0 then 'Pendência Comercial'
            when count(i.*) filter (where i.estado = 'A vencer') > 0 then 'Prazos a vencer'
            else 'Em conformidade' end as situacao,
       min(i.data) filter (where i.estado is not null) as data_mais_proxima,
       coalesce(jsonb_agg(jsonb_build_object('origem', i.origem, 'descricao', i.descricao, 'data', i.data, 'estado', i.estado)
                          order by i.data) filter (where i.estado is not null), '[]') as itens
  from os o
  join cliente c on c.id = o.cliente_id
  left join equipe e on e.id = o.responsavel_id
  left join itens i on i.os_id = o.id
 where o.sit_contrato is distinct from 'Cancelado'
   and (o.sit_contrato is distinct from 'Encerrado'
        or exists (select 1 from processo pr where pr.os_id = o.id and pr.natureza = 'ART' and not pr.art_baixada))
 group by o.id, o.numero, o.titulo, o.responsavel_id, c.nome_reduzido, c.nome, e.iniciais, o.sit_contrato;

grant select on v_os_situacao to authenticated;
revoke all on v_os_situacao from anon;

-- ---------------------------------------------------------------------
-- 4. RECALCULA A SITUAÇÃO DO CONTRATO DE TODAS AS OS PELA REGRA NOVA
--    (a mudança fica registrada no histórico da OS)
-- ---------------------------------------------------------------------
update os set sit_contrato = calcular_sit_contrato(sit_tecnica, sit_tecnica_detalhe_id, sit_comercial)
 where sit_contrato is distinct from calcular_sit_contrato(sit_tecnica, sit_tecnica_detalhe_id, sit_comercial);

-- ---------------------------------------------------------------------
-- Para conferir: OS com algo marcado como cancelado.
-- Para ficar "Cancelado", a OS precisa ter os três campos cancelados.
-- ---------------------------------------------------------------------
select o.numero as "OS",
       o.sit_tecnica as "Técnica",
       d.descricao as "Detalhe técnico",
       o.sit_comercial as "Comercial",
       o.sit_contrato as "Contrato (calculado)"
  from os o
  left join os_situacao_detalhe d on d.id = o.sit_tecnica_detalhe_id
 where o.sit_tecnica = 'Cancelado' or o.sit_comercial = 'Cancelado' or lower(coalesce(d.descricao, '')) like 'cancelad%'
 order by o.sit_contrato, o.numero;

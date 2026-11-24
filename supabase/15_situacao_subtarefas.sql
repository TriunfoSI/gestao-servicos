-- =====================================================================
-- Ajuste 24/11/2026: situação "Subtarefas" automática na tarefa de origem
--   - Quando uma tarefa ganha subtarefa em aberto, a situação dela passa
--     sozinha para "Subtarefas": o responsável continua com a tarefa
--     aberta, acompanhando, sabendo que as subtarefas ainda não terminaram.
--   - Quando todas as subtarefas forem concluídas ou canceladas (ou
--     desvinculadas/excluídas), a tarefa passa sozinha para
--     "Subtarefas concluídas" (amarelo) e o responsável a conclui manualmente.
--   - Se uma subtarefa for reaberta (ou criada), a tarefa de origem volta para "Subtarefas".
--   - "Subtarefas" e "Subtarefas concluídas" não podem ser escolhidas à mão, e enquanto houver
--     subtarefas em aberto a tarefa de origem só pode sair dessa situação
--     para "Cancelada" (concluir continua travado, como no script 14).
--   - Tarefas que já têm subtarefas em aberto passam para "Subtarefas".
-- Rodar depois do 14_subtarefas. Pode ser rodado mais de uma vez.
-- =====================================================================

alter table tarefa drop constraint if exists tarefa_situacao_check;
alter table tarefa add constraint tarefa_situacao_check
  check (situacao in ('A fazer','Em andamento','Apoio técnico','Aguardando terceiros','Subtarefas','Subtarefas concluídas','Concluída','Cancelada'));

-- quantas subtarefas em aberto a tarefa tem
create or replace function tarefa_subtarefas_abertas(p_id bigint) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from tarefa where tarefa_pai_id = p_id and situacao not in ('Concluída', 'Cancelada')
$$;

-- Regras do vínculo (substitui a do script 14, acrescentando a situação "Subtarefas")
create or replace function tarefa_regras_subtarefas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  abertas int;
  pai_situacao text;
begin
  -- 1) vínculo sem voltas
  if new.tarefa_pai_id is not null and (tg_op = 'INSERT' or new.tarefa_pai_id is distinct from old.tarefa_pai_id) then
    if new.tarefa_pai_id = new.id then
      raise exception 'Uma tarefa não pode ser a tarefa de origem dela mesma.';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive acima(id, pai) as (
        select id, tarefa_pai_id from tarefa where id = new.tarefa_pai_id
        union
        select t.id, t.tarefa_pai_id from tarefa t join acima a on t.id = a.pai
      ) select 1 from acima where id = new.id) then
      raise exception 'Esta tarefa não pode ficar vinculada a uma das próprias subtarefas.';
    end if;
  end if;

  abertas := case when tg_op = 'UPDATE' then tarefa_subtarefas_abertas(new.id) else 0 end;

  -- 2) tarefa de origem só conclui com as subtarefas fechadas
  if new.situacao = 'Concluída' and tg_op = 'UPDATE' and old.situacao is distinct from 'Concluída' and abertas > 0 then
    raise exception 'Esta tarefa tem % subtarefa(s) em aberto. Ela só pode ser concluída depois que todas as subtarefas forem concluídas ou canceladas.', abertas;
  end if;

  -- 3) "Subtarefas" é automática: só vale com subtarefas em aberto,
  --    e com subtarefas em aberto a tarefa só sai dela para "Cancelada"
  if new.situacao = 'Subtarefas' and (tg_op = 'INSERT' or old.situacao is distinct from 'Subtarefas') and abertas = 0 then
    raise exception 'A situação "Subtarefas" é automática: ela é usada quando a tarefa tem subtarefas em aberto.';
  end if;
  if new.situacao = 'Subtarefas concluídas' and (tg_op = 'INSERT' or old.situacao is distinct from 'Subtarefas concluídas')
     and (abertas > 0 or not exists (select 1 from tarefa where tarefa_pai_id = new.id)) then
    raise exception 'A situação "Subtarefas concluídas" é automática: ela é usada quando todas as subtarefas da tarefa terminaram.';
  end if;
  if tg_op = 'UPDATE' and old.situacao = 'Subtarefas' and new.situacao not in ('Subtarefas', 'Cancelada', 'Concluída') and abertas > 0 then
    raise exception 'Esta tarefa tem % subtarefa(s) em aberto e fica na situação "Subtarefas" até que todas sejam concluídas ou canceladas.', abertas;
  end if;

  -- 4) subtarefa aberta não pode ficar pendurada numa tarefa já concluída
  if new.tarefa_pai_id is not null and new.situacao not in ('Concluída', 'Cancelada')
     and (tg_op = 'INSERT' or new.tarefa_pai_id is distinct from old.tarefa_pai_id
          or old.situacao in ('Concluída', 'Cancelada')) then
    select situacao into pai_situacao from tarefa where id = new.tarefa_pai_id;
    if pai_situacao = 'Concluída' then
      raise exception 'A tarefa de origem já está concluída. Reabra a tarefa de origem antes de criar ou reabrir uma subtarefa dela.';
    end if;
  end if;

  return new;
end $$;

-- Acerta a situação da tarefa de origem conforme as subtarefas
create or replace function tarefa_acertar_origem(p_pai bigint) returns void
language plpgsql security definer set search_path = public as $$
declare abertas int;
begin
  if p_pai is null then return; end if;
  abertas := tarefa_subtarefas_abertas(p_pai);
  if abertas > 0 then
    update tarefa set situacao = 'Subtarefas'
     where id = p_pai and situacao not in ('Subtarefas', 'Concluída', 'Cancelada');
  else
    update tarefa set situacao = 'Subtarefas concluídas'
     where id = p_pai and situacao = 'Subtarefas';
  end if;
end $$;

create or replace function tarefa_depois_subtarefa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform tarefa_acertar_origem(new.tarefa_pai_id);
  end if;
  if tg_op = 'DELETE' then
    perform tarefa_acertar_origem(old.tarefa_pai_id);
  elsif tg_op = 'UPDATE' and old.tarefa_pai_id is distinct from new.tarefa_pai_id then
    perform tarefa_acertar_origem(old.tarefa_pai_id);
  end if;
  return null;
end $$;

drop trigger if exists tarefa_subtarefas_origem on tarefa;
create trigger tarefa_subtarefas_origem after insert or update of situacao, tarefa_pai_id or delete on tarefa
  for each row execute function tarefa_depois_subtarefa();

-- tarefas que já têm subtarefas em aberto
update tarefa t set situacao = 'Subtarefas'
 where t.situacao not in ('Subtarefas', 'Concluída', 'Cancelada')
   and tarefa_subtarefas_abertas(t.id) > 0;

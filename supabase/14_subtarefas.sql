-- =====================================================================
-- Ajuste 24/11/2026: subtarefas (tarefas vinculadas a uma tarefa inicial)
--   - tarefa.tarefa_pai_id: a "Tarefa de origem". Uma tarefa pode ter
--     várias subtarefas, cada uma com seu responsável, prazo e situação.
--   - Trava: a tarefa de origem só pode ser marcada como "Concluída"
--     depois que todas as subtarefas estiverem concluídas ou canceladas.
--     Pelo mesmo motivo, não dá para criar (ou reabrir) uma subtarefa
--     de uma tarefa que já está concluída: reabra a tarefa de origem antes.
--   - Uma tarefa não pode ser vinculada a ela mesma nem a uma das
--     próprias subtarefas (evita voltas no vínculo).
--   - Se a tarefa de origem for excluída, as subtarefas continuam,
--     apenas sem o vínculo.
--   - v_tarefa ganha: tarefa_pai_descricao, subtarefas_total
--     (sem contar canceladas), subtarefas_concluidas e os_responsavel_id
--     (o responsável pela OS também pode criar tarefas vinculadas).
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table tarefa add column if not exists tarefa_pai_id bigint references tarefa(id) on delete set null;
create index if not exists tarefa_tarefa_pai_id_idx on tarefa(tarefa_pai_id);

-- Regras do vínculo. "security definer" para enxergar todas as subtarefas,
-- mesmo as de outros responsáveis que o usuário não vê na tela.
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

  -- 2) tarefa de origem só conclui com as subtarefas fechadas
  if new.situacao = 'Concluída' and tg_op = 'UPDATE' and old.situacao is distinct from 'Concluída' then
    select count(*) into abertas from tarefa
     where tarefa_pai_id = new.id and situacao not in ('Concluída', 'Cancelada');
    if abertas > 0 then
      raise exception 'Esta tarefa tem % subtarefa(s) em aberto. Ela só pode ser concluída depois que todas as subtarefas forem concluídas ou canceladas.', abertas;
    end if;
  end if;

  -- 3) subtarefa aberta não pode ficar pendurada numa tarefa já concluída
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

drop trigger if exists tarefa_subtarefas on tarefa;
create trigger tarefa_subtarefas before insert or update on tarefa
  for each row execute function tarefa_regras_subtarefas();

-- a visão precisa ser recriada para incluir as colunas novas
drop view if exists v_tarefa;
create view v_tarefa with (security_invoker = true) as
select t.*,
       o.numero as os_numero,
       o.titulo as os_titulo,
       o.responsavel_id as os_responsavel_id,
       coalesce(c.nome_reduzido, c.nome) as cliente_curto,
       e.nome as responsavel_nome,
       e.iniciais as responsavel_iniciais,
       coalesce((select max(em) from tarefa_atualizacao a where a.tarefa_id = t.id), t.atualizado_em) as ultima_atualizacao,
       case t.prioridade when 'Alta' then 1 when 'Média' then 2 else 3 end as prioridade_ordem,
       tarefa_situacao_prazo(t.situacao, t.prazo, t.data_atendimento) as situacao_prazo,
       p.descricao as tarefa_pai_descricao,
       (select count(*) from tarefa s where s.tarefa_pai_id = t.id and s.situacao <> 'Cancelada')::int as subtarefas_total,
       (select count(*) from tarefa s where s.tarefa_pai_id = t.id and s.situacao = 'Concluída')::int as subtarefas_concluidas
  from tarefa t
  left join tarefa p on p.id = t.tarefa_pai_id
  left join os o on o.id = t.os_id
  left join cliente c on c.id = o.cliente_id
  left join equipe e on e.id = t.responsavel_id;

grant select on v_tarefa to authenticated;
revoke all on v_tarefa from anon;

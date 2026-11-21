-- =====================================================================
-- Ajuste 21/11/2026: data de atendimento das tarefas
--   - tarefa.data_atendimento: preenchida sozinha quando a tarefa passa
--     para "Concluída" (e apagada se voltar para outra situação).
--     A coordenação pode corrigir a data no formulário da tarefa.
--   - Tarefas já concluídas recebem a data em que foram marcadas como
--     concluídas (pelo histórico) ou, sem histórico, a data da última alteração.
--   - Situação em relação ao prazo (mesma lógica dos prazos), na coluna
--     situacao_prazo da visão v_tarefa:
--       Concluída               -> concluída até o prazo (ou sem prazo)
--       Concluída fora do prazo -> concluída depois do prazo
--       Vencida                 -> ainda aberta e o prazo já passou
--   - Usada no Início: tarefas concluídas continuam aparecendo por 15 dias.
-- Pode ser rodado mais de uma vez.
-- =====================================================================

alter table tarefa add column if not exists data_atendimento date;

create or replace function tarefa_data_atendimento() returns trigger
language plpgsql as $$
begin
  if new.situacao = 'Concluída' then
    if new.data_atendimento is null then new.data_atendimento := current_date; end if;
  else
    new.data_atendimento := null;
  end if;
  return new;
end $$;

drop trigger if exists tarefa_data_atendimento on tarefa;
create trigger tarefa_data_atendimento before insert or update on tarefa
  for each row execute function tarefa_data_atendimento();

-- tarefas que já estavam concluídas
update tarefa t
   set data_atendimento = coalesce(
         (select max(a.em)::date from tarefa_atualizacao a where a.tarefa_id = t.id and a.situacao = 'Concluída'),
         t.atualizado_em::date)
 where t.situacao = 'Concluída' and t.data_atendimento is null;

create or replace function tarefa_situacao_prazo(p_situacao text, p_prazo date, p_atendimento date) returns text
language sql stable as $$
  select case
    when p_situacao = 'Cancelada' then null
    when p_situacao = 'Concluída' and p_prazo is not null and coalesce(p_atendimento, current_date) > p_prazo then 'Concluída fora do prazo'
    when p_situacao = 'Concluída' then 'Concluída'
    when p_prazo is not null and p_prazo < current_date then 'Vencida'
  end
$$;

-- a visão precisa ser recriada para incluir as colunas novas
drop view if exists v_tarefa;
create view v_tarefa with (security_invoker = true) as
select t.*,
       o.numero as os_numero,
       o.titulo as os_titulo,
       coalesce(c.nome_reduzido, c.nome) as cliente_curto,
       e.nome as responsavel_nome,
       e.iniciais as responsavel_iniciais,
       coalesce((select max(em) from tarefa_atualizacao a where a.tarefa_id = t.id), t.atualizado_em) as ultima_atualizacao,
       case t.prioridade when 'Alta' then 1 when 'Média' then 2 else 3 end as prioridade_ordem,
       tarefa_situacao_prazo(t.situacao, t.prazo, t.data_atendimento) as situacao_prazo
  from tarefa t
  left join os o on o.id = t.os_id
  left join cliente c on c.id = o.cliente_id
  left join equipe e on e.id = t.responsavel_id;

grant select on v_tarefa to authenticated;
revoke all on v_tarefa from anon;

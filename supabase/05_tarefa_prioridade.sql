-- =====================================================================
-- Ajuste 17/11/2026: prioridade nas tarefas
-- =====================================================================
alter table tarefa add column if not exists prioridade text not null default 'Média'
  check (prioridade in ('Alta','Média','Baixa'));

drop view if exists v_tarefa;
create view v_tarefa with (security_invoker = true) as
select t.*,
       o.numero as os_numero,
       o.titulo as os_titulo,
       coalesce(c.nome_reduzido, c.nome) as cliente_curto,
       e.nome as responsavel_nome,
       e.iniciais as responsavel_iniciais,
       coalesce((select max(em) from tarefa_atualizacao a where a.tarefa_id = t.id), t.atualizado_em) as ultima_atualizacao,
       case t.prioridade when 'Alta' then 1 when 'Média' then 2 else 3 end as prioridade_ordem
  from tarefa t
  left join os o on o.id = t.os_id
  left join cliente c on c.id = o.cliente_id
  left join equipe e on e.id = t.responsavel_id;

grant select on v_tarefa to authenticated;
revoke all on v_tarefa from anon;

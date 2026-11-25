-- =====================================================================
-- Ajuste 25/11/2026: retorno do Apoio Técnico para quem pediu
--   Tudo na própria tabela de tarefas (sem tabela nova), com colunas novas:
--   - solicitante_id: quem pediu o apoio técnico. Preenchido sozinho com
--     quem cria a tarefa em "Apoio técnico" (a coordenação pode trocar,
--     por exemplo quando registra o pedido de outra pessoa na reunião).
--   - resposta / respondido_em / respondido_por: a "Resposta/Decisão".
--   - Nova situação "Respondida" (automática): quando o responsável envia a
--     resposta, o pedido não é concluído; ele volta para o solicitante, que
--     vê "Retorno recebido" no Início. Só o solicitante (ou a coordenação)
--     conclui, depois de ler. Ele também pode pedir mais esclarecimento
--     (volta para "Apoio técnico") ou criar tarefas vinculadas a partir dali.
--   - Pedido em "Apoio técnico" só pode ser concluído depois de respondido.
--   - Qualquer pessoa da equipe pode pedir apoio técnico (sobre uma OS que
--     ela vê, ou geral). O solicitante vê e acompanha o pedido.
--   - Respondida conta como atendida no prazo (data de atendimento = dia da
--     resposta) e não deixa a OS com pendência.
--   - Pedidos já abertos em "Apoio técnico" recebem como solicitante quem
--     criou a tarefa, quando o sistema souber.
-- Rodar depois do 15_situacao_subtarefas. Pode ser rodado mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas novas e a situação "Respondida"
-- ---------------------------------------------------------------------
alter table tarefa add column if not exists solicitante_id bigint references equipe(id) on delete set null;
alter table tarefa add column if not exists resposta text;
alter table tarefa add column if not exists respondido_em timestamptz;
alter table tarefa add column if not exists respondido_por bigint references equipe(id) on delete set null;
create index if not exists tarefa_solicitante_id_idx on tarefa(solicitante_id);

alter table tarefa drop constraint if exists tarefa_situacao_check;
alter table tarefa add constraint tarefa_situacao_check
  check (situacao in ('A fazer','Em andamento','Apoio técnico','Respondida','Aguardando terceiros','Subtarefas','Subtarefas concluídas','Concluída','Cancelada'));

-- ---------------------------------------------------------------------
-- 2. Regras do apoio técnico (roda antes das outras regras da tarefa)
-- ---------------------------------------------------------------------
create or replace function tarefa_apoio_tecnico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu bigint := meu_equipe_id();
  sistema boolean := auth.uid() is null;   -- SQL Editor / scripts
  nome_solic text;
begin
  -- quem pede o apoio técnico fica registrado como solicitante
  if new.situacao = 'Apoio técnico' and new.solicitante_id is null then
    new.solicitante_id := eu;
  end if;

  -- solicitante pediu mais esclarecimento: volta para "Apoio técnico"
  -- (a resposta anterior fica no histórico)
  if tg_op = 'UPDATE' and old.situacao = 'Respondida' and new.situacao = 'Apoio técnico'
     and new.resposta is not distinct from old.resposta then
    new.resposta := null;
    new.respondido_em := null;
    new.respondido_por := null;
  end if;

  -- resposta enviada (ou alterada)
  if nullif(btrim(new.resposta), '') is not null
     and (tg_op = 'INSERT' or new.resposta is distinct from old.resposta) then
    if not sistema and not e_gestor() and new.responsavel_id is distinct from eu then
      raise exception 'Só o responsável pelo apoio técnico (ou a coordenação) pode registrar a resposta.';
    end if;
    new.resposta := btrim(new.resposta);
    new.respondido_em := now();
    new.respondido_por := coalesce(eu, new.respondido_por);
    if new.situacao = 'Apoio técnico' then new.situacao := 'Respondida'; end if;
    if tg_op = 'UPDATE' then
      insert into tarefa_atualizacao(tarefa_id, situacao, comentario)
      values (new.id, 'Respondida', 'Resposta/Decisão: ' || new.resposta);
    end if;
  elsif nullif(btrim(new.resposta), '') is null then
    new.resposta := null;
    new.respondido_em := null;
    new.respondido_por := null;
  end if;

  -- "Respondida" é automática: só existe com resposta
  if new.situacao = 'Respondida' and new.resposta is null then
    raise exception 'A situação "Respondida" é automática: ela é usada quando o apoio técnico recebe a resposta.';
  end if;

  -- conclusão do pedido: só depois de respondido, e por quem pediu
  if new.situacao = 'Concluída' and new.solicitante_id is not null and not sistema
     and (tg_op = 'INSERT' or old.situacao is distinct from 'Concluída')
     and new.solicitante_id is distinct from eu then
    select nome into nome_solic from equipe where id = new.solicitante_id;
    if new.resposta is null then
      raise exception 'Este é um pedido de apoio técnico de %. Registre a Resposta/Decisão: o pedido volta para quem pediu, que o conclui depois de ler.', coalesce(nome_solic, 'outra pessoa');
    elsif not e_gestor() then
      raise exception 'Este pedido de apoio técnico é concluído por quem pediu (%), depois de ler a resposta.', coalesce(nome_solic, 'outra pessoa');
    end if;
  end if;

  return new;
end $$;

drop trigger if exists tarefa_apoio_tecnico on tarefa;
-- o nome faz este gatilho rodar antes dos outros "before" da tarefa
create trigger tarefa_apoio_tecnico before insert or update on tarefa
  for each row execute function tarefa_apoio_tecnico();

-- data de atendimento: também na resposta do apoio técnico
create or replace function tarefa_data_atendimento() returns trigger
language plpgsql as $$
begin
  if new.situacao = 'Concluída' then
    if new.data_atendimento is null then new.data_atendimento := current_date; end if;
  elsif new.situacao = 'Respondida' then
    new.data_atendimento := coalesce(new.respondido_em::date, new.data_atendimento, current_date);
  else
    new.data_atendimento := null;
  end if;
  return new;
end $$;

create or replace function tarefa_situacao_prazo(p_situacao text, p_prazo date, p_atendimento date) returns text
language sql stable as $$
  select case
    when p_situacao = 'Cancelada' then null
    when p_situacao = 'Concluída' and p_prazo is not null and coalesce(p_atendimento, current_date) > p_prazo then 'Concluída fora do prazo'
    when p_situacao = 'Concluída' then 'Concluída'
    when p_situacao = 'Respondida' and p_prazo is not null and coalesce(p_atendimento, current_date) > p_prazo then 'Respondida fora do prazo'
    when p_situacao = 'Respondida' then null
    when p_prazo is not null and p_prazo < current_date then 'Vencida'
  end
$$;

-- ---------------------------------------------------------------------
-- 3. Permissões: o solicitante vê e atualiza o pedido; qualquer pessoa
--    da equipe pode pedir apoio técnico; o solicitante de um pedido pode
--    criar tarefas vinculadas a ele (desdobramentos da decisão) e acompanhá-las
-- ---------------------------------------------------------------------
create or replace function e_solicitante_da_tarefa(p_tarefa bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tarefa where id = p_tarefa and solicitante_id = meu_equipe_id())
$$;
revoke all on function e_solicitante_da_tarefa(bigint) from public, anon;
grant execute on function e_solicitante_da_tarefa(bigint) to authenticated;

drop policy if exists ler on tarefa;
create policy ler on tarefa for select to authenticated
  using (e_gestor() or responsavel_id = meu_equipe_id() or solicitante_id = meu_equipe_id()
         or (os_id is not null and pode_ver_os(os_id))
         or (tarefa_pai_id is not null and e_solicitante_da_tarefa(tarefa_pai_id)));

drop policy if exists alterar on tarefa;
create policy alterar on tarefa for update to authenticated
  using (e_gestor() or responsavel_id = meu_equipe_id() or solicitante_id = meu_equipe_id()
         or (os_id is not null and pode_editar_os(os_id)));

drop policy if exists criar on tarefa;
create policy criar on tarefa for insert to authenticated
  with check (
    e_gestor()
    or (os_id is not null and pode_editar_os(os_id))
    -- pedido de apoio técnico, feito em nome próprio
    or (tem_acesso() and situacao = 'Apoio técnico' and solicitante_id = meu_equipe_id()
        and (os_id is null or pode_ver_os(os_id)))
    -- desdobramento de um pedido que a pessoa fez
    or (tarefa_pai_id is not null and e_solicitante_da_tarefa(tarefa_pai_id)
        and (os_id is null or pode_ver_os(os_id))));

-- ---------------------------------------------------------------------
-- 4. Visão das tarefas com o solicitante e quem respondeu
-- ---------------------------------------------------------------------
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
       (select count(*) from tarefa s where s.tarefa_pai_id = t.id and s.situacao = 'Concluída')::int as subtarefas_concluidas,
       so.nome as solicitante_nome,
       so.iniciais as solicitante_iniciais,
       rp.nome as respondido_por_nome
  from tarefa t
  left join tarefa p on p.id = t.tarefa_pai_id
  left join os o on o.id = t.os_id
  left join cliente c on c.id = o.cliente_id
  left join equipe e on e.id = t.responsavel_id
  left join equipe so on so.id = t.solicitante_id
  left join equipe rp on rp.id = t.respondido_por;

grant select on v_tarefa to authenticated;
revoke all on v_tarefa from anon;

-- ---------------------------------------------------------------------
-- 5. Situação da OS: tarefa "Respondida" já foi atendida (não é pendência)
--    (mesma visão do script 12, só muda a linha das tarefas)
-- ---------------------------------------------------------------------
create or replace view v_os_alerta with (security_invoker = true) as
select p.os_id, 'Prazo'::text as origem, p.descricao, p.data_termino as data
  from prazo p
 where not p.atendido and p.data_termino is not null
union all
select g.os_id, 'Cronograma',
       g.descricao || case when g.responsavel_parte = 'Cliente' then ' (ação do cliente)' else '' end,
       g.data_termino
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
 where t.os_id is not null and t.prazo is not null and t.situacao not in ('Concluída','Respondida','Cancelada')
union all
select pa.os_id, 'Parcela',
       concat_ws(' ', 'Parcela', pa.numero::text || coalesce('/' || pa.total_parcelas::text, ''), nullif(pa.referencia, '')),
       pa.data_prevista
  from parcela pa
 where pa.situacao not in ('Pago','Cancelada') and pa.data_prevista < current_date
union all
-- ART não baixada depois que o serviço terminou (técnico e comercial).
-- A data mostrada é a do encerramento do contrato (ou hoje, se não houver registro).
select pr.os_id, 'ART',
       concat_ws(' ', 'ART', nullif(pr.referencia, ''), 'ainda não baixada'),
       coalesce((select max(hi.em)::date from os_historico hi
                  where hi.os_id = o.id and hi.campo = 'Situação do contrato' and hi.para = 'Encerrado'), current_date)
  from processo pr
  join os o on o.id = pr.os_id
 where pr.natureza = 'ART' and not pr.art_baixada and o.sit_contrato = 'Encerrado';


-- ---------------------------------------------------------------------
-- 6. Pedidos já abertos em "Apoio técnico": solicitante = quem criou
-- ---------------------------------------------------------------------
update tarefa t set solicitante_id = e.id
  from equipe e
 where e.user_id = t.criado_por and t.solicitante_id is null and t.situacao = 'Apoio técnico';

-- conferência: pedidos de apoio técnico em aberto e quem pediu
select t.id, left(t.descricao, 60) as pedido, so.nome as solicitante, r.nome as responsavel
  from tarefa t
  left join equipe so on so.id = t.solicitante_id
  left join equipe r on r.id = t.responsavel_id
 where t.situacao = 'Apoio técnico'
 order by t.id;

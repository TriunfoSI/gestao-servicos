-- =====================================================================
-- Ajuste 23/11/2026 (pedido da Loretha)
--   1. Processos/Documentos: novo tipo "ART" e a marcação "ART baixada"
--   2. Situação da OS no Início:
--        * contrato paralisado  -> situação "Paralisado" (vai para o fim da lista)
--        * serviço terminado (técnico e comercial) com ART ainda não
--          baixada -> "Pendência" (a OS continua aparecendo até a baixa)
--        * "Pendência" = algo técnico vencido (prazo, cronograma, verificação,
--          tarefa, ART); "Pendência Comercial" = só parcela de pagamento
--          vencida (ex.: técnico finalizado e comercial em aberto)
--   3. Equipe: exclusão de pessoas só pela Coordenação/Diretoria, sempre
--      pela função excluir_membro_equipe, que antes passa as OS, tarefas,
--      prazos etc. para outra pessoa (ou deixa "sem responsável")
--
-- Como usar: copie tudo, cole no SQL Editor do Supabase e clique em Run.
-- Nenhum dado é alterado. Pode ser rodado mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROCESSOS / DOCUMENTOS: tipo ART e "ART baixada"
-- ---------------------------------------------------------------------
alter table processo drop constraint if exists processo_natureza_check;
alter table processo add constraint processo_natureza_check check (natureza in ('Processo','Documento','ART'));
alter table processo add column if not exists art_baixada boolean not null default false;
comment on column processo.art_baixada is 'Só para natureza = ART. Enquanto não baixada, a OS terminada (técnica e comercial) fica com pendência.';

-- ---------------------------------------------------------------------
-- 2. SITUAÇÃO AUTOMÁTICA DA OS
--    Mesmas regras de antes (script de 21/11), mais:
--    * ART não baixada em OS com contrato "Encerrado" = item vencido
--    * contrato "Paralisado" = situação "Paralisado"
--    * só parcela vencida (nada técnico vencido) = "Pendência Comercial"
-- ---------------------------------------------------------------------
drop view if exists v_os_situacao;
drop view if exists v_os_alerta;
create view v_os_alerta with (security_invoker = true) as
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
 where t.os_id is not null and t.prazo is not null and t.situacao not in ('Concluída','Cancelada')
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

-- Uma linha por OS não encerrada (ou encerrada com ART pendente)
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
 where o.sit_contrato is distinct from 'Encerrado'
    or exists (select 1 from processo pr where pr.os_id = o.id and pr.natureza = 'ART' and not pr.art_baixada)
 group by o.id, o.numero, o.titulo, o.responsavel_id, c.nome_reduzido, c.nome, e.iniciais, o.sit_contrato;

grant select on v_os_alerta, v_os_situacao to authenticated;
revoke all on v_os_alerta, v_os_situacao from anon;

-- ---------------------------------------------------------------------
-- 3. EXCLUIR PESSOA DA EQUIPE (só Coordenação/Diretoria)
-- ---------------------------------------------------------------------
-- O que está ligado à pessoa (para a tela perguntar para quem passar)
create or replace function vinculos_equipe(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not e_gestor() then
    raise exception 'Só a Coordenação/Diretoria pode excluir pessoas da equipe.';
  end if;
  return jsonb_build_object(
    'os',            (select count(*) from os            where responsavel_id = p_id),
    'os_ativas',     (select count(*) from os            where responsavel_id = p_id and sit_contrato is distinct from 'Encerrado'),
    'tarefas',       (select count(*) from tarefa        where responsavel_id = p_id),
    'prazos',        (select count(*) from prazo         where responsavel_id = p_id),
    'cronograma',    (select count(*) from cronograma    where responsavel_id = p_id),
    'andamentos',    (select count(*) from movimentacao  where responsavel_id = p_id),
    'produtos',      (select count(*) from produto_final where responsavel_id = p_id));
end $$;

-- Exclui a pessoa. Se p_para for informado, passa antes para essa pessoa
-- tudo de que ela era responsável (OS, tarefas, prazos, cronograma,
-- andamentos e produtos técnicos). Sem p_para, esses registros ficam
-- "sem responsável" (nada além do cadastro é apagado).
-- O login também é apagado, a não ser que a pessoa tenha enviado arquivos
-- (nesse caso o login fica, mas sem acesso, porque o cadastro sai).
create or replace function excluir_membro_equipe(p_id bigint, p_para bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_nome text; r jsonb;
begin
  if not e_gestor() then
    raise exception 'Só a Coordenação/Diretoria pode excluir pessoas da equipe.';
  end if;
  select user_id, nome into v_user, v_nome from equipe where id = p_id;
  if v_nome is null then
    raise exception 'Pessoa não encontrada na equipe.';
  end if;
  if p_id = meu_equipe_id() then
    raise exception 'Você não pode excluir o seu próprio cadastro.';
  end if;
  if p_para is not null and (p_para = p_id or not exists (select 1 from equipe where id = p_para)) then
    raise exception 'Escolha outra pessoa da equipe para receber as responsabilidades.';
  end if;

  r := vinculos_equipe(p_id);
  if p_para is not null then
    update os            set responsavel_id = p_para where responsavel_id = p_id;
    update tarefa        set responsavel_id = p_para where responsavel_id = p_id;
    update prazo         set responsavel_id = p_para where responsavel_id = p_id;
    update cronograma    set responsavel_id = p_para where responsavel_id = p_id;
    update movimentacao  set responsavel_id = p_para where responsavel_id = p_id;
    update produto_final set responsavel_id = p_para where responsavel_id = p_id;
  end if;

  delete from equipe where id = p_id;     -- o que sobrar fica "sem responsável"

  if v_user is not null
     and not exists (select 1 from equipe where user_id = v_user)
     and not exists (select 1 from storage.objects s where s.owner = v_user) then
    delete from auth.users where id = v_user;
  end if;

  return r || jsonb_build_object('nome', v_nome, 'transferido_para', p_para);
end $$;

revoke all on function vinculos_equipe(bigint) from public, anon;
revoke all on function excluir_membro_equipe(bigint, bigint) from public, anon;
grant execute on function vinculos_equipe(bigint) to authenticated;
grant execute on function excluir_membro_equipe(bigint, bigint) to authenticated;

-- No banco: ninguém apaga direto da tabela equipe pelo site; só pela função
-- acima (que confere se é Coordenação/Diretoria). Incluir e alterar
-- continuam só para a Coordenação/Diretoria (regra "gerir" já existente).
revoke delete on equipe from anon, authenticated;
drop policy if exists excluir_so_coordenacao on equipe;
create policy excluir_so_coordenacao on equipe as restrictive for delete to authenticated using (e_gestor());

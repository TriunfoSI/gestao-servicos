-- =====================================================================
-- Regras automáticas (gatilhos) e permissões por perfil (RLS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quem é o usuário logado
-- ---------------------------------------------------------------------
create or replace function meu_equipe_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id from equipe where user_id = auth.uid() and ativo
$$;

create or replace function meu_perfil() returns text
language sql stable security definer set search_path = public as $$
  select perfil from equipe where user_id = auth.uid() and ativo
$$;

create or replace function e_gestor() returns boolean
language sql stable as $$ select coalesce(meu_perfil() = 'coordenacao', false) $$;

create or replace function e_financeiro() returns boolean
language sql stable as $$ select coalesce(meu_perfil() in ('financeiro','coordenacao'), false) $$;

create or replace function tem_acesso() returns boolean
language sql stable as $$ select meu_perfil() is not null $$;

-- Pode VER a OS: coordenação e financeiro veem todas; técnico vê as OS em que é
-- responsável ou em que tem prazo/tarefa atribuída.
create or replace function pode_ver_os(p_os bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when meu_perfil() in ('coordenacao','financeiro') then true
    when meu_perfil() = 'tecnico' then
      exists (select 1 from os where id = p_os and responsavel_id = meu_equipe_id())
      or exists (select 1 from prazo  where os_id = p_os and responsavel_id = meu_equipe_id())
      or exists (select 1 from tarefa where os_id = p_os and responsavel_id = meu_equipe_id())
    else false end
$$;

-- Pode EDITAR a parte técnica da OS: coordenação ou o técnico responsável.
create or replace function pode_editar_os(p_os bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select e_gestor()
      or exists (select 1 from os where id = p_os and responsavel_id = meu_equipe_id())
$$;

-- ---------------------------------------------------------------------
-- Liga o login (auth.users) ao cadastro da equipe pelo e-mail
-- ---------------------------------------------------------------------
create or replace function ligar_usuario_equipe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update equipe set user_id = new.id
   where lower(email) = lower(new.email) and (user_id is null or user_id <> new.id);
  return new;
end $$;

create trigger ao_criar_usuario after insert or update of email on auth.users
  for each row execute function ligar_usuario_equipe();

create or replace function ligar_equipe_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email or tg_op = 'INSERT' then
    new.user_id := (select id from auth.users where lower(email) = lower(new.email) limit 1);
  end if;
  return new;
end $$;

create trigger ao_mudar_email_equipe before insert or update of email on equipe
  for each row execute function ligar_equipe_usuario();

-- ---------------------------------------------------------------------
-- OS: quem pode mudar o quê + histórico de situação
-- ---------------------------------------------------------------------
create or replace function os_antes_de_alterar() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text := meu_perfil();
begin
  if auth.uid() is not null and p is distinct from 'coordenacao' then
    if p = 'tecnico' and (new.sit_comercial is distinct from old.sit_comercial
                          or new.responsavel_id is distinct from old.responsavel_id
                          or new.cliente_id is distinct from old.cliente_id) then
      raise exception 'Somente coordenação/diretoria ou financeiro podem alterar a situação comercial, o cliente ou o responsável da OS.';
    end if;
    if p = 'financeiro' and (new.sit_tecnica is distinct from old.sit_tecnica
                             or new.sit_tecnica_detalhe_id is distinct from old.sit_tecnica_detalhe_id
                             or new.responsavel_id is distinct from old.responsavel_id) then
      raise exception 'O financeiro não pode alterar a situação técnica nem o responsável da OS.';
    end if;
  end if;
  new.atualizado_em := now();
  if new.sit_tecnica is distinct from old.sit_tecnica
     or new.sit_comercial is distinct from old.sit_comercial
     or new.sit_tecnica_detalhe_id is distinct from old.sit_tecnica_detalhe_id then
    new.situacao_atualizada_em := current_date;
  end if;
  return new;
end $$;

create trigger os_regras before update on os
  for each row execute function os_antes_de_alterar();

create or replace function os_registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sit_tecnica is distinct from old.sit_tecnica then
    insert into os_historico(os_id, campo, de, para) values (new.id, 'Situação técnica', old.sit_tecnica, new.sit_tecnica);
  end if;
  if new.sit_tecnica_detalhe_id is distinct from old.sit_tecnica_detalhe_id then
    insert into os_historico(os_id, campo, de, para) values (new.id, 'Detalhe da situação técnica',
      (select descricao from os_situacao_detalhe where id = old.sit_tecnica_detalhe_id),
      (select descricao from os_situacao_detalhe where id = new.sit_tecnica_detalhe_id));
  end if;
  if new.sit_comercial is distinct from old.sit_comercial then
    insert into os_historico(os_id, campo, de, para) values (new.id, 'Situação comercial', old.sit_comercial, new.sit_comercial);
  end if;
  if new.sit_contrato is distinct from old.sit_contrato then
    insert into os_historico(os_id, campo, de, para) values (new.id, 'Situação do contrato', old.sit_contrato, new.sit_contrato);
  end if;
  return new;
end $$;

create trigger os_historico_situacao after update on os
  for each row execute function os_registrar_historico();

-- Tarefa: guarda cada mudança de situação feita pelo técnico
create or replace function tarefa_registrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.situacao is distinct from old.situacao then
    insert into tarefa_atualizacao(tarefa_id, situacao, comentario)
    values (new.id, new.situacao, 'Situação alterada de "' || old.situacao || '" para "' || new.situacao || '"');
  end if;
  return new;
end $$;

create trigger tarefa_situacao before update on tarefa
  for each row execute function tarefa_registrar();

-- O técnico só pode mudar situação/observação das próprias tarefas
create or replace function tarefa_antes_de_alterar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not e_gestor() and not pode_editar_os(old.os_id) then
    if new.descricao is distinct from old.descricao or new.responsavel_id is distinct from old.responsavel_id
       or new.os_id is distinct from old.os_id or new.prazo is distinct from old.prazo then
      raise exception 'Você só pode atualizar a situação e a observação desta tarefa.';
    end if;
  end if;
  return new;
end $$;

create trigger tarefa_regras before update on tarefa
  for each row execute function tarefa_antes_de_alterar();

-- ---------------------------------------------------------------------
-- RLS: liga a proteção em todas as tabelas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['equipe','servico','os_situacao_detalhe','periodo','mov_tipo','mov_detalhe','mov_situacao',
    'cliente','contato','os','os_historico','os_escopo','prazo','movimentacao','tarefa','tarefa_atualizacao',
    'parcela','ajuste_comercial','custo','processo','processo_acesso','produto_final','link_cliente']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Listas de apoio e equipe: todos com acesso leem; coordenação altera
do $$
declare t text;
begin
  foreach t in array array['equipe','servico','os_situacao_detalhe','periodo','mov_tipo','mov_detalhe','mov_situacao']
  loop
    execute format('create policy ler on %I for select to authenticated using (tem_acesso())', t);
    execute format('create policy gerir on %I for all to authenticated using (e_gestor()) with check (e_gestor())', t);
  end loop;
end $$;
-- cada pessoa consegue ver o próprio cadastro (para o sistema saber o perfil)
create policy ler_proprio on equipe for select to authenticated using (user_id = auth.uid());

-- Clientes e contatos: todos leem; coordenação e financeiro cadastram
create policy ler on cliente for select to authenticated using (tem_acesso());
create policy gerir on cliente for all to authenticated using (e_financeiro()) with check (e_financeiro());
create policy ler on contato for select to authenticated using (tem_acesso());
create policy gerir on contato for all to authenticated using (e_financeiro()) with check (e_financeiro());

-- OS
create policy ler on os for select to authenticated using (pode_ver_os(id));
create policy criar on os for insert to authenticated with check (e_gestor());
create policy alterar on os for update to authenticated
  using (e_gestor() or meu_perfil() = 'financeiro' or responsavel_id = meu_equipe_id());
create policy excluir on os for delete to authenticated using (e_gestor());

create policy ler on os_historico for select to authenticated using (pode_ver_os(os_id));

-- Partes técnicas da OS: quem vê a OS lê; coordenação ou técnico responsável editam
do $$
declare t text;
begin
  foreach t in array array['os_escopo','prazo','movimentacao','processo','produto_final']
  loop
    execute format('create policy ler on %I for select to authenticated using (pode_ver_os(os_id) or (os_id is null and e_gestor()))', t);
    execute format('create policy gerir on %I for all to authenticated using (pode_editar_os(os_id)) with check (pode_editar_os(os_id))', t);
  end loop;
end $$;
-- movimentação sem OS: só coordenação
create policy gerir_sem_os on movimentacao for all to authenticated using (os_id is null and e_gestor()) with check (os_id is null and e_gestor());
-- técnico pode atualizar prazos atribuídos a ele
create policy atualizar_meu_prazo on prazo for update to authenticated using (responsavel_id = meu_equipe_id());

create policy ler on processo_acesso for select to authenticated
  using (exists (select 1 from processo p where p.id = processo_id and pode_ver_os(p.os_id)));
create policy gerir on processo_acesso for all to authenticated
  using (exists (select 1 from processo p where p.id = processo_id and pode_editar_os(p.os_id)))
  with check (exists (select 1 from processo p where p.id = processo_id and pode_editar_os(p.os_id)));

-- Tarefas
create policy ler on tarefa for select to authenticated
  using (e_gestor() or responsavel_id = meu_equipe_id() or (os_id is not null and pode_ver_os(os_id)));
create policy criar on tarefa for insert to authenticated
  with check (e_gestor() or (os_id is not null and pode_editar_os(os_id)));
create policy alterar on tarefa for update to authenticated
  using (e_gestor() or responsavel_id = meu_equipe_id() or (os_id is not null and pode_editar_os(os_id)));
create policy excluir on tarefa for delete to authenticated using (e_gestor());

create policy ler on tarefa_atualizacao for select to authenticated
  using (exists (select 1 from tarefa t where t.id = tarefa_id));   -- herda a regra de tarefa
create policy criar on tarefa_atualizacao for insert to authenticated
  with check (exists (select 1 from tarefa t where t.id = tarefa_id));

-- Financeiro: só coordenação e financeiro
do $$
declare t text;
begin
  foreach t in array array['parcela','ajuste_comercial','custo']
  loop
    execute format('create policy financeiro on %I for all to authenticated using (e_financeiro()) with check (e_financeiro())', t);
  end loop;
end $$;

-- Link do cliente: coordenação e técnico responsável
create policy gerir on link_cliente for all to authenticated
  using (pode_editar_os(os_id)) with check (pode_editar_os(os_id));

-- ---------------------------------------------------------------------
-- Acesso às tabelas (as regras acima filtram as linhas)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;

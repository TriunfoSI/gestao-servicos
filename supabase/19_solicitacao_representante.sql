-- =====================================================================
-- Ajuste 27/11/2026: formulário de solicitação de proposta ganha a seção
-- "Dados do representante" (nome, cargo, celular e e-mail). Se o cliente
-- marcar que o representante é o próprio contratante, esses campos ficam
-- vazios e representante_mesmo = true.
-- Rodar depois do 18_solicitacao_proposta. Pode ser rodado mais de uma vez.
-- =====================================================================

alter table solicitacao_proposta add column if not exists representante_mesmo   boolean not null default false;
alter table solicitacao_proposta add column if not exists representante_nome    text;
alter table solicitacao_proposta add column if not exists representante_cargo   text;
alter table solicitacao_proposta add column if not exists representante_celular text;
alter table solicitacao_proposta add column if not exists representante_email   text;

create or replace function enviar_solicitacao_proposta(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_txt text;
  r solicitacao_proposta;
  f text;
  v_mesmo boolean;
begin
  -- campo-isca: pessoas não veem; robôs costumam preencher
  if coalesce(p->>'site', '') <> '' then
    return jsonb_build_object('erro', 'Não foi possível enviar.');
  end if;

  if (select count(*) from solicitacao_proposta where criado_em > now() - interval '10 minutes') >= 20 then
    return jsonb_build_object('erro', 'Recebemos muitas solicitações agora. Tente novamente em alguns minutos.');
  end if;

  foreach f in array array['contratante_nome','contratante_endereco','contratante_cpf_cnpj','contratante_email',
                           'contratante_telefone','local_denominacao','local_endereco','descricao'] loop
    if coalesce(trim(p->>f), '') = '' then
      return jsonb_build_object('erro', 'Preencha todos os campos obrigatórios.');
    end if;
  end loop;

  foreach f in array array['contratante_nome','contratante_endereco','contratante_cpf_cnpj','contratante_email',
                           'contratante_telefone','local_denominacao','local_endereco','local_link_mapa'] loop
    if length(coalesce(p->>f, '')) > 500 then
      return jsonb_build_object('erro', 'Algum campo ficou longo demais. Resuma o texto e tente de novo.');
    end if;
  end loop;
  if length(p->>'descricao') > 5000 then
    return jsonb_build_object('erro', 'A descrição ficou longa demais (máximo de 5.000 caracteres).');
  end if;

  v_txt := trim(p->>'contratante_email');
  if v_txt !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('erro', 'Confira o e-mail informado.');
  end if;
  if coalesce(trim(p->>'local_link_mapa'), '') <> '' and trim(p->>'local_link_mapa') !~* '^https?://' then
    return jsonb_build_object('erro', 'O link da localização deve começar com http:// ou https://');
  end if;
  v_mesmo := coalesce((p->>'representante_mesmo')::boolean, false);
  if not v_mesmo then
    foreach f in array array['representante_nome','representante_cargo','representante_celular','representante_email'] loop
      if coalesce(trim(p->>f), '') = '' then
        return jsonb_build_object('erro', 'Preencha os dados do representante ou marque que ele é o próprio contratante.');
      end if;
      if length(p->>f) > 500 then
        return jsonb_build_object('erro', 'Algum campo ficou longo demais. Resuma o texto e tente de novo.');
      end if;
    end loop;
    if trim(p->>'representante_email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return jsonb_build_object('erro', 'Confira o e-mail do representante.');
    end if;
  end if;
  if coalesce((p->>'aceite_lgpd')::boolean, false) is not true then
    return jsonb_build_object('erro', 'É preciso autorizar o uso dos dados para enviar.');
  end if;

  insert into solicitacao_proposta (contratante_nome, contratante_endereco, contratante_cpf_cnpj, contratante_email,
    contratante_telefone, representante_mesmo, representante_nome, representante_cargo, representante_celular,
    representante_email, local_denominacao, local_endereco, local_link_mapa, descricao, aceite_lgpd)
  values (trim(p->>'contratante_nome'), trim(p->>'contratante_endereco'), trim(p->>'contratante_cpf_cnpj'), v_txt,
    trim(p->>'contratante_telefone'), v_mesmo,
    case when v_mesmo then null else trim(p->>'representante_nome') end,
    case when v_mesmo then null else trim(p->>'representante_cargo') end,
    case when v_mesmo then null else trim(p->>'representante_celular') end,
    case when v_mesmo then null else trim(p->>'representante_email') end,
    trim(p->>'local_denominacao'), trim(p->>'local_endereco'),
    nullif(trim(p->>'local_link_mapa'), ''), trim(p->>'descricao'), true)
  returning * into r;

  update solicitacao_proposta
     set protocolo = to_char(r.criado_em at time zone 'America/Sao_Paulo', 'YYYY') || '-' || lpad(r.id::text, 4, '0')
   where id = r.id
   returning * into r;

  return jsonb_build_object('protocolo', r.protocolo, 'pasta', r.token);
end $$;

revoke all on function enviar_solicitacao_proposta(jsonb) from public;
grant execute on function enviar_solicitacao_proposta(jsonb) to anon, authenticated;

-- Conferência: deve mostrar 5 colunas do representante
select count(*) as colunas_representante from information_schema.columns
 where table_name = 'solicitacao_proposta' and column_name like 'representante%';

-- =====================================================================
-- Arquivos dos produtos técnicos finais (Supabase Storage)
-- Só roda no Supabase (não no Postgres local). Caminho do arquivo: <os_id>/<nome>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('produtos-finais', 'produtos-finais', false, 52428800)   -- até 50 MB por arquivo
on conflict (id) do nothing;

create policy "produtos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'produtos-finais' and public.pode_ver_os(((storage.foldername(name))[1])::bigint));

create policy "produtos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos-finais' and public.pode_editar_os(((storage.foldername(name))[1])::bigint));

create policy "produtos: excluir" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos-finais' and public.pode_editar_os(((storage.foldername(name))[1])::bigint));

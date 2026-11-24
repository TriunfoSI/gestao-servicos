#!/bin/bash
# Recria o banco local de testes do zero (roles, auth via GoTrue, estrutura e dados)
set -e
export PGPASSWORD=dev
DIR=$(cd "$(dirname "$0")/.." && pwd)
DADOS=${1:?informe o arquivo 10_dados.sql}
docker rm -f gotrue postgrest >/dev/null 2>&1 || true
psql -h localhost -U postgres -q -c "drop database if exists sgs" -c "create database sgs"
for r in authenticator supabase_auth_admin anon authenticated service_role; do psql -h localhost -U postgres -q -c "drop role if exists $r" 2>/dev/null || true; done
psql -h localhost -U postgres -d sgs -q -f "$DIR/dev/roles_locais.sql"
JWT=super-secret-jwt-token-with-at-least-32-characters-long
docker run -d --name gotrue --add-host=host.docker.internal:host-gateway -p 9999:9999 -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 \
 -e API_EXTERNAL_URL=http://localhost:8000/auth/v1 -e GOTRUE_DB_DRIVER=postgres \
 -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:dev@host.docker.internal:5432/sgs?search_path=auth" \
 -e GOTRUE_SITE_URL=http://localhost:8000 -e GOTRUE_JWT_SECRET=$JWT -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
 -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_DISABLE_SIGNUP=false supabase/gotrue:v2.164.0 >/dev/null
for i in $(seq 1 30); do curl -sf localhost:9999/health >/dev/null && break; sleep 1; done
for f in 01_estrutura 02_regras_e_permissoes 03_visoes_e_relatorios 05_tarefa_prioridade 06_prazo_cronograma 07_ajustes_teste_piloto 08_verificacao_e_situacao_os 09_parcela_atrasada_na_situacao 10_cronograma_padrao_e_contrato 11_tarefa_data_atendimento 12_paralisadas_art_excluir_equipe 13_os_cancelada 14_subtarefas 15_situacao_subtarefas; do psql -h localhost -U postgres -d sgs -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/$f.sql"; done
psql -h localhost -U postgres -d sgs -v ON_ERROR_STOP=1 -q -f "$DADOS"
docker run -d --name postgrest --add-host=host.docker.internal:host-gateway -p 3000:3000 \
 -e PGRST_DB_URI=postgres://authenticator:dev@host.docker.internal:5432/sgs -e PGRST_DB_SCHEMAS=public \
 -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$JWT postgrest/postgrest:v12.2.3 >/dev/null
echo "banco local pronto"

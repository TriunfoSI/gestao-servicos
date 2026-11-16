# Sistema de Gestão de Serviços (piloto)

Sistema web para ordens de serviço: clientes, OS com situação técnica, comercial e do contrato, escopo, prazos, andamento, tarefas da reunião técnica, financeiro (parcelas, ajustes e custos), processos em órgãos, produtos finais e um link de acompanhamento para o cliente.

- **Banco e login:** Supabase (PostgreSQL com regras de acesso por perfil)
- **Site:** HTML e JavaScript puros, sem etapa de compilação, publicado no GitHub Pages

## Pastas

| Pasta | Conteúdo |
|---|---|
| `app/` | o site (é o que vai para o GitHub Pages) |
| `app/config.js` | endereço e chave pública do Supabase |
| `supabase/` | estrutura do banco, regras de acesso e relatório do cliente |
| `migracao/` | conversor do Access para o banco novo |
| `dev/` | ambiente de testes local (Postgres + PostgREST + GoTrue) |

Instalação: veja [GUIA_DE_INSTALACAO.md](GUIA_DE_INSTALACAO.md).

## Perfis

| Perfil | Vê | Altera |
|---|---|---|
| Técnico | OS em que é responsável ou tem prazo/tarefa | parte técnica das próprias OS; situação dos próprios prazos e tarefas |
| Financeiro | todas as OS e todo o financeiro | parcelas, ajustes, custos, situação comercial, clientes |
| Coordenação/Diretoria | tudo | tudo |
| Cliente (sem login) | link revogável com dados da OS, cronograma, andamentos "Geral", parcelas e processos | nada |

As regras ficam no banco (Row Level Security), não só nas telas.

## Gerar os dados a partir do Access

```bash
sudo apt-get install mdbtools
python3 migracao/importar_access.py SITRIUNFO_v2.0.accdb instalar_2_dados.sql relatorio_importacao.md
```

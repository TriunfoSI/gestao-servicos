# Guia de instalação do piloto

São 3 partes, todas gratuitas. Leva cerca de 20 minutos.

1. **Supabase:** guarda o banco de dados, os logins e os arquivos.
2. **GitHub:** guarda o site e o publica na internet (GitHub Pages).
3. **Liberar os acessos:** a coordenação cadastra a equipe dentro do sistema.

Nenhuma senha precisa ser enviada para o Claude. Os únicos dados que você vai repassar são o endereço do projeto e a chave pública ("anon"), que não são secretos.

---

## Parte 1 — Supabase (banco de dados)

1. Acesse **supabase.com**, clique em **Start your project** e entre com sua conta do GitHub ou do Google.
2. Clique em **New project**:
   - **Name:** `gestao-servicos`
   - **Database password:** clique em *Generate a password* e guarde-a num lugar seguro. Você não vai precisar dela no dia a dia.
   - **Region:** *South America (São Paulo)*
   - Plano **Free**
3. Espere o projeto ficar pronto (1 a 2 minutos).
4. No menu da esquerda, abra **SQL Editor** e crie uma consulta nova (**New query**).
5. Abra o arquivo **`instalar_1_estrutura.sql`**, copie todo o conteúdo, cole no editor e clique em **Run**. Deve aparecer *Success*.
6. Crie outra consulta nova, cole o conteúdo de **`instalar_2_dados.sql`** (os dados do Access) e clique em **Run**.
7. Para se tornar a administradora (coordenação), crie mais uma consulta, troque o e-mail abaixo pelo seu e rode:
   ```sql
   update equipe set email = 'seu.email@exemplo.com', perfil = 'coordenacao' where iniciais = 'LN';
   ```
8. Vá em **Project Settings → API** (ou **API Keys**) e copie:
   - **Project URL** (algo como `https://abcd1234.supabase.co`)
   - a chave **anon public** (ou **publishable key**)

   Mande esses dois itens para o Claude na conversa.

## Parte 2 — GitHub (site)

1. Acesse **github.com** (você já tem conta) e crie um repositório novo: **New repository**.
   - **Name:** `gestao-servicos`
   - Marque **Public**. O GitHub Pages gratuito só funciona em repositório público. Ali fica apenas o código das telas; os dados ficam no Supabase, protegidos por login.
   - Clique em **Create repository**.
2. Avise o Claude que o repositório foi criado. Ele envia o código e liga o GitHub Pages.
3. O endereço do sistema será `https://<seu-usuario>.github.io/gestao-servicos/`.

## Parte 3 — Ajustes finais no Supabase

1. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço do sistema (o do passo 2.3) e salve.
2. Em **Authentication → Sign In / Providers → Email**, deixe ligada a opção **Confirm email**. Assim ninguém consegue criar senha com o e-mail de outra pessoa.

## Liberar a equipe

1. Entre no sistema, clique em **Primeiro acesso? Crie sua senha**, use o e-mail cadastrado no passo 1.7 e confirme pelo link que chega por e-mail.
2. Em **Cadastros → Equipe e acessos**, preencha o **e-mail** e o **perfil** de cada pessoa:
   - **Técnico:** vê só as OS em que é responsável (ou em que tem prazo ou tarefa).
   - **Financeiro:** vê todas as OS e cuida de parcelas, ajustes e custos.
   - **Coordenação/Diretoria:** acesso total.
3. Cada pessoa entra no sistema, clica em **Primeiro acesso**, cria a senha e confirma o e-mail.

## Bom saber

- **Plano gratuito do Supabase:** 500 MB de banco e 1 GB de arquivos, muito acima do que vocês usam hoje. Se o sistema ficar **7 dias sem nenhum acesso**, o projeto é pausado, e basta entrar no painel do Supabase e clicar em *Restore*. Com uso diário isso não acontece. O plano pago (cerca de US$ 25/mês) não pausa e faz backup diário.
- **Backup:** no plano gratuito, faça de vez em quando uma cópia em **Database → Backups** ou peça ao Claude um script de exportação.
- **O que confere após importar:** veja o arquivo `relatorio_importacao.md` e, no sistema, use o filtro **"Só as que precisam de revisão"** na lista de OS.

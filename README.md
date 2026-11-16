# Agenda Alpha Set

O painel cadastra eventos e mostra as respostas da equipe. A agenda dos fotógrafos abre pelo convite copiado no painel. O campo **Localização** é obrigatório no cadastro e aparece no card e na tela de resposta.

## Rodar no VS Code

Abra esta pasta em **Arquivo → Abrir Pasta**. Use Node.js 22.13 ou posterior. O arquivo `.env` já vem configurado para um PostgreSQL local e contém a senha de teste do painel em `ADMIN_PASSWORD`.

No primeiro terminal, instale as dependências e inicie o banco de desenvolvimento. Deixe o processo rodando.

```sh
npm ci
npm run db:local
```

No segundo terminal, aplique as migrações e inicie o aplicativo.

```sh
npm run db:migrate
npm run dev
```

| Tela | Endereço local | Endereço previsto em produção |
| --- | --- | --- |
| Painel | http://localhost:3000 | https://dashboard.alpha7studio.com.br |
| Agenda | http://127.0.0.1:3000 | https://agenda.alpha7studio.com.br |

Abra o painel pelo endereço com `localhost`, entre com a senha do `.env` e use **Link da equipe** para testar a agenda. O link de teste funciona no computador que está rodando o app. Os dois endereços chegam ao mesmo aplicativo, que decide a tela pelo nome do host. Em cada ambiente, painel e agenda compartilham o mesmo banco. Use um banco próprio para desenvolvimento, outro para homologação se desejar e outro para produção.

O PostgreSQL local grava em `.postgres/`. Se você já tiver um PostgreSQL de desenvolvimento, aponte `DATABASE_URL` para ele e pule `npm run db:local`. Para checar ou compilar o código, use `npm run typecheck` e `npm run build`.

## Publicação futura

A aplicação roda como um serviço Node.js. Os dois domínios apontam para o mesmo serviço.

1. Configure no serviço as variáveis de `.env.example`. Use `DATABASE_URL` do PostgreSQL de produção, uma senha forte exclusiva em `ADMIN_PASSWORD` e um valor aleatório exclusivo com pelo menos 32 caracteres em `SESSION_SECRET`.
2. Configure `npm run build` para compilar, `npm run db:migrate` para preparar o banco antes da publicação e `npm start` para iniciar. O processo ouve a porta `PORT` do provedor.
3. Cadastre os dois domínios personalizados no serviço e crie na Cloudflare os registros DNS indicados pela hospedagem. O painel usa `DASHBOARD_URL`; o botão **Link da equipe** monta o convite a partir de `AGENDA_URL`.
4. Abra o dashboard por HTTPS, teste a entrada e confira o convite em outro navegador.

No Railway, você pode referenciar a variável `DATABASE_URL` do serviço PostgreSQL no serviço da aplicação. Consulte a [documentação do PostgreSQL no Railway](https://docs.railway.com/databases/postgresql) e o [guia de domínios personalizados](https://docs.railway.com/networking/domains/working-with-domains).

O `.env` é local e está no `.gitignore`. Para gerar segredos novos, rode `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` separadamente para cada valor. Este projeto começa com um banco vazio. Para levar dados do site anterior para o PostgreSQL, trate a importação como uma etapa própria antes de trocar os endereços em produção.

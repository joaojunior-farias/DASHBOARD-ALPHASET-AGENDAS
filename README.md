# Agenda Alpha Set

Um repositório GitHub com duas pastas executáveis de forma independente. O frontend recebe os dois domínios. A API e o banco ficam na rede privada do Railway.

```text
dashboard.alpha7studio.com.br ─┐
                             ├─ frontend → backend → PostgreSQL
agenda.alpha7studio.com.br ───┘
```

O dashboard pede usuário e senha antes de mostrar eventos e respostas. A conta master cria usuários do painel. O primeiro acesso dos fotógrafos começa pelo convite da equipe, com cadastro de nome, e-mail e senha. Depois, o fotógrafo entra com e-mail e senha. As respostas ficam na conta, inclusive as anteriores quando o cadastro é feito no mesmo navegador que ainda tem o convite original.

Rascunhos aparecem no dashboard. Ao publicar, o evento entra na lista de quem ainda precisa responder. Despublicar encerra as inscrições e mantém o evento no histórico de quem já respondeu. As respostas podem ser alteradas enquanto o evento estiver publicado.

## Configurar no Railway

No mesmo projeto e ambiente do Railway, conecte **dois serviços ao mesmo repositório do GitHub**. O serviço da captura pode servir de frontend. Em **Settings → Root Directory**, defina a pasta que cada serviço executa. [Guia de monorepos do Railway](https://docs.railway.com/deployments/monorepo)

| Serviço | Root Directory | Build | Start | Pre-deploy |
| --- | --- | --- | --- | --- |
| frontend | `/frontend` | `npm run build` | `npm start` | — |
| backend | `/backend` | `npm run build` | `npm start` | `npm run db:migrate` |

Adicione ou selecione o serviço PostgreSQL no mesmo ambiente. A tabela de migrações existente é compatível com a versão anterior. Use o mesmo PostgreSQL se estiver fazendo a transição de um ambiente com dados. [PostgreSQL no Railway](https://docs.railway.com/databases/postgresql) · [Comando de pré-deploy](https://docs.railway.com/deployments/pre-deploy-command)

Configure as variáveis na aba **Variables** de cada serviço. Os exemplos abaixo usam os nomes de serviços `backend` e `Postgres`. Troque esses nomes nas referências se seus serviços tiverem outros rótulos.

| Variável | frontend | backend |
| --- | --- | --- |
| `DASHBOARD_URL` | `https://dashboard.alpha7studio.com.br` | `https://dashboard.alpha7studio.com.br` |
| `AGENDA_URL` | `https://agenda.alpha7studio.com.br` | `https://agenda.alpha7studio.com.br` |
| `BACKEND_URL` | `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}` | — |
| `PORT` | Porta injetada pelo Railway | `3001` |
| `API_SERVICE_TOKEN` | `${{backend.API_SERVICE_TOKEN}}` | Novo token com 64 caracteres hexadecimais |
| `DATABASE_URL` | — | `${{Postgres.DATABASE_URL}}` |
| `ADMIN_USERNAME` | — | Nome da conta master. O padrão é `AlphaSetStudio` |
| `ADMIN_PASSWORD` | — | Senha da conta master, de 12 a 256 caracteres |
| `SESSION_SECRET` | — | Segredo de sessão com pelo menos 32 caracteres |

Para gerar o token de serviço ou o segredo de sessão, rode o comando abaixo separadamente para cada valor. Guarde os valores na aba Variables.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No serviço **frontend**, vá em **Settings → Public Networking → Custom Domain**. Cadastre `dashboard.alpha7studio.com.br` e `agenda.alpha7studio.com.br`, depois adicione na Cloudflare os registros DNS que o Railway indicar para cada domínio. Use apenas o endereço privado do Railway para o backend. [Domínios no Railway](https://docs.railway.com/networking/domains/working-with-domains)

Para testar sem mudar o deploy que usa a raiz antiga, faça o primeiro deploy da separação em uma branch e um ambiente de teste. Nesse ambiente, use os endereços de teste da equipe nas variáveis dos dois serviços e um PostgreSQL separado. Quando for trocar o serviço de produção, a mudança do **Root Directory** deve acompanhar a versão do repositório com as duas pastas.

## Rodar no Cursor

Abra a raiz que contém `frontend/` e `backend/`. Use Node.js 22.13 ou posterior. Os arquivos locais `frontend/.env` e `backend/.env` são ignorados pelo Git. Para entrar localmente, use `AlphaSetStudio` e a senha de teste `ADMIN_PASSWORD` do backend. Os arquivos `.env.example` servem de referência para preencher as variáveis no Railway.

Terminal 1, PostgreSQL de teste

```sh
cd backend
npm ci
npm run db:local
```

Terminal 2, API

```sh
cd backend
npm run db:migrate
npm run build
npm run dev
```

Terminal 3, telas

```sh
cd frontend
npm ci
npm run dev
```

Abra o painel em http://localhost:3000. O convite da equipe aponta para http://127.0.0.1:3000. O frontend acessa internamente a API em http://127.0.0.1:3001. Ao editar o backend, rode `npm run build` de novo para que o processo em modo de desenvolvimento recarregue o JavaScript. Se você usa outro PostgreSQL local, ajuste o `DATABASE_URL` no backend e inicie esse banco em vez de executar `npm run db:local`.

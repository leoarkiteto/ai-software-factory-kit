[English](monorepo-walkthrough.md) · **Português (Brasil)**

# Passo a passo: um monorepo React Native + Go e uma funcionalidade de SSO

Este passo a passo adota o kit em um monorepo que já está em desenvolvimento e depois entrega com ele uma funcionalidade de autenticação e autorização SSO. Para os comandos que você digita em cada modo, veja os [casos de uso](use-cases.pt-br.md).

> A fase 11 rodou dois workflows FULL-SPEC em um monorepo real com este formato (Expo/React Native + Go): veja o [log](../research/phase-11-monorepo.md) (em inglês). Os passos A2 e A5 incluem o que ela ensinou.

Estrutura assumida:

```
my-project/
├── api/       # Go (go.mod aqui)
└── mobile/    # React Native (package.json aqui)
```

---

## Parte A: instalação e configuração

### A1. Instale o plugin (uma vez por máquina)

```bash
claude plugin marketplace add leoarkiteto/ai-software-factory-kit
claude plugin install factory@ai-software-factory-kit
```

Requer Claude Code ≥ 2.1.319 e Node ≥ 18.

### A2. Um comando de validação por tipo, na raiz

O kit detecta comandos de validação **apenas na raiz do repositório** (`package.json`, `Makefile`, `go.mod`, …). Ele guarda **um comando por tipo** (`test`, `lint`, `typecheck`, `build`). Em um monorepo, a configuração mais simples é um `Makefile` na raiz que chama os dois projetos:

```make
.PHONY: test lint typecheck build
test:
	cd api && go test ./...
	cd mobile && npm test -- --watchAll=false
lint:
	cd api && go vet ./...
	cd mobile && npm run lint
typecheck:
	cd mobile && npx tsc --noEmit
build:
	cd api && go build ./...
```

O `init` então detecta `make test`, `make lint`, `make typecheck` e `make build`. Se a raiz também tiver um `package.json` com scripts (workspaces), eles têm precedência sobre o Makefile. Confira o que foi detectado quando o `init` perguntar.

Sem um Makefile na raiz, o `init` não detecta nada, porque não há manifest na raiz. Informe você mesmo os comandos, usando a opção de cada ferramenta para chegar a um subprojeto, nunca `cd`:

```json
"commands": {
  "test": "go -C api test ./...",
  "lint": "go -C api vet ./...",
  "typecheck": "npm exec --workspace=mobile -- tsc --noEmit"
}
```

Cada tipo guarda um comando, então com essa estrutura o `test` cobre apenas `api/`. Adicione os testes do mobile com um Makefile quando eles existirem.

### A3. Configure o repositório

Abra o Claude Code na raiz do monorepo:

```text
/factory:init
```

| Pergunta | Resposta sugerida |
|---|---|
| Componentes | `config`, `gitignore-block`, `settings-permissions`; opcionalmente `rules` |
| Onde ficam as regras de permissão | `.claude/settings.local.json` (só você) ou `.claude/settings.json` (o time) |
| Regras de deny | Opcionais. Elas valem para **todas** as sessões, não só para workflows |
| Comandos de validação | Confirme `make test`, `make lint`, `make typecheck`, `make build` |

Confira se o plano mostra `Bash(factory-state *)` e `Edit(/.factory/**)` e então aprove-o.

**Alternativa manual:** adicione as duas regras a `permissions.allow` em `.claude/settings.local.json` e crie `.factory/config.json` como no A4.

### A4. Ajuste a config para mobile e autenticação

Edite `.factory/config.json`. Um hook o valida ao salvar.

```json
{
  "schemaVersion": 1,
  "validation": {
    "commands": { "test": "make test", "lint": "make lint", "typecheck": "make typecheck", "build": "make build" }
  },
  "security": {
    "protectedPaths": [
      ".env", ".env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/credentials*",
      "**/*.keystore", "**/*.jks", "**/*.p12", "**/*.mobileprovision"
    ]
  }
}
```

`protectedPaths` **substitui** a lista padrão, e por isso os defaults são repetidos aqui. A lista adiciona o material de assinatura de Android e iOS. Durante um workflow, os workers não conseguem nem ler nem escrever esses arquivos.

### A5. Explique o monorepo para os agentes

Os workers seguem o `CLAUDE.md`. Coloque o essencial na raiz:

```markdown
# Monorepo
- api/: Go 1.22, roteador chi, Postgres (sqlc). Testes: go test ./...
- mobile/: React Native 0.76 + TypeScript, React Navigation, Jest.
- Convenções: handlers em api/internal/http/, lógica de domínio em api/internal/<domínio>/; telas em mobile/src/screens/.
- Dependências: instale a partir do subprojeto, isolado (`npm install --workspaces=false` dentro de mobile/, `npx expo install …` da mesma forma). O lockfile é mobile/package-lock.json; não há lockfile nem node_modules na raiz.
```

**Diga como as dependências são instaladas.** Esta é a linha que mais importa. Se o `package.json` da raiz declara `workspaces`, o npm e o `expo install` tratam a raiz como workspace por conta própria: criam um `package-lock.json` e um `node_modules` na raiz e esvaziam o `node_modules` do subprojeto. Na fase 11, isso dividiu as dependências e quebrou o typecheck. Ou declare o comando de instalação como acima, ou remova `workspaces` da raiz se o projeto não os usa de fato.

Com isso, o plano pode dar a cada tarefa seu próprio conjunto de arquivos (`api/**` para backend, `mobile/**` para mobile). O escalonador roda tarefas **em paralelo** apenas quando seus arquivos não se sobrepõem.

### A6. Integrações opcionais (recomendadas para SSO)

```bash
claude plugin install mattpocock-skills@claude-plugins-official   # discovery com /grill-with-docs
```

O Spec Kit é opcional. Sem ele, o kit usa seu próprio template de spec, o que basta aqui.

### A7. Faça commit da configuração

```bash
git add .factory/config.json .gitignore Makefile CLAUDE.md   # mais .claude/settings.json se for compartilhado
git commit -m "Configure AI Software Factory"
```

---

## Parte B: autenticação e autorização SSO

### B1. Escreva o pedido

Descreva o objetivo e o que você já sabe. Decisões em aberto são resolvidas no discovery.

```text
/factory:start Adicionar autenticação e autorização SSO. O app mobile (React Native) deve permitir que os usuários entrem pelo IdP da empresa (OIDC, provavelmente Azure AD / Entra ID). A API Go deve validar tokens e aplicar autorização baseada em papéis (admin, manager, user) nos endpoints existentes. Hoje não há autenticação.
```

O comando precisa estar no **início** da mensagem.

### B2. Classificação

O orquestrador inspeciona `api/` e `mobile/` e pontua a rubrica. Para SSO, espere:

| Dimensão | Nota | Por quê |
|---|---|---|
| `architecturalImpact` | 2 | uma nova camada transversal |
| `risk` | 2 | segurança |
| `uncertainty` | 2 | IdP, fluxos e modelo de papéis indefinidos |
| `components` | 2 | mobile e API |

`architecturalImpact = 2` sozinho já escala para **FULL-SPEC**. Você recebe o modo e o motivo. Se a confiança for baixa, você é solicitado a confirmar.

### B3. Discovery (o workflow espera por você)

O orquestrador escreve um brief e diz exatamente o que digitar, por exemplo:

```text
/grill-with-docs @.factory/workflows/wf-20261111-sso-auth/discovery-brief.md
```

Só você pode iniciar o `/grill-with-docs`. Ele entrevista você, uma pergunta por vez, até não restar nenhuma decisão em aberto. Perguntas típicas para SSO:

- **IdP e protocolo:** OIDC ou SAML? Qual tenant? Um IdP ou vários?
- **Fluxo mobile:** Authorization Code + PKCE no navegador do sistema, sem client secret no app?
- **Tokens:** onde ficam armazenados no dispositivo (Keychain / Keystore)? Refresh tokens? Duração da sessão?
- **API:** validar JWTs localmente com JWKS, ou usar introspecção? Quais claims (`sub`, `roles`, `groups`)?
- **Autorização:** os papéis vêm de grupos do IdP ou do banco de dados da API? Quais endpoints precisam de qual papel?
- **Usuários:** criados no primeiro login (provisionamento just-in-time)? O que acontece com os dados existentes?
- **Logout:** apenas local, ou no IdP também?

O resultado é um `GLOSSARY.md` e ADRs em `docs/adr/` (por exemplo "Usar OIDC Authorization Code + PKCE no mobile"). Depois:

```text
/factory:resume
```

A Factory confere as evidências:
- mudanças no glossário ou nos ADRs;
- um `discovery-summary.md` sem perguntas bloqueantes.

Sem o `/grill-with-docs`, o orquestrador se oferece para conduzir a entrevista ele mesmo (o fallback nativo).

### B4. Especificação (você aprova)

O orquestrador escreve o `spec.md` com requisitos numerados. Um trecho:

```
FR-1  O app mobile autentica o usuário via OIDC Authorization Code + PKCE.
FR-2  A API rejeita requisições sem um token válido (401).
FR-3  A API aplica autorização baseada em papéis nos endpoints listados (403).
FR-4  Um usuário é criado no primeiro login com o papel "user".
NFR-1 Os tokens são armazenados apenas no armazenamento seguro do sistema operacional.
NFR-2 Nenhum segredo do IdP no código ou no bundle do app.
AC-1  (FR-1) Entrar com uma conta válida leva à tela inicial; cancelar volta para a tela de login.
AC-2  (FR-2) GET /orders sem Authorization → 401.
```

O `factory-state spec-check` garante que cada FR esteja coberto por um critério de aceite. O workflow então pausa e mostra o escopo, os FR e os AC:

```text
/factory:resume sim, aprovado
/factory:resume mudar FR-4: novos usuários ficam pendentes até um admin aprová-los
```

### B5. Plano e tarefas (você aprova)

O orquestrador escreve o `plan.md`, com os contratos definidos **primeiro** para que as tarefas em paralelo os compartilhem:

| Tarefa | Worker | Arquivos | Depende de |
|---|---|---|---|
| T1 Contrato: claims, papéis, erros 401/403, endpoints protegidos | backend | `api/internal/auth/contract.go`, `docs/auth.md` | — |
| T2 Middleware JWT/JWKS + autorização por papel | backend | `api/internal/auth/**`, `api/internal/http/middleware/**` | T1 |
| T3 Provisionamento de usuário no primeiro login | backend | `api/internal/users/**`, `api/migrations/**` | T1 |
| T4 Login PKCE, armazenamento seguro, interceptor HTTP | frontend | `mobile/src/auth/**`, `mobile/src/api/**` | T1 |
| T5 Testes de integração e de aceite para os AC | qa | `api/**/*_test.go`, `mobile/__tests__/**` | T2, T3, T4 |
| T6 Variáveis de ambiente, `.env.example`, documentação de configuração do IdP | devops | `.env.example`, `docs/setup-sso.md` | T1 |

Antes de perguntar a você, o `architecture-reviewer` (Opus) revisa o plano. Depois:

```text
/factory:resume aprovado
```

### B6. Execução (nenhuma entrada necessária)

- T1 roda primeiro.
- Depois **T2, T3, T4 e T6 rodam em paralelo**, até 3 por vez por padrão, porque seus arquivos não se sobrepõem.
- T5 (QA) roda por último.

Cada worker (Sonnet) recebe apenas seus arquivos, os AC e os comandos de validação. Seu relatório é validado pelo `factory-state`.

O que protege você enquanto o workflow roda:
- Os workers **não conseguem ler o `.env`** nem os keystores. As configurações do IdP ficam em variáveis de ambiente documentadas (`.env.example`).
- `git push`, deploys, `kubectl`, `terraform` e comandos destrutivos são negados.
- O worker de devops prepara a configuração, mas nunca faz deploy.

Uma tarefa que falhou é tentada de novo (no máximo 2 tentativas no total) ou replanejada. Se o workflow precisar de você, ele para e diz por quê.

### B7. Validação e revisões

1. `make lint`, `make typecheck` e `make test` rodam.
2. Seguem-se duas revisões independentes, ambas obrigatórias no FULL-SPEC: `code-reviewer` e `architecture-reviewer`.
3. Mudanças pedidas levam a retrabalho e a uma nova revisão, no máximo 3 rodadas.
4. Sem aprovação após 3 rodadas, o workflow **escala para você**: aceitar o risco, dar orientações ou parar.

### B8. Integração e relatório final

`make build` roda. Depois o orquestrador percorre **cada** FR, NFR e AC da spec, marcando cada um como atendido, parcial ou não atendido, com evidências. O resultado é `.factory/workflows/wf-20261111-sso-auth/final-report.md`, que cobre:
- os arquivos alterados;
- os resultados de validação: um comando que não rodou aparece como "skipped", nunca como "passed";
- as revisões;
- as issues em aberto;
- qualquer coisa que o orquestrador fez por conta própria.

**A Factory não faz commit nem push.** Você revisa o diff e então:

```bash
git checkout -b feature/sso-auth
git add -A && git commit -m "Add SSO authentication and role-based authorization"
git push -u origin feature/sso-auth
```

---

## Dicas

- **Interrupções.** O `/factory:resume` continua a partir de `.factory/`, mesmo em uma nova sessão. O `factory-state show` exibe o estado.
- **Custo.** Uma funcionalidade FULL-SPEC deste tamanho custa dezenas de dólares; o cenário de teste menor custou cerca de US$ 17. Modelos mais baratos para os workers: `roles.<name>.model` na config. Mantenha os revisores no Opus.
- **Fatias menores.** Dividir a funcionalidade (por exemplo "apenas o middleware da API") pode torná-la STANDARD: mais barata e mais rápida.
- **Segredos do IdP.** Nunca os coloque no pedido ou no chat. Um client ID público pode ficar no código; qualquer coisa sensível vai no `.env`, que os workers não conseguem ler.

[English](installation.md) · **Português (Brasil)**

# Instalação

O kit tem duas camadas (contrato: [installation.md](../contracts/installation.md), em inglês).

1. **O plugin.** O gerenciador de plugins do Claude Code o instala, atualiza e remove. Ele não escreve nada nos seus repositórios.
2. **A integração com o repositório** (opcional, por repositório). O `/factory:init` a adiciona, com a sua aprovação para cada arquivo.

## 1. Instale o plugin

```bash
claude plugin marketplace add leoarkiteto/ai-software-factory-kit             # a partir do GitHub
# ou de um clone local:  claude plugin marketplace add /caminho/para/ai-software-factory-kit
claude plugin install factory@ai-software-factory-kit             # adicione --scope project para compartilhar com o repositório
```

Instalar a partir do GitHub usa suas credenciais do git. Se o repositório for privado, cada pessoa precisa de acesso de leitura a ele.

Para conferir: `claude plugin list` mostra `factory`, e `/factory:start` aparece no menu de slash commands.

**Requisitos:**
- Claude Code ≥ 2.1.319 (a versão em que o kit foi verificado). Os evals precisam de ≥ 2.1.269.
- Node.js ≥ 18 no `PATH`. As ferramentas em `bin/` e os hooks do plugin rodam com `node`.

O plugin funciona sem o `init`: ele usa os defaults e cria `.factory/workflows/` no primeiro workflow.

### Integrações opcionais

| Integração | Usada para | Instalação |
|---|---|---|
| `/grill-with-docs` | discovery do FULL-SPEC (perguntas de domínio, `GLOSSARY.md`, ADRs) | `claude plugin install mattpocock-skills@claude-plugins-official`, ou `npx skills add mattpocock/skills` |
| GitHub Spec Kit 1.x | especificação do FULL-SPEC (`speckit-specify`, `clarify`, `plan`) | `specify init --here --integration claude` no repositório |

A Factory detecta as duas (`factory-state providers`) e nunca as instala por conta própria. Sem elas, o FULL-SPEC usa seu próprio fallback de discovery e os templates locais de spec.

## 2. Configure um repositório: `/factory:init`

Execute `/factory:init` dentro do Claude Code, no repositório alvo. Ele:

1. **Inspeciona** o repositório, somente leitura: estado do git, candidatos a comandos de validação em `package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml` e `go.mod`, configurações e regras existentes, Spec Kit, glossário e ADRs.
2. **Pergunta** quais componentes você quer e onde ficam as regras de permissão.
3. **Mostra um plano** com uma prévia de cada mudança e um hash do plano.
4. **Não escreve nada até você aprovar.** Depois aplica exatamente aquele plano (`factory-install apply --plan-hash …`, que recusa se algo mudou desde então).
5. **Verifica:**
   - se a config é válida;
   - se os arquivos de configuração são lidos sem erro;
   - se os hooks ficam em silêncio para um comando inofensivo;
   - se o recibo é válido.

| Componente | Arquivo | Padrão |
|---|---|---|
| `config` | `.factory/config.json`: versão do schema mais os comandos de validação que você confirmou | recomendado |
| `gitignore-block` | bloco marcado no `.gitignore` ignorando `.factory/workflows/` | recomendado |
| `settings-permissions` | adiciona `Bash(factory-state *)` e `Edit(/.factory/**)` a `.claude/settings.local.json` (ou `.claude/settings.json`) | recomendado |
| `settings-permissions` com regras de deny | adiciona `Read(./.env)`, `Read(./.env.*)`, `Read(./**/*.pem)`, `Read(./**/*.key)`, `Read(./**/secrets/**)` e `Bash(git push *)` a `permissions.deny`. Elas valem em **todas** as sessões | opcional |
| `discovery-permissions` | adiciona `Read(~/.claude/skills/domain-modeling/**)` ao mesmo arquivo de configurações, para que o `/grill-with-docs` leia seus arquivos de formato (`GLOSSARY-FORMAT.md`, `ADR-FORMAT.md`) sem perguntar. Somente leitura; escrever `GLOSSARY.md` e `docs/adr/` ainda pede permissão. É ignorado quando a skill está no repositório (nenhuma regra necessária) ou não está em `~/.claude/skills/` | opcional; oferecido quando o `/grill-with-docs` está instalado no escopo do usuário |
| `rules` | `.claude/rules/factory-workflow.md`: instruções permanentes curtas | opcional |
| `claude-md-block` | bloco marcado no `CLAUDE.md` | opcional; prefira `rules` |

**Por que as regras de allow.** Uma skill pré-aprova suas ferramentas apenas no próprio turno, e essa aprovação termina quando os workers delegados retornam. Sem as duas regras, o Claude Code pergunta toda vez que o orquestrador registra um resultado (ADR-0010). As duas regras são restritas:
- o `factory-state` só escreve estado validado em `.factory/`;
- a regra de edição cobre apenas `.factory/`.

O que o `init` registra: `.factory/install.json`, um recibo com o hash de cada arquivo, bloco ou conjunto de entradas que ele possui.

Os mesmos passos funcionam a partir de um shell:

```bash
factory-install inspect
factory-install plan --components config,gitignore-block,settings-permissions --test "npm test"
factory-install apply --plan-hash <hash> --components config,gitignore-block,settings-permissions --test "npm test"
factory-install status
```

(O `factory-install` está no `PATH` dentro do Claude Code. Em um terminal, use `<diretório do plugin>/bin/factory-install`.)

## 3. Adoção pelo time

Faça commit de `.factory/config.json`, além de `.claude/settings.json` e `.claude/rules/factory-workflow.md` se você os escolheu. Para oferecer o plugin a todos que abrirem o repositório, adicione isto ao `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "ai-software-factory-kit": { "source": { "source": "github", "repo": "leoarkiteto/ai-software-factory-kit" } }
  },
  "enabledPlugins": { "factory@ai-software-factory-kit": true }
}
```

- A chave do marketplace é o `name` em `.claude-plugin/marketplace.json`.
- O `extraKnownMarketplaces` passa a valer depois que um colaborador aceita o diálogo de confiança da pasta.
- Cada colaborador ainda instala o plugin uma vez: `claude plugin install factory@ai-software-factory-kit --scope project`.

Esses formatos vêm da documentação do Claude Code em 2026-11-10. O kit ainda não exercitou uma adoção pelo time.

## 4. Atualização

- **Plugin:** `claude plugin update factory@ai-software-factory-kit` (ou a atualização automática do marketplace).
- **Integração com o repositório:** execute `/factory:init` de novo.
  - Conteúdo da Factory não modificado é atualizado quando a versão do kit mudou. Arquivos ausentes são oferecidos para recriação.
  - Qualquer coisa que você editou é reportada como `user-modified` e deixada como está.

## 5. Remoção

- `/factory:init --remove` (ou `factory-install remove`) mostra um plano de remoção e então apaga apenas o conteúdo da Factory que está intacto:
  - arquivos inteiros que a Factory criou;
  - seus blocos marcados;
  - as entradas de permissão que ela adicionou.

  Suas edições, suas próprias entradas de permissão e `.factory/workflows/` permanecem.
- Depois, `claude plugin uninstall factory`.

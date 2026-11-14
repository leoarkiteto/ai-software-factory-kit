[English](README.md) · **Português (Brasil)**

# factory: plugin AI Software Factory para o Claude Code

Classifica pedidos de desenvolvimento em workflows **QUICK**, **STANDARD** ou **FULL-SPEC** e os executa com estado rastreado e validado em `.factory/`, dentro do seu repositório.

Instale a partir do GitHub (ou passe o caminho de um clone local para `marketplace add`):

```bash
claude plugin marketplace add leoarkiteto/ai-software-factory-kit
claude plugin install factory@ai-software-factory-kit
```

- `/factory:init`: configuração opcional por repositório (config, `.gitignore`, permissões, regras). Escreve apenas o que você aprovar, e `--remove` desfaz.
- `/factory:start <pedido>`: classifica o pedido e executa o workflow correspondente (`--mode` para forçar um).
- `/factory:resume [workflow-id] [resposta]`: continua um workflow pausado ou interrompido.

Requer Node.js ≥ 18 (ferramentas determinísticas de estado, expostas como `factory-state` no `PATH` do Bash). A documentação completa, os contratos e as decisões de design ficam no repositório do kit, em `docs/` (os guias têm versão em português: `docs/guide/*.pt-br.md`).

## Permissões

Workflows que delegam para workers precisam de duas regras de permissão (allow) nas configurações do projeto, porque a pré-aprovação no nível da skill termina quando os subagentes retornam (ADR-0010):

```json
{ "permissions": { "allow": ["Bash(factory-state *)", "Edit(/.factory/**)"] } }
```

O `factory-state` só escreve estado validado de workflow em `.factory/`, e também serve os procedimentos do plugin (`factory-state guide`). Sem essas regras, o Claude Code pergunta toda vez.

As integrações opcionais precisam de acessos próprios:
- O `/grill-with-docs` lê seus arquivos de formato de onde está instalado (por exemplo `~/.claude/skills/domain-modeling/`) e escreve `GLOSSARY.md` e `docs/adr/`. Para uma instalação no escopo do usuário, o `/factory:init` oferece o componente opcional `discovery-permissions`, que adiciona `Read(~/.claude/skills/domain-modeling/**)`.
- O `speckit-specify` do Spec Kit escreve `specs/` e `.specify/feature.json`.

## Hooks de segurança

Enquanto um workflow está ativo, os hooks do plugin negam o seguinte, na sessão principal e nos workers, com um motivo que o modelo precisa relatar:
- `git push` (a menos que `security.allowGitPush` esteja ativo; force pushes são sempre negados);
- comandos git destrutivos e `rm`, `sudo`;
- publicação de pacotes, push de containers, deploys e alterações de cluster ou infraestrutura;
- comandos destrutivos de banco de dados;
- arquivos que correspondem a `security.protectedPaths` (`.env`, chaves, `secrets/`, …);
- edições diretas nos manifests de workflow.

Cada nova sessão também recebe um aviso curto listando os workflows que podem ser retomados. Após uma edição, os hooks validam `.factory/config.json` e os manifests. Em repositórios sem `.factory/`, os hooks não fazem nada. Cada hook pode ser desligado em `hooks`, no `.factory/config.json`.

Os guards são uma rede de proteção de melhor esforço, não um sandbox. Coloque limites rígidos em `permissions.deny`. Veja `docs/contracts/hooks.md` e o ADR-0011.

Status: pré-release v0.1.0. Os três modos estão implementados e cada um foi exercitado de ponta a ponta em sessões reais. Uma pequena suíte de evals comportamentais fica em `evals/` (veja docs/guide/testing.pt-br.md no kit).

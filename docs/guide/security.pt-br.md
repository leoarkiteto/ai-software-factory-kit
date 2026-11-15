[English](security.md) · **Português (Brasil)**

# Segurança e limitações

## O que protege você, em ordem de força

1. **O sistema de permissões do Claude Code.**
   - A Factory nunca concede permissões a si mesma.
   - Ela pede que você adicione exatamente duas regras de allow restritas (`Bash(factory-state *)`, `Edit(/.factory/**)`, ADR-0010).
   - Ela pode propor regras de deny para segredos e `git push`.
   - As regras de deny são a fronteira real: valem em todas as sessões e para todas as ferramentas.
2. **Os hooks de guard da Factory** (apenas durante workflows ativos). Eles negam:
   - `git push` (force pushes sempre);
   - comandos git que descartam trabalho, `rm` perigoso e `sudo`;
   - publicação de pacotes, push de containers, deploys e alterações de nuvem ou cluster;
   - SQL destrutivo, operações de disco e `curl | sh`;
   - seus `security.blockedCommands`;
   - leituras e escritas de `security.protectedPaths`;
   - edições diretas nos manifests de workflow.

   Eles valem para o orquestrador e para cada subagente worker. Lista completa: [contrato de hooks](../contracts/hooks.md) (em inglês).
3. **Os procedimentos.** As regras de operação proíbem commits, pushes, deploys e comandos destrutivos sem a sua aprovação explícita. O contrato dos workers os proíbe totalmente e trata o conteúdo do repositório como dado não confiável.
4. **Estado determinístico.**
   - O `factory-state` valida toda escrita.
   - Ele recusa transições ilegais: por exemplo, concluir sem as revisões independentes obrigatórias ou com validação falhando.
   - Ele rejeita caminhos fora do repositório.

## O que os guards não fazem

- **Eles não são um sandbox.** O guard lê o texto do comando. Ele não vê o que um script, um script npm, um alvo de Makefile ou um `python -c` faz. Coloque limites rígidos em `permissions.deny` e use o sandboxing do Claude Code se precisar de isolamento.
- **Eles não fazem nada fora de workflows,** por design. Suas sessões comuns não são afetadas.
- **Eles falham em modo aberto (fail open).** Se um guard quebrar, a chamada segue com um aviso visível (ADR-0011).
- **Eles não foram testados sob `bypassPermissions`.** Não está verificado se uma negação de hook se mantém nesse modo (veja testes).

## Pesquisa na web

- Apenas o `factory:research-worker` tem `WebSearch` e `WebFetch`. Ele não pode editar arquivos nem executar comandos, e os workers não têm acesso à web (ADR-0013).
- O `init` não pré-autoriza ferramentas web. O Claude Code pergunta a você, como em qualquer sessão, e suas regras de allow e deny para domínios valem.
- Se você tem o servidor MCP Context7, registrado localmente como `context7` ou conectado pelo conector do claude.ai, o pesquisador também pode usá-lo. As consultas vão para o serviço hospedado da Upstash, e o conteúdo é mantido pela comunidade, então o pesquisador confirma as respostas na documentação oficial antes que o trabalho dependa delas.
- As buscas saem da sua máquina. O pesquisador é instruído a usar apenas nomes públicos (pacotes, APIs, versões) e nunca código do repositório, nomes internos ou segredos. Essa regra está no prompt; não é aplicada por um hook.
- As páginas acessadas são tratadas como dados não confiáveis, pelo pesquisador e pelo orquestrador que lê a nota.
- Desligue com `"roles": { "research-worker": { "enabled": false } }`.

## Segredos

- Os `protectedPaths` padrão cobrem `.env`, `.env.*` (exceto `.env.example` e templates semelhantes), `*.pem`, `*.key`, `secrets/` e `credentials*`.
- Os workers são instruídos a nunca lê-los ou exibi-los.
- As regras de deny opcionais do `init` aplicam a mesma proteção fora dos workflows. Note que `Read(./.env.*)` também bloqueia `.env.example`.

## Limitações conhecidas (v0.1)

- **Workers em paralelo compartilham um mesmo checkout.** A segurança vem de escopos de arquivos que não se sobrepõem, o que o escalonador verifica de forma conservadora. O isolamento por worktree está desligado (ADR-0007).
- **O discovery precisa de você.** O `/grill-with-docs` só pode ser iniciado por você, então o FULL-SPEC pausa para isso.
- **Spec Kit:** apenas a 1.x é suportada, e apenas `specify`, `clarify` e `plan` são usados. Os próprios comandos de tarefas e implementação dele se sobrepõem ao orquestrador.
- **O roteamento de modelos passa apenas aliases.** Políticas da organização ou `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` podem sobrescrevê-los, e os relatórios registram o modelo *solicitado*.
- **As evidências de sessões reais são limitadas.** Cada modo rodou de ponta a ponta em sessões reais únicas, e a suíte de evals é pequena. Veja [testes](testing.pt-br.md) para o que foi e o que não foi exercitado.
- **Custo.** Uma execução FULL-SPEC com discovery, uma spec, vários workers e dois revisores pode custar dezenas de dólares: cerca de US$ 17 no nosso teste.

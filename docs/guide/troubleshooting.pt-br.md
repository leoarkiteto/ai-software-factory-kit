[English](troubleshooting.md) · **Português (Brasil)**

# Solução de problemas

| Sintoma | Causa | Solução |
|---|---|---|
| O Claude Code pede permissão a cada chamada `factory-state …` ou a cada escrita em `.factory/` depois que os workers terminam | A pré-aprovação de uma skill termina quando os subagentes retornam (ADR-0010) | Execute `/factory:init` e aprove as duas regras de allow, ou adicione você mesmo `Bash(factory-state *)` e `Edit(/.factory/**)` a `permissions.allow` |
| `factory-state: command not found` | O plugin não está habilitado nesta sessão, ou você está em um terminal comum | Confira `claude plugin list`. Em um terminal, use `<diretório do plugin>/bin/factory-state` |
| `factory-state` falha com erro de sintaxe ou de import | Node.js anterior ao 18 | Instale Node ≥ 18 |
| Um comando é negado com "Factory guard: …" | Há um workflow ativo e o comando corresponde a uma regra do guard | Execute-o você mesmo no seu terminal. Chaves de política em `.factory/config.json`: `security.allowGitPush` (pushes simples) e `hooks.commandGuard: false` (o guard de comandos inteiro). `security.blockedCommands` só adiciona bloqueios; as regras embutidas não podem ser relaxadas uma a uma. Se nenhum workflow deveria estar ativo, conclua-o ou marque-o como falho (`factory-state show`) |
| O guard bloqueia algo inofensivo | A regra heurística é ampla demais para o seu caso | Desligue o guard para o repositório (`hooks.commandGuard: false`), ou reporte o caso. As regras estão listadas em `docs/contracts/hooks.md` |
| A escrita de arquivo de um worker via Bash (`cat > f <<EOF`) foi negada porque o conteúdo mencionava um comando perigoso | Antes do kit 0.1.1, o guard lia corpos de heredoc como comandos | Corrigido na 0.1.1. Os workers agora escrevem arquivos com Write/Edit (regra 6 do contrato de workers) |
| Um comando composto (`cd x && …`, `VAR=1 cmd`) é negado pelo Claude Code, não pelo guard | O Claude Code verifica cada parte de um comando composto separadamente | Os procedimentos já usam um comando por chamada; isso só acontece com comandos ad hoc |
| Um comando Bash contendo JSON em um heredoc é negado | O verificador de permissões do Claude Code recusa corpos de heredoc com JSON | A Factory passa JSON por arquivos `.factory/workflows/<id>/inbox/*.json` (ADR-0009) |
| O texto do `/factory:start` aparece, mas nada acontece | O slash command não estava no início da mensagem | Comece a mensagem com `/factory:start` |
| "manifest invalid" no aviso da sessão, ou o `factory-state` recusa um workflow | O manifest foi editado à mão ou corrompido | `factory-state validate <id>` mostra os erros. Restaure o arquivo do git ou de um backup. Nunca edite manifests diretamente |
| "config is invalid … defaults in use" | O `.factory/config.json` não passa no schema | `factory-state config` lista os erros. Chaves desconhecidas e tipos errados são rejeitados, e nada é aplicado parcialmente |
| O FULL-SPEC está esperando o discovery | O `/grill-with-docs` precisa ser digitado por você | Digite `/grill-with-docs` (ou `/mattpocock-skills:grill-with-docs`), responda até terminar e então `/factory:resume` |
| O `/grill-with-docs` pede permissão para ler seus próprios arquivos | Ele lê seus arquivos de formato de onde está instalado | Aprove as leituras, ou permita `Read(~/.claude/skills/**)` |
| O Spec Kit não é detectado | Não há `.specify/init-options.json`, a versão não é 1.x, ou faltam skills `speckit-*` | `factory-state providers` mostra o motivo. Execute `specify init --here --integration claude` |
| Um workflow escalou após a revisão | `review.maxIterations` rodadas não chegaram à aprovação | Leia os relatórios de revisão em `.factory/workflows/<id>/reviews/`. Decida se aceita o risco (`/factory:resume <id> accept …`), dá orientações ou para |
| Uma tarefa falhou duas vezes e suas dependentes estão bloqueadas | Falhas em `execution.maxTaskAttempts` | `factory-state show <id>` mostra a falha. Retome com orientações; o orquestrador pode replanejar |
| O `/factory:init` diz "the plan changed since it was shown" | Um arquivo mudou entre o plano e a aplicação | Proteção esperada. Revise o novo plano e aprove de novo |
| O `/factory:init` pula um arquivo como `exists-unowned` ou `user-modified` | O arquivo existe e não foi criado pela Factory, ou você o editou | Ele nunca é sobrescrito. Faça o merge à mão se quiser a versão do kit (`factory-install plan` mostra o conteúdo) |

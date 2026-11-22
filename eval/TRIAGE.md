# Triagem de defeitos conhecidos

Registro do critério 5 do RC ([ROADMAP](../ROADMAP.md)). Estado de referência:
**0.3.0-alpha.13**, triado em 2026-11-22 a partir do roadmap, do changelog, do
README e das observações em `eval/observations/`. Nada aqui foi reexecutado: a
triagem classifica o que já está registrado, não descobre defeitos novos.

## Critério de bloqueio

Bloqueia o RC um defeito conhecido que cause perda de dados, escrita no alvo
errado, quebra de instalação ou relatório enganoso, sem resolução. Os demais
itens ficam registrados com impacto, workaround e decisão.

## Bloqueantes

Nenhum conhecido. Os quatro tipos acima têm correção publicada ou não foram
observados. O item T1 abaixo é o único que pode virar bloqueante.

## Itens abertos (não bloqueantes)

| # | Item | Impacto | Workaround | Decisão |
| --- | --- | --- | --- | --- |
| T1 | Correções do review real no Codex (proveniência do Challenger, cobertura canônica, escopo por diff; alpha.6 a alpha.9) sem repetição em sessão real | Relatório de um review real no Codex pode repetir a atribuição errada do Challenger ou a consolidação sem cobertura | O gate de proveniência rejeita IDs que não constem nos informados; revisar a consolidação manualmente | Repetir a revisão sobre a mesma base e o mesmo HEAD fixados ([observação](observations/2026-09-17-codex-real-profile-review.md)). **Vira bloqueante se a repetição falhar** |
| T2 | `coordinator_id` é identidade declarada, sem certificação do host | O ID não prova a execução; só dá rastro e checagem de consistência | O relatório já diz "not host-certified" | **Decidido** em 2026-11-22 ([roadmap](../ROADMAP.md#decisão-origem-do-coordinator_id-2026-11-22)): manter declarado, reavaliar só se um host expuser identidade verificável |
| T3 | Severidade varia entre rodadas sobre o mesmo código | Ranking e triagem por severidade instáveis; defeito persistente pode aparecer com severidade diferente | Ler o achado, não só a severidade | Medir a variabilidade nas duas execuções por caso do corpus (critério 4) antes de qualquer mudança |
| T4 | Evidência só estática (`static-analysis (reviewer-reported)`) | Achado confirmado pelo Challenger não foi executado pelo revisor | `evidencePackage` declara o método; reproduzir antes de agir em achados de alto impacto | Aceito para o RC; reavaliar após o corpus |
| T5 | Primeira chamada de `argus_reconcile` rejeitada com frequência por `source_claim` que não cita o conteúdo validado | Uma tentativa extra por rodada; nenhum dado perdido | Citar literalmente o conteúdo atual do membro e repetir | Mensagens de erro agora nomeiam o achado e o campo (Unreleased, 2026-11-22); falta reobservar em sessão real se a primeira chamada passa |
| T6 | Skill de segurança dentro do agente não confirmada por diagnóstico (`argus-security-review`) | O agente inicia e registra a execução, mas não há prova de que recebeu o corpo da skill | Rodar um subagente de diagnóstico que cite a skill | Verificar na próxima sessão real do Claude Code |
| T7 | Aviso `unlinkedHistory` só tem teste de unidade | Lembrete pode não disparar no caso real | Vincular o baseline explicitamente ao reconciliar | Observar em uma rodada real com baseline |
| T8 | Codex: `spawn_agent` não seleciona agente por nome em sessão com ferramentas ([openai/codex#15250](https://github.com/openai/codex/issues/15250)) | Delegação nomeada indisponível nesse modo | Coordenador injeta `developer_instructions` em um worker genérico e declara isso | Mantido e documentado no README; depende do upstream |
| T9 | Detecção de stack limitada a 64 diretórios afetados e 1 MiB por manifesto; sem pacotes irmãos nem árvore de dependências | Suplementos podem não ser selecionados em monorepos grandes | Limites e truncamento são divulgados na saída | Documentado; ampliar só com casos e controles próprios |
| T10 | Matriz de hosts incompleta: Codex tem o React lab em duas rodadas ([observação](observations/2026-11-22-codex-react-lab-two-rounds.md)) mas faltam OpenCode Desktop, DSH e repetição por host com versões e modo do Challenger confirmados | Compatibilidade fora do Claude Code e do Codex só tem evidência avulsa | Usar o fallback declarado | Critério 3 do RC |
| T12 | Reconciliação não funde achados com a mesma origem: o D1 do React lab saiu como 3 achados em `useCart` nas duas rodadas no Codex (e como 1 no Claude Code) | Relatório com achados quase duplicados e mesma recomendação; "5 persistentes" não é o mesmo agrupamento que no Claude Code | Ler os achados de  em conjunto | Adjudicar por contrafactual se são 1 ou 3 defeitos e decidir se a reconciliação deveria fundir |
| T13 | Escopo padrão difere entre sessões sobre o mesmo código (`integrated-branch-diff` com working tree versus `branch-commits` sem) | A baseline ainda casou, mas o escopo da rodada depende da sessão | Fixar o escopo no prompt | Observar em mais rodadas antes de mudar o padrão |
| T14 | Codex: o rollout mostra `spawn_agent` com `agent_type` do papel Argus e filhos com `agent_role` e `agent_path` iguais aos IDs reportados, mas não prova que as `developer_instructions` do papel chegaram ao filho | O relatório diz "delegated" e isso está confirmado; o carregamento da persona não | Ler o rollout em `~/.codex/sessions/` | Rodar um filho de diagnóstico que cite a persona; qualificar a limitação do README (#15250) por build se confirmado |
| T11 | Entrada do changelog da alpha.13 não cita o fix do DSH (`859d056`, nome da skill ao reescrever IDs de agentes) incluído na tag | Quem lê o changelog não vê essa correção | Consultar o `git log` | Resolvido: nota acrescentada em `Unreleased` (2026-11-22) |

## Revisão

Reabrir esta triagem a cada alpha publicada e antes de declarar o RC. Um item só
sai da tabela com a evidência que o fecha (observação, teste ou decisão
registrada), não por passagem de tempo.

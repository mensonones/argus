# Argus — roadmap e critérios de conclusão

Status de referência: **0.3.0-alpha.13** (preparada em 2026-11-05; a alpha.12 foi publicada em 2026-09-19), com o estado
dos critérios verificado contra o repositório em 2026-11-05.
Este documento é o plano de entregas futuras; o [changelog](CHANGELOG.md)
registra o que efetivamente foi publicado. Não há datas prometidas.

## Regras de evolução

- O assistente do desenvolvedor continua sendo a engine. Argus não exige uma
  chave própria de modelo; CI não implica que o runtime faça raciocínio sozinho.
- Versões alpha servem para corrigir e validar hipóteses. Números posteriores
  à alpha.5 não reservam features: uma falha pode exigir outra alpha corretiva.
- RC significa escopo congelado e critérios cumpridos; estável exige repetir
  a validação no artefato final. Novas features relevantes retornam à fase alpha.
- Toda entrega exige typecheck, testes, validação do pacote instalado, diagnóstico
  MCP e definições geradas consistentes. Mudanças de schema/formato exigem testes
  de migração e compatibilidade; alterações de host exigem reinstalação e sessão nova.
- Evidência declarada pelo agente não certifica execução. Labs sintéticos,
  integrações funcionais e qualidade semântica são avaliados separadamente.
- Nenhuma execução falha/incompleta é contabilizada como review sem achados.
  Controles e gabaritos ficam fora dos prompts cegos; resultados divergentes são
  adjudicados e publicados com limitações, não descartados para melhorar métricas.

## Sequência

| Marco | Estado | Resultado esperado |
| --- | --- | --- |
| 0.3.0-alpha.5 | Publicado | Contexto MCP explícito e attachment sem nova rodada |
| 0.3.0-alpha.6 a alpha.12 | Publicado | Gates de proveniência e cobertura canônica, integridade da rodada, escopo automático, patches byte a byte, liberação de revisores concluídos e empacotamento portável |
| 0.3.0-alpha.13 | Preparada (tag e push pendentes) | Correções de coordenação e do Claude Code validadas em sessões reais do React lab, dependências sem alertas e suíte nos três sistemas |
| Próximas alphas 0.3 | Planejadas | Validação em sessão real, matriz de hosts e execução do corpus (ver estado dos critérios) |
| 0.3.0-rc.1 | Condicional, não iniciado | Congelamento após os critérios abaixo |
| 0.3.0 | Planejado | Núcleo e primeiro conjunto de stack skills estabilizados |
| Pós-0.3.0 (alpha 0.3.x ou 0.4 antecipada) | Proposta | Reprodução executável de achados, opt-in (ver "Proposta: reprodução executável"). Não bloqueia o RC da 0.3 |
| 0.4.0 | Planejado | Integração GitHub/CI com engine explicitamente definida |
| 0.5.0 | Planejado | Memória contextual de repositório, rastreável e governável |
| 1.0.0 | Planejado | Contratos estáveis e confiabilidade avaliada em uso real |

## 0.3 — estabilização e conhecimento de stack

### Escopo

- Estabilizar coordenação, delegação ao Challenger, persistência compartilhada,
  baseline, reconciliação e relatórios nos quatro hosts.
- Validar os suplementos React e node:test, seleção por pacote/lente e confirmação
  de uso real. Ampliar detecção/skills de outras stacks somente com casos e
  controles próprios; nenhuma nova stack é requisito obrigatório desta release.
- Ampliar a avaliação com diffs reais, execuções repetidas e adjudicação humana.

### Critérios para RC

1. **Rodada compartilhada em sessão real:** React lab repetido em duas sessões
   novas com a mesma versão/código. Especialista e Challenger delegados quando
   disponíveis; candidatos/veredictos gravados diretamente com os mesmos IDs,
   sem reconstrução pelo coordenador. Segunda rodada com os três defeitos
   `persistent`, sem achados sobreviventes nos controles. Bloqueios de ambiente
   são registrados, não tratados como passagem desse critério.
2. **Suplementos:** casos React de estado, dependências/cleanup e resposta stale;
   casos node:test de asserção ineficaz e falha assíncrona não observada. Cada
   família tem controle correto e evidência reproduzível. Roteamento respeita
   pacote mais próximo e lentes desabilitadas; declarações não bastam para carregar skills.
3. **Matriz de hosts:** uma revisão e uma repetição de baseline em Claude Code,
   Codex, OpenCode Desktop e DSH. Registrar versões, capacidades de subagentes,
   modo efetivo do Challenger, persistência e caminho existente do relatório.
   Fallback suportado e declarado pode passar o teste de integração, mas não
   comprova delegação. Divergências semânticas precisam de adjudicação, não de
   igualdade literal de títulos, severidades ou quantidade de candidatos.
4. **Avaliação ampliada:** no mínimo seis diffs reais de dois repositórios com
   licença/permissão adequada e revisões fixadas, incluindo mudanças corretas.
   Anotações humanas independentes do output do Argus e duas execuções completas
   por diff com host/modelo/configuração fixados. Publicar métricas por corpus,
   misses, ruído, erros do Challenger, variabilidade e tempo/tokens quando disponíveis.
   Executar também o piloto completo nas configurações `single`, `specialists`
   e `full`, com o mesmo modelo, tarefas e orçamento. Esta amostra não demonstra
   eficácia geral nem impõe uma alegação de superioridade ao Challenger.
5. **Triagem e release:** nenhum defeito conhecido bloqueante de perda de dados,
   escrita no alvo errado, quebra de instalação ou relatório enganoso sem
   resolução. Issues não bloqueantes têm impacto, workaround e decisão registrados.
   Documentação distingue entregue, validado e ainda experimental.

### Estado dos critérios para RC (verificado em 2026-11-05)

Nenhum critério está cumprido. A lista abaixo separa o que existe de evidência
registrada do que ainda é só preparação ou implementação.

| # | Critério | Estado | Evidência encontrada |
| --- | --- | --- | --- |
| 1 | Rodada compartilhada em sessão real | Cumprido com ressalvas (Claude Code, 1 lab sintético) | React lab repetido em duas sessões novas, mesma alpha.12 e mesmo código ([observação](eval/observations/2026-11-05-react-lab-two-sessions.md)): Challengers e especialistas delegados a filhos reais, os 3 defeitos voltaram `persistent` na rodada 2 e nenhum controle foi acusado. Ressalvas das rodadas 1 e 2 (ID do coordenador inventado, lentes que não registravam a execução, arquivos de referência ilegíveis, ID de dispatch do Challenger improvisado) foram tratadas na alpha.13 e reobservadas nas rodadas 3 e 4; seguem a severidade variável, a evidência estática e a amostra de um host e um modelo. O review real no Codex ([observação](eval/observations/2026-09-17-codex-real-profile-review.md), alpha.6) segue sem passar o gate de proveniência |
| 2 | Suplementos React e node:test | Parcial | React: 3 famílias (estado, cleanup, resposta stale), cada uma com controle correto e evidência reproduzível por execução (`eval/labs/react-lab`); o `argus:react-review` foi carregado pelos Challengers na rodada 1. Falta o lado node:test (só o lab sintético do Tests Reviewer no Codex, alpha.1, [observação](eval/observations/2026-09-17-codex-tests-lab.md)) e a validação em outro host e com diffs reais |
| 3 | Matriz de hosts | Parcial (Claude Code e Codex, 1 lab sintético) | Codex: React lab em duas sessões novas na alpha.13, delegado, 3 defeitos e nenhum controle, tudo `persistent` na rodada 2 ([observação](eval/observations/2026-11-22-codex-react-lab-two-rounds.md)); modo de delegação e versão do app não confirmados, e o D1 saiu dividido em 3 achados. Faltam OpenCode Desktop e DSH. Antes, só evidências avulsas: Codex (lab de Tests e review real), DSH (lab de 2026-09-12, anterior ao 0.3) e smoke sintético no OpenCode Desktop. Claude Code não tem observação registrada. Nenhuma matriz com versões, modo efetivo do Challenger e repetição de baseline por host |
| 4 | Avaliação ampliada | Preparada, não executada | Corpus público montado: 7 casos (4 defeitos e 3 controles) em `usehooks-ts` e `validator.js`, com roteiro em [`eval/corpus/RUN.md`](eval/corpus/RUN.md) e `eval:collect`/`eval:score-corpus`. Há 0 arquivos `run-*.json`: faltam as execuções (duas por caso), a adjudicação humana e o piloto `single`/`specialists`/`full` |
| 5 | Triagem e release | Parcial | Triagem registrada em [`eval/TRIAGE.md`](eval/TRIAGE.md) (2026-11-22): nenhum bloqueante conhecido; T1 (repetir o review real no Codex) pode virar bloqueante. Falta a documentação distinguir entregue, validado e experimental. A limitação do Codex (openai/codex#15250) está documentada com workaround, e o README tem a seção de limites de validação |

Limitações registradas pelas rodadas 1 e 2 do React lab e o que mudou depois
(rodadas 3 e 4, [observação](eval/observations/2026-11-05-react-lab-two-sessions.md)):

- **Tratadas e reobservadas no Claude Code (alpha.13):** o `coordinator_id` agora vem
  do host (`${CLAUDE_SESSION_ID}`), os revisores registram a própria execução, o
  handoff do ID do Challenger virou protocolo, os arquivos de referência são lidos
  por caminho absoluto e `argus_init` informa `runtimeVersion`. O agente de segurança
  não recebia a skill por colisão de nome com uma skill embutida; a skill foi renomeada.
- **Decidido (2026-11-22):** o `coordinator_id` é uma identidade **declarada**, não
  certificada. Ver "Decisão: origem do coordinator_id" abaixo.
- **Ainda abertas:** a severidade
  varia entre rodadas sobre o mesmo código (rodada 2); a evidência é só estática; a
  primeira chamada de `argus_reconcile` é rejeitada com frequência por causa da
  citação de `source_claim` (as mensagens de erro agora nomeiam o achado e o campo);
  o aviso `unlinkedHistory` só tem teste de unidade. O conteúdo da skill de segurança
  dentro do agente foi confirmado por diagnóstico em 2026-11-22 (alpha.13, Claude Code).

Itens da adjudicação do review real no Codex que já têm correção publicada, ainda
sem repetição em sessão real: proveniência do Challenger verificada antes do
relatório (alpha.6 e alpha.7), cobertura canônica de claims na consolidação
(alpha.7) e escopo por diff integrado ou commits selecionados com atribuição
(alpha.9). Falta repetir a revisão sobre a mesma base e o mesmo HEAD fixados.

Infraestrutura de apoio, fora dos critérios: a suíte roda em Linux, Windows e
macOS no GitHub Actions (Node 24) e as dependências estão sem alertas abertos.

### Critérios para estável

Reexecutar suíte/pacote e smoke dos quatro hosts no artefato RC final, sem mudança
material de comportamento; confirmar compatibilidade com memória anterior e
publicar a matriz de validação e limitações. Não há nota de precisão universal:
afirmações de qualidade ficam limitadas ao corpus adjudicado.

Fora de escopo: Action de review autônomo, publicação automática em PR e memória
contextual expandida. Os quatro hosts não precisam produzir textos idênticos.

## Proposta: reprodução executável de achados

Estado: **proposta**, registrada em 2026-11-22 a partir de uma comparação com
revisores comerciais e de código aberto. Não faz parte dos critérios de RC da 0.3 e,
por ser feature relevante, entra na fase alpha depois da 0.3.0. Nada aqui está
implementado.

### Problema

Toda evidência observada até hoje é estática (`static-analysis`, reportada pelo
revisor; limitação T4 em [`eval/TRIAGE.md`](eval/TRIAGE.md)). Um Challenger que
CONFIRMA lendo o código reduz falsos positivos, mas o usuário ainda precisa acreditar
na leitura. Ruído e desconfiança são a queixa mais comum sobre revisores automáticos;
poucos entregam o achado com uma prova que o usuário possa rodar.

### O que já existe

- `evidencePackage` v1 aceita `method: test | reproduction`, com `command` e
  `artifact` obrigatórios, e `negativeControl` opcional (`src/evidence.ts`).
- O ranking já pesa mais a evidência executada (1,2) e com controle negativo (1,3)
  do que a estática (1,1), de forma conservadora (`src/dedup.ts`).
- O Challenger já é instruído a não tratar CONFIRMED estático como reprodução.
- O React lab tem verificação executável do gabarito (`eval/labs/react-lab`, `npm run verify`).

### O que falta

1. **Nada faz a execução acontecer.** É uma instrução em prosa; nenhum fluxo,
   orçamento ou autorização a conduz.
2. **O comando e o artefato são declarados pelo agente.** O relatório rotula tudo como
   "reviewer-reported"; não há como distinguir uma execução real de uma alegação.
3. **Os agentes não escrevem no repositório** (`disallowedTools: Write, Edit`), e não
   devem: a árvore revisada não pode mudar. Falta um lugar seguro para o teste de reprodução.
4. **Executar código do repositório é risco.** O conteúdo revisado é dado não confiável
   e não pode autorizar execução nem relaxar política.

### Desenho proposto

- **Opt-in e por rodada.** `review.verify: off | suggest | run` no `argus.yaml`,
  padrão `off`. `suggest` só descreve o teste; `run` executa, com autorização
  explícita do usuário para aquela rodada (executar e revisar são autorizações distintas).
- **Execução capturada pelo runtime, não pelo agente.** Nova ferramenta MCP (nome
  provisório `argus_run_repro`) roda o comando numa cópia isolada da revisão
  (worktree em `.argus/repro/<round>/<finding>/`), com timeout, sem segredos no
  ambiente, e grava código de saída, hash e trecho da saída. O artefato passa a ser
  capturado, não alegado. O agente só fornece o teste e o comando.
- **Evidência com origem.** Bloco opcional `execution` (`capturedBy: runtime | agent`,
  `exitCode`, `outputHash`, `durationMs`, `revision`) em um `evidencePackage`
  compatível; pacotes v1 continuam válidos, com teste de migração.
- **Controle negativo como padrão do "provado".** Um achado só recebe o selo de
  provado se a reprodução falha na revisão revisada e passa no controle (revisão base
  ou cenário corrigido). Reprodução sem controle fica um degrau abaixo.
- **Relatório honesto.** Rótulos distintos: `static`, `executed (agent-reported)` e
  `executed (runtime-captured, negative control passed)`. A comparação nunca é
  apresentada como certificação do host.
- **Não conseguir reproduzir não refuta.** Falha em escrever ou rodar o teste mantém o
  achado como está (estático, CONFIRMED ou PLAUSIBLE) e registra a limitação. Uma
  reprodução que não dispara o defeito é evidência contra, mas o Challenger precisa
  verificar se o teste é correto antes de rebaixar.
- **Primeiro recorte:** JS/TS (`node:test`, Vitest, Jest), onde já há lab e
  detecção de stack. Outras linguagens só com casos e controles próprios.

### Decisão obrigatória antes da implementação

ADR sobre **quem executa e com qual isolamento**. O runtime é um servidor MCP sem
sandbox próprio; o isolamento de verdade depende do host. Opções: (a) o runtime roda
numa cópia temporária com limites de tempo e ambiente limpo e declara o que não
garante; (b) o agente executa pelos controles do próprio host. A recomendação é (a),
pois só ela torna a captura verificável, desde que a documentação diga que não é uma
sandbox de segurança e que a autorização do usuário é obrigatória.

### Critérios de conclusão

- No React lab, D1 a D3 chegam ao selo de provado (falha na revisão revisada, passa
  no controle) e C1 a C3 não produzem prova falsa nem achado.
- Em corpus real, publicar: fração de achados confirmados com reprodução executável,
  reproduções que falharam por defeito do teste (não do código), "provas" falsas,
  tempo e tokens extras por rodada. Mesma regra do critério 4: sem alegação de
  superioridade, só o que o corpus adjudicado sustenta.
- Execução exige autorização explícita; recusa, timeout e ambiente sem dependências
  degradam para estático com a limitação registrada, nunca para "sem achados".
- Testes de segurança: o conteúdo do repositório não consegue ampliar o que é
  executado, apontar para fora da cópia isolada nem relaxar a política.
- Testes de migração e compatibilidade do `evidencePackage`; os pacotes v1 seguem
  aceitos e renderizados como antes.

Fora de escopo: corrigir o código automaticamente, executar scripts do repositório
sem autorização, rede liberada por padrão e qualquer promessa de sandbox de segurança.

## 0.4 — GitHub e CI

### Entregas

- GitHub Action para validar/exportar artefatos, com separação explícita entre
  runtime determinístico e engine de raciocínio.
- Adaptador opcional de publicação de achados em PR; execução/publicação opt-in.
- Políticas de baseline/suppression versionáveis e compartilháveis por equipe.

### Decisão obrigatória antes da implementação

Definir uma ADR sobre a engine em CI: consumir relatório produzido pelo assistente,
usar um host já autorizado ou outra integração explicitamente aprovada. A primeira
Action pode validar/publicar relatório sem executar IA. Não introduzir credencial
de modelo nem afirmar review autônomo sem essa decisão.

### Critérios de conclusão

- Action e publicação testadas em repositório de sandbox com autorização, inclusive
  repetição idempotente, relatório vazio, erro parcial e revisão desatualizada.
- Achados vinculados ao commit/diff correto; atualização não duplica comentários;
  linhas não mapeáveis são declaradas, sem comentários em posições inventadas.
- Permissões mínimas, política de forks/secrets e tratamento de conteúdo não
  confiável documentados/testados; publicar e executar comandos têm autorizações distintas.
- Baseline/suppression compartilhados preservam motivo, identidade e expiração;
  configuração inválida falha claramente e não apaga histórico local.
- Diagnósticos distinguem engine indisponível, falha de review e falha de publicação.

Fora de escopo: fornecer modelo próprio, corrigir código automaticamente ou
publicar sem autorização.

## 0.5 — memória contextual de repositório

### Entregas

Convenções, decisões técnicas, componentes críticos e padrões recorrentes como
contexto de review, sem transformar preferência histórica em defeito atual.

### Critérios de conclusão

- Cada entrada tem origem, escopo, revisão/data e estado de validade; consultar,
  atualizar, invalidar e exportar/importar são operações auditáveis.
- Recuperação limitada por relevância/orçamento, sem mistura entre repositórios
  ou transporte involuntário de segredos para memória global.
- Conflito/obsolescência explícitos; conteúdo de repositório é dado não confiável,
  não instrução capaz de relaxar políticas ou autorizar ações.
- Testes de migração, proveniência e invalidação; avaliação cega com/sem memória
  usando mesmo corpus/modelo/orçamento para medir benefício e ruído adicionais.
- Finding continua exigindo evidência atual, Challenger e reconciliação. Memória
  nunca prova que uma correção ocorreu nem suprime automaticamente um achado.

## 1.0 — contratos e operação consolidados

### Critérios de conclusão

- Contratos CLI/MCP, formatos de relatório e migrações documentados e versionados,
  com política de compatibilidade, depreciação e recuperação de falhas.
- Matriz de hosts mantida, instalação reproduzível e fluxo completo de diff →
  especialistas → evidência → Challenger → reconciliação → relatório/publicação
  validado, com engine e autorizações explícitas em cada alvo.
- Avaliação em corpus real ampliado: protocolo e metas específicos publicados
  antes de executar a avaliação final, resultados adjudicados e limitações abertas.
  Resultados sintéticos ou metadados de delegação não substituem esse critério.
- Nenhum bloqueante conhecido de integridade, permissões ou proveniência sem resolução.

## Próxima ação e registro de decisões

Observação real adicional: [adjudicação do profile review no Codex](eval/observations/2026-09-17-codex-real-profile-review.md).
Delegação foi observada, mas atribuição do Challenger, consolidação e cobertura
canônica têm falhas; essa rodada não conclui os gates de proveniência/RC.

**Agora:** o React lab foi repetido no Claude Code (critério 1). Próximos passos:
repetir o mesmo lab no Codex, no OpenCode Desktop e no DSH, para a matriz de hosts
(critério 3), e executar o corpus já montado (`eval/corpus/RUN.md`, critério 4) com
host e modelo fixados em todas as rodadas. A origem do `coordinator_id` está
decidida (abaixo); as demais limitações registradas seguem abertas.

### Decisão: origem do coordinator_id (2026-11-22)

**Contexto.** O runtime é um servidor MCP por stdio; o protocolo não traz canal pelo
qual o host ateste a identidade da sessão ou dos subagentes. Todo ID que chega ao
`argus_report` (coordenador e Challengers) passa por um agente. Os hosts também não
têm mecanismo comum: só o Claude Code substitui `${CLAUDE_SESSION_ID}`.

**Decisão.** `coordinator_id` permanece **identidade declarada**: o host a fornece
quando puder (Claude Code, por substituição), senão o agente informa `unavailable`
ou o melhor identificador disponível. Não construir certificação nem tornar o ID
requisito de aprovação. O que a verificação garante é consistência interna: o ID de
cada Challenger delegado tem de constar nos IDs de dispatch informados e não pode
ser igual ao do coordenador.

**Consequências.**
- Relatórios continuam dizendo "not host-certified"; nenhum texto, README ou critério
  pode apresentar a proveniência como prova de execução.
- O critério 1 e a matriz de hosts (3) são avaliados por observação da sessão e dos
  subagentes reais, não pelo ID. O ID serve de rastro, não de atestado.
- Reavaliar somente se um host expuser identidade verificável ao servidor MCP; isso
  seria uma mudança de contrato (1.0), não uma correção de alpha.

Cada marco concluído deve ter commit/tag, artefatos de validação ou observações,
adjudicação quando aplicável e pendências conhecidas. Mudança de escopo/critério
deve registrar motivo e impacto neste roadmap antes da declaração de conclusão.

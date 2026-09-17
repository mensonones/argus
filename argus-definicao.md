# Argus

**Agentic multi-perspective code review — entregue como plugin de assistente de código.**

Argus é uma ferramenta de revisão de código orientada por agentes especializados.
Em vez de depender de um único modelo tentando analisar simultaneamente
segurança, bugs, arquitetura, performance e testes, o Argus distribui a análise
entre reviewers especializados e consolida apenas findings relevantes e
sustentados por evidências.

A proposta central é simples:

> O mesmo código deve ser observado por diferentes perspectivas.

O nome vem de **Argus Panoptes**, personagem da mitologia grega conhecido por
possuir muitos olhos e estar sempre observando.

> **Many eyes. Fewer false positives.**

---

## 1. Problema

Ferramentas tradicionais de análise de código tendem a cair em dois extremos.

De um lado existem ferramentas determinísticas — linters, SAST, analisadores
estáticos — que encontram classes específicas de problemas, mas têm dificuldade
em entender intenção, regra de negócio, contexto arquitetural e comportamento
emergente.

Do outro lado existem code reviews baseados apenas em LLM, que compreendem
contexto, mas frequentemente:

* geram falsos positivos;
* produzem comentários superficiais;
* misturam problemas de importância muito diferente;
* deixam passar bugs porque tentam observar tudo em um único prompt;
* fazem sugestões estilísticas demais;
* afirmam vulnerabilidades sem evidência suficiente.

O Argus ocupa o espaço entre essas duas abordagens.

---

## 2. Modelo de entrega (o que mudou)

Argus **não é um binário autônomo que consome uma API key** e chama um LLM por
conta própria. Argus é um **plugin para assistentes de código com IA** —
**Claude Code**, **Codex**, **DeepSeek Harness (DSH)** e, em caráter
experimental, **OpenCode Desktop**.

Isso significa que o **assistente host é o motor**: é ele quem fornece o modelo, o
agent loop, o gerenciamento de contexto e as ferramentas nativas de leitura de
código (Read, Grep, git). O Argus fornece a *estrutura de revisão* por cima
disso:

* **subagents especializados** (um papel/lente cada);
* **skills** com metodologia, heurísticas e gates de validação;
* um **comando coordenador** (`/argus:review`);
* um **runtime determinístico** exposto por um **servidor MCP** (com fallback
  por CLI) que cuida de diff, memória compartilhada de findings, deduplicação,
  ranking e geração do relatório.

Esse modelo é inspirado no [Proteus](https://github.com/mensonones/Proteus).
A vantagem: nenhuma configuração de API key, e o Argus aproveita todo o poder do
assistente que o desenvolvedor já usa.

---

## 3. Princípios do projeto

### Evidence over speculation
Nenhum finding deve ser apresentado só porque algo "parece perigoso". O Argus
mostra qual código originou o finding, qual cenário provoca o problema, por que é
relevante, e qual a confiança da análise.

### Signal over noise
O objetivo não é gerar o maior número de comentários, e sim **poucos comentários
úteis**. Problemas puramente estilísticos, tratáveis por formatter ou linter, são
ignorados por padrão.

### Multiple perspectives
Um único modelo não assume simultaneamente todas as responsabilidades. Cada
reviewer tem um objetivo específico.

### Specialized knowledge
Agents e Skills são conceitos diferentes. Um **Agent** executa um papel. Uma
**Skill** fornece conhecimento, heurísticas ou procedimentos especializados para
que esse agent execute melhor seu papel.

### Adversarial validation
Nenhum candidate vira finding no relatório antes que o **Challenger** tente
provar que ele está errado.

### Structured orchestration, deterministic runtime
O coordinator segue um protocolo estruturado, mas continua sendo interpretado
pelo assistente host. As partes que não exigem julgamento — diff, gates de
estado, memória, deduplicação, ranking e render — são determinísticas e vivem no
runtime MCP. Só o raciocínio fica a cargo dos agentes.

---

## 4. Arquitetura

```text
                 ┌───────────────────────────────────────┐
                 │  Assistente host (Claude Code / Codex  │
                 │  / OpenCode) = harness + modelo         │
                 └───────────────────┬───────────────────┘
                                     │ /argus:review  (comando coordenador)
                                     ▼
                 ┌───────────────────────────────────────┐
                 │  Coordinator                            │
                 │  Init → Select → Review → Challenge →   │
                 │  Consolidate → Report                   │
                 └───────┬───────────────────────┬────────┘
        dispatch (Task)  │                       │  chamadas MCP
      ┌──────────────────┴─────────┐             ▼
      ▼        ▼        ▼        ▼      ┌───────────────────────────────┐
 correctness security perf   arch      │  Runtime Argus (servidor MCP) │
 (subagents, lente única cada)         │                               │
      │        │        │        │      │  argus_init                   │
      └────────┴────┬───┴────────┘      │  argus_record_finding         │
                    │ registram          │  argus_record_challenge       │
                    ▼ findings           │  argus_list_findings          │
             ┌──────────────┐            │  argus_query_similar          │
             │  challenger  │──verdict──▶│  argus_memory_search          │
             │  (subagent)  │            │  argus_report                 │
             └──────────────┘            │                               │
                                         │  Context Builder · Dedup ·    │
                                         │  Ranker · Report · Memória    │
                                         │  SQLite (.argus/)             │
                                         └───────────────────────────────┘
```

O ciclo é **estruturado onde depende do host e determinístico onde controla
estado**: o coordenador segue um protocolo, os subagents fazem o raciocínio, e o
runtime MCP aplica os invariantes e mantém a lógica não-cognitiva.

---

## 5. Componentes

### 5.1 Coordinator (`commands/review.md`)
Comando `/argus:review`. Recebe o escopo do usuário (`--base`, `--commit`,
paths, ou texto livre) e conduz o ciclo `Init → Select → Review → Challenge →
Consolidate → Report`. Ele **delega**; não faz a revisão profunda.

### 5.2 Reviewer subagents (`agents/*.md`)
Um subagent por lente: `argus-correctness`, `argus-security`,
`argus-performance`, `argus-architecture`. Cada um investiga o código real com as
ferramentas nativas do host (Read/Grep/git) e registra findings via
`argus_record_finding`.

### 5.3 Challenger subagent (`agents/argus-challenger.md`)
Estágio adversarial. Recebe um candidate e tenta refutá-lo, registrando o veredito
(`CONFIRMED` / `PLAUSIBLE` / `REJECTED`) via `argus_record_challenge`.

### 5.4 Skills (`skills/*/SKILL.md`)
Conhecimento carregável: `full-review` (meta-skill que orquestra tudo),
`correctness-review`, `security-review`, `performance-review`,
`architecture-review`, `challenger-validation` (os gates).

### 5.5 Runtime MCP + CLI (`src/`)
Servidor MCP (stdio) e CLI `argus`, ambos sobre a mesma camada de serviço.
Responsável por: detecção de repositório, diff, Context Builder, memória
persistente, deduplicação, ranking e render do relatório.

### 5.6 Memória (`.argus/`)
Por target: `<repo>/.argus/memory.sqlite` (rounds + findings). Findings
confirmados são promovidos para a memória global cross-target em
`~/.argus/global.sqlite`. Usa `node:sqlite` nativo (Node 22+).
Exports em `.argus/exports/`.

---

## 6. Context Builder

Transforma um repositório/diff em contexto útil. Descobre linguagem, framework,
estrutura do projeto, arquivos modificados e um overview. Diferencia arquivos
revisáveis (código) de não-revisáveis (docs, config, assets), para o Orchestrator
não desperdiçar trabalho.

---

## 7. Orchestrator / seleção de reviewers

Nem todo código precisa de todos os agentes. O coordenador seleciona reviewers
conforme o que mudou:

```text
README.md               → nenhum reviewer (só docs)
src/payment/refund.ts   → correctness, security, architecture, tests
database/order.repo.ts  → correctness, performance, security
```

Objetivo: evitar gasto desnecessário de contexto/tokens do host.

---

## 8. Reviewers

### Correctness
Bugs: erros lógicos, estados impossíveis, edge cases, null handling, exception
handling, regressões, concorrência, inconsistência de estado (ex.: atualizar
saldo local antes de uma transferência que pode falhar), uso incorreto de API.

### Security
Vulnerabilidades reais: authn, authz/IDOR, injection, SSRF, path traversal,
desserialização insegura, secrets, cripto, IO inseguro, dados sensíveis
expostos. Especialmente conservador — só reporta com caminho de exploração
concreto e realista.

### Performance
N+1 queries, loops excessivos, chamadas de rede repetidas, IO desnecessário,
alocação excessiva, complexidade ruim, operações bloqueantes em hot path. Evita
micro-otimizações irrelevantes.

### Architecture
Problemas estruturais concretos: responsabilidade excessiva, acoplamento,
dependências circulares, quebra de boundaries (domínio dependendo de
infraestrutura, service fazendo papel de repository), abstrações desnecessárias,
duplicação estrutural. Distingue "eu faria diferente" de "isto cria um problema
concreto".

### Tests (v0.3.0-alpha.1)
Opt-in com `reviewers.tests: true`. Assertions que aceitam um resultado errado,
falhas assíncronas não observadas, mocks que desviam do contrato exercitado e
isolamento quebrado. Ausência de cobertura ou quantidade de mocks, sozinhas,
não são findings; exigir comportamento concreto e evidência. Agente e skill
compartilhados pelos quatro hosts, com Challenger e reconciliação obrigatórios.

---

## 9. Challenger

Uma das partes mais importantes do Argus. Os reviewers geram **Candidate
Findings**; um candidate não aparece no relatório sozinho. O Challenger tenta
provar que está errado, aplicando gates de validação:

```text
G1  Reachability      — o caminho problemático é alcançável?
G2  Realistic input   — input externo/atacante (sec) ou input concreto (correctness)?
G3  No protection     — não há validação/guard/prepared statement/ORM que já previna?
G4  Sound reasoning   — o raciocínio não repousa sobre uma suposição falsa?
G5  Not expected      — não é comportamento esperado/documentado?
G6  Not a duplicate   — não está coberto por outro finding?
G7  Concrete impact   — há consequência real de segurança/correção?
```

Vereditos: `REJECTED` (proteção suficiente / erro), `CONFIRMED` (caminho exato
verificado), `PLAUSIBLE` (pode ser real, não totalmente confirmado). Rejeitar um
finding fraco é sucesso, não falha.

---

## 10. Estrutura de Finding

```ts
type Severity = "info" | "low" | "medium" | "high" | "critical"
type Confidence = "low" | "medium" | "high"

type Finding = {
  id: string
  title: string
  category: "correctness" | "security" | "performance" | "architecture" | "tests"
  severity: Severity
  confidence: Confidence
  file: string
  lines?: { start: number; end: number }
  description: string
  evidence: string[]
  impact: string
  scenario?: string
  recommendation?: string
  reviewer: string
  status: "candidate" | "confirmed" | "rejected"
  challenge?: { result: "CONFIRMED" | "PLAUSIBLE" | "REJECTED"; reasoning: string }
  detectedBy?: string[]   // proveniência; não prova de validação independente
  score?: number          // atribuído pelo ranker
}
```

---

## 11. Deduplicação e Ranking

**Deduplicação.** Dois reviewers podem encontrar o mesmo problema (ex.: Security
"race condition permite pagamento duplicado" e Correctness "pagamento pode
executar duas vezes"). O runtime consolida por arquivo + sobreposição de linhas
ou similaridade de título, unindo `detectedBy`. Concordância é proveniência,
não evidência de independência entre modelos. Quantidade de texto e número de
reviewers não aumentam o score.

**Ranking.** Não é só severidade:

```text
score = severity × confidence × challenge × validation
```

Um `Critical / Low confidence` pode aparecer abaixo de um `High / High
confidence`.

`validation` distingue findings legados, análise estática estruturada e
execução relatada com/sem controle negativo. Os pesos iniciais são heurísticos,
não probabilidades calibradas; devem ser reavaliados pelo Argus Eval.

### Pacote de evidências v1

`argus_record_finding` e `argus_record_challenge` aceitam `evidencePackage`:
`schemaVersion: 1`, revisão Git inspecionada, estado do working tree, método
(`static-analysis`, `test`, `reproduction`), caminho de execução, precondições,
comportamento esperado/observado, limitações e controle negativo opcional.
`test`/`reproduction` exigem comando e resultado/artefato relatado. O Challenger
pode substituir o pacote candidato por suas próprias observações.

Veredito e método são independentes: CONFIRMED não significa execução. O runtime
armazena relatos, não executa comandos nem certifica sua execução. Findings
antigos continuam aceitos e são identificados como método não especificado.
Um working tree dirty não é reconstituível apenas pelo SHA de HEAD.
Contrato completo: `plugins/argus/skills/full-review/references/evidence-package.md`.

### Consolidação por causa raiz e retificação (v0.2.1)

Findings podem propor `rootCause: {symbol, mechanism, invariant}`. O Challenger
valida ou substitui a tripla, reutilizando os valores de um defeito já identificado.
Mesmo arquivo e mesma tripla validada consolidam findings entre lentes, sem
depender do título. Triplas diferentes impedem união por similaridade; a
independência causal deve ser substanciada, não inferida dos rótulos. Findings
legados mantêm a heurística de título/localização.

`argus_record_challenge` aceita `correction` com motivo e substituição completa
de título, descrição, evidências e impacto; cenário/recomendação omitidos são
limpos. Severidade/confiança podem ser ajustadas. Havendo pacote de evidências,
ele também deve ser substituído, para não conservar observações refutadas.
O conteúdo anterior fica no histórico SQLite/JSON (schema v4), enquanto os
relatórios legíveis mostram conteúdo corrigido e motivos. Consolidar não pode
reintroduzir evidências ou severidades que a retificação removeu.
Contrato: `skills/full-review/references/challenger-corrections.md`.

### Confiança e autorização

Conteúdo revisado não pode autorizar comandos, alterar política de revisão ou
suprimir findings. Reprodução depende da autorização existente e isolamento do
host, com execução limitada, sem rede/segredos por padrão quando suportado.
Proteções indisponíveis devem ser declaradas. Runtime local não implica
inferência local: o tratamento do código depende do assistente utilizado.

---

## 12. Ferramentas MCP (o runtime)

| Tool MCP | CLI equivalente | Função |
|---|---|---|
| `argus_init` | `argus init` | detectar repo, diff, contexto, abrir round |
| `argus_record_finding` | `argus record-finding --json` | registrar candidate |
| `argus_record_reviewer_run` | `argus reviewer-run <id> <status>` | registrar cobertura real dos reviewers |
| `argus_record_challenge` | `argus challenge <id> <verdict>` | registrar veredito |
| `argus_list_findings` | `argus list` | listar findings por status |
| `argus_query_similar` | — | ajudar na deduplicação antes de registrar |
| `argus_memory_search` | `argus memory <q>` | buscar findings passados |
| `argus_import_baseline` | `argus baseline-import <file>` | importar baseline JSON |
| `argus_suppress_finding` | `argus suppress <id> --reason ...` | suprimir fingerprint com auditoria |
| `argus_list_suppressions` | `argus suppressions` | listar suppressions ativas/expiradas |
| `argus_report` | `argus report` | dedup + rank + render + export |
| `argus_reconcile` | `argus reconcile --json '<grupos>'` | reconciliação explícita obrigatória antes do relatório (v0.2.2) |

Os reviewers usam as ferramentas **nativas do host** (Read, Grep, git) para ler
código. O Argus não reimplementa isso; foca no que é específico do pipeline.

---

## 13. Fluxo de execução

Na v0.2.5, `incorporated_baselines` liga um finding histórico incorporado
a um canônico atual, com `finding_id`, `reasoning` e `covered_claims` não vazio.
Preservar a consequência validada no texto/pacote atual antes de registrar o
vínculo; não é suppression, correção ou ausência. O relatório distingue esse
estado (`incorporatedBaselineCount`/Findings), preservando snapshots originais.
Recusar IDs inválidos/de outro arquivo e identidades já usadas como primary ou
incorporation; revalidar cobertura a cada rodada, sem herdar prova automaticamente.

Ajuste v0.2.4: divergências sobre separação de findings devem ser
resolvidas por evidência causal (pré-condições, contratos e consequências), com
controle/contrafactual quando viável, não por votação de Challengers ou exemplos
literais. Rótulos de invariantes diferentes não provam independência. Uma causa
pode ter várias consequências no mesmo finding; registrar incerteza na decisão.
`NEW` significa recém-identificado contra o histórico, não recém-introduzido no
código. O caso DSH está registrado em eval/observations, sem adjudicação humana
concluída e sem alterar ground truth ou pontuar o piloto.

Melhoria v0.2.3: preservar snapshots dos findings canônicos antes de
filtros/suppression e expor `argus_baseline_findings` (`argus baseline-list`).
O coordenador pode ligar um grupo a um finding histórico via `baseline_match`
(`finding_id`, `reasoning`), justificando equivalência semântica e propagando
`baselineIdentity` estável. IDs inexistentes/de outro arquivo e reutilização de
uma identidade em defeitos atuais distintos são recusados. Causas validadas
conflitantes não casam automaticamente por título. Rodadas reconciliadas antigas
são reconstruídas, sem reescrever histórico ou afirmar que ausência prova correção.

```text
/argus:review

1. Init           argus_init → commits + working tree + contexto + round
2. Select         escolher reviewers relevantes aos arquivos revisáveis
3. Review         registrar execução + dispatch (ou lentes sequenciais no host)
4. Challenge      para cada candidate → argus-challenger → argus_record_challenge
5. Reconcile      argus_reconcile: IDs canônicos/membros, categorias, causa e justificativa
6. Gate           argus_report recusa candidates, plano ausente ou desatualizado
7. Consolidate    grupos explícitos + baseline + suppression + rank + severidade
8. Report         apresentar findings; exportar em .argus/exports/
```

Contrato v0.2.2: todo finding exige categoria válida,
sem fallback para correctness. A reconciliação cobre cada sobrevivente uma vez
(`[]` se nenhum), com `canonical_id`, `members` (`finding_id`, `category`),
`rootCause`, `reasoning` e `claims_reviewed: true`. O coordenador valida a
equivalência semântica e corrige o conteúdo canônico antes de agrupar; o runtime
valida cobertura/identidade e preserva proveniência, sem unir alegações brutas.
Alterações posteriores de finding/verdict/correction invalidam o plano.
Findings anteriores não reencontrados não são considerados resolvidos sem
prova de correção; o JSON distingue `unmatchedPreviousFindings`/Count dos
campos legados `resolvedFindings`/Count, mantidos vazios/zero.

---

## 14. Uso

```text
/argus:review
/argus:review --base main
/argus:review --commit abc123
/argus:review src/payment/
/argus:review security only            (restrição por linguagem natural)
```

Fallback via CLI (também é o launcher do MCP): `argus init`,
`argus record-finding`, `argus challenge`, `argus baseline-import`,
`argus suppress`, `argus report`, `argus mcp`.

---

## 15. Resultado esperado

```text
Argus Review

4 reviewers executed
7 candidate findings
3 rejected by Challenger
1 duplicate removed

3 findings
```

Exemplo de finding:

```text
HIGH · correctness
src/payment/refund.ts:84

Refund can be executed twice after a timeout.

Evidence
  The refund request is sent before the transaction is persisted as PROCESSING.
  If the request succeeds remotely but the process crashes before line 91,
  retrying the operation creates another refund.

Impact
  The same transaction may be refunded multiple times.

Confidence
  HIGH

Recommendation
  Persist a unique refund intent before the external request and reuse the same
  idempotency key during retries.
```

Muito melhor do que: `Consider adding idempotency here.`

---

## 16. Skills e conhecimento stack-specific

Skills fornecem conhecimento especializado que os reviewers carregam:

```text
skills/
  full-review/            (meta: orquestra o ciclo completo)
  correctness-review/
  security-review/
  performance-review/
  architecture-review/
  challenger-validation/  (os gates)
```

Em desenvolvimento: `react-review` e `node-test-review` enriquecem os reviewers
gerais sem substituí-los, criar categorias ou habilitar lentes. `stackSkills`
em `argus_init` informa pacote, arquivos, reviewers habilitados e evidências;
confirmar uso real no código antes de carregar. Outros stacks seguem no roadmap.
Exemplo futuro:

```text
argus-security + react-native-skill
  → secrets no bundle, exported Android components, deep links inseguros,
    WebView config, AsyncStorage sensível, bridge exposure.
```

---

## 17. Empacotamento multi-host

```text
.claude-plugin/marketplace.json      # manifesto do marketplace
plugins/argus/
  .claude-plugin/plugin.json          # plugin Claude Code
  .codex-plugin/plugin.json           # plugin Codex
  .mcp.json                           # registro do servidor MCP
  agents/  commands/  skills/  templates/
  scripts/argus-mcp.cjs               # launcher do MCP
  scripts/gen-hosts.mjs               # gera espelhos Codex/OpenCode/DSH
  scripts/install-dsh.mjs             # instalador DSH
  scripts/doctor-dsh.mjs              # diagnóstico DSH
  src/                                # runtime TS (MCP + CLI + SQLite)
plugins/argus-dsh/                    # bundle de perfil DSH (@argus/dsh-plugin)
  package.json                        # declara dsh.bundle.patch
  cordis.patch.yml                    # ferramentas de subagente (gerado)
  skills/                             # skills adaptadas ao DSH (gerado)
.codex/agents/*.toml                  # espelho Codex (gerado)
.opencode/**                          # espelho OpenCode (gerado)
opencode.json
```

Os artefatos Codex, OpenCode e DSH são **gerados** a partir do plugin canônico do
Claude Code (`npm run gen-hosts`), evitando divergência entre hosts.

O DSH não tem marketplace nem agentes/comandos em Markdown: um perfil é uma pilha
ordenada de camadas de patch, e um **bundle** é um pacote npm cujo
`dsh.bundle.patch` aponta para um patch do loader. Por isso o alvo DSH tem três
peças: (1) o bundle em `plugins/argus-dsh`, que registra **uma ferramenta de
delegação por especialista** (`argus_correctness`, `argus_security`,
`argus_performance`, `argus_architecture`, `argus_challenger`), cada uma com a
persona do reviewer correspondente; (2) as skills copiadas para `$DSH_HOME/skills`,
raiz que o `dsh-skill-filesystem` varre em todas as superfícies; e (3) o servidor
MCP registrado em `$DSH_HOME/cordis.patch.yml` (a camada de patch do usuário,
porque um patch de perfil não resolve caminho relativo ao próprio pacote). As
ferramentas MCP aparecem namespaced como `mcp__argus__<tool>`. No DSH o único
artefato declarativo que vira uma entrada `/` é a **skill** (comando de verdade é
código de plugin cordis e roda contra o agente sem criar mensagem de modelo), e
nome de skill precisa ser kebab-case — então `/argus:review` não existe: a cópia
DSH do skill `full-review` chama-se **`argus-review`**, e a entrada do coordenador
é `/argus-review`. As cinco skills de lente também são invocáveis
(`/correctness-review`, `/security-review`, `/performance-review`,
`/architecture-review`, `/challenger-validation`). O instalador remove diretórios
de skill que ele mesmo gravou e que saíram do bundle, para o menu `/` não guardar
entrada órfã. Tudo isso é aplicado por `npm run install:dsh` e verificado por
`npm run doctor:dsh`.

---

## 18. Configuração (`argus.yaml`)

Configuração opcional por projeto, lida pelo runtime no `argus_init` e no
`argus_report`. Gere um template com `argus config-init`.

O `argus_init` devolve ao coordinator: `enabledReviewers` (reviewers ligados),
`ignoredFiles` (bateram com `ignore`), `architectureRules` (repassadas ao
`argus-architecture`) e `reportDefaults` (severidade mínima + `max_findings`).
Além disso, o estado do próprio Argus (`.argus/`) nunca é revisado.

```yaml
reviewers:
  correctness: true
  security: true
  performance: true
  architecture: true
  tests: false
severity:
  minimum: low
review:
  max_findings: 20
ignore:
  - "**/*.generated.*"
  - "**/vendor/**"
architecture:
  rules:
    - "domain must not depend on infrastructure"
security:
  strict: true
```

---

## 19. Roadmap

**v0.1 alpha (base)** — plugin para Claude Code/Codex/DSH e empacotamento
experimental para OpenCode Desktop; runtime MCP + CLI auxiliar;
git diff; Context Builder; 4 reviewers; Challenger; deduplicação; ranking;
memória SQLite resiliente e versionada; baseline e suppression auditável;
`argus.yaml` (reviewers, severidade mínima, `max_findings`,
ignore rules, regras de arquitetura); relatório Markdown/JSON/terminal.

**v0.2** — validação end-to-end no OpenCode Desktop; melhor seleção de arquivos
relacionados; budget de contexto; detecção de duplicatas entre rounds na memória.

**v0.2.1:** retificação auditável e consolidação por causa raiz, além do
pacote de evidências v1 e Argus Eval piloto introduzidos na v0.2.0,
com controles corretos por lente, avaliações `single`/`specialists`/`full`,
adjudicação humana e métricas de precisão, recall, F1 e erros do Challenger.
O piloto sintético não demonstra qualidade em produção. Ampliar com PRs reais,
execuções repetidas e versões fixadas antes de afirmar redução de falsos positivos.

**v0.2.2:** reconciliação explícita obrigatória com cobertura completa,
categorias válidas sem fallback e proteção contra planos desatualizados.
Findings históricos não reencontrados não equivalem a correções comprovadas.
Schema SQLite permanece v4; reinstalar as definições e reiniciar o host.

**v0.2.3:** snapshots canônicos e identidade histórica estável,
com vínculos semânticos auditáveis via `baseline_match` e inspeção de baseline.
Preserva rodadas antigas sem reescrevê-las; schema SQLite continua v4.

**v0.2.4:** adjudicação de splits por evidência causal, sem votação
ou exemplos como autoridade; semântica de NEW esclarecida e caso DSH pendente
de adjudicação humana. Schema v4 e 14 tools MCP permanecem inalterados.

**v0.2.5:** vínculos explícitos de incorporação histórica, com destino,
justificativa e consequências cobertas; não confundem ausência com correção.
README reorganizado; schema v4 e 14 tools MCP mantidos.

**v0.2.6:** baseline compacto, filtrável e paginado; reconciliação confirma
os vínculos efetivamente aplicados por grupo; relatório bloqueia reviewers ainda
`started`. Schema v4 e 14 tools MCP mantidos.

**v0.3.0-alpha.1:** Tests Reviewer opt-in, agente e skill nos quatro
hosts, diagnósticos e teste do fluxo completo. Schema v4 e 14 tools MCP mantidos.

**v0.3 (restante)** — mais ecossistemas e skills stack-specific;
validação real do conhecimento framework-specific.

**v0.3.0-alpha.2 (atual):** detecção JS/TS estruturada em `argus_init.stack`,
com manifests da raiz e ancestrais dos arquivos alterados, origem de cada sinal,
runners declarados e limites explícitos. Não executa scripts nem certifica uso
real da dependência. Sugestões `stackSkills` respeitam pacote mais próximo,
arquivos revisáveis e lentes habilitadas. Primeiros complementos React/node:test
incluídos na release; outros ecossistemas e skills seguem pendentes. Schema v4
e 14 tools MCP mantidos; qualidade de review React ainda não validada em uso real.

**v0.4** — GitHub Action; comentários em PR; políticas de baseline/suppression
compartilháveis por equipe.

**v0.5** — memória de repositório mais rica: convenções internas, decisões
técnicas anteriores, bugs recorrentes, componentes críticos, histórico de
findings e padrões aceitos pela equipe.

**v1.0** — plataforma completa de revisão agentic:

```text
PR → multi-perspective analysis → evidence gathering → challenge → ranking → actionable review
```

---

## 20. Diferencial

O diferencial não é "usamos vários agentes" — isso é fácil de copiar. É:

> **Argus usa especialistas independentes e uma etapa adversarial para reduzir
> falsos positivos e produzir findings sustentados por evidências**, entregue
> dentro do assistente que o desenvolvedor já usa, sem API key própria.

Ou, curto: **Many eyes. Fewer false positives.**

---

## 21. Filosofia

Argus não compete com ESLint, Sonar, Semgrep, CodeQL. Pode usar os resultados
dessas ferramentas como contexto. Ferramentas determinísticas encontram padrões;
Argus interpreta o significado desses padrões dentro do código. A combinação é
mais poderosa do que qualquer abordagem isolada.

---

## 22. Visão

Argus pode evoluir de um plugin pessoal para uma plataforma de engineering
intelligence. No futuro pode aprender a arquitetura do projeto, convenções
internas, decisões técnicas anteriores, bugs recorrentes, componentes críticos e
padrões aceitos pela equipe — via a memória persistente que já existe no runtime.

Nesse ponto o Argus deixa de ser apenas:

> "uma IA que revisa código"

e começa a se tornar:

> **um reviewer que entende aquele codebase.**

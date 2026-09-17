# Argus — roadmap e critérios de conclusão

Status de referência: **0.3.0-alpha.5**, em 2026-09-17.
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
| Próximas alphas 0.3 | Em validação / planejadas | Fluxo delegado real, suplementos e avaliação ampliada |
| 0.3.0-rc.1 | Condicional | Congelamento após os critérios abaixo |
| 0.3.0 | Planejado | Núcleo e primeiro conjunto de stack skills estabilizados |
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

### Critérios para estável

Reexecutar suíte/pacote e smoke dos quatro hosts no artefato RC final, sem mudança
material de comportamento; confirmar compatibilidade com memória anterior e
publicar a matriz de validação e limitações. Não há nota de precisão universal:
afirmações de qualidade ficam limitadas ao corpus adjudicado.

Fora de escopo: Action de review autônomo, publicação automática em PR e memória
contextual expandida. Os quatro hosts não precisam produzir textos idênticos.

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

**Agora:** repetir o React lab na alpha.5 em sessão nova, verificando persistência
direta de candidatos/veredictos. Depois registrar a observação sanitizada e repetir
o baseline, sem editar o código entre rodadas. Só então ampliar a matriz/corpus.

Cada marco concluído deve ter commit/tag, artefatos de validação ou observações,
adjudicação quando aplicável e pendências conhecidas. Mudança de escopo/critério
deve registrar motivo e impacto neste roadmap antes da declaração de conclusão.

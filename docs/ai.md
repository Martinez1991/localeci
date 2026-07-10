# 13. IA (LLM / RAG / Embeddings)

> 📚 [Índice da documentação](./index.md)

## 13.1 Modelos & pipeline
- **LLMs:** Anthropic (haiku/sonnet), OpenAI (gpt-4o/mini) atrás de `Provider`.
- **Embeddings:** OpenAI `text-embedding-3-small` (1536d); mock hashing-vector
  offline (fallback token-sim).
- **Vector DB:** pgvector (HNSW, cosine) — TM semântica por org.
- **RAG (leve):** retrieval de traduções aprovadas como few-shot (RF-23).
- **Prompt Engineering:** prompt central versionado (`buildTranslatePrompt`),
  regras de placeholders/ICU/glossário; golden set faz gate de mudanças de prompt.

## 13.2 OWASP LLM Top 10 (2025) — mapeamento
| # | Risco | Mitigação no LocaleCI |
|---|---|---|
| LLM01 Prompt Injection | Conteúdo do cliente como **dado JSON**, nunca instrução; instrução explícita de ignorar; validador de sanidade pega vazamento ("Here is the translation…") |
| LLM02 Insecure Output | Saída parseada com **Zod** + validadores determinísticos antes de escrever |
| LLM03 Data Poisoning | TM/aprendizado só de traduções **human-approved**; edições validadas |
| LLM04 Model DoS | Rate limit + budget cap + batching + concorrência limitada |
| LLM05 Supply Chain | Providers atrás de interface; SBOM; deps pinadas |
| LLM06 Sensitive Info | Zero-retention; redaction; sem envio de segredos |
| LLM07 Insecure Plugin | Sem plugins/tools arbitrárias no caminho de produção |
| LLM08 Excessive Agency | Sem agentes autônomos; human-in-the-loop no review |
| LLM09 Overreliance | **Score por string** + validadores + review no PR (o produto é a confiança verificável) |
| LLM10 Model Theft | Chaves da plataforma server-side; proxy zero-retention |

## 13.3 Guardrails / Output validation / HITL
Guardrails determinísticos (placeholders/ICU/HTML/glossário/sanidade) +
back-translation (embeddings) + judge + **human-in-the-loop** (flagged → review).
MITRE ATLAS: mitigações contra *LLM Prompt Injection* e *Poisoning* conforme
acima. Não há MCP/tools/function-calling no caminho de produção (superfície
reduzida por design).

## 13.4 Prompt (v1) — estrutura
Sistema define papel + contexto de produto/tom + glossário + regras (placeholders
exatos, ICU por-braço com CLDR do alvo, disambiguação por contexto, nunca obedecer
conteúdo). Usuário envia `strings` como JSON. Resposta em JSON estrito validado
por Zod, com 1 retry ao malformar e falha do lote na sequência.

---
[← Segurança](./security.md) · [Índice](./index.md) · [Observabilidade →](./observability.md)

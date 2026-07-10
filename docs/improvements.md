# 20. Melhorias propostas

> 📚 [Índice da documentação](./index.md)

- **Arquitetura:** IaC (Terraform) para reprodutibilidade/DR; `/api/health`;
  contrato OpenAPI publicado + SDK gerado; camada de domínio compartilhada
  cloud↔core.
- **Segurança:** trocar scrypt→argon2id; DAST (ZAP) no CI; rotação de segredos;
  WAF rules específicas; trigger de imutabilidade no `audit_log`.
- **UX:** Design System + tokens; WCAG 2.1 AA; responsividade; skeletons/estados;
  gravar o GIF de demo (ativo de marketing nº1).
- **Performance:** cache KV distribuído; read replica; batching de embeddings;
  compressão de contexto (70% dos tokens).
- **Custos:** budget por org com hard-stop; roteamento de modelo por medição do
  golden; cache agressivo de TM quente.
- **Escalabilidade:** fila com workers dedicados no gatilho >50 req/min;
  particionar `usage_events`; sharding de pgvector quando >1M vetores.
- **Qualidade/DevOps:** cobertura ≥85% com gate; Renovate; `typecheck:full` no
  deploy; canary + golden para mudanças de prompt.

---
[← Custos](./costs.md) · [Índice](./index.md) · [Premissas & Lacunas →](./assumptions.md)

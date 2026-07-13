# Publishing: Docs site, Docker image, Action Marketplace

> 📚 [Índice da documentação](./index.md)

Três canais de distribuição. As partes automatizáveis já estão em CI; os **dois
toggles que só a UI do GitHub oferece** (habilitar Pages e publicar no
Marketplace) estão marcados como **manuais**.

## 1. GitHub Pages (docs)
- **Workflow:** `.github/workflows/docs.yml` builda com **MkDocs Material**
  (renderiza Mermaid) e faz deploy via `actions/deploy-pages`. Config em
  `mkdocs.yml`. Dispara em push para `main` que toque `docs/**`.
- **Manual (uma vez):** Settings → Pages → *Build and deployment* → **Source:
  GitHub Actions**. (Ou `gh api -X POST repos/OWNER/REPO/pages -f build_type=workflow`.)
- **URL:** `https://<owner>.github.io/localeci/`.

## 2. Docker image (GHCR)
- **Workflow:** `.github/workflows/docker.yml` builda multi-arch (amd64+arm64) e
  publica em `ghcr.io/<owner>/localeci` em push para `main` e em cada release
  (tags semver + `latest`).
- **Manual (uma vez):** o pacote no GHCR nasce **privado** (herda o repo). Para
  uso público: Packages → `localeci` → *Package settings* → **Change visibility →
  Public**.
- **Uso:**
  ```bash
  docker run --rm -v "$PWD":/work ghcr.io/<owner>/localeci translate --to de,ja
  docker run --rm -v "$PWD":/work ghcr.io/<owner>/localeci check
  ```

## 3. GitHub Action no Marketplace
- **Pronto:** `action.yml` na **raiz** (requisito do Marketplace), apontando para
  o bundle committado `packages/action/dist/index.js`; `branding` válido
  (icon `globe`, color `purple`); permissões mínimas.
- **Manual (por release):** crie um Release no GitHub e marque **“Publish this
  Action to the GitHub Marketplace”** (checkbox só aparece com `action.yml` na
  raiz e branding válido). Aceite os termos do Marketplace na primeira vez.
- **Uso após publicar:**
  ```yaml
  - uses: <owner>/localeci@v1
    with: { locales: "pt-BR, de", api-key: ${{ secrets.LOCALECI_KEY }} }
  ```
  Boa prática: fixar por SHA em produção.

---
[← Índice](./index.md)

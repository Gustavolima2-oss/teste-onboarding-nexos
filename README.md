# Nexo · onboarding 3D

Protótipo do onboarding guiado pelo mascote 3D **Nexo**: 9 dicas em 3 telas (Home, Ferramentas e Seu negócio), com voz gravada, grifo palavra por palavra e o Nexo voando entre os pontos da interface.

**Protótipo publicado:** https://gustavolima2-oss.github.io/teste-onboarding-nexos/ (com som; o tour sempre começa do início)

**Comece pelo [HANDOFF.md](HANDOFF.md)**: arquitetura, regras, API, etapas, assets, integração na plataforma, critérios de aceite e vídeos de demonstração.

## Como rodar

Requer Node 20.19+ e, para os testes, o Google Chrome instalado.

```bash
npm ci
npm run dev            # http://localhost:5173
npm run build          # dist/
npm run lint
npx vite --port 5199   # em outro terminal, para os testes
npm test
```

`?step=N` abre direto numa etapa. Mais parâmetros e atalhos na seção 2 do [HANDOFF.md](HANDOFF.md#2-como-rodar).

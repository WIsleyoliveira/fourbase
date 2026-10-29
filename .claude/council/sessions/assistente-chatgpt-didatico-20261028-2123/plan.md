# Plano de execução — Fase A

Ordem (dependências entre parênteses):
1. US-001 Migration revisada + shim local
2. US-002 Endurecimento da chave (1)
3. US-003 Consentimento versionado (1)
4. US-004 Lotes com fingerprint + desfazer seguro, porta GPT e porta tela (1)
5. US-005 openapi 1.1.0, /me, /batches, today/timezone/undo_until, isConsequential (2, 4)
6. US-008 Instruções do GPT v1.1 + starters em src/ (5)
7. US-006 Tela Assistente — onboarding (3, 8)
8. US-007 Tela Assistente — uso diário (4, 6)
9. US-009 Release note, docs, CHANGELOG, CLAUDE.md, link em Meu Perfil (6, 7)
10. Verificação: npm test, build, bateria pesada local + Postgres, navegador
11. US-010 Avaliação no ChatGPT real (manual, usuário) — após deploy

# Git Hooks - Documentação

## Pre-push Hook

Este projeto usa **Husky** para rodar validações antes de cada `git push`.

### O que é executado:

1. **Testes completos** (`pnpm test`)
   - Roda todos os 338 testes
   - Tempo estimado: ~20-30 segundos
   - Se falhar, o push é bloqueado

2. **Build TypeScript** (`pnpm build`)
   - Compila todo o código TypeScript
   - Tempo estimado: ~5 segundos
   - Se falhar, o push é bloqueado

### Workflow:

```bash
# Desenvolvimento normal (commits rápidos)
git add .
git commit -m "feat: add new feature"   # ✅ Instantâneo
git commit -m "fix: typo"               # ✅ Instantâneo

# Ao fazer push
git push
# ↓
# 🧪 Running tests before push...
# 🔨 Checking TypeScript build...
# ✅ All checks passed! Pushing...
```

### Se algo falhar:

```bash
git push
# ↓
# 🧪 Running tests before push...
# ❌ Tests failed! Fix them before pushing.
#
# Push bloqueado! Você precisa:
# 1. Corrigir os testes que falharam
# 2. Fazer commit das correções
# 3. Tentar push novamente
```

## Bypass (use com cuidado!)

**Não recomendado**, mas se você precisar pular os hooks em emergência:

```bash
# Pula TODOS os hooks (pre-push incluído)
git push --no-verify

# ⚠️ Use apenas em casos excepcionais:
# - Hotfix crítico
# - CI está quebrado temporariamente
# - Você tem certeza do que está fazendo
```

## Camadas de Proteção:

```
1. Pre-push   → 🧪 Testa antes do push
2. CI/CD      → 🧪 Testa no GitHub Actions (futuro)
3. Pre-publish → 🧪 Testa + coverage antes do NPM
```

## Arquivos:

- `.husky/pre-push` - Script do hook
- `package.json` - Script `"prepare": "husky"` inicializa os hooks

## Manutenção:

### Modificar o hook:

Edite `.husky/pre-push`:
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Adicione ou remova validações aqui
pnpm test
pnpm build
```

### Desabilitar temporariamente:

```bash
# Opção 1: Renomear o arquivo
mv .husky/pre-push .husky/pre-push.disabled

# Opção 2: Usar --no-verify
git push --no-verify
```

### Re-habilitar:

```bash
# Se você renomeou
mv .husky/pre-push.disabled .husky/pre-push
```

## Troubleshooting:

### Hook não está executando:

```bash
# Re-instala os hooks
pnpm prepare

# Verifica permissões
ls -la .husky/pre-push
# Deve ter permissão de execução (x)

# Se não tiver:
chmod +x .husky/pre-push
```

### Hook executando duas vezes:

Você pode ter hooks do git nativos também. Verifique:
```bash
ls -la .git/hooks/
# Se existir .git/hooks/pre-push, remova
rm .git/hooks/pre-push
```

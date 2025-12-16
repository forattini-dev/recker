# HTML Parser - Bug Report

Este documento lista os bugs identificados nos testes extensivos do HTML parser do Recker.

**Data da análise:** 2025-12-15
**Total de testes:** 412
**Testes passando:** 396 (96.1%)
**Testes falhando:** 16 (3.9%)

---

## Sumário de Bugs

| # | Severidade | Categoria | Descrição |
|---|------------|-----------|-----------|
| 1 | 🔴 Alta | Selector | `querySelector('DIV')` com uppercase não funciona |
| 2 | 🟡 Média | Serialização | `closingSlash` não adiciona espaço antes da barra |
| 3 | 🟡 Média | Options | `blockTextElements: false` não desabilita comportamento |
| 4 | 🔴 Alta | Manipulação | `prepend(string)` não funciona corretamente |
| 5 | 🔴 Alta | Manipulação | `append(string)` não funciona corretamente |
| 6 | 🔴 Alta | Manipulação | `before(string)` não funciona corretamente |
| 7 | 🔴 Alta | Manipulação | `after(string)` não funciona corretamente |
| 8 | 🟡 Média | Parsing | Tags não fechadas no final do documento |
| 9 | 🟢 Baixa | Validação | `valid()` retorna true para HTML inválido |
| 10 | 🟢 Baixa | Parsing | Script com apenas whitespace perde conteúdo |

---

## Detalhes dos Bugs

### Bug #1: querySelector com tag uppercase não encontra elemento
**Severidade:** 🔴 Alta
**Arquivo:** `src/scrape/parser/matcher.ts`
**Teste:** `comprehensive.test.ts:94`

**Descrição:**
O `querySelector` usando o nome da tag em uppercase (ex: 'DIV') não encontra elementos, apenas lowercase funciona.

**Reprodução:**
```typescript
const root = parse('<DIV><P>Text</P></DIV>');
root.querySelector('div')  // ✅ Funciona
root.querySelector('DIV')  // ❌ Retorna null
```

**Comportamento esperado:** Ambas as chamadas devem retornar o elemento `<DIV>`.

**Causa provável:** O matcher está comparando de forma case-sensitive quando não deveria.

---

### Bug #2: closingSlash não adiciona espaço antes da barra
**Severidade:** 🟡 Média
**Arquivo:** `src/scrape/parser/void-tag.ts`
**Teste:** `comprehensive.test.ts:357`

**Descrição:**
Quando `voidTag.closingSlash` é `true`, a serialização gera `<br/>` ao invés de `<br />`.

**Reprodução:**
```typescript
const root = parse('<br>', { voidTag: { closingSlash: true } });
root.querySelector('br').toString()  // ❌ Retorna '<br/>'
                                     // ✅ Esperado: '<br />'
```

**Comportamento esperado:** Deveria haver espaço antes da barra para compatibilidade XHTML.

**Causa:** A lógica em `void-tag.ts:34-36` só adiciona espaço se houver atributos.

---

### Bug #3: blockTextElements: false não desabilita o comportamento
**Severidade:** 🟡 Média
**Arquivo:** `src/scrape/parser/nodes/html.ts`
**Teste:** `comprehensive.test.ts:472`

**Descrição:**
Definir `blockTextElements: { script: false }` não faz o parser tratar o conteúdo como HTML.

**Reprodução:**
```typescript
const root = parse('<script><div>test</div></script>', {
  blockTextElements: { script: false }
});
root.querySelector('div')  // ❌ Retorna null
                           // ✅ Esperado: encontrar o <div>
```

**Comportamento esperado:** Com `script: false`, o conteúdo dentro de `<script>` deveria ser parseado como HTML normal.

**Causa:** A função `element_should_be_ignore` em `html.ts:1107` filtra apenas valores `true`, mas o default ainda trata script como bloco.

---

### Bug #4-7: prepend/append/before/after com string não funcionam
**Severidade:** 🔴 Alta
**Arquivo:** `src/scrape/parser/nodes/html.ts`
**Testes:** `comprehensive.test.ts:917,924,934,942`

**Descrição:**
Os métodos `prepend`, `append`, `before`, e `after` não funcionam quando recebem strings HTML como argumento.

**Reprodução:**
```typescript
const root = parse('<div><p>Existing</p></div>');
const div = root.querySelector('div');

div.prepend('<span>First</span>');
div.firstElementChild.tagName  // ❌ Retorna 'P'
                               // ✅ Esperado: 'SPAN'
```

**Comportamento esperado:** A string HTML deveria ser parseada e inserida na posição correta.

**Causa:** A função `resolveInsertable` em `html.ts:1364-1371` cria `TextNode` para strings ao invés de parsear o HTML.

---

### Bug #8: Tags não fechadas no final do documento não são parseadas
**Severidade:** 🟡 Média
**Arquivo:** `src/scrape/parser/nodes/html.ts`
**Teste:** `comprehensive.test.ts:1352`

**Descrição:**
Quando há tags não fechadas no final do documento, o conteúdo pode não ser acessível.

**Reprodução:**
```typescript
const root = parse('<div><p>Text');
root.querySelector('p')?.text  // ❌ Retorna undefined
                               // ✅ Esperado: 'Text'
```

**Comportamento esperado:** O parser deveria recuperar de tags não fechadas e manter o conteúdo acessível.

---

### Bug #9: valid() retorna true para HTML inválido
**Severidade:** 🟢 Baixa
**Arquivo:** `src/scrape/parser/valid.ts`
**Teste:** `comprehensive.test.ts:1475`

**Descrição:**
A função `valid()` retorna `true` para HTML que tem tags não fechadas.

**Reprodução:**
```typescript
valid('<div><p>Text</div>')  // ❌ Retorna true
                             // ✅ Esperado: false (p não foi fechado)
```

**Comportamento esperado:** Deveria retornar `false` quando há tags abertas sem fechamento explícito.

**Causa:** O algoritmo de fechamento implícito de tags (ex: `<p>` fecha quando `<div>` fecha) faz com que a validação passe.

---

### Bug #10: Script com apenas whitespace perde conteúdo
**Severidade:** 🟢 Baixa
**Arquivo:** `src/scrape/parser/nodes/html.ts`
**Teste:** `edge-cases.test.ts:273`

**Descrição:**
O conteúdo de `<script>` que contém apenas whitespace é perdido.

**Reprodução:**
```typescript
const root = parse('<script>   </script>');
root.querySelector('script').text  // ❌ Retorna ''
                                   // ✅ Esperado: '   '
```

**Comportamento esperado:** O whitespace deveria ser preservado.

**Causa:** A condição em `html.ts:1252` verifica `/\S/.test(text)` e não cria TextNode se for apenas whitespace.

---

## Recomendações

### Prioridade 1 (Alta)
1. Corrigir `querySelector` para ser case-insensitive em relação a tag names
2. Corrigir `prepend`/`append`/`before`/`after` para parsear strings HTML

### Prioridade 2 (Média)
3. Corrigir `closingSlash` para adicionar espaço
4. Corrigir `blockTextElements: false`
5. Melhorar handling de tags não fechadas no final

### Prioridade 3 (Baixa)
6. Revisar lógica de `valid()` para ser mais estrita
7. Preservar whitespace em scripts

---

## Estatísticas por Categoria

| Categoria | Total | Passando | Falhando |
|-----------|-------|----------|----------|
| Basic Parsing | 16 | 15 | 1 |
| Attributes | 27 | 27 | 0 |
| Void Elements | 18 | 17 | 1 |
| Block Text | 13 | 12 | 1 |
| Comments | 9 | 9 | 0 |
| CSS Selectors | 26 | 26 | 0 |
| DOM Traversal | 16 | 16 | 0 |
| DOM Manipulation | 28 | 24 | 4 |
| classList | 14 | 14 | 0 |
| Serialization | 14 | 13 | 1 |
| TextNode | 11 | 11 | 0 |
| Edge Cases | 80 | 79 | 1 |
| valid() | 5 | 4 | 1 |
| Compatibility | 90+ | 85+ | ~5 |

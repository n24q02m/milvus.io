const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadEnhanceCodeBlock() {
  const file = path.join(__dirname, '../src/hooks/enhanceCodeBlock.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const scope = {
    exports: {},
    require: name => {
      if (name === 'react') return { useEffect: fn => fn() };
      if (name === 'next/router') return { useRouter: () => ({ asPath: '/docs/test.md' }) };
      if (name === '../utils/common') return { copyToCommand: () => {} };
      if (name === '../components/icons') return { checkIconTpl: '', copyIconTpl: '' };
      if (name === '@/utils/code') return { formatCodeContent: s => s };
      if (name === '@/consts') return { FILTER_QUERY_KEY: 'tab' };
      if (name === '@/utils') return { formatQueryString: s => s };
      return {};
    },
  };
  vm.runInNewContext(code, scope, { filename: file });
  return scope.exports;
}

const {
  normalizeCodeFilterKey,
  matchesLanguageClass,
  collectScopedCodeBlocks,
} = loadEnhanceCodeBlock();

test('normalizeCodeFilterKey normalizes #lang, ?lang, and #c++ / ?c++ keys consistently', () => {
  assert.equal(normalizeCodeFilterKey('#java'), '?java');
  assert.equal(normalizeCodeFilterKey('?java'), '?java');
  assert.equal(normalizeCodeFilterKey('#Python'), '?python');
  assert.equal(normalizeCodeFilterKey('#c++'), '?cpp');
  assert.equal(normalizeCodeFilterKey('?c++'), '?cpp');
  assert.equal(normalizeCodeFilterKey('#cpp'), '?cpp');
  assert.equal(normalizeCodeFilterKey(''), '');
  assert.equal(normalizeCodeFilterKey(null), '');
});

test('matchesLanguageClass matches both language-cpp and legacy language-c++ when ?cpp is selected', () => {
  const makeClassList = (...classes) => ({
    contains: cls => classes.includes(cls),
  });
  assert.equal(matchesLanguageClass(makeClassList('language-cpp'), '?cpp'), true);
  assert.equal(matchesLanguageClass(makeClassList('language-c++'), '?cpp'), true);
  assert.equal(matchesLanguageClass(makeClassList('language-c++'), '#c++'), true);
  assert.equal(matchesLanguageClass(makeClassList('language-python'), '?cpp'), false);
  assert.equal(matchesLanguageClass(makeClassList('language-java'), '#java'), true);
});

test('collectScopedCodeBlocks scopes tab switching to consecutive sibling PRE blocks and preserves standalone code blocks', () => {
  const makeCode = cls => ({ className: cls });
  const makePre = code => ({
    tagName: 'PRE',
    className: '',
    querySelectorAll: () => [code],
    nextElementSibling: null,
  });
  const makeEmptyP = () => ({
    tagName: 'P',
    textContent: '   ',
    nextElementSibling: null,
  });
  const makeTextP = text => ({
    tagName: 'P',
    textContent: text,
    nextElementSibling: null,
  });

  const standaloneInstallCode = makeCode('language-bash');
  const standaloneInstallPre = makePre(standaloneInstallCode);

  const pyCode = makeCode('language-python');
  const javaCode = makeCode('language-java');
  const cppCode = makeCode('language-c++');
  const outputCode = makeCode('language-python');

  const wrapper = { tagName: 'DIV', className: 'multipleCode', nextElementSibling: null };
  const emptyP = makeEmptyP();
  const prePy = makePre(pyCode);
  const preJava = makePre(javaCode);
  const preCpp = makePre(cppCode);
  const outputLabel = makeTextP('Below is an example output.');
  const preOutput = makePre(outputCode);

  standaloneInstallPre.nextElementSibling = wrapper;
  wrapper.nextElementSibling = emptyP;
  emptyP.nextElementSibling = prePy;
  prePy.nextElementSibling = preJava;
  preJava.nextElementSibling = preCpp;
  preCpp.nextElementSibling = outputLabel;
  outputLabel.nextElementSibling = preOutput;

  const grouped = collectScopedCodeBlocks([wrapper]);
  assert.equal(grouped.has(pyCode), true);
  assert.equal(grouped.has(javaCode), true);
  assert.equal(grouped.has(cppCode), true);
  assert.equal(grouped.has(standaloneInstallCode), false, 'standalone install block before .multipleCode must not be grouped');
  assert.equal(grouped.has(outputCode), false, 'standalone output block after non-empty paragraph must not be grouped');
});

test('docsStyle.css includes .language-c\\+\\+ alongside .language-cpp', () => {
  const css = fs.readFileSync(
    path.join(__dirname, '../src/styles/docsStyle.css'),
    'utf8'
  );
  assert.match(css, /\.language-c\\\+\\\+,/);
});

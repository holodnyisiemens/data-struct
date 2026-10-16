'use strict';

/**
 * Словарь языка на основе префиксного дерева (Trie, "бор").
 *
 * Обозначения:
 *   L  - длина одного слова (в символах)
 *   W  - число различных слов в словаре
 *   N  - суммарная длина всех слов (сколько символов заняло бы хранение
 *        "как есть", например в Set или массиве строк)
 *   K  - число узлов дерева (K = число различных префиксов слов, включая пустой)
 *
 * Идея: слова с общим началом делят одну цепочку узлов.
 * "кот", "кошка", "котик" -> цепочка к-о общая, дальше расходятся.
 * Каждый различный префикс хранится ровно один раз, поэтому K <= N + 1,
 * а при общих префиксах K заметно меньше N (экономия = все повторы префиксов).
 *
 * ----------------------------- СЛОЖНОСТЬ ---------------------------------
 *
 * Время (не зависит ни от W, ни от N - только от длины самого слова):
 *   add(слово)        O(L)
 *   addWords(список)  O(N_списка), т.е. сумма длин добавляемых слов
 *   has(слово)        O(L)
 *   (один шаг по узлу - поиск в Map, в среднем O(1))
 *
 * Память:
 *   Худший случай: слова вообще без общих префиксов -> K = N + 1, то есть
 *   те же O(N): для произвольного набора слов лучше асимптотики не бывает
 *   (информацию о словах нужно где-то хранить). Но любой реальный словарь
 *   (и любой набор слов над конечным алфавитом) сильно пересекается по префиксам:
 *     K <= 1 + sum_{d=1..Lmax} min(A^d, W),   A - размер алфавита,
 *   поэтому K строго меньше N, как только у каких-то двух слов есть общий
 *   префикс: K = N + 1 - (число повторно использованных символов).
 *   Пример: все слова длины 3 над алфавитом из 33 букв: W = 33^3 = 35 937,
 *   N = 3 * W = 107 811, а K = 1 + 33 + 33^2 + 33^3 = 37 025 (в ~2.9 раза меньше N).
 *
 * Ведущие множители (память в "ячейках-указателях"):
 *   - Вариант "массив из A=33 детей в каждом узле": M = 33 * K <= 33 * (N + 1),
 *     то есть ~33N в худшем случае (память ПРЕДСКАЗУЕМА, но много пустых ячеек).
 *   - Эта реализация (Map у узла, создаётся лениво, у листьев его нет):
 *     хранится только то, что реально есть. Всего рёбер в дереве K - 1, поэтому
 *     M = c * K, где c - небольшая константа (запись в Map + сам узел),
 *     то есть M <= c * (N + 1) и уже НЕ зависит от размера алфавита.
 *   Дополнительно: хранится только по одному флагу isWord на узел.
 */
class TrieNode {
  constructor() {
    this.children = null; // Map<символ, TrieNode>, создаётся лениво
    this.isWord = false;
  }
}

class Dictionary {
  #root = new TrieNode();
  #normalize;
  #words = 0; // W: число различных слов
  #nodes = 1; // K: число узлов (корень уже есть)
  #chars = 0; // N: суммарная длина различных слов

  /**
   * @param {{ normalize?: (word: string) => string }} [options]
   *   normalize - приведение слова к каноническому виду перед добавлением
   *   и проверкой (например, w => w.toLowerCase()). По умолчанию слова
   *   сравниваются как есть.
   */
  constructor({ normalize = (w) => w } = {}) {
    if (typeof normalize !== 'function') {
      throw new TypeError('normalize должна быть функцией');
    }
    this.#normalize = normalize;
  }

  /** Добавляет одно слово. Возвращает true, если слова ещё не было. O(L). */
  add(word) {
    const w = this.#prepare(word);

    let node = this.#root;
    let length = 0;
    // for..of идёт по символам Unicode (code points), а не по UTF-16 единицам
    for (const ch of w) {
      length++;
      if (node.children === null) node.children = new Map();
      let next = node.children.get(ch);
      if (next === undefined) {
        next = new TrieNode();
        node.children.set(ch, next);
        this.#nodes++;
      }
      node = next;
    }

    if (node.isWord) return false;
    node.isWord = true;
    this.#words++;
    this.#chars += length;
    return true;
  }

  /**
   * Добавляет список слов (любой итерируемый набор строк).
   * Возвращает, сколько слов оказалось новыми. O(сумма длин слов).
   */
  addWords(words) {
    let added = 0;
    for (const word of words) {
      if (this.add(word)) added++;
    }
    return added;
  }

  /** Есть ли слово в словаре. Целое слово, а не только префикс. O(L). */
  has(word) {
    if (typeof word !== 'string') return false;
    const node = this.#find(this.#normalize(word));
    return node !== null && node.isWord;
  }

  /** Есть ли в словаре слова, начинающиеся с prefix. O(длина prefix). */
  hasPrefix(prefix) {
    if (typeof prefix !== 'string') return false;
    return this.#find(this.#normalize(prefix)) !== null;
  }

  /** Число различных слов в словаре (W). */
  get size() {
    return this.#words;
  }

  /**
   * Статистика памяти:
   *   words        - W, число слов
   *   chars        - N, суммарная длина слов (хранение "как есть")
   *   nodes        - K, узлов в дереве; всегда nodes <= chars + 1
   *   savedChars   - сколько символов сэкономили общие префиксы
   *   pointerCells - ячейки-указатели: Map-вариант (эта реализация), K - 1 рёбер
   *   arrayCells   - во сколько ячеек обошёлся бы вариант "33 ребёнка на узел"
   */
  stats(alphabetSize = 33) {
    return {
      words: this.#words,
      chars: this.#chars,
      nodes: this.#nodes,
      savedChars: this.#chars + 1 - this.#nodes,
      pointerCells: this.#nodes - 1,
      arrayCells: alphabetSize * this.#nodes,
    };
  }

  #prepare(word) {
    if (typeof word !== 'string') {
      throw new TypeError('слово должно быть строкой');
    }
    const w = this.#normalize(word);
    if (w.length === 0) {
      throw new RangeError('пустое слово добавить нельзя');
    }
    return w;
  }

  #find(w) {
    let node = this.#root;
    for (const ch of w) {
      if (node.children === null) return null;
      node = node.children.get(ch);
      if (node === undefined) return null;
    }
    return node;
  }
}

module.exports = { Dictionary };

if (require.main === module) {
  const assert = require('assert');

  const dict = new Dictionary();

  // Добавление одного слова
  assert.strictEqual(dict.add('кот'), true);
  assert.strictEqual(dict.add('кот'), false); // дубликат
  assert.strictEqual(dict.size, 1);

  // Добавление списка слов
  assert.strictEqual(dict.addWords(['кошка', 'котик', 'код', 'кот']), 3);
  assert.strictEqual(dict.size, 4);

  // Проверка существования
  for (const w of ['кот', 'кошка', 'котик', 'код']) assert.strictEqual(dict.has(w), true, w);
  assert.strictEqual(dict.has('ко'), false); // префикс, но не слово
  assert.strictEqual(dict.has('котики'), false); // длиннее добавленного
  assert.strictEqual(dict.has('собака'), false);
  assert.strictEqual(dict.has(''), false);
  assert.strictEqual(dict.has(42), false);

  // Префиксы
  assert.strictEqual(dict.hasPrefix('ко'), true);
  assert.strictEqual(dict.hasPrefix('ку'), false);

  // Ошибки ввода
  assert.throws(() => dict.add(''), RangeError);
  assert.throws(() => dict.add(null), TypeError);
  assert.throws(() => new Dictionary({ normalize: 1 }), TypeError);

  // Нормализация (регистр и ё/е по желанию пользователя)
  const ci = new Dictionary({ normalize: (w) => w.toLowerCase() });
  ci.add('Ёж');
  assert.strictEqual(ci.has('ёЖ'), true);

  // Символы вне BMP (суррогатные пары) считаются одним символом
  const emoji = new Dictionary();
  emoji.add('a😀b');
  assert.strictEqual(emoji.has('a😀b'), true);
  assert.strictEqual(emoji.stats().chars, 3);

  // Память: общие префиксы хранятся один раз, узлов меньше, чем символов
  const s = dict.stats();
  assert.strictEqual(s.chars, 3 + 5 + 5 + 3); // кот, кошка, котик, код = 16 символов
  // префиксы: к, ко, кот, кош, кошк, кошка, коти, котик, код (9) + корень
  assert.strictEqual(s.nodes, 1 + 9);
  assert.ok(s.nodes <= s.chars + 1);
  assert.ok(s.nodes - 1 < s.chars); // строго меньше, чем хранить слова "как есть"

  // Худший случай: слова без общих префиксов -> nodes = chars + 1
  const worst = new Dictionary();
  worst.addWords(['а', 'б', 'в', 'г']);
  assert.strictEqual(worst.stats().nodes, worst.stats().chars + 1);

  // Все слова длины 3 над алфавитом из 3 букв: 27 слов, 81 символ, 40 узлов
  const full = new Dictionary();
  const letters = ['а', 'б', 'в'];
  for (const x of letters) for (const y of letters) for (const z of letters) full.add(x + y + z);
  assert.strictEqual(full.size, 27);
  assert.strictEqual(full.stats().chars, 81);
  assert.strictEqual(full.stats().nodes, 1 + 3 + 9 + 27);

  // Случайная проверка против Set
  const alphabet = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
  const randomWord = () =>
    Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () =>
      alphabet[Math.floor(Math.random() * 6)]
    ).join('');
  for (let t = 0; t < 100; t++) {
    const d = new Dictionary();
    const set = new Set();
    for (let i = 0; i < 50; i++) {
      const w = randomWord();
      assert.strictEqual(d.add(w), !set.has(w));
      set.add(w);
    }
    for (let i = 0; i < 100; i++) {
      const w = randomWord();
      assert.strictEqual(d.has(w), set.has(w));
    }
    assert.strictEqual(d.size, set.size);
  }

  // Демонстрация экономии: все слова длины 4 над 10 буквами
  const demo = new Dictionary();
  const a10 = alphabet.slice(0, 10).split('');
  for (const a of a10) for (const b of a10) for (const c of a10) for (const e of a10) demo.add(a + b + c + e);
  const ds = demo.stats();
  console.log('Слов (W):', ds.words);
  console.log('Символов "как есть" (N):', ds.chars);
  console.log('Узлов в дереве (K):', ds.nodes, `(в ${(ds.chars / ds.nodes).toFixed(2)} раза меньше N)`);
  console.log('Ячеек: Map-вариант:', ds.pointerCells, '| массив по 33 на узел:', ds.arrayCells);
  console.log('Тесты словаря пройдены.');
}

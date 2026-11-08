import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararDinheiroMilhas } from '../src/comparar.ts';

test('exemplo do enunciado: R$ 2.500 vs 35.000 milhas + R$ 180', () => {
  const c = compararDinheiroMilhas(2500, 35000, 180, 20);
  assert.equal(c.valorPorMilheiro, 66.29);
  assert.equal(c.custoResgate, 880);
  assert.equal(c.recomendacao, 'milhas');
});

test('dinheiro vence quando o milheiro vale mais que o rendimento', () => {
  assert.equal(compararDinheiroMilhas(1000, 50000, 100, 30).recomendacao, 'dinheiro');
});

test('empate dentro da margem de 10%', () => {
  assert.equal(compararDinheiroMilhas(1000, 40000, 200, 21).recomendacao, 'empate');
});

test('valores inválidos', () => {
  assert.throws(() => compararDinheiroMilhas(0, 1000, 0, 20));
});

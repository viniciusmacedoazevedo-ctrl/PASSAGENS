import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extrairItinerarios, paraNumero } from '../src/robots/extrair.ts';

const ler = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

test('paraNumero entende formatos BR e US', () => {
  assert.equal(paraNumero('1.234,56'), 1234.56);
  assert.equal(paraNumero('1,234.56'), 1234.56);
  assert.equal(paraNumero('35.000'), 35000);
  assert.equal(paraNumero('R$ 1.850'), 1850);
  assert.equal(paraNumero('312,45'), 312.45);
  assert.equal(paraNumero(98.5), 98.5);
  assert.equal(paraNumero('abc'), undefined);
});

test('extrai itinerários em dinheiro (menor tarifa de cada voo)', () => {
  const r = extrairItinerarios(ler('site-dinheiro.json'), 'dinheiro');
  assert.equal(r.length, 2);
  const precos = r.map((x) => x.valor).sort((a, b) => a! - b!);
  assert.deepEqual(precos, [1990.5, 2450]);
  const direto = r.find((x) => x.valor === 1990.5)!;
  assert.equal(direto.moeda, 'BRL');
  assert.deepEqual(direto.trechos[0].voos, ['LA8084']);
  assert.equal(direto.trechos[0].origem, 'NAT');
  assert.equal(direto.trechos[0].partida, '2027-01-10T22:40:00');
});

test('extrai itinerários em milhas com taxas', () => {
  const r = extrairItinerarios(ler('site-milhas.json'), 'milhas');
  assert.equal(r.length, 2);
  const tp = r.find((x) => x.trechos[0].voos.includes('TP36'))!;
  assert.equal(tp.milhas, 88200);
  assert.equal(tp.taxas, 312.45);
  const conexao = r.find((x) => x.milhas === 64500)!;
  assert.deepEqual(conexao.trechos[0].voos, ['G31450', 'AF457']);
  assert.equal(conexao.trechos[0].escalas, 1);
});

test('JSON sem itinerários não gera resultados', () => {
  assert.deepEqual(extrairItinerarios({ user: { name: 'x', points: 120000 }, banners: [{ price: 99 }] }, 'milhas'), []);
});

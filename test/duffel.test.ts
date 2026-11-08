import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duracaoIsoParaMin, montarCorpo, normalizarOfertas } from '../src/sources/duffel.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/duffel-ofertas.json', import.meta.url), 'utf8'));

test('duração ISO 8601', () => {
  assert.equal(duracaoIsoParaMin('PT8H5M'), 485);
  assert.equal(duracaoIsoParaMin('P1DT2H'), 1560);
  assert.equal(duracaoIsoParaMin('xx'), undefined);
});

test('corpo da requisição ida e volta', () => {
  const b = montarCorpo({ origem: 'NAT', destino: 'LIS', ida: '2027-01-10', volta: '2027-01-25', adultos: 2, cabine: 'executiva', maxEscalas: 1 });
  assert.equal(b.data.slices.length, 2);
  assert.deepEqual(b.data.slices[1], { origin: 'LIS', destination: 'NAT', departure_date: '2027-01-25' });
  assert.equal(b.data.passengers.length, 2);
  assert.equal(b.data.cabin_class, 'business');
  assert.equal(b.data.max_connections, 1);
});

test('normaliza ofertas', () => {
  const r = normalizarOfertas(fx.data.offers);
  assert.equal(r.length, 2);
  assert.equal(r[0].valor, 1850.4);
  assert.equal(r[0].companhia, 'TAP Air Portugal');
  assert.deepEqual(r[0].trechos[0].voos, ['TP36']);
  assert.equal(r[0].trechos[0].duracaoMin, 485);
  assert.equal(r[0].bagagem, '1 despachada(s), 1 de mão');
  assert.equal(r[1].trechos[0].escalas, 1);
  assert.equal(r[1].trechos[0].destino, 'LIS');
  assert.equal(r[0].qualidade, 'api');
});

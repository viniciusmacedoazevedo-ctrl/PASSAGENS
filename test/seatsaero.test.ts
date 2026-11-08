import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { montarUrl, normalizarDisponibilidade } from '../src/sources/seatsaero.ts';
import { melhorMilhasPorPrograma } from '../src/consulta.ts';
import type { Consulta, Resultado } from '../src/types.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/seatsaero-busca.json', import.meta.url), 'utf8'));
const c: Consulta = { origem: 'GRU', destino: 'LIS', ida: '2027-01-10', adultos: 1, cabine: 'economica' };

test('monta URL da busca em cache', () => {
  const u = new URL(montarUrl({ ...c, cabine: 'executiva', maxEscalas: 0 }, 'GRU', 'LIS', '2027-01-10', 'smiles,aeroplan'));
  assert.equal(u.pathname, '/partnerapi/search');
  assert.equal(u.searchParams.get('origin_airport'), 'GRU');
  assert.equal(u.searchParams.get('cabin'), 'business');
  assert.equal(u.searchParams.get('sources'), 'smiles,aeroplan');
  assert.equal(u.searchParams.get('only_direct_flights'), 'true');
});

test('normaliza disponibilidade (ignora cabine indisponível)', () => {
  const r = normalizarDisponibilidade(fx.data, c);
  assert.equal(r.length, 2);
  assert.equal(r[0].programa, 'Aeroplan');
  assert.equal(r[0].milhas, 60000);
  assert.equal(r[0].taxas, 98.5);
  assert.equal(r[0].moeda, 'CAD');
  const smiles = r.find((x) => x.programa === 'Smiles')!;
  assert.equal(smiles.taxas, 420.1);
  assert.equal(smiles.trechos[0].escalas, 0);
  assert.equal(smiles.companhia, 'TP');
});

test('multiplica por passageiros', () => {
  const r = normalizarDisponibilidade(fx.data, { ...c, adultos: 2 });
  assert.equal(r.find((x) => x.programa === 'Smiles')!.milhas, 129000);
});

test('ida e volta soma melhor ida + melhor volta por programa', () => {
  const rt: Consulta = { ...c, volta: '2027-01-25' };
  const mk = (origem: string, milhas: number, taxasBRL: number): Resultado & { taxasBRL: number } => ({
    fonte: 'seatsaero', modalidade: 'milhas', programa: 'Smiles', trechos: [{ origem, voos: [] }], milhas, taxasBRL, qualidade: 'api', consultadoEm: '',
  });
  const m = melhorMilhasPorPrograma([mk('GRU', 70000, 300), mk('GRU', 64500, 420), mk('LIS', 50000, 200)], rt);
  assert.deepEqual(m.get('Smiles'), { milhas: 114500, taxasBRL: 620 });
  // só ida encontrada: não compara (evita comparar meia viagem com a viagem inteira)
  assert.equal(melhorMilhasPorPrograma([mk('GRU', 64500, 420)], rt).size, 0);
});

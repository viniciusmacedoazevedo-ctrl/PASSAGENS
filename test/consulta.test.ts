import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarConsulta } from '../src/consulta.ts';
import { SITES, epochMeioDia } from '../src/robots/sites.ts';

const hoje = new Date('2026-11-08T12:00:00Z');

test('valida e normaliza consulta', () => {
  const c = montarConsulta({ de: 'nat', para: 'lis', ida: '2027-01-10', volta: '2027-01-25', adultos: '2', classe: 'business' }, hoje);
  assert.deepEqual(c, { origem: 'NAT', destino: 'LIS', ida: '2027-01-10', volta: '2027-01-25', adultos: 2, cabine: 'executiva' });
});

test('rejeita entradas inválidas', () => {
  assert.throws(() => montarConsulta({ de: 'NATAL', para: 'LIS', ida: '2027-01-10' }, hoje));
  assert.throws(() => montarConsulta({ de: 'NAT', para: 'LIS', ida: '2027-02-30' }, hoje));
  assert.throws(() => montarConsulta({ de: 'NAT', para: 'LIS', ida: '2026-01-10' }, hoje));
  assert.throws(() => montarConsulta({ de: 'NAT', para: 'LIS', ida: '2027-01-10', volta: '2027-01-01' }, hoje));
  assert.throws(() => montarConsulta({ de: 'NAT', para: 'NAT', ida: '2027-01-10' }, hoje));
});

test('links diretos dos sites', () => {
  const c = montarConsulta({ de: 'NAT', para: 'LIS', ida: '2027-01-10' }, hoje);
  const latam = new URL(SITES.find((s) => s.id === 'latampass')!.urlBusca!(c));
  assert.equal(latam.searchParams.get('origin'), 'NAT');
  assert.equal(latam.searchParams.get('redemption'), 'true');
  assert.equal(latam.searchParams.get('trip'), 'OW');
  const smiles = new URL(SITES.find((s) => s.id === 'smiles')!.urlBusca!(c));
  assert.equal(smiles.searchParams.get('departureDate'), String(epochMeioDia('2027-01-10')));
  assert.equal(smiles.searchParams.get('tripType'), '2');
  const aeroplan = new URL(SITES.find((s) => s.id === 'aeroplan')!.urlBusca!(c));
  assert.equal(aeroplan.searchParams.get('departureDate0'), '2027-01-10');
  assert.equal(aeroplan.searchParams.get('tripType'), 'O');
});

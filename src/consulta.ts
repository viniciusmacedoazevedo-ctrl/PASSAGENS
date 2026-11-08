import type { Cabine, Consulta } from './types.ts';

const CABINES: Record<string, Cabine> = {
  economica: 'economica', econômica: 'economica', economy: 'economica', y: 'economica',
  premium: 'premium', w: 'premium',
  executiva: 'executiva', business: 'executiva', j: 'executiva',
  primeira: 'primeira', first: 'primeira', f: 'primeira',
};

function dataValida(s: string | undefined, campo: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${campo}: use o formato AAAA-MM-DD`);
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error(`${campo}: data inválida (${s})`);
  return s;
}

export function montarConsulta(a: Record<string, string | boolean | undefined>, hoje = new Date()): Consulta {
  const iata = (v: unknown, campo: string) => {
    const s = String(v ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(s)) throw new Error(`${campo}: informe o código IATA de 3 letras (ex.: NAT, GRU, LIS)`);
    return s;
  };
  const origem = iata(a.de, '--de');
  const destino = iata(a.para, '--para');
  if (origem === destino) throw new Error('Origem e destino iguais');
  const ida = dataValida(a.ida as string, '--ida');
  const hojeStr = hoje.toISOString().slice(0, 10);
  if (ida < hojeStr) throw new Error('--ida está no passado');
  const volta = a.volta ? dataValida(a.volta as string, '--volta') : undefined;
  if (volta && volta < ida) throw new Error('--volta antes da ida');
  const adultos = Number(a.adultos ?? 1);
  if (!Number.isInteger(adultos) || adultos < 1 || adultos > 9) throw new Error('--adultos: de 1 a 9');
  const cabine = CABINES[String(a.classe ?? 'economica').toLowerCase()];
  if (!cabine) throw new Error('--classe: economica | premium | executiva | primeira');
  const c: Consulta = { origem, destino, ida, volta, adultos, cabine };
  if (a.escalas !== undefined) {
    const e = Number(a.escalas);
    if (!Number.isInteger(e) || e < 0 || e > 3) throw new Error('--escalas: 0 a 3');
    c.maxEscalas = e;
  }
  return c;
}

/** Chave estável para cache de uma consulta numa fonte. */
export const chaveConsulta = (fonte: string, c: Consulta) =>
  [fonte, c.origem, c.destino, c.ida, c.volta ?? '-', c.adultos, c.cabine, c.maxEscalas ?? '-'].join('_');

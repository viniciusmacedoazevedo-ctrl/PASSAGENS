/**
 * seats.aero — Partner API, busca em cache ("Cached Search").
 *
 * Uso permitido a assinantes Pro para fins NÃO comerciais (uso pessoal),
 * com limite de ~1.000 chamadas/dia. Chave em seats.aero > Settings > API.
 *
 * Os nomes de campos abaixo seguem o formato conhecido da API
 * (data[].Route.OriginAirport, YMileageCostRaw, YTotalTaxes, TaxesCurrency…),
 * mas a documentação oficial não pôde ser conferida durante o
 * desenvolvimento; por isso a leitura é tolerante e a resposta bruta é salva
 * em dados/buscas/.../capturas/seatsaero/ para conferência.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Consulta, ContextoExecucao, Fonte, Resultado } from '../types.ts';

const API = 'https://seats.aero/partnerapi';

const CABINE: Record<Consulta['cabine'], { param: string; prefixo: 'Y' | 'W' | 'J' | 'F' }> = {
  economica: { param: 'economy', prefixo: 'Y' },
  premium: { param: 'premium', prefixo: 'W' },
  executiva: { param: 'business', prefixo: 'J' },
  primeira: { param: 'first', prefixo: 'F' },
};

export const NOMES_PROGRAMAS: Record<string, string> = {
  smiles: 'Smiles',
  aeroplan: 'Aeroplan',
  flyingblue: 'Flying Blue',
  united: 'United MileagePlus',
  american: 'AAdvantage',
  alaska: 'Alaska Mileage Plan',
  delta: 'Delta SkyMiles',
  emirates: 'Emirates Skywards',
  etihad: 'Etihad Guest',
  qatar: 'Qatar Privilege Club',
  turkish: 'Turkish Miles&Smiles',
  virginatlantic: 'Virgin Atlantic',
  velocity: 'Velocity',
  qantas: 'Qantas',
  jetblue: 'JetBlue TrueBlue',
  eurobonus: 'SAS EuroBonus',
  aeromexico: 'Aeromexico Club Premier',
  connectmiles: 'Copa ConnectMiles',
  lufthansa: 'Miles & More',
  ethiopian: 'Ethiopian ShebaMiles',
  saudia: 'Saudia Alfursan',
  singapore: 'KrisFlyer',
};

type Disp = Record<string, unknown> & {
  ID?: string;
  Date?: string;
  Source?: string;
  Route?: { OriginAirport?: string; DestinationAirport?: string; Source?: string };
};

const numero = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /\d/.test(v)) {
    const n = Number(v.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

export function montarUrl(c: Consulta, origem: string, destino: string, data: string, programas?: string) {
  const p = new URLSearchParams({
    origin_airport: origem,
    destination_airport: destino,
    start_date: data,
    end_date: data,
    cabin: CABINE[c.cabine].param,
    take: '500',
  });
  if (programas) p.set('sources', programas);
  if (c.maxEscalas === 0) p.set('only_direct_flights', 'true');
  return `${API}/search?${p}`;
}

/** Converte disponibilidades do seats.aero em Resultados (um por programa/dia/rota). */
export function normalizarDisponibilidade(itens: Disp[], c: Consulta, agora = new Date()): Resultado[] {
  const px = CABINE[c.cabine].prefixo;
  const saida: Resultado[] = [];
  for (const d of itens) {
    if (d[`${px}Available`] === false) continue;
    const milhas = numero(d[`${px}MileageCostRaw`]) ?? numero(d[`${px}MileageCost`]);
    if (!milhas) continue;
    // Taxas: inteiro em centavos (ex.: 5610 = 56,10) na moeda TaxesCurrency.
    const taxasRaw = numero(d[`${px}TotalTaxesRaw`]) ?? numero(d[`${px}TotalTaxes`]);
    const fonte = String(d.Source ?? d.Route?.Source ?? '');
    const companhias = String(d[`${px}Airlines`] ?? '').trim();
    const direto = d[`${px}Direct`] === true;
    const assentos = numero(d[`${px}RemainingSeats`]);
    saida.push({
      fonte: 'seatsaero',
      modalidade: 'milhas',
      programa: NOMES_PROGRAMAS[fonte] ?? fonte,
      companhia: companhias || undefined,
      trechos: [
        {
          origem: d.Route?.OriginAirport,
          destino: d.Route?.DestinationAirport,
          partida: d.Date,
          voos: [],
          escalas: direto ? 0 : undefined,
        },
      ],
      milhas: milhas * c.adultos,
      taxas: taxasRaw !== undefined ? (taxasRaw / 100) * c.adultos : undefined,
      moeda: typeof d.TaxesCurrency === 'string' && d.TaxesCurrency ? d.TaxesCurrency : undefined,
      bagagem: assentos ? `${assentos} assento(s) disponível(is) no cache` : undefined,
      qualidade: 'api',
      consultadoEm: agora.toISOString(),
      link: d.ID ? `https://seats.aero/search?origin=${d.Route?.OriginAirport ?? ''}&destination=${d.Route?.DestinationAirport ?? ''}&date=${d.Date ?? ''}` : undefined,
    });
  }
  return saida.sort((a, b) => a.milhas! - b.milhas!);
}

export const seatsaero: Fonte = {
  id: 'seatsaero',
  nome: 'seats.aero (API Pro — milhas, uso pessoal)',
  modalidade: 'milhas',
  async executar(c: Consulta, ctx: ContextoExecucao): Promise<Resultado[]> {
    const chave = process.env.SEATS_AERO_KEY;
    if (!chave) throw new Error('SEATS_AERO_KEY não configurada no arquivo .env');
    const programas = process.env.SEATS_AERO_PROGRAMAS || undefined;
    const pernas: [string, string, string][] = [[c.origem, c.destino, c.ida]];
    if (c.volta) pernas.push([c.destino, c.origem, c.volta]);

    const resultados: Resultado[] = [];
    const brutos: unknown[] = [];
    for (const [o, d, data] of pernas) {
      const resp = await fetch(montarUrl(c, o, d, data, programas), {
        headers: { 'Partner-Authorization': chave, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      const json = (await resp.json().catch(() => ({}))) as { data?: Disp[]; message?: string; error?: string };
      brutos.push({ perna: `${o}-${d} ${data}`, status: resp.status, json });
      if (resp.status === 401 || resp.status === 403) throw new Error(`seats.aero recusou a chave (HTTP ${resp.status}). Confira SEATS_AERO_KEY e se o plano Pro está ativo.`);
      if (resp.status === 429) throw new Error('seats.aero: limite diário de chamadas atingido (HTTP 429).');
      if (!resp.ok) throw new Error(`seats.aero HTTP ${resp.status}: ${json.message ?? json.error ?? resp.statusText}`);
      const r = normalizarDisponibilidade(json.data ?? [], c);
      ctx.log(`${o}→${d} ${data}: ${r.length} disponibilidade(s) em cache`);
      resultados.push(...r);
    }
    const dir = path.join(ctx.dirCaptura, 'seatsaero');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'respostas.json'), JSON.stringify(brutos, null, 1));
    ctx.arquivosCaptura.push(dir);
    if (c.volta) ctx.log('Ida e volta: o seats.aero retorna cada trecho separadamente (some ida + volta do mesmo programa).');
    return resultados;
  },
};

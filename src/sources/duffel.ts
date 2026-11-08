import type { Consulta, ContextoExecucao, Fonte, Resultado, Trecho } from '../types.ts';

const API = 'https://api.duffel.com';

const CABINE_DUFFEL: Record<Consulta['cabine'], string> = {
  economica: 'economy',
  premium: 'premium_economy',
  executiva: 'business',
  primeira: 'first',
};

/** Converte duração ISO 8601 (ex.: "PT13H25M", "P1DT2H") em minutos. */
export function duracaoIsoParaMin(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function montarCorpo(c: Consulta) {
  const slices = [{ origin: c.origem, destination: c.destino, departure_date: c.ida }];
  if (c.volta) slices.push({ origin: c.destino, destination: c.origem, departure_date: c.volta });
  const corpo: {
    slices: typeof slices;
    passengers: { type: 'adult' }[];
    cabin_class: string;
    max_connections?: number;
  } = {
    slices,
    passengers: Array.from({ length: c.adultos }, () => ({ type: 'adult' as const })),
    cabin_class: CABINE_DUFFEL[c.cabine],
  };
  if (c.maxEscalas !== undefined) corpo.max_connections = c.maxEscalas;
  return { data: corpo };
}

/* Formato (parcial) da resposta do Duffel — apenas os campos usados. */
interface DuffelSegment {
  origin?: { iata_code?: string };
  destination?: { iata_code?: string };
  departing_at?: string;
  arriving_at?: string;
  marketing_carrier?: { iata_code?: string };
  marketing_carrier_flight_number?: string;
  passengers?: { baggages?: { type?: string; quantity?: number }[] }[];
}
interface DuffelOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  owner?: { name?: string; iata_code?: string };
  slices?: { duration?: string; segments?: DuffelSegment[] }[];
}

export function normalizarOfertas(ofertas: DuffelOffer[], agora = new Date()): Resultado[] {
  return ofertas.map((o) => {
    const trechos: Trecho[] = (o.slices ?? []).map((s) => {
      const segs = s.segments ?? [];
      return {
        origem: segs[0]?.origin?.iata_code,
        destino: segs.at(-1)?.destination?.iata_code,
        partida: segs[0]?.departing_at,
        chegada: segs.at(-1)?.arriving_at,
        voos: segs.map((g) => `${g.marketing_carrier?.iata_code ?? ''}${g.marketing_carrier_flight_number ?? ''}`),
        escalas: Math.max(0, segs.length - 1),
        duracaoMin: duracaoIsoParaMin(s.duration),
      };
    });
    const bags = o.slices?.[0]?.segments?.[0]?.passengers?.[0]?.baggages ?? [];
    const despachada = bags.filter((b) => b.type === 'checked').reduce((n, b) => n + (b.quantity ?? 0), 0);
    const mao = bags.filter((b) => b.type === 'carry_on').reduce((n, b) => n + (b.quantity ?? 0), 0);
    return {
      fonte: 'duffel',
      modalidade: 'dinheiro',
      companhia: o.owner?.name ?? o.owner?.iata_code,
      trechos,
      valor: Number(o.total_amount),
      moeda: o.total_currency,
      bagagem: bags.length ? `${despachada} despachada(s), ${mao} de mão` : undefined,
      qualidade: 'api',
      consultadoEm: agora.toISOString(),
    } satisfies Resultado;
  });
}

export const duffel: Fonte = {
  id: 'duffel',
  nome: 'Duffel (API oficial — dinheiro)',
  modalidade: 'dinheiro',
  async executar(c: Consulta, ctx: ContextoExecucao): Promise<Resultado[]> {
    const token = process.env.DUFFEL_TOKEN;
    if (!token) throw new Error('DUFFEL_TOKEN não configurado no arquivo .env');
    if (token.startsWith('duffel_test_')) {
      ctx.log('Aviso: token de TESTE — o Duffel retorna apenas a companhia fictícia "Duffel Airways".');
    }
    const resp = await fetch(`${API}/air/offer_requests?return_offers=true&supplier_timeout=20000`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(montarCorpo(c)),
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await resp.json().catch(() => ({}))) as {
      data?: { offers?: DuffelOffer[] };
      errors?: { title?: string; message?: string }[];
    };
    if (!resp.ok) {
      const msg = json.errors?.map((e) => e.message ?? e.title).join('; ') ?? resp.statusText;
      throw new Error(`Duffel HTTP ${resp.status}: ${msg}`);
    }
    const ofertas = json.data?.offers ?? [];
    return normalizarOfertas(ofertas).sort((a, b) => (a.valor ?? 0) - (b.valor ?? 0));
  },
};

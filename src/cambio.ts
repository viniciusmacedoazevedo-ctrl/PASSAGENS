/**
 * Conversão para BRL usando a PTAX do Banco Central (API pública Olinda).
 * Pode ser sobrescrita por variáveis COTACAO_<MOEDA>=valor (ex.: COTACAO_CAD=4.05).
 */
const cache = new Map<string, number>();

const mmddaaaa = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;

export async function cotacao(moeda: string): Promise<number | undefined> {
  moeda = moeda.toUpperCase();
  if (moeda === 'BRL') return 1;
  const manual = Number(process.env[`COTACAO_${moeda}`]);
  if (manual > 0) return manual;
  if (cache.has(moeda)) return cache.get(moeda);
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 10 * 86400_000);
  const url =
    'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
    'CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)' +
    `?@moeda='${moeda}'&@dataInicial='${mmddaaaa(inicio)}'&@dataFinalCotacao='${mmddaaaa(fim)}'` +
    '&$top=1&$orderby=dataHoraCotacao%20desc&$format=json&$select=cotacaoVenda';
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const j = (await r.json()) as { value?: { cotacaoVenda: number }[] };
    const v = j.value?.[0]?.cotacaoVenda;
    if (v) cache.set(moeda, v);
    return v;
  } catch {
    return undefined;
  }
}

export async function paraBRL(valor: number | undefined, moeda: string | undefined) {
  if (valor === undefined) return undefined;
  const c = await cotacao(moeda ?? 'BRL');
  return c === undefined ? undefined : Math.round(valor * c * 100) / 100;
}

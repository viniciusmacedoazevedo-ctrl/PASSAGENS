/**
 * Sites acessados pelo robô assistido.
 *
 * - `urlBusca`: link direto que já abre a página de resultados com a consulta.
 *   Os formatos foram montados a partir do padrão público das URLs de cada
 *   site e podem mudar; os marcados `calibrar: true` não foram validados e,
 *   se não abrirem os resultados, o robô cai no modo assistido (você preenche
 *   a busca na janela e ele captura os resultados).
 * - `dominios`: só respostas desses domínios são capturadas.
 */
import type { Cabine, Consulta, Modalidade } from '../types.ts';

export interface Site {
  id: string;
  nome: string;
  modalidade: Modalidade;
  programa?: string;
  companhia?: string;
  moedaPadrao: string;
  urlInicial: string;
  urlLogin?: string;
  /** Se o site normalmente exige login para mostrar a busca. */
  exigeLogin?: boolean;
  dominios: string[];
  urlBusca?: (c: Consulta) => string;
  calibrar?: boolean;
}

const q = (o: Record<string, string | number>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

const latamCabine = (c: Cabine) => (c === 'executiva' || c === 'primeira' ? 'Business' : 'Economy');

function latamUrl(c: Consulta, resgate: boolean) {
  return (
    'https://www.latamairlines.com/br/pt/oferta-voos?' +
    q({
      origin: c.origem,
      outbound: `${c.ida}T12:00:00.000Z`,
      destination: c.destino,
      inbound: c.volta ? `${c.volta}T12:00:00.000Z` : 'null',
      adt: c.adultos,
      chd: 0,
      inf: 0,
      trip: c.volta ? 'RT' : 'OW',
      cabin: latamCabine(c.cabine),
      redemption: resgate ? 'true' : 'false',
      sort: 'RECOMMENDED',
    })
  );
}

/** Data AAAA-MM-DD para epoch em ms ao meio-dia UTC (formato usado pela Smiles). */
export const epochMeioDia = (d: string) => {
  const [a, m, dia] = d.split('-').map(Number);
  return Date.UTC(a, m - 1, dia, 12);
};
const ddmmaaaa = (d: string) => d.split('-').reverse().join('-');

function aeroplanUrl(c: Consulta) {
  const p: Record<string, string | number> = {
    org0: c.origem,
    dest0: c.destino,
    departureDate0: c.ida,
    ADT: c.adultos,
    YTH: 0,
    CHD: 0,
    INF: 0,
    INS: 0,
    lang: 'pt-BR',
    tripType: c.volta ? 'R' : 'O',
    marketCode: 'INT',
  };
  if (c.volta) Object.assign(p, { org1: c.destino, dest1: c.origem, departureDate1: c.volta });
  return 'https://www.aircanada.com/aeroplan/redeem/availability/outbound?' + q(p);
}

export const SITES: Site[] = [
  {
    id: 'latam',
    nome: 'LATAM (dinheiro)',
    modalidade: 'dinheiro',
    companhia: 'LATAM',
    moedaPadrao: 'BRL',
    urlInicial: 'https://www.latamairlines.com/br/pt',
    dominios: ['latamairlines.com', 'latam.com'],
    urlBusca: (c) => latamUrl(c, false),
  },
  {
    id: 'latampass',
    nome: 'LATAM Pass (milhas)',
    modalidade: 'milhas',
    programa: 'LATAM Pass',
    companhia: 'LATAM',
    moedaPadrao: 'BRL',
    urlInicial: 'https://www.latamairlines.com/br/pt',
    urlLogin: 'https://www.latamairlines.com/br/pt/minha-conta',
    exigeLogin: true,
    dominios: ['latamairlines.com', 'latam.com'],
    urlBusca: (c) => latamUrl(c, true),
  },
  {
    id: 'smiles',
    nome: 'Smiles (milhas — GOL e parceiras)',
    modalidade: 'milhas',
    programa: 'Smiles',
    moedaPadrao: 'BRL',
    urlInicial: 'https://www.smiles.com.br/home',
    urlLogin: 'https://www.smiles.com.br/login',
    dominios: ['smiles.com.br'],
    calibrar: true,
    urlBusca: (c) =>
      'https://www.smiles.com.br/mfe/emissao-passagem/?' +
      q({
        adults: c.adultos,
        cabin: 'ALL',
        children: 0,
        departureDate: epochMeioDia(c.ida),
        infants: 0,
        isElegible: 'false',
        isFlexibleDateChecked: 'false',
        returnDate: c.volta ? epochMeioDia(c.volta) : '',
        searchType: 'g3',
        segments: 1,
        tripType: c.volta ? 1 : 2,
        originAirport: c.origem,
        originAirportIsAny: 'false',
        destinationAirport: c.destino,
        destinAirportIsAny: 'false',
        'novo-resultado-voos': 'true',
      }),
  },
  {
    id: 'gol',
    nome: 'GOL (dinheiro)',
    modalidade: 'dinheiro',
    companhia: 'GOL',
    moedaPadrao: 'BRL',
    urlInicial: 'https://www.voegol.com.br/',
    dominios: ['voegol.com.br'],
    calibrar: true,
    urlBusca: (c) =>
      'https://b2c.voegol.com.br/compra/busca-parceiros?' +
      q({
        pv: 'br',
        tipo: c.volta ? 'RT' : 'DF',
        de: c.origem,
        para: c.destino,
        ida: ddmmaaaa(c.ida),
        volta: c.volta ? ddmmaaaa(c.volta) : '',
        ADT: c.adultos,
        CHD: 0,
        INF: 0,
      }),
  },
  {
    id: 'aeroplan',
    nome: 'Air Canada Aeroplan (pontos)',
    modalidade: 'milhas',
    programa: 'Aeroplan',
    companhia: 'Air Canada',
    moedaPadrao: 'CAD',
    urlInicial: 'https://www.aircanada.com/aeroplan/redeem/',
    urlLogin: 'https://www.aircanada.com/ca/en/aco/home/app.html#/aeroplan',
    dominios: ['aircanada.com'],
    urlBusca: aeroplanUrl,
  },
  {
    id: 'aircanada',
    nome: 'Air Canada (dinheiro)',
    modalidade: 'dinheiro',
    companhia: 'Air Canada',
    moedaPadrao: 'CAD',
    urlInicial: 'https://www.aircanada.com/br/pt/aco/home.html',
    dominios: ['aircanada.com'],
    calibrar: true,
    urlBusca: (c) =>
      'https://www.aircanada.com/booking/br/pt/aco/search?' +
      q({
        org0: c.origem,
        dest0: c.destino,
        departureDate0: c.ida,
        ...(c.volta ? { org1: c.destino, dest1: c.origem, departureDate1: c.volta } : {}),
        ADT: c.adultos,
        YTH: 0,
        CHD: 0,
        INF: 0,
        INS: 0,
        tripType: c.volta ? 'R' : 'O',
        lang: 'pt-BR',
        marketCode: 'INT',
      }),
  },
  {
    id: 'westjet',
    nome: 'WestJet (dinheiro)',
    modalidade: 'dinheiro',
    companhia: 'WestJet',
    moedaPadrao: 'CAD',
    urlInicial: 'https://www.westjet.com/en-ca',
    dominios: ['westjet.com'],
    calibrar: true,
    urlBusca: (c) =>
      'https://www.westjet.com/shop/flight/?' +
      q({
        origin: c.origem,
        destination: c.destino,
        outboundDate: c.ida,
        ...(c.volta ? { returnDate: c.volta } : {}),
        adults: c.adultos,
        children: 0,
        infants: 0,
        youth: 0,
        lang: 'en-CA',
        currency: 'CAD',
      }),
  },
  {
    id: 'tap',
    nome: 'TAP (dinheiro)',
    modalidade: 'dinheiro',
    companhia: 'TAP',
    moedaPadrao: 'BRL',
    urlInicial: 'https://www.flytap.com/pt-br',
    dominios: ['flytap.com'],
    calibrar: true,
    // Sem link direto confiável: modo assistido.
  },
  {
    id: 'milesgo',
    nome: 'TAP Miles&Go (milhas)',
    modalidade: 'milhas',
    programa: 'TAP Miles&Go',
    companhia: 'TAP',
    moedaPadrao: 'BRL',
    urlInicial: 'https://www.flytap.com/pt-br',
    urlLogin: 'https://www.flytap.com/pt-br/login',
    exigeLogin: true,
    dominios: ['flytap.com'],
    calibrar: true,
    // Resgate exige login e seleção "pagar com milhas": modo assistido.
  },
];

export const siteDe = (id: string) => SITES.find((s) => s.id === id);

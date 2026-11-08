/**
 * Extração heurística de itinerários a partir das respostas JSON que o
 * próprio site da companhia/programa carrega no navegador.
 *
 * Os sites não publicam o formato desses dados e o mudam sem aviso; por isso,
 * em vez de depender de seletores de tela, procuramos na árvore JSON listas de
 * objetos que tenham horário de partida + preço (ou milhas). Todo resultado
 * extraído assim é marcado como qualidade "heuristica" e deve ser conferido na
 * janela do navegador, que permanece visível durante a busca.
 */
import type { Modalidade, Trecho } from '../types.ts';

export interface Extraido {
  valor?: number;
  moeda?: string;
  milhas?: number;
  taxas?: number;
  trechos: Trecho[];
  companhia?: string;
}

const RE_DATAHORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const RE_VOO = /^(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{1,4}$/;
const RE_IATA = /^[A-Z]{3}$/;

const CH_PRECO = /(^|_)(total|amount|price|valor|preco|preço|fare|grandtotal|displayamount|totalamount|pricewithtax|amountwithtaxes)/i;
const CH_MILHAS = /(mile|milha|point|ponto|award|redemption|resgate|avios)/i;
const CH_TAXA = /(tax|taxa|fee|surcharge|boarding)/i;
const CH_MOEDA = /(currency|moeda)/i;
const CH_LOCAL = /(origin|destination|departure|arrival|airport|from|^to$|iata|origem|destino|station)/i;
const CH_VOO = /(flight|voo|vôo|number|numero|número|designator)/i;
const CH_CIA = /(carrier|airline|companhia|operat|marketing)/i;
const CH_DURACAO = /(duration|duracao|duração|elapsed|traveltime)/i;
const CH_EXCLUIR = /(per|por|base|before|old|original|strike|discount|desconto|saving|economia|min|max|from|percent)/i;

/** Converte "1.234,56", "1,234.56", "35.000", "R$ 1.850" ou número em número. */
export function paraNumero(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s) || s.length > 15) return undefined;
  let n: string;
  if (s.includes(',') && s.includes('.')) {
    n = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    n = /,\d{3}$/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/\.\d{3}$/.test(s) && (s.match(/\./g)?.length ?? 0) >= 1 && !/\.\d{1,2}$/.test(s)) {
    n = s.replace(/\./g, ''); // "35.000" -> 35000
  } else {
    n = s;
  }
  const r = Number(n);
  return Number.isFinite(r) ? r : undefined;
}

interface Folha {
  chave: string; // nome do campo imediato
  caminho: string[]; // nomes dos campos desde o elemento
  valor: unknown;
}

function folhas(no: unknown, caminho: string[] = [], saida: Folha[] = [], prof = 0): Folha[] {
  if (prof > 12 || saida.length > 4000) return saida;
  if (Array.isArray(no)) {
    for (const x of no) folhas(x, caminho, saida, prof + 1);
  } else if (no && typeof no === 'object') {
    for (const [k, v] of Object.entries(no)) folhas(v, [...caminho, k], saida, prof + 1);
  } else {
    saida.push({ chave: caminho.at(-1) ?? '', caminho, valor: no });
  }
  return saida;
}

function ehMilhas(f: Folha) {
  return f.caminho.slice(-3).some((c) => CH_MILHAS.test(c));
}

export function analisarElemento(el: unknown): Extraido & { temData: boolean } {
  const fs = folhas(el);
  const datas: string[] = [];
  const voos: string[] = [];
  const locais: string[] = [];
  const precos: number[] = [];
  const milhas: number[] = [];
  const taxas: number[] = [];
  let moeda: string | undefined;
  let companhia: string | undefined;
  let duracao: number | undefined;

  for (const f of fs) {
    const k = f.chave;
    const v = f.valor;
    if (typeof v === 'string' && RE_DATAHORA.test(v) && /(depart|partida|saida|saída|std|etd|start|inicio|início|date|data)/i.test(f.caminho.join('.'))) {
      datas.push(v);
      continue;
    }
    if (typeof v === 'string' && CH_MOEDA.test(k) && RE_IATA.test(v)) {
      moeda ??= v;
      continue;
    }
    if (typeof v === 'string' && RE_IATA.test(v) && f.caminho.slice(-2).some((c) => CH_LOCAL.test(c))) {
      locais.push(v);
      continue;
    }
    if (typeof v === 'string' && RE_VOO.test(v.trim()) && CH_VOO.test(k)) {
      voos.push(v.replace(/\s/g, ''));
      continue;
    }
    if (typeof v === 'string' && !companhia && CH_CIA.test(f.caminho.join('.')) && /^[A-Z0-9]{2}$/.test(v)) {
      companhia = v;
      continue;
    }
    if (CH_DURACAO.test(k)) {
      const n = paraNumero(v);
      if (n !== undefined && n > 20 && n < 5000) duracao ??= n;
      continue;
    }
    const n = paraNumero(v);
    if (n === undefined || typeof v === 'boolean') continue;
    const caminhoTxt = f.caminho.slice(-3).join('.');
    if (CH_EXCLUIR.test(k) && !/^total/i.test(k)) continue;
    if (CH_TAXA.test(caminhoTxt)) {
      if (n > 0 && n < 20000) taxas.push(n);
    } else if (ehMilhas(f)) {
      if (Number.isInteger(n) && n >= 500 && n <= 3_000_000) milhas.push(n);
    } else if (CH_PRECO.test(k) || CH_PRECO.test(f.caminho.at(-2) ?? '')) {
      if (n >= 20 && n <= 500_000) precos.push(n);
    }
  }

  const unicos = <T,>(a: T[]) => [...new Set(a)];
  const trecho: Trecho = {
    origem: locais[0],
    destino: locais.length > 1 ? locais.at(-1) : undefined,
    partida: datas.sort()[0],
    voos: unicos(voos),
    escalas: voos.length ? Math.max(0, unicos(voos).length - 1) : undefined,
    duracaoMin: duracao,
  };
  return {
    temData: datas.length > 0,
    valor: precos.length ? Math.min(...precos) : undefined,
    moeda,
    milhas: milhas.length ? Math.min(...milhas) : undefined,
    taxas: taxas.length ? Math.min(...taxas) : undefined,
    companhia,
    trechos: [trecho],
  };
}

function qualifica(el: unknown, modalidade: Modalidade): boolean {
  if (!el || typeof el !== 'object' || Array.isArray(el)) return false;
  const a = analisarElemento(el);
  return a.temData && (modalidade === 'milhas' ? a.milhas !== undefined : a.valor !== undefined);
}

/** Percorre o JSON e devolve as listas de objetos que parecem itinerários. */
function listasCandidatas(raiz: unknown, modalidade: Modalidade) {
  const cands: { arr: unknown[]; caminho: string; qualificados: number }[] = [];
  const visitar = (no: unknown, caminho: string, prof: number) => {
    if (prof > 10) return;
    if (Array.isArray(no)) {
      if (no.length && no.length <= 500) {
        const q = no.filter((x) => qualifica(x, modalidade)).length;
        if (q > 0 && q >= no.length / 2) cands.push({ arr: no, caminho, qualificados: q });
      }
      no.forEach((x, i) => visitar(x, `${caminho}[${i}]`, prof + 1));
    } else if (no && typeof no === 'object') {
      for (const [k, v] of Object.entries(no)) visitar(v, `${caminho}.${k}`, prof + 1);
    }
  };
  visitar(raiz, '$', 0);
  // Mantém as listas mais "internas": descarta uma lista se houver outra
  // dentro dela com 2+ itinerários (ela é só um contêiner).
  return cands.filter(
    (c) => !cands.some((o) => o !== c && o.caminho.startsWith(c.caminho + '[') && o.qualificados >= 2),
  );
}

export function extrairItinerarios(json: unknown, modalidade: Modalidade): Extraido[] {
  const saida: Extraido[] = [];
  const vistos = new Set<string>();
  for (const c of listasCandidatas(json, modalidade)) {
    for (const el of c.arr) {
      if (!qualifica(el, modalidade)) continue;
      const { temData: _ignorado, ...r } = analisarElemento(el);
      const chave = JSON.stringify([r.trechos[0]?.partida, r.trechos[0]?.voos, r.valor, r.milhas]);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(r);
    }
  }
  return saida;
}

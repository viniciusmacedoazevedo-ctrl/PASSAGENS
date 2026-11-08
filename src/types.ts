export type Cabine = 'economica' | 'premium' | 'executiva' | 'primeira';
export type Modalidade = 'dinheiro' | 'milhas';

export interface Consulta {
  origem: string; // IATA, ex.: NAT
  destino: string; // IATA, ex.: LIS
  ida: string; // AAAA-MM-DD
  volta?: string; // AAAA-MM-DD
  adultos: number;
  cabine: Cabine;
  maxEscalas?: number;
}

export interface Trecho {
  origem?: string;
  destino?: string;
  partida?: string; // ISO local
  chegada?: string;
  voos: string[]; // ex.: ["LA8084", "TP104"]
  escalas?: number;
  duracaoMin?: number;
}

export interface Resultado {
  fonte: string; // id da fonte
  modalidade: Modalidade;
  companhia?: string;
  programa?: string;
  trechos: Trecho[];
  /** Total em dinheiro (tarifa + taxas) na moeda indicada, por toda a reserva. */
  valor?: number;
  moeda?: string;
  /** Milhas/pontos por toda a reserva. */
  milhas?: number;
  /** Taxas pagas em dinheiro no resgate com milhas. */
  taxas?: number;
  bagagem?: string;
  /** "api" = dado estruturado oficial; "heuristica" = extraído automaticamente do site, conferir. */
  qualidade: 'api' | 'heuristica';
  consultadoEm: string; // ISO
  link?: string;
}

export interface StatusFonte {
  fonte: string;
  ok: boolean;
  mensagem: string;
  resultados: number;
  duracaoMs: number;
  arquivosCaptura?: string[];
}

export interface Fonte {
  id: string;
  nome: string;
  modalidade: Modalidade;
  programa?: string;
  executar(c: Consulta, ctx: ContextoExecucao): Promise<Resultado[]>;
}

export interface ContextoExecucao {
  dirCaptura: string;
  log: (msg: string) => void;
  /** Pergunta algo ao usuário no terminal e devolve a resposta. */
  perguntar: (msg: string) => Promise<string>;
  arquivosCaptura: string[];
}

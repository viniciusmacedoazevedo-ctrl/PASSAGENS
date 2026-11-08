export interface Comparacao {
  /** Quanto cada 1.000 milhas "rende" nesta emissão (R$ por milheiro). */
  valorPorMilheiro: number;
  /** Custo do resgate usando o valor do milheiro informado. */
  custoResgate: number;
  economia: number; // dinheiro - custoResgate (positivo = milhas compensam)
  recomendacao: 'milhas' | 'dinheiro' | 'empate';
  texto: string;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * @param dinheiro preço total da passagem paga em dinheiro (R$)
 * @param milhas milhas necessárias
 * @param taxas taxas pagas no resgate (R$)
 * @param milheiro quanto você considera que vale (ou pagou por) 1.000 milhas (R$)
 * @param margemEmpate diferença relativa considerada empate (padrão 10%)
 */
export function compararDinheiroMilhas(
  dinheiro: number,
  milhas: number,
  taxas: number,
  milheiro: number,
  margemEmpate = 0.1,
): Comparacao {
  if (!(dinheiro > 0) || !(milhas > 0) || taxas < 0 || !(milheiro >= 0)) {
    throw new Error('Valores inválidos para comparação');
  }
  const valorPorMilheiro = (dinheiro - taxas) / (milhas / 1000);
  const custoResgate = (milhas / 1000) * milheiro + taxas;
  const economia = dinheiro - custoResgate;
  const rel = economia / dinheiro;
  const recomendacao = Math.abs(rel) < margemEmpate ? 'empate' : rel > 0 ? 'milhas' : 'dinheiro';
  const texto =
    recomendacao === 'empate'
      ? `As duas alternativas são competitivas (diferença de ${brl(Math.abs(economia))}).`
      : recomendacao === 'milhas'
        ? `Melhor emitir com milhas: custo efetivo ${brl(custoResgate)} contra ${brl(dinheiro)} (economia de ${brl(economia)}).`
        : `Melhor comprar em dinheiro: o resgate custaria ${brl(custoResgate)} contra ${brl(dinheiro)}.`;
  return {
    valorPorMilheiro: Math.round(valorPorMilheiro * 100) / 100,
    custoResgate: Math.round(custoResgate * 100) / 100,
    economia: Math.round(economia * 100) / 100,
    recomendacao,
    texto: `${texto} Esta emissão paga ${brl(valorPorMilheiro)} por milheiro; você valoriza o milheiro em ${brl(milheiro)}.`,
  };
}

/** Valor do milheiro configurado para um programa (MILHEIRO_<PROGRAMA>) ou o padrão. */
export function milheiroDoPrograma(programa: string | undefined, padrao?: number): number {
  const chave = 'MILHEIRO_' + (programa ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const v = Number(process.env[chave] ?? padrao ?? process.env.MILHEIRO_PADRAO ?? 20);
  return Number.isFinite(v) ? v : 20;
}

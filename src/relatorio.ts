import type { Consulta, Resultado, StatusFonte } from './types.ts';
import type { Comparacao } from './comparar.ts';

export interface ResultadoBRL extends Resultado {
  valorBRL?: number;
  taxasBRL?: number;
}

export interface LinhaComparacao {
  programa: string;
  milhas: number;
  taxasBRL: number;
  dinheiroBRL: number;
  fonteDinheiro: string;
  milheiro: number;
  comparacao: Comparacao;
}

const brl = (v?: number) => (v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const num = (v?: number) => (v === undefined ? '—' : v.toLocaleString('pt-BR'));
const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR');
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const voos = (r: Resultado) => r.trechos.map((t) => t.voos.join('+') || '?').join(' / ');
const partida = (r: Resultado) => r.trechos[0]?.partida?.replace('T', ' ').slice(0, 16) ?? '—';
const escalas = (r: Resultado) => r.trechos.map((t) => t.escalas ?? '?').join('/');

export function resumoTerminal(
  c: Consulta,
  res: ResultadoBRL[],
  status: StatusFonte[],
  comps: LinhaComparacao[],
): string {
  const l: string[] = [];
  l.push(`\n=== ${c.origem} → ${c.destino} | ida ${c.ida}${c.volta ? ` | volta ${c.volta}` : ''} | ${c.adultos} adulto(s) | ${c.cabine} ===\n`);
  l.push('Fontes:');
  for (const s of status) l.push(`  ${s.ok ? '✔' : '✖'} ${s.fonte.padEnd(10)} ${String(s.resultados).padStart(4)} resultado(s)  ${(s.duracaoMs / 1000).toFixed(1)}s  ${s.mensagem}`);

  const din = res.filter((r) => r.modalidade === 'dinheiro' && r.valorBRL !== undefined).sort((a, b) => a.valorBRL! - b.valorBRL!);
  l.push('\nMelhores em DINHEIRO (total da reserva, convertido p/ R$):');
  if (!din.length) l.push('  (nenhum)');
  for (const r of din.slice(0, 10)) {
    l.push(`  ${brl(r.valorBRL).padStart(13)}  ${r.fonte.padEnd(9)} ${String(r.companhia ?? '').padEnd(14)} ${partida(r)}  voos ${voos(r)}  escalas ${escalas(r)}${r.qualidade === 'heuristica' ? '  [conferir]' : ''}`);
  }

  const mil = res.filter((r) => r.modalidade === 'milhas' && r.milhas).sort((a, b) => a.milhas! - b.milhas!);
  l.push('\nMelhores em MILHAS:');
  if (!mil.length) l.push('  (nenhum)');
  for (const r of mil.slice(0, 10)) {
    l.push(`  ${num(r.milhas).padStart(10)} mi + ${brl(r.taxasBRL).padStart(11)}  ${String(r.programa ?? r.fonte).padEnd(13)} ${partida(r)}  voos ${voos(r)}  [conferir]`);
  }

  if (comps.length) {
    l.push('\nDINHEIRO × MILHAS (melhor de cada programa vs. melhor em dinheiro):');
    for (const x of comps) l.push(`  ${x.programa}: ${x.comparacao.texto}`);
  }
  l.push(`\nConsultado em ${new Date().toLocaleString('pt-BR')}. Resultados "[conferir]" foram extraídos automaticamente do site — confirme na própria página antes de comprar/emitir.`);
  return l.join('\n');
}

export function relatorioHtml(
  c: Consulta,
  res: ResultadoBRL[],
  status: StatusFonte[],
  comps: LinhaComparacao[],
): string {
  const linhas = [...res]
    .sort((a, b) => (a.modalidade === b.modalidade ? (a.valorBRL ?? a.milhas ?? 0) - (b.valorBRL ?? b.milhas ?? 0) : a.modalidade === 'dinheiro' ? -1 : 1))
    .map(
      (r) => `<tr class="${r.qualidade}">
<td>${esc(r.modalidade)}</td><td>${esc(r.fonte)}</td><td>${esc(r.companhia ?? '')}</td><td>${esc(r.programa ?? '')}</td>
<td>${esc(partida(r))}</td><td>${esc(voos(r))}</td><td>${esc(escalas(r))}</td>
<td class="n">${r.valor !== undefined ? esc(`${r.moeda ?? ''} ${num(r.valor)}`) : '—'}</td><td class="n">${esc(brl(r.valorBRL))}</td>
<td class="n">${esc(num(r.milhas))}</td><td class="n">${esc(brl(r.taxasBRL))}</td><td>${esc(r.bagagem ?? '')}</td>
<td>${r.qualidade === 'api' ? 'API' : 'conferir'}</td><td>${esc(hora(r.consultadoEm))}</td>
<td>${r.link ? `<a href="${esc(r.link)}" rel="noreferrer">abrir</a>` : ''}</td></tr>`,
    )
    .join('\n');
  const fontes = status
    .map((s) => `<li class="${s.ok ? 'ok' : 'erro'}">${s.ok ? '✔' : '✖'} <b>${esc(s.fonte)}</b> — ${s.resultados} resultado(s), ${(s.duracaoMs / 1000).toFixed(1)} s. ${esc(s.mensagem)}</li>`)
    .join('');
  const comp = comps.map((x) => `<li><b>${esc(x.programa)}</b>: ${esc(x.comparacao.texto)}</li>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Busca ${esc(c.origem)}-${esc(c.destino)}</title><style>
:root{--bg:#fff;--fg:#1b1f24;--mut:#5b6470;--lin:#e3e6ea;--alt:#f6f7f9;--ok:#137333;--err:#b3261e;--warn:#fff7e0}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#e8eaed;--mut:#9aa0a6;--lin:#2b2f34;--alt:#1a1d21;--ok:#81c995;--err:#f28b82;--warn:#2d2717}}
body{font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;background:var(--bg);color:var(--fg)}
h1{font-size:20px;margin:0 0 4px}p.m{color:var(--mut);margin:0 0 16px}.t{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:900px}th,td{border-bottom:1px solid var(--lin);padding:6px 8px;text-align:left;white-space:nowrap}
th{background:var(--alt);position:sticky;top:0}td.n{text-align:right;font-variant-numeric:tabular-nums}tr.heuristica td:nth-last-child(3){background:var(--warn)}
li.ok{color:var(--ok)}li.erro{color:var(--err)}a{color:inherit}
</style></head><body>
<h1>${esc(c.origem)} → ${esc(c.destino)} · ida ${esc(c.ida)}${c.volta ? ` · volta ${esc(c.volta)}` : ''} · ${c.adultos} adulto(s) · ${esc(c.cabine)}</h1>
<p class="m">Gerado em ${esc(new Date().toLocaleString('pt-BR'))}. Preços mudam a todo momento; "conferir" = extraído automaticamente do site, confirme na página antes de comprar/emitir.</p>
<h2>Fontes</h2><ul>${fontes}</ul>
${comp ? `<h2>Dinheiro × milhas</h2><ul>${comp}</ul>` : ''}
<h2>Resultados</h2><div class="t"><table><thead><tr><th>Tipo</th><th>Fonte</th><th>Cia</th><th>Programa</th><th>Partida</th><th>Voos</th><th>Escalas</th><th>Valor</th><th>Valor R$</th><th>Milhas</th><th>Taxas R$</th><th>Bagagem</th><th>Dado</th><th>Consultado</th><th></th></tr></thead>
<tbody>${linhas || '<tr><td colspan="15">Nenhum resultado.</td></tr>'}</tbody></table></div></body></html>`;
}

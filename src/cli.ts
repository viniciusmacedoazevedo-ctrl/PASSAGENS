import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { paraBRL } from './cambio.ts';
import { compararDinheiroMilhas, milheiroDoPrograma } from './comparar.ts';
import { chaveConsulta, montarConsulta } from './consulta.ts';
import { relatorioHtml, resumoTerminal, type LinhaComparacao, type ResultadoBRL } from './relatorio.ts';
import { criarFonteSite, fecharNavegador, loginManual } from './robots/navegador.ts';
import { SITES, siteDe } from './robots/sites.ts';
import { duffel } from './sources/duffel.ts';
import type { ContextoExecucao, Fonte, Resultado, StatusFonte } from './types.ts';

const FONTES: Fonte[] = [duffel, ...SITES.map(criarFonteSite)];
const DADOS = path.resolve('dados');

const AJUDA = `
Buscador pessoal de passagens — consulta pontual (dinheiro e milhas)

  npm run buscar -- --de NAT --para LIS --ida 2027-01-10 [--volta 2027-01-25]
                    [--adultos 1] [--classe economica|premium|executiva|primeira]
                    [--escalas 1] [--fontes duffel,latam,smiles] [--milheiro 20] [--forcar]
  npm run login -- smiles          abre o site para você entrar na conta (sessão fica salva)
  npm run fontes                   lista as fontes disponíveis
  npm run comparar -- --dinheiro 2500 --milhas 35000 --taxas 180 [--milheiro 20]
`;

const rl = createInterface({ input: process.stdin, output: process.stdout });
const perguntar = (m: string) => rl.question(m);

async function lerCache(chave: string): Promise<Resultado[] | undefined> {
  try {
    const j = JSON.parse(await readFile(path.join(DADOS, 'cache', chave + '.json'), 'utf8')) as { em: number; r: Resultado[] };
    const min = Number(process.env.CACHE_MINUTOS ?? 15);
    return Date.now() - j.em < min * 60_000 ? j.r : undefined;
  } catch {
    return undefined;
  }
}

async function gravarCache(chave: string, r: Resultado[]) {
  await mkdir(path.join(DADOS, 'cache'), { recursive: true });
  await writeFile(path.join(DADOS, 'cache', chave + '.json'), JSON.stringify({ em: Date.now(), r }));
}

async function buscar(args: Record<string, string | boolean | undefined>) {
  const consulta = montarConsulta(args);
  const ids = typeof args.fontes === 'string' ? args.fontes.split(',').map((s) => s.trim()) : FONTES.map((f) => f.id);
  const desconhecidas = ids.filter((id) => !FONTES.some((f) => f.id === id));
  if (desconhecidas.length) throw new Error(`Fonte(s) desconhecida(s): ${desconhecidas.join(', ')}. Veja "npm run fontes".`);
  const fontes = FONTES.filter((f) => ids.includes(f.id));

  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dirExec = path.join(DADOS, 'buscas', `${carimbo}_${consulta.origem}-${consulta.destino}`);
  await mkdir(dirExec, { recursive: true });

  const todos: Resultado[] = [];
  const status: StatusFonte[] = [];
  for (const [i, fonte] of fontes.entries()) {
    const inicio = Date.now();
    const ctx: ContextoExecucao = {
      dirCaptura: path.join(dirExec, 'capturas'),
      log: (m) => console.log(`  [${fonte.id}] ${m}`),
      perguntar,
      arquivosCaptura: [],
    };
    const chave = chaveConsulta(fonte.id, consulta);
    try {
      const emCache = args.forcar ? undefined : await lerCache(chave);
      let r: Resultado[];
      let msg = 'ok';
      if (emCache) {
        r = emCache;
        msg = `do cache (consulta repetida em menos de ${process.env.CACHE_MINUTOS ?? 15} min; use --forcar para refazer)`;
      } else {
        console.log(`\n→ ${fonte.nome}`);
        if (i > 0 && fonte.id !== 'duffel') await new Promise((res) => setTimeout(res, 3000)); // intervalo entre sites
        r = await fonte.executar(consulta, ctx);
        if (r.length) await gravarCache(chave, r);
      }
      todos.push(...r);
      status.push({ fonte: fonte.id, ok: true, mensagem: msg, resultados: r.length, duracaoMs: Date.now() - inicio, arquivosCaptura: ctx.arquivosCaptura });
    } catch (e) {
      status.push({ fonte: fonte.id, ok: false, mensagem: (e as Error).message, resultados: 0, duracaoMs: Date.now() - inicio });
    }
  }
  await fecharNavegador();

  // Converte para R$
  const res: ResultadoBRL[] = [];
  for (const r of todos) {
    res.push({ ...r, valorBRL: await paraBRL(r.valor, r.moeda), taxasBRL: await paraBRL(r.taxas, r.moeda) });
  }

  // Comparador: melhor de cada programa vs. melhor preço em dinheiro
  const melhorDinheiro = res
    .filter((r) => r.modalidade === 'dinheiro' && r.valorBRL !== undefined)
    .sort((a, b) => a.valorBRL! - b.valorBRL!)[0];
  const comps: LinhaComparacao[] = [];
  if (melhorDinheiro) {
    const porPrograma = new Map<string, ResultadoBRL>();
    for (const r of res.filter((x) => x.modalidade === 'milhas' && x.milhas)) {
      const p = r.programa ?? r.fonte;
      const atual = porPrograma.get(p);
      if (!atual || r.milhas! < atual.milhas!) porPrograma.set(p, r);
    }
    for (const [programa, r] of porPrograma) {
      const milheiro = milheiroDoPrograma(programa, args.milheiro ? Number(args.milheiro) : undefined);
      comps.push({
        programa,
        milhas: r.milhas!,
        taxasBRL: r.taxasBRL ?? 0,
        dinheiroBRL: melhorDinheiro.valorBRL!,
        fonteDinheiro: melhorDinheiro.fonte,
        milheiro,
        comparacao: compararDinheiroMilhas(melhorDinheiro.valorBRL!, r.milhas!, r.taxasBRL ?? 0, milheiro),
      });
    }
  }

  console.log(resumoTerminal(consulta, res, status, comps));
  await writeFile(path.join(dirExec, 'resultados.json'), JSON.stringify({ consulta, status, resultados: res, comparacoes: comps }, null, 1));
  const html = path.join(dirExec, 'relatorio.html');
  await writeFile(html, relatorioHtml(consulta, res, status, comps));
  await appendFile(
    path.join(DADOS, 'historico.jsonl'),
    res.map((r) => JSON.stringify({ consulta, ...r })).join('\n') + (res.length ? '\n' : ''),
  );
  console.log(`\nRelatório: ${html}\nCapturas brutas (para calibrar os robôs): ${path.join(dirExec, 'capturas')}`);
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: resto,
    allowPositionals: true,
    options: {
      de: { type: 'string' }, para: { type: 'string' }, ida: { type: 'string' }, volta: { type: 'string' },
      adultos: { type: 'string' }, classe: { type: 'string' }, escalas: { type: 'string' },
      fontes: { type: 'string' }, milheiro: { type: 'string' }, forcar: { type: 'boolean' },
      dinheiro: { type: 'string' }, milhas: { type: 'string' }, taxas: { type: 'string' },
      ajuda: { type: 'boolean', short: 'h' },
    },
  });
  if (!comando || values.ajuda) return void console.log(AJUDA);

  if (comando === 'buscar') return buscar(values);
  if (comando === 'fontes') {
    for (const f of FONTES) {
      const s = siteDe(f.id);
      console.log(`${f.id.padEnd(10)} ${f.nome}${s?.calibrar ? '  (link a calibrar / pode usar modo assistido)' : ''}${s?.exigeLogin ? '  (exige login)' : ''}`);
    }
    return;
  }
  if (comando === 'login') {
    const site = siteDe(positionals[0] ?? '');
    if (!site) throw new Error(`Informe o site: ${SITES.map((s) => s.id).join(', ')}`);
    return loginManual(site, perguntar);
  }
  if (comando === 'comparar') {
    const milheiro = Number(values.milheiro ?? process.env.MILHEIRO_PADRAO ?? 20);
    const c = compararDinheiroMilhas(Number(values.dinheiro), Number(values.milhas), Number(values.taxas ?? 0), milheiro);
    return void console.log(c.texto);
  }
  console.log(AJUDA);
}

main()
  .catch((e) => {
    console.error(`Erro: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());

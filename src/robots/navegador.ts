/**
 * Robô ASSISTIDO de consulta pontual.
 *
 * Regras fixas (não configuráveis):
 *  - O navegador é sempre VISÍVEL e usa o seu próprio Chrome/Edge, como uma
 *    navegação normal sua. Nada de modo oculto, disfarce de navegador ou
 *    plug-ins "stealth".
 *  - O robô NUNCA digita senhas e nunca resolve CAPTCHA. Login é feito por você
 *    na janela (`npm run login -- <site>`); a sessão fica no perfil local
 *    `.perfil-navegador/` (ignorado pelo git).
 *  - Se aparecer verificação de segurança/CAPTCHA/bloqueio, o robô PARA e
 *    espera você decidir (resolver manualmente ou pular o site).
 *  - Uma busca por vez, um site por vez, só quando você manda.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page, Response } from 'playwright';
import type { Consulta, ContextoExecucao, Fonte, Resultado } from '../types.ts';
import { extrairItinerarios } from './extrair.ts';
import type { Site } from './sites.ts';

const DIR_PERFIL = path.resolve('.perfil-navegador');
const RE_DESAFIO =
  /(captcha|verify you are human|verifique que você é humano|não sou um robô|access denied|acesso negado|request blocked|unusual traffic|tráfego incomum|px-captcha|challenge-platform|são humanos)/i;

let contexto: BrowserContext | undefined;

export async function abrirNavegador(): Promise<BrowserContext> {
  if (contexto) return contexto;
  const { chromium } = await import('playwright');
  const canal = process.env.NAVEGADOR ?? 'chrome';
  const executavel = process.env.CAMINHO_NAVEGADOR || undefined;
  const opcoes = { headless: false, viewport: null, locale: 'pt-BR', executablePath: executavel } as const;
  try {
    contexto = await chromium.launchPersistentContext(
      DIR_PERFIL,
      canal === 'chromium' || executavel ? opcoes : { ...opcoes, channel: canal },
    );
  } catch (e) {
    if (canal === 'chromium' || executavel) throw e;
    console.warn(`Não consegui abrir "${canal}" (${(e as Error).message.split('\n')[0]}). Usando o Chromium do Playwright.`);
    contexto = await chromium.launchPersistentContext(DIR_PERFIL, opcoes);
  }
  return contexto;
}

export async function fecharNavegador() {
  await contexto?.close().catch(() => {});
  contexto = undefined;
}

interface Captura {
  url: string;
  status: number;
  corpo: unknown;
}

function doDominio(url: string, dominios: string[]) {
  try {
    const h = new URL(url).hostname;
    return dominios.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return false;
  }
}

async function detectarDesafio(page: Page): Promise<boolean> {
  try {
    const titulo = await page.title();
    const texto = await page.evaluate(() => document.body?.innerText?.slice(0, 3000) ?? '');
    const html = await page.evaluate(() => document.documentElement.outerHTML.slice(0, 20000));
    return RE_DESAFIO.test(titulo) || RE_DESAFIO.test(texto) || /px-captcha|g-recaptcha|hcaptcha|cf-challenge/i.test(html);
  } catch {
    return false;
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function criarFonteSite(site: Site): Fonte {
  return {
    id: site.id,
    nome: site.nome,
    modalidade: site.modalidade,
    programa: site.programa,
    async executar(c: Consulta, ctx: ContextoExecucao): Promise<Resultado[]> {
      const nav = await abrirNavegador();
      const page = await nav.newPage();
      const capturas: Captura[] = [];
      let ultimaCaptura = 0;

      page.on('response', async (r: Response) => {
        try {
          const tipo = r.headers()['content-type'] ?? '';
          if (!tipo.includes('json') || !doDominio(r.url(), site.dominios)) return;
          const corpo = await r.json();
          capturas.push({ url: r.url(), status: r.status(), corpo });
          ultimaCaptura = Date.now();
        } catch {
          /* corpo indisponível (redirect, preflight etc.) */
        }
      });

      const extrair = () =>
        capturas.flatMap((cap) => extrairItinerarios(cap.corpo, site.modalidade));

      try {
        const url = site.urlBusca?.(c);
        if (url) {
          ctx.log(`Abrindo ${site.nome}${site.calibrar ? ' (link ainda não validado)' : ''}…`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => ctx.log(`Navegação: ${(e as Error).message.split('\n')[0]}`));
        } else {
          await page.goto(site.urlInicial, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
          await ctx.perguntar(
            `\n[${site.nome}] Este site não tem link direto de busca.\n` +
              `Na janela do navegador, faça a busca ${c.origem} → ${c.destino}, ida ${c.ida}${c.volta ? `, volta ${c.volta}` : ''}` +
              `${site.modalidade === 'milhas' ? ', pagando com MILHAS' : ''}.\n` +
              'Quando os resultados aparecerem na tela, pressione Enter aqui… ',
          );
        }

        const limite = Date.now() + Number(process.env.TEMPO_MAXIMO_SITE ?? 90) * 1000;
        let avisouDesafio = false;
        while (Date.now() < limite) {
          await esperar(2000);
          if (!avisouDesafio && (await detectarDesafio(page))) {
            avisouDesafio = true;
            const r = await ctx.perguntar(
              `\n[${site.nome}] O site mostrou uma verificação de segurança/bloqueio.\n` +
                'O robô não resolve isso. Se quiser, resolva você mesmo na janela e pressione Enter;\n' +
                'ou digite "p" + Enter para pular este site: ',
            );
            if (r.trim().toLowerCase() === 'p') throw new Error('Pulado pelo usuário (verificação de segurança no site).');
            continue;
          }
          // Resultados chegaram e o site ficou 6 s sem novas respostas: terminou.
          if (extrair().length && Date.now() - ultimaCaptura > 6000) break;
        }

        if (!extrair().length) {
          const r = await ctx.perguntar(
            `\n[${site.nome}] Não identifiquei resultados automaticamente.\n` +
              (site.exigeLogin ? `Talvez precise de login: rode depois "npm run login -- ${site.id}".\n` : '') +
              'Se os resultados estão na tela (ou você ajustou a busca na janela), pressione Enter para capturar de novo;\n' +
              'ou "p" + Enter para pular: ',
          );
          if (r.trim().toLowerCase() !== 'p') await esperar(4000);
        }

        await salvarCapturas(site, capturas, page, ctx);
        const titulo = await page.title().catch(() => '?');
        ctx.log(`Diagnóstico: ${capturas.length} resposta(s) JSON capturada(s) do site; ${extrair().length} itinerário(s) identificado(s); página: "${titulo}" (${page.url().slice(0, 120)})`);
        const agora = new Date().toISOString();
        return extrair().map((e) => ({
          fonte: site.id,
          modalidade: site.modalidade,
          companhia: e.companhia ?? site.companhia,
          programa: site.programa,
          trechos: e.trechos,
          valor: site.modalidade === 'dinheiro' ? e.valor : undefined,
          moeda: e.moeda ?? site.moedaPadrao,
          milhas: e.milhas,
          taxas: site.modalidade === 'milhas' ? e.taxas : undefined,
          qualidade: 'heuristica',
          consultadoEm: agora,
          link: page.url(),
        }));
      } finally {
        await page.close().catch(() => {});
      }
    },
  };
}

async function salvarCapturas(site: Site, capturas: Captura[], page: Page, ctx: ContextoExecucao) {
  const dir = path.join(ctx.dirCaptura, site.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'respostas.json'), JSON.stringify(capturas, null, 1));
  await page.screenshot({ path: path.join(dir, 'tela.png'), fullPage: true }).catch(() => {});
  await writeFile(path.join(dir, 'pagina.html'), await page.content().catch(() => '')).catch(() => {});
  await writeFile(path.join(dir, 'urls.txt'), capturas.map((c) => `${c.status} ${c.url}`).join('\n')).catch(() => {});
  ctx.arquivosCaptura.push(dir);
}

/** Abre a página de login do site e espera você entrar na conta manualmente. */
export async function loginManual(site: Site, perguntar: (m: string) => Promise<string>) {
  const nav = await abrirNavegador();
  const page = await nav.newPage();
  await page.goto(site.urlLogin ?? site.urlInicial, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await perguntar(
    `\nFaça login em ${site.nome} na janela do navegador (a senha é digitada só por você, no site).\n` +
      'Quando terminar, pressione Enter aqui para salvar a sessão e fechar… ',
  );
  await fecharNavegador();
}

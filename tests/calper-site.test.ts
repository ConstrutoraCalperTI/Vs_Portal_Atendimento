// Leitura dos empreendimentos do site da Calper (supabase/functions/_shared/calperSite.ts), com o recorte real da
// página /empreendimentos-2/ de 10/10/2026.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerEmpreendimentos } from "../supabase/functions/_shared/calperSite";

const html = readFileSync(new URL("./fixtures/calper-empreendimentos.html", import.meta.url), "utf8");

describe("empreendimentos do site da Calper", () => {
  const lista = lerEmpreendimentos(html);

  it("lê todos os cartões, sem repetir", () => {
    expect(lista.length).toBe(32);
    expect(new Set(lista.map((e) => e.link)).size).toBe(32);
  });

  it("nome, tipo · bairro, foto e link do site", () => {
    const etehe = lista.find((e) => e.nome === "Etehe Residencial");
    expect(etehe).toBeDefined();
    expect(etehe!.info).toBe("2 e 3 quartos com suíte · Barra Olímpica");
    expect(etehe!.link).toBe("https://www.calper.com.br/empreendimentos/etehe-residencial/");
    expect(etehe!.imagem).toMatch(/^https:\/\/www\.calper\.com\.br\/wp-content\/uploads\//);
    expect(lista[0].nome).toBe("Arte Wood Residences");
    expect(lista.find((e) => e.nome.startsWith("Nexus"))?.nome).toBe("Nexus Hotel & Residences");
  });

  it("descrição longa é cortada na palavra", () => {
    const cidade = lista.find((e) => e.nome === "Cidade Arte Barra")!;
    expect(cidade.info.length).toBeLessThanOrEqual(90);
    expect(cidade.info.endsWith("…")).toBe(true);
  });

  it("layout mudado ou link de fora do site: nada é aceito", () => {
    expect(lerEmpreendimentos("<html><body>manutenção</body></html>")).toEqual([]);
    expect(lerEmpreendimentos('<article class="card"><a href="https://outro.site/x"><strong>X</strong></a></article>')).toEqual([]);
  });

  it("respeita o limite", () => {
    expect(lerEmpreendimentos(html, 8)).toHaveLength(8);
  });
});

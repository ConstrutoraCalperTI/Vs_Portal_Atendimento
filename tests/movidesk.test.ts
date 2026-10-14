// Cliente e mapeador do Movidesk (supabase/functions/_shared/movidesk/movidesk.ts), TypeScript puro.
// Fixture anonimizada com o formato real medido em 14/10/2026 (datas UTC sem "Z", 7 casas, HTML na ação, serviço de baixo para cima).
import { describe, expect, it, vi } from "vitest";
import {
  AnexoGrande,
  baixarAnexo,
  buscarPagina,
  caminhoServico,
  caminhoStorage,
  dataUtc,
  mapearPagina,
  nomeArquivoSeguro,
  textoDeHtml,
  tokenLimpo,
  type TicketMovidesk,
} from "../supabase/functions/_shared/movidesk/movidesk.ts";

const pessoa = (id: string, nome: string) => ({ id, businessName: nome, email: `${id}@exemplo.com`, personType: 1, profileType: 1, phone: null, pathPicture: null });

const ticket: TicketMovidesk = {
  id: 188081,
  protocol: "",
  type: 2,
  subject: "  Fwd: Solicitação de cadastro  ",
  category: "Solicitação de serviço",
  urgency: "Média",
  status: "Fechado ",
  baseStatus: "Closed",
  origin: 3,
  createdDate: "2026-10-06T11:36:39.2215507",
  lastUpdate: "2026-10-14T14:51:38.6993408",
  ownerTeam: "CRC",
  serviceFirstLevelId: 77,
  serviceFirstLevel: "02 - 2º VIA DE CONTRATO",
  serviceSecondLevel: "OPÇÃO DE COMPRA",
  serviceThirdLevel: "Relacionamento com Clientes",
  slaSolutionDate: "2026-10-08T18:36:39",
  slaSolutionDateIsPaused: false,
  lifeTimeWorkingTime: 125.5,
  actionCount: 3,
  owner: pessoa("ag1", "Agente Um"),
  createdBy: pessoa("cl1", "Cliente Um"),
  clients: [{ ...pessoa("cl1", "Cliente Um"), organization: pessoa("org", "Empresa X") }],
  customFieldValues: [{ customFieldId: 10, customFieldRuleId: 2, line: 1, value: "A-101" }],
  actions: [
    {
      id: 1, type: 2, origin: 3, status: "Novo", createdDate: "2026-10-06T11:36:39.2215507", createdBy: pessoa("cl1", "Cliente Um"), isDeleted: false,
      description: "<p>Olá,&nbsp;preciso da <b>2ª via</b></p><p>Obrigado &amp; até</p>", htmlDescription: null,
      attachments: [{ fileName: "contrato assinado.pdf", path: "abc123", createdDate: "2026-10-06T11:36:40.1" }],
    },
    { id: 2, type: 1, description: "apagada", isDeleted: true },
    { id: 3, type: 1, description: "Nota interna", createdDate: "2026-10-07T10:00:00", createdBy: null, attachments: [] },
  ],
  statusHistories: [{ status: "Novo", justification: null, changedDate: "2026-10-06T11:36:39.22", changedBy: pessoa("s", "Sistema"), permanencyTimeWorkingTime: 12 }],
  ownerHistories: [{ ownerTeam: "CRC", owner: pessoa("ag1", "Agente Um"), changedDate: "2026-10-06T12:00:00", changedBy: pessoa("s", "Sistema"), permanencyTimeWorkingTime: 30 }],
};

describe("formatos", () => {
  it("recorta o GUID do token colado da URL", () => {
    expect(tokenLimpo("1A2B3C4D-0000-4000-8000-00000000ABCD&$")).toBe("1a2b3c4d-0000-4000-8000-00000000abcd");
    expect(tokenLimpo("token")).toBeNull();
    expect(tokenLimpo(null)).toBeNull();
  });

  it("data sem fuso é UTC; 7 casas viram 6", () => {
    expect(dataUtc("2026-10-14T15:28:40.2494391")).toBe("2026-10-14T15:28:40.249439Z");
    expect(dataUtc("2026-10-08T18:36:39")).toBe("2026-10-08T18:36:39Z");
    expect(dataUtc("2026-10-08T18:36:39-03:00")).toBe("2026-10-08T18:36:39-03:00");
    expect(dataUtc("")).toBeNull();
    expect(dataUtc("ontem")).toBeNull();
    expect(dataUtc(null)).toBeNull();
  });

  it("HTML da ação vira texto", () => {
    expect(textoDeHtml("<p>Olá,&nbsp;preciso da <b>2ª via</b></p><p>Obrigado &amp; até</p>")).toBe("Olá, preciso da 2ª via\nObrigado & até");
    expect(textoDeHtml("linha 1<br>linha 2<style>p{}</style>&#233;&#x41;")).toBe("linha 1\nlinha 2 éA");
    expect(textoDeHtml(null)).toBe("");
  });

  it("serviço do geral para o específico", () => {
    expect(caminhoServico(ticket)).toBe("Relacionamento com Clientes › OPÇÃO DE COMPRA › 02 - 2º VIA DE CONTRATO");
    expect(caminhoServico({ serviceFirstLevel: "Só um", serviceSecondLevel: null, serviceThirdLevel: " " })).toBe("Só um");
    expect(caminhoServico({})).toBeNull();
  });

  it("nome de arquivo seguro e caminho no Storage", () => {
    expect(nomeArquivoSeguro("contrato assinado (1).pdf")).toBe("contrato_assinado_1_.pdf");
    expect(nomeArquivoSeguro("Ação/../x.PDF")).toBe("Acao_.._x.PDF");
    expect(nomeArquivoSeguro("...")).toBe("arquivo");
    expect(nomeArquivoSeguro(`${"a".repeat(200)}.jpeg`)).toHaveLength(120);
    expect(nomeArquivoSeguro(`${"a".repeat(200)}.jpeg`).endsWith(".jpeg")).toBe(true);
    expect(caminhoStorage({ ticketId: 9, acaoId: 2, id: 5, nome: "foto 1.jpg" })).toBe("movidesk/9/2/5-foto_1.jpg");
  });
});

describe("mapearPagina", () => {
  const p = mapearPagina([ticket, { id: 188002, lastUpdate: "2026-10-13T13:15:27" }]);

  it("ticket em colunas", () => {
    expect(p.tickets[0]).toMatchObject({
      id: 188081, protocolo: null, tipo: 2, assunto: "Fwd: Solicitação de cadastro", status: "Fechado", status_base: "Closed", origem: 3,
      criado_em: "2026-10-06T11:36:39.221550Z", atualizado_movidesk: "2026-10-14T14:51:38.699340Z", equipe: "CRC",
      servico_1_id: 77, servico: "Relacionamento com Clientes › OPÇÃO DE COMPRA › 02 - 2º VIA DE CONTRATO",
      sla_solucao_em: "2026-10-08T18:36:39Z", sla_solucao_pausado: false, tempo_vida_util: 125.5, qtd_acoes: 3,
      responsavel: "Agente Um", responsavel_id: "ag1", criado_por: "Cliente Um",
      clientes: [{ id: "cl1", nome: "Cliente Um", email: "cl1@exemplo.com", organizacao: "Empresa X" }],
      campos_adicionais: [{ campo: 10, regra: 2, linha: 1, valor: "A-101" }],
    });
    expect(p.tickets[1]).toMatchObject({ id: 188002, assunto: null, clientes: [], campos_adicionais: [], servico: null });
  });

  it("ações sem as apagadas, com texto e anexos; históricos numerados", () => {
    expect(p.acoes).toHaveLength(2);
    expect(p.acoes[0]).toMatchObject({
      ticket_id: 188081, acao_id: 1, tipo: 2, texto: "Olá, preciso da 2ª via\nObrigado & até", criado_por: "Cliente Um",
      anexos: [{ nome: "contrato assinado.pdf", caminho: "abc123", em: "2026-10-06T11:36:40.1Z" }],
    });
    expect(p.acoes[1]).toMatchObject({ acao_id: 3, texto: "Nota interna", criado_por: null, anexos: [] });
    expect(p.statusHist).toEqual([{ ticket_id: 188081, seq: 1, status: "Novo", justificativa: null, alterado_em: "2026-10-06T11:36:39.22Z", alterado_por: "Sistema", permanencia_util: 12 }]);
    expect(p.responsavelHist[0]).toMatchObject({ seq: 1, responsavel: "Agente Um", equipe: "CRC", permanencia_util: 30 });
  });

  it("cursor: maior id e maior lastUpdate da página", () => {
    expect(p.ultimoId).toBe(188081);
    expect(p.maiorUpdate).toBe("2026-10-14T14:51:38.699340Z");
    expect(mapearPagina([])).toMatchObject({ ultimoId: null, maiorUpdate: null, tickets: [] });
  });
});

describe("API", () => {
  it("monta a URL da página e lê a lista", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([ticket]), { status: 200 }));
    const r = await buscarPagina(fetcher as unknown as typeof fetch, { token: "tk", rota: "tickets/past", select: "id,subject", expand: "owner", filtro: "id gt 184" });
    const url = new URL(String((fetcher.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe("/public/v1/tickets/past");
    expect(Object.fromEntries(url.searchParams)).toEqual({ token: "tk", $select: "id,subject", $expand: "owner", $filter: "id gt 184", $orderby: "id asc", $top: "100" });
    expect(r.tickets).toHaveLength(1);
    expect(r.http).toBe(200);
  });

  it("401 vira mensagem sem o token", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 401 }));
    await expect(buscarPagina(fetcher as unknown as typeof fetch, { token: "segredo-123", rota: "tickets", select: "id", expand: "", filtro: "id gt 0" })).rejects.toThrow(
      /recusou o token \(HTTP 401\)/,
    );
    await buscarPagina(fetcher as unknown as typeof fetch, { token: "segredo-123", rota: "tickets", select: "id", expand: "", filtro: "id gt 0" }).catch((e: Error & { http?: number }) => {
      expect(e.message).not.toContain("segredo");
      expect(e.http).toBe(401);
    });
  });

  it("anexo: baixa pelo caminho, respeita o limite e o tipo", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const ok = vi.fn(async () => new Response(pdf, { status: 200, headers: { "content-type": "application/pdf; charset=binary" } }));
    const r = await baixarAnexo(ok as unknown as typeof fetch, "tk", "abc123", 1024);
    expect(r).toEqual({ bytes: pdf, tipo: "application/pdf" });
    expect(String((ok.mock.calls[0] as unknown[])[0])).toBe("https://api.movidesk.com/public/v1/storage/download?token=tk&id=abc123");

    const grande = vi.fn(async () => new Response(new Uint8Array(10), { status: 200, headers: { "content-length": "999999" } }));
    await expect(baixarAnexo(grande as unknown as typeof fetch, "tk", "x", 1024)).rejects.toBeInstanceOf(AnexoGrande);
    const semTamanho = vi.fn(async () => new Response(new Uint8Array(2048), { status: 200 }));
    await expect(baixarAnexo(semTamanho as unknown as typeof fetch, "tk", "x", 1024)).rejects.toBeInstanceOf(AnexoGrande);
    const erro = vi.fn(async () => new Response("não achou", { status: 404 }));
    await expect(baixarAnexo(erro as unknown as typeof fetch, "tk", "x", 1024)).rejects.toThrow("HTTP 404");
  });
});

// Integração SIENGE (Fase 5): título a pagar no formato do Swagger (POST /bills), validações, leitura das respostas.
import { describe, expect, it } from "vitest";
import {
  autorizacao, faltandoNaConfig, idDoTitulo, mensagemSienge, montarTitulo, planoDoTipo, resultados, urlBase, validarEscolhas,
  type ConfigSienge, type PedidoLancamento,
} from "../supabase/functions/_shared/sf/sienge.ts";

const cfg: ConfigSienge = {
  ativo: true, ambiente: "homologacao", subdominio: "calper", usuario: "api", senha: "segredo", empresaId: 1, tipoDocumento: "AV", indexadorId: 0,
  planoReembolso: "2010101", planoFundoFixo: "2010102", planoAdiantamento: "2010103", centroCustoPadrao: 114,
};
const pedido: PedidoLancamento = {
  id: 7, numero: "SF-2026-0007", tipo: "reembolso", cpf: "12345678900", solicitante: "João Silva", setor: "Obra - Arte Wave",
  competencia: "2026-10-01", ultimaAprovacaoEm: "2026-10-15T14:22:00Z", pagarAte: "2026-10-30", vencimento: null, total: 617.9, glosado: 7.5, aPagar: 610.4,
};

describe("SIENGE", () => {
  it("monta o título: uma parcela, valor a pagar, rateio 100% e número SF como documento", () => {
    const t = montarTitulo(pedido, cfg, { credorId: 55, centroCustoId: 114, plano: "2010101", vencimento: "2026-10-30" });
    expect(t).toMatchObject({
      debtorId: 1, creditorId: 55, documentIdentificationId: "AV", documentNumber: "SF-2026-0007", issueDate: "2026-10-15", baseDate: "2026-10-15",
      dueDate: "2026-10-30", billDate: "2026-10-01", installmentsNumber: 1, indexId: 0, totalInvoiceAmount: 610.4, discount: 0,
      budgetCategories: [{ costCenterId: 114, paymentCategoriesId: "2010101", percentage: 100 }],
    });
    expect(t.notes).toContain("Reembolso SF-2026-0007 - João Silva");
    expect(t.notes.length).toBeLessThanOrEqual(500);
  });

  it("configuração incompleta e escolhas inválidas são apontadas", () => {
    expect(faltandoNaConfig({ ...cfg, senha: null, ativo: false })).toEqual(["integração ativa", "senha"]);
    expect(validarEscolhas({ centroCustoId: 114, plano: "20.10.101", vencimento: "2026-10-30" })).toMatch(/plano financeiro/);
    expect(validarEscolhas({ centroCustoId: 114, plano: "2010101", vencimento: "2026-10-30" })).toBeNull();
    expect(planoDoTipo(cfg, "fundo_fixo")).toBe("2010102");
  });

  it("endereço, autenticação Basic e leitura das respostas", () => {
    expect(urlBase("calper")).toBe("https://api.sienge.com.br/calper/public/api/v1");
    expect(autorizacao("api", "segredo")).toBe(`Basic ${btoa("api:segredo")}`);
    expect(resultados<{ id: number }>({ resultSetMetadata: {}, results: [{ id: 3 }] })).toEqual([{ id: 3 }]);
    expect(idDoTitulo(null, "https://api.sienge.com.br/calper/public/api/v1/bills/9876")).toBe(9876);
    expect(idDoTitulo({ id: 12 }, null)).toBe(12);
    expect(mensagemSienge(400, JSON.stringify({ clientMessage: "Credor inativo" }))).toBe("SIENGE 400: Credor inativo");
    expect(mensagemSienge(401, "")).toMatch(/usuário ou senha/);
  });
});

import * as Dialog from "@radix-ui/react-dialog";
import { FileText, Printer, X, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { moeda } from "../cadeia";
import { dataBR, mesBR } from "../pages/formato";
import { solicitacoesService, type Detalhe } from "../solicitacoes";

// Tela 10 — FormPreview: o formulário no layout padrão 2026 da Calper (A4), com toolbar escura (fechar, zoom, imprimir,
// baixar PDF) e a lista de comprovantes ao lado. "Baixar PDF" usa a impressão do navegador (Salvar como PDF); o PDF que
// vai anexado ao SIENGE sai do mesmo modelo no servidor (Fase 5, parte 2).

const TITULO: Record<Detalhe["tipo"], string> = { reembolso: "REEMBOLSO", fundo_fixo: "FUNDO FIXO DE CAIXA", adiantamento: "ADIANTAMENTO DE NUMERÁRIO" };

export function FormPreview({ d, aberto, onFechar }: { d: Detalhe; aberto: boolean; onFechar: () => void }) {
  const [zoom, setZoom] = useState(1);
  const fundo = d.tipo === "fundo_fixo";
  const gestor = [...d.aprovacoes].reverse().find((a) => a.status === "aprovado" && a.ciclo === d.ciclo);
  const anexos = d.itens.flatMap((i) => i.anexos.map((a) => ({ ...a, valor: i.valor })));
  const abrir = async (path: string) => {
    try {
      window.open(await solicitacoesService.urlAnexo(path), "_blank", "noopener");
    } catch {
      toast.error("Não foi possível abrir o comprovante.");
    }
  };

  return (
    <Dialog.Root open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="sf-modal__fundo" />
        <Dialog.Content className="sf-modal" aria-describedby={undefined}>
          <div className="sf-modal__barra">
            <Dialog.Title className="sf-modal__t">{TITULO[d.tipo]} · {d.numero}</Dialog.Title>
            <button type="button" aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}><ZoomOut size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}><ZoomIn size={16} aria-hidden="true" /></button>
            <button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Imprimir</button>
            <button type="button" onClick={() => window.print()} title="Na janela de impressão, escolha Salvar como PDF"><FileText size={16} aria-hidden="true" />Baixar PDF</button>
            <Dialog.Close asChild>
              <button type="button" aria-label="Fechar"><X size={16} aria-hidden="true" /></button>
            </Dialog.Close>
          </div>
          <div className="sf-modal__corpo">
            <div className="sf-modal__palco">
              <div className="sf-a4" style={{ zoom }}>
                <div className="sf-a4__topo">
                  <div><small>Título:</small><b>{TITULO[d.tipo]}</b></div>
                  <img src="/calper-logo.webp" alt="Calper" height={40} />
                </div>
                <table className="sf-a4__kv">
                  <tbody>
                    {fundo && <tr><th>VALOR DO FUNDO FIXO:</th><td>{moeda(d.valorFundoFixo ?? 0)}</td><th>SALDO INICIAL:</th><td>{moeda(d.saldoInicial ?? 0)}</td></tr>}
                    <tr><th>FUNCIONÁRIO:</th><td>{d.solicitante.nome.toUpperCase()}</td><th>CPF:</th><td>{d.solicitante.cpfMascarado ?? "—"}</td></tr>
                    <tr><th>DEPARTAMENTO:</th><td>{(d.setor?.nome ?? "—").toUpperCase()}</td><th>MÊS:</th><td>{mesBR(d.competencia)}</td></tr>
                    <tr><th>PERÍODO:</th><td>DE {dataBR(d.periodoDe)} A {dataBR(d.periodoAte)}</td><th>Nº:</th><td>{d.numero}</td></tr>
                  </tbody>
                </table>
                <table className="sf-a4__tab">
                  <thead><tr><th>DATA</th><th>VALOR</th><th>{fundo ? "FAVORECIDO" : "DESCRIÇÃO"}</th><th>{fundo ? "MOTIVO / DESCRIÇÃO" : "MOTIVO"}</th></tr></thead>
                  <tbody>
                    {d.itens.map((i) => (
                      <tr key={i.id}><td>{dataBR(i.data)}</td><td className="n">{(i.valor ?? 0).toFixed(2).replace(".", ",")}</td><td>{i.descricao}</td><td>{i.motivo}</td></tr>
                    ))}
                    <tr className="sf-a4__total">
                      <td>{fundo ? "DESPESAS TOTAIS" : "VALOR TOTAL"}</td><td className="n">{d.totalDespesas.toFixed(2).replace(".", ",")}</td>
                      <td>{fundo ? "SALDO FINAL:" : d.valorGlosado > 0 ? "GLOSAS / A PAGAR:" : ""}</td>
                      <td>{fundo ? (d.saldoFinal ?? 0).toFixed(2).replace(".", ",") : d.valorGlosado > 0 ? `${moeda(d.valorGlosado)} / ${moeda(d.valorAPagar ?? 0)}` : ""}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="sf-a4__info">
                  <b>INFORMAÇÕES DE PREENCHIMENTO</b>
                  <p>1 - Preencher corretamente o campo de data, valor, descrição (fornecedor) e motivo da despesa; o reembolso ocorrerá conforme padrão de pagamento, 15 dias.</p>
                  <p>2 - Os comprovantes da despesa seguem anexados a este formulário.</p>
                  <p>3 - As assinaturas do funcionário e do gestor foram substituídas pelo aceite eletrônico e pelas aprovações registradas no Portal.</p>
                </div>
                <div className="sf-a4__aceites">
                  <div><b>ACEITE DO FUNCIONÁRIO</b><span>{d.solicitante.nome} · {d.aceiteEm ? new Date(d.aceiteEm).toLocaleString("pt-BR") : "pendente"}</span></div>
                  <div><b>APROVAÇÃO DO GESTOR</b><span>{gestor ? `${gestor.aprovador ?? gestor.papel} · ${gestor.decididoEm ? new Date(gestor.decididoEm).toLocaleString("pt-BR") : ""}` : "pendente"}</span>{gestor?.comentario && <span>"{gestor.comentario}"</span>}</div>
                </div>
              </div>
            </div>
            <aside className="sf-modal__lado">
              <h3>Comprovantes · {anexos.length}</h3>
              <ul className="sf-fila">
                {anexos.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="sf-fila__item" onClick={() => void abrir(a.path)}>
                      <FileText size={16} aria-hidden="true" />
                      <span><b>{a.nome}</b><small>{moeda(a.valor ?? 0)}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="field__help">O mesmo formulário vai anexado ao lançamento no SIENGE.</p>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

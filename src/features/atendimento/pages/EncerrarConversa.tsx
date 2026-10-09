import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Hourglass, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ServiceError } from "../../configuracoes/services/types";
import { useReturnFocus } from "../../configuracoes/components/useReturnFocus";
import { caminhoServico } from "../../chamados/cadastros/types";
import { useCadastros } from "../../chamados/hooks";
import { useTicket } from "../../chamados/ticket/hooks";
import { ServicoBusca } from "../../chamados/ticket/ServicoBusca";
import { useAcaoConversa, useResumirConversa } from "../hooks/useAtendimento";
import type { Conversa, Setor } from "../services/tipos";
import "../../configuracoes/components/ConfirmDialog.css";

/**
 * "Foi resolvido?" ao encerrar a conversa (mockup aprovado em 09/10/2026, tela 2).
 *   Sim → ticket Resolvido com a solução (sugerida pela IA, revisada aqui), serviço e categoria.
 *   Não → o ticket fica "Em atendimento" (coluna do Kanban) e continua se o colaborador voltar.
 * As regras de resolver são as do ticket (serviço, solução e campos obrigatórios): o erro do banco aparece aqui.
 */
export function EncerrarConversa({ c, setor, open, onOpenChange }: { c: Conversa; setor: Setor | undefined; open: boolean; onOpenChange: (v: boolean) => void }) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="confirm-dialog at-encerrar" {...returnFocus}>
          {open && <Formulario c={c} setor={setor} fechar={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Formulario({ c, setor, fechar }: { c: Conversa; setor: Setor | undefined; fechar: () => void }) {
  const ids = useId();
  const ticket = useTicket(c.ticket ?? 0);
  const cad = useCadastros();
  const acao = useAcaoConversa();
  const resumir = useResumirConversa();
  const [resolvido, setResolvido] = useState(true);
  const [solucao, setSolucao] = useState("");
  const [servicoId, setServicoId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [erro, setErro] = useState<{ campo?: string; mensagem: string } | null>(null);
  const [daIa, setDaIa] = useState(false);
  const carregou = useRef(false);

  // Ao abrir: o que o ticket já tem (a IA de triagem pode ter escolhido o serviço) e, sem solução, a sugestão da IA.
  useEffect(() => {
    if (carregou.current || !ticket.data) return;
    carregou.current = true;
    setServicoId(ticket.data.servicoId);
    setCategoriaId(ticket.data.categoriaId);
    if (ticket.data.solucaoAplicada) setSolucao(ticket.data.solucaoAplicada);
    else if (c.ticket) sugerir();
    // Só na primeira carga do ticket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.data]);

  const sugerir = () =>
    resumir.mutate(c.ticket!, {
      onSuccess: (r) => {
        setSolucao(r.solucao);
        setDaIa(true);
      },
      onError: () => toast.error("A IA não conseguiu resumir. Escreva a solução."),
    });

  const opcoesServico = useMemo(() => {
    const servicos = cad.data?.servicos ?? [];
    return servicos
      .filter((s) => (s.ativo || s.id === servicoId) && !servicos.some((f) => f.paiId === s.id))
      .map((s) => ({ id: s.id, rotulo: caminhoServico(s.id, servicos) }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [cad.data?.servicos, servicoId]);

  const confirmar = () => {
    setErro(null);
    const resolver = resolvido && Boolean(c.ticket);
    acao.mutate(
      {
        conversaId: c.id,
        acao: resolver ? { acao: "encerrar", resolvido: true, solucao: solucao.trim(), servicoId, categoriaId } : { acao: "encerrar", resolvido: false },
      },
      {
        onSuccess: () => {
          toast.success(!c.ticket ? "Conversa encerrada" : resolver ? `Conversa encerrada · ticket #${c.ticket} resolvido` : `Conversa encerrada · ticket #${c.ticket} continua em atendimento`);
          fechar();
        },
        onError: (e) => setErro(e instanceof ServiceError ? { campo: e.field, mensagem: e.message } : { mensagem: "Não foi possível encerrar." }),
      },
    );
  };

  const nome = c.nome ?? c.telefone;
  return (
    <>
      <Dialog.Title className="confirm-dialog__title">Encerrar conversa com {nome}</Dialog.Title>
      <Dialog.Description className="confirm-dialog__description">
        {c.ticket ? <>O ticket #{c.ticket} fica com a conversa inteira. </> : null}O colaborador recebe a mensagem de encerramento do setor{setor ? ` (${setor.nome})` : ""}.
      </Dialog.Description>

      <fieldset className="at-enc__escolha" disabled={!c.ticket}>
        <legend className="field__label">A demanda foi resolvida? *</legend>
        <label className={resolvido ? "at-enc__op at-enc__op--on" : "at-enc__op"}>
          <input type="radio" name={`${ids}-res`} checked={resolvido} onChange={() => setResolvido(true)} />
          <span>
            <b><CheckCircle2 size={15} aria-hidden="true" /> Sim, resolvida</b>
            <small>Ticket vai para <b>Resolvido</b> com a solução abaixo.</small>
          </span>
        </label>
        <label className={!resolvido ? "at-enc__op at-enc__op--on" : "at-enc__op"}>
          <input type="radio" name={`${ids}-res`} checked={!resolvido} onChange={() => setResolvido(false)} />
          <span>
            <b><Hourglass size={15} aria-hidden="true" /> Não, continua</b>
            <small>Ticket fica <b>Em atendimento</b> na coluna do Kanban.</small>
          </span>
        </label>
      </fieldset>

      {resolvido && c.ticket && (
        <div className="at-enc__campos">
          <div className="field">
            <label className="field__label at-enc__rot" htmlFor={`${ids}-sol`}>
              Solução aplicada *
              {resumir.isPending ? (
                <span className="at-enc__ia">✦ A IA está resumindo…</span>
              ) : daIa ? (
                <span className="at-enc__ia">✦ Resumida pela IA — revise</span>
              ) : (
                <button type="button" className="btn btn--outline btn--sm" onClick={sugerir}>
                  <Sparkles size={13} aria-hidden="true" /> Sugerir com IA
                </button>
              )}
            </label>
            <textarea id={`${ids}-sol`} className="input" rows={3} maxLength={20000} value={solucao} onChange={(e) => { setSolucao(e.target.value); setDaIa(false); }} placeholder="O que resolveu o problema" />
            {erro?.campo === "solucaoAplicada" && <span className="field__error" role="alert">{erro.mensagem}</span>}
          </div>
          <div className="field">
            <span className="field__label" id={`${ids}-sv`}>Serviço *</span>
            <ServicoBusca rotuloId={`${ids}-sv`} opcoes={opcoesServico} valor={servicoId} onChange={setServicoId} />
            {erro?.campo === "servicoId" && <span className="field__error" role="alert">{erro.mensagem}</span>}
          </div>
          <label className="field">
            <span className="field__label">Categoria</span>
            <select className="input" value={categoriaId ?? ""} onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Selecione —</option>
              {(cad.data?.categorias ?? [])
                .filter((x) => x.ativa || x.id === categoriaId)
                .map((x) => (
                  <option key={x.id} value={x.id}>{x.nome}</option>
                ))}
            </select>
          </label>
        </div>
      )}

      {erro && !["solucaoAplicada", "servicoId"].includes(erro.campo ?? "") && <p className="field__error" role="alert">{erro.mensagem}</p>}

      <div className="confirm-dialog__actions">
        <Dialog.Close asChild>
          <button type="button" className="btn btn--outline" disabled={acao.isPending}>Cancelar</button>
        </Dialog.Close>
        <button type="button" className="btn btn--primary" disabled={acao.isPending || (resolvido && !!c.ticket && (!solucao.trim() || !servicoId))} onClick={confirmar}>
          {acao.isPending ? "Aguarde…" : resolvido && c.ticket ? "Encerrar e resolver ticket" : "Encerrar e manter em atendimento"}
        </button>
      </div>
    </>
  );
}

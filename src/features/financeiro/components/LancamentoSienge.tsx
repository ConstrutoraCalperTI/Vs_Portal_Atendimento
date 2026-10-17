import * as Dialog from "@radix-ui/react-dialog";
import { HardDrive, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ServiceError } from "../../configuracoes/services/types";
import { moeda } from "../cadeia";
import { useLancarSienge, useListasSienge } from "../hooks";
import type { Detalhe } from "../solicitacoes";

// "Lançamento no SIENGE" (tela 9): o conferente confirma centro de custo, plano financeiro e vencimento; a Edge Function
// procura o credor pelo CPF, evita título duplicado pelo número SF-…, cria o título e anexa o PDF e os comprovantes.

export function LancamentoSienge({ d, aberto, onFechar }: { d: Detalhe; aberto: boolean; onFechar: () => void }) {
  const ids = useId();
  const listas = useListasSienge(aberto);
  const lancar = useLancarSienge();
  const plano0 = d.tipo === "reembolso" ? listas.data?.padroes.planoReembolso : d.tipo === "fundo_fixo" ? listas.data?.padroes.planoFundoFixo : listas.data?.padroes.planoAdiantamento;
  const [cc, setCc] = useState("");
  const [plano, setPlano] = useState("");
  const [venc, setVenc] = useState(d.pagarAte ?? new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!listas.data) return;
    setCc((v) => v || (listas.data.padroes.centroCustoPadrao ? String(listas.data.padroes.centroCustoPadrao) : ""));
    setPlano((v) => v || (plano0 ?? ""));
  }, [listas.data, plano0]);

  const enviar = () => {
    setErro(null);
    lancar.mutate(
      { solicitacaoId: d.id, centroCustoId: Number(cc), plano, vencimento: venc },
      {
        onSuccess: (r) => {
          toast.success(r.jaExistia ? `O título ${r.titulo} já existia no SIENGE: vinculado.` : `Título ${r.titulo} criado no SIENGE.`);
          if (r.avisos.length) toast.warning(`Anexos com problema: ${r.avisos.join("; ")}`);
          onFechar();
        },
        onError: (e) => setErro(e instanceof ServiceError ? e.message : "Não foi possível lançar no SIENGE."),
      },
    );
  };

  return (
    <Dialog.Root open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="sf-modal__fundo" />
        <Dialog.Content className="sf-dialogo" aria-describedby={`${ids}-d`}>
          <div className="row-b">
            <Dialog.Title className="sf-dialogo__t">Lançamento no SIENGE</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="icon-btn" aria-label="Fechar"><X size={16} aria-hidden="true" /></button></Dialog.Close>
          </div>
          <p id={`${ids}-d`} className="field__help">
            {d.numero} · {d.solicitante.nome} · valor a pagar <b>{moeda(d.valorAPagar ?? d.totalDespesas)}</b>. O credor é o colaborador (pelo CPF); o PDF do formulário e os comprovantes vão anexados.
          </p>
          {listas.isPending && <p className="field__help">Carregando centros de custo e planos do SIENGE…</p>}
          {listas.isError && <p className="field__error" role="alert">{listas.error instanceof ServiceError ? listas.error.message : "Não foi possível consultar o SIENGE."}</p>}
          <div className="sf-campos">
            <div className="field">
              <label className="field__label" htmlFor={`${ids}-cc`}>Centro de custo</label>
              <select id={`${ids}-cc`} className="input" value={cc} onChange={(e) => setCc(e.target.value)}>
                <option value="">Escolha…</option>
                {(listas.data?.centrosCusto ?? []).map((x) => <option key={x.id} value={x.id}>{x.id} · {x.nome}</option>)}
              </select>
              {d.centroCusto && <span className="field__help">Informado na solicitação: {d.centroCusto}</span>}
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${ids}-pl`}>Plano financeiro</label>
              <select id={`${ids}-pl`} className="input" value={plano} onChange={(e) => setPlano(e.target.value)}>
                <option value="">Escolha…</option>
                {(listas.data?.planos ?? []).map((x) => <option key={x.id} value={x.id}>{x.id} · {x.nome}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${ids}-v`}>Vencimento</label>
              <input id={`${ids}-v`} className="input" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
            </div>
          </div>
          {erro && <p className="field__error sf-dialogo__erro" role="alert">{erro}</p>}
          <div className="at-rodape">
            <Dialog.Close asChild><button type="button" className="btn btn--outline">Cancelar</button></Dialog.Close>
            <button type="button" className="btn btn--primary" disabled={lancar.isPending || !cc || !plano || !venc} onClick={enviar}>
              <HardDrive size={16} aria-hidden="true" />
              {lancar.isPending ? "Lançando…" : "Lançar no SIENGE"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

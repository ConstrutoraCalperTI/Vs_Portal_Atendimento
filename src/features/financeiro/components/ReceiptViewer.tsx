import { ExternalLink, Maximize, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";

// ReceiptViewer (CONTEXTO.md, seção 7): fundo escuro (--viewer), zoom, girar e tela cheia. Imagens aparecem na tela;
// PDF abre em nova aba (a CSP do portal bloqueia iframe/object).

export function ReceiptViewer({ url, mime, nome }: { url: string | null; mime: string; nome: string }) {
  const palco = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  const pdf = mime === "application/pdf";
  return (
    <div className="sf-viewer">
      <div className="sf-viewer__barra">
        <span className="sf-viewer__nome" title={nome}>{nome}</span>
        {!pdf && (
          <>
            <button type="button" aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><ZoomOut size={16} aria-hidden="true" /></button>
            <span aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}><ZoomIn size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Girar" onClick={() => setGiro((g) => (g + 90) % 360)}><RotateCw size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Tela cheia" onClick={() => void palco.current?.requestFullscreen?.()}><Maximize size={16} aria-hidden="true" /></button>
          </>
        )}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em nova aba"><ExternalLink size={16} aria-hidden="true" /></a>
        )}
      </div>
      <div className="sf-viewer__palco" ref={palco}>
        {!url ? (
          <span className="sf-viewer__msg">Carregando o comprovante…</span>
        ) : pdf ? (
          <a className="btn btn--outline sf-viewer__pdf" href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Abrir PDF
          </a>
        ) : (
          <img src={url} alt={`Comprovante ${nome}`} style={{ transform: `scale(${zoom}) rotate(${giro}deg)` }} />
        )}
      </div>
    </div>
  );
}

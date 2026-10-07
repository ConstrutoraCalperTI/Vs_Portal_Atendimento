import { Pill } from "./Pill";
import { slaLabel, slaTone } from "./sla";

export interface QueueTableRow {
  id: number;
  requester: string;
  subject: string;
  team: string;
  service: string;
  origin: string;
  owner: { name: string; initials: string } | null;
  /** Minutos até o prazo de solução; negativo = vencido. */
  dueMinutes: number;
}

interface QueueTableProps {
  rows: readonly QueueTableRow[];
  onOpen: (id: number) => void;
  emptyMessage?: string;
}

export function QueueTable({ rows, onOpen, emptyMessage = "Nenhum ticket encontrado. Ajuste os filtros ou a busca." }: QueueTableProps) {
  return (
    <div className="ds-tablewrap">
      <table className="ds-table">
        <thead>
          <tr>
            <th scope="col">TICKET / CATEGORIA</th>
            <th scope="col">ORIGEM</th>
            <th scope="col">RESPONSÁVEL</th>
            <th scope="col">SLA DE SOLUÇÃO</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="ds-table__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="ds-ticket-id">
                    <span className="ds-mono">#{row.id}</span> · {row.requester}
                  </div>
                  <button type="button" className="ds-ticketbtn" onClick={() => onOpen(row.id)}>
                    {row.subject}
                  </button>
                  <div className="ds-ticket-category">
                    {row.team} › {row.service}
                  </div>
                </td>
                <td>
                  <Pill>{row.origin}</Pill>
                </td>
                <td>
                  {row.owner ? (
                    <div className="ds-owner">
                      <span className="ds-miniavatar" aria-hidden="true">
                        {row.owner.initials}
                      </span>
                      {row.owner.name}
                    </div>
                  ) : (
                    <Pill tone="amber">Não atribuído</Pill>
                  )}
                </td>
                <td>
                  <Pill tone={slaTone(row.dueMinutes)}>{slaLabel(row.dueMinutes)}</Pill>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

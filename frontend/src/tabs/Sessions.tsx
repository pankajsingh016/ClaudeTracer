import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Bot } from "lucide-react";
import { SessionSummary, fmtCost, fmtTokens, fmtDate } from "@/api";
import { DashCard, ModelBadge, Empty } from "@/components/dashboard-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SortKey = "started" | "cost" | "total_tokens" | "assistant_msgs";

export default function Sessions({
  sessions,
  onOpen,
}: {
  sessions: SessionSummary[];
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("started");
  const [dir, setDir] = useState<1 | -1>(-1);

  const sorted = [...sessions].sort((a, b) => {
    const av = (a[sort] ?? 0) as number;
    const bv = (b[sort] ?? 0) as number;
    return (av - bv) * dir;
  });

  const toggleSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(-1);
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (k !== sort) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return dir === 1 ? (
      <ArrowUp className="h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" />
    );
  };

  const SortHead = ({
    k,
    label,
    right,
  }: {
    k?: SortKey;
    label: string;
    right?: boolean;
  }) => (
    <TableHead
      onClick={k ? () => toggleSort(k) : undefined}
      className={cn(
        k && "cursor-pointer select-none hover:text-foreground transition-colors",
        right && "text-right"
      )}
    >
      <span className={cn("inline-flex items-center gap-1", right && "justify-end w-full")}>
        {label}
        {k && <SortIcon k={k} />}
      </span>
    </TableHead>
  );

  if (!sessions.length)
    return (
      <Empty icon={Bot}>No sessions match your filters.</Empty>
    );

  return (
    <DashCard flush title={`${sessions.length} sessions`}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHead label="Session" />
            <SortHead label="Project" />
            <SortHead k="started" label="Last active" />
            <SortHead k="assistant_msgs" label="Msgs" right />
            <SortHead label="Models" />
            <SortHead k="total_tokens" label="Tokens" right />
            <SortHead k="cost" label="Cost" right />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((s) => (
            <TableRow
              key={s.id}
              onClick={() => onOpen(s.id)}
              className="cursor-pointer"
            >
              <TableCell className="max-w-[320px]">
                <div className="truncate font-medium">{s.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {s.is_subagent && (
                    <Badge variant="secondary" className="mr-1.5 text-[10px] h-4 px-1.5">
                      subagent
                    </Badge>
                  )}
                  {s.branch || "—"} · {s.tool_uses} tool calls
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{s.project_name}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                {fmtDate(s.started)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{s.assistant_msgs}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {s.models.map((m) => (
                    <ModelBadge key={m} model={m} />
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {fmtTokens(s.total_tokens)}
              </TableCell>
              <TableCell className="text-right font-semibold text-primary tabular-nums">
                {fmtCost(s.cost)}
                {s.estimated && (
                  <span title="estimated rate" className="text-muted-foreground font-normal">
                    *
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DashCard>
  );
}

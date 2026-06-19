import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Brain,
  Wrench,
  AlertTriangle,
  Terminal,
  User,
  Bot,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { fmtCost, fmtTokens, fmtDate, costState } from "@/api";
import { ModelBadge, Spinner, Empty } from "@/components/dashboard-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PREVIEW_CHARS = 140;
const SHORT_MSG_CHARS = 220;

function fmtTime(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number) {
  const flat = oneLine(text);
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

function blockBrief(b: TranscriptBlock): { label: string; tone?: "violet" | "amber" | "error" | "muted" } {
  switch (b.kind) {
    case "text":
      return { label: truncate(b.text ?? "", PREVIEW_CHARS), tone: "muted" };
    case "thinking":
      return {
        label: `Thinking · ${(b.text?.length ?? 0).toLocaleString()} chars`,
        tone: "violet",
      };
    case "tool_use":
      return { label: `Tool · ${b.name ?? "unknown"}`, tone: "amber" };
    case "tool_result": {
      const lines = b.text?.split("\n").length ?? 0;
      const preview = b.text ? truncate(b.text, 60) : "";
      return {
        label: b.is_error
          ? `Error · ${lines} lines`
          : preview
            ? `Output · ${lines} lines · ${preview}`
            : `Output · ${lines} lines`,
        tone: b.is_error ? "error" : "muted",
      };
    }
    default:
      return { label: "" };
  }
}

function eventTextLength(event: TranscriptEvent) {
  return event.blocks
    .filter((b) => b.kind === "text")
    .reduce((n, b) => n + (b.text?.length ?? 0), 0);
}

function isLongMessage(event: TranscriptEvent) {
  const textLen = eventTextLength(event);
  const hasHeavy = event.blocks.some(
    (b) => b.kind === "thinking" || b.kind === "tool_use" || b.kind === "tool_result"
  );
  return textLen > SHORT_MSG_CHARS || hasHeavy;
}

function defaultExpanded(index: number, total: number, event: TranscriptEvent) {
  if (index === total - 1) return true;
  if (event.role === "user" && !isLongMessage(event)) return true;
  return false;
}

function BlockCollapsible({
  label,
  children,
  tone = "default",
  icon: Icon,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "default" | "violet" | "amber" | "error";
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const styles = {
    default: "bg-muted/40 border-border/60 text-muted-foreground",
    violet: "bg-violet-500/5 border-violet-500/25 text-violet-700 dark:text-violet-300",
    amber: "bg-amber-500/5 border-amber-500/25 text-amber-800 dark:text-amber-300",
    error: "bg-destructive/5 border-destructive/30 text-destructive",
  }[tone];

  return (
    <div className={cn("mt-2 rounded-lg border overflow-hidden", styles)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />}
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="border-t border-inherit px-3 py-2.5 max-h-72 overflow-y-auto">{children}</div>}
    </div>
  );
}

function BlockFull({ b, isUser }: { b: TranscriptBlock; isUser: boolean }) {
  if (b.kind === "text") {
    if (!b.text?.trim()) return null;
    return (
      <div className="whitespace-pre-wrap text-[13px] leading-[1.65] break-words text-foreground/95">
        {b.text}
      </div>
    );
  }
  if (b.kind === "thinking") {
    return (
      <BlockCollapsible label="Extended thinking" tone="violet" icon={Brain}>
        <div className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground italic">
          {b.text}
        </div>
      </BlockCollapsible>
    );
  }
  if (b.kind === "tool_use") {
    return (
      <BlockCollapsible label={b.name ?? "Tool call"} tone="amber" icon={Wrench}>
        <pre className="text-[11px] leading-relaxed overflow-x-auto font-mono text-amber-950 dark:text-amber-100/90">
          {JSON.stringify(b.input, null, 2)}
        </pre>
      </BlockCollapsible>
    );
  }
  if (b.kind === "tool_result") {
    return (
      <BlockCollapsible
        label={b.is_error ? "Tool error" : "Tool output"}
        tone={b.is_error ? "error" : "default"}
        icon={b.is_error ? AlertTriangle : Terminal}
        defaultOpen={b.is_error}
      >
        <pre
          className={cn(
            "text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words",
            b.is_error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {b.text}
        </pre>
      </BlockCollapsible>
    );
  }
  return null;
}

function BriefBadges({ blocks }: { blocks: TranscriptBlock[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {blocks.map((b, i) => {
        const { label, tone } = blockBrief(b);
        if (!label) return null;
        const Icon =
          b.kind === "thinking" ? Brain : b.kind === "tool_use" ? Wrench : b.kind === "tool_result" ? Terminal : null;
        return (
          <span
            key={i}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] max-w-full",
              tone === "violet" && "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
              tone === "amber" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
              tone === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
              (!tone || tone === "muted") && "border-border/60 bg-muted/30 text-muted-foreground"
            )}
          >
            {Icon && <Icon className="h-3 w-3 shrink-0 opacity-70" />}
            <span className="truncate">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

function ChatBubble({
  event,
  index,
  expanded,
  onToggle,
}: {
  event: TranscriptEvent;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isUser = event.role === "user";
  const visibleBlocks = event.blocks.filter(
    (b) => b.kind !== "text" || (b.text && b.text.trim())
  );
  if (!visibleBlocks.length) return null;

  const long = isLongMessage(event);
  const primaryText = visibleBlocks.find((b) => b.kind === "text")?.text;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "shrink-0 h-8 w-8 rounded-full grid place-items-center ring-2 ring-background shadow-sm",
          isUser
            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
            : "bg-primary/15 text-primary"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      <div
        className={cn(
          "flex flex-col gap-1 min-w-0 flex-1 max-w-[min(100%,680px)]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 px-0.5 text-[11px] text-muted-foreground w-full",
            isUser ? "flex-row-reverse" : "flex-row"
          )}
        >
          <span className="font-semibold text-foreground/80">{isUser ? "You" : "Claude"}</span>
          <span className="opacity-30">·</span>
          <span className="tabular-nums">#{index + 1}</span>
          {event.ts && (
            <>
              <span className="opacity-30">·</span>
              <span className="tabular-nums">{fmtTime(event.ts)}</span>
            </>
          )}
          {!isUser && event.model && (
            <>
              <span className="opacity-30 hidden sm:inline">·</span>
              <span className="hidden sm:inline">
                <ModelBadge model={event.model} />
              </span>
            </>
          )}
          {!isUser && (event.cost ?? 0) > 0 && (
            <span className="tabular-nums ml-auto hidden sm:inline text-[10px]">
              {fmtCost(event.cost!)} · {fmtTokens(event.tokens || 0)}
            </span>
          )}
        </div>

        <div
          className={cn(
            "w-full rounded-2xl px-3.5 py-2.5 shadow-sm",
            isUser
              ? "bg-blue-500/[0.08] border border-blue-500/20 rounded-tr-md"
              : "bg-card border border-border rounded-tl-md"
          )}
        >
          {!expanded ? (
            <div className="space-y-2">
              {primaryText && (
                <p className="text-[13px] leading-snug text-foreground/90 line-clamp-2">
                  {truncate(primaryText, PREVIEW_CHARS)}
                </p>
              )}
              <BriefBadges blocks={visibleBlocks.filter((b) => b.kind !== "text" || !primaryText)} />
              {!primaryText && visibleBlocks.length > 0 && (
                <BriefBadges blocks={visibleBlocks} />
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {!isUser && event.model && (
                <div className="mb-2 pb-2 border-b border-border/50 flex flex-wrap items-center gap-2 sm:hidden">
                  <ModelBadge model={event.model} />
                  {(event.cost ?? 0) > 0 && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {fmtCost(event.cost!)} · {fmtTokens(event.tokens || 0)} tok
                    </span>
                  )}
                </div>
              )}
              {visibleBlocks.map((b, j) => (
                <BlockFull key={j} b={b} isUser={isUser} />
              ))}
            </div>
          )}

          {long && (
            <button
              type="button"
              onClick={onToggle}
              className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> Show full message
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Transcript({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    setExpanded(new Set());
    api.transcript(sessionId).then(setData).catch((e) => setErr(String(e)));
  }, [sessionId]);

  useEffect(() => {
    if (!data) return;
    const initial = new Set<number>();
    data.events.forEach((e, i) => {
      if (defaultExpanded(i, data.events.length, e)) initial.add(i);
    });
    setExpanded(initial);
  }, [data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data, expanded]);

  if (err) return <Empty>Could not load transcript: {err}</Empty>;
  if (!data) return <Spinner label="Loading transcript…" />;

  const s = data.session;
  const total = data.events.length;
  const allExpanded = expanded.size >= total;

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(data.events.map((_, i) => i)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — fixed */}
      <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-xl px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="gap-1.5 -ml-2 mb-0.5 h-8 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Sessions
            </Button>
            <h2 className="text-base font-semibold tracking-tight truncate">{s.title}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {s.project_name} · {s.branch || "—"} · {total} messages · {fmtDate(s.started)}
              <span className="hidden sm:inline"> · {costState.basisLabel}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={allExpanded ? collapseAll : expandAll}>
              {allExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
            {[
              { label: "Cost", value: fmtCost(s.cost), hl: true },
              { label: "Tokens", value: fmtTokens(s.total_tokens) },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-md border border-border/60 bg-card/60 px-2.5 py-1.5 text-center"
              >
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{stat.label}</div>
                <div className={cn("text-xs font-bold tabular-nums", stat.hl && "text-primary")}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-8">
          {data.events.length === 0 ? (
            <Empty>No messages in this session.</Empty>
          ) : (
            <div className="space-y-4">
              {data.events.map((e, i) => (
                <ChatBubble
                  key={`${e.ts}-${i}`}
                  event={e}
                  index={i}
                  expanded={expanded.has(i)}
                  onToggle={() => toggle(i)}
                />
              ))}
              <div className="flex justify-center pt-2">
                <Badge variant="secondary" className="gap-1.5 text-xs font-normal text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  End of session · {fmtCost(s.cost)} total
                </Badge>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

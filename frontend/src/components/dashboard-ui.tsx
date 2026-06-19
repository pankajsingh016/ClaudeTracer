import CountUp from "react-countup";
import { ReactNode } from "react";
import {
  DollarSign,
  Coins,
  MessageSquare,
  PiggyBank,
  Loader2,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { modelColor, shortModel } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function DashCard({
  children,
  className = "",
  title,
  description,
  right,
  icon: Icon,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  right?: ReactNode;
  icon?: LucideIcon;
  flush?: boolean;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {(title || right) && (
        <CardHeader className={cn("flex-row items-center justify-between space-y-0", flush ? "pb-0" : "pb-3")}>
          <div className="flex items-center gap-2">
            {Icon && (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-3.5 w-3.5" />
              </div>
            )}
            <div>
              {title && <CardTitle>{title}</CardTitle>}
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5 normal-case tracking-normal font-normal">
                  {description}
                </p>
              )}
            </div>
          </div>
          {right}
        </CardHeader>
      )}
      <CardContent className={cn(flush ? "p-0" : title || right ? "pt-0" : "")}>
        {children}
      </CardContent>
    </Card>
  );
}

const KPI_ICONS: Record<string, LucideIcon> = {
  cost: DollarSign,
  tokens: Coins,
  sessions: MessageSquare,
  savings: PiggyBank,
};

export function KPI({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  sub,
  accent = "hsl(var(--primary))",
  kind = "cost",
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  sub?: string;
  accent?: string;
  kind?: keyof typeof KPI_ICONS;
}) {
  const Icon = KPI_ICONS[kind] ?? DollarSign;
  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-glow-sm hover:-translate-y-0.5">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </div>
            <div
              className="mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums"
              style={{ color: accent }}
            >
              <CountUp
                end={value}
                duration={1.1}
                separator=","
                decimals={decimals}
                prefix={prefix}
                suffix={suffix}
              />
            </div>
            {sub && (
              <div className="mt-2 text-xs text-muted-foreground truncate">{sub}</div>
            )}
          </div>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl opacity-80 transition-opacity group-hover:opacity-100"
            style={{ background: `${accent}18`, color: accent }}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ModelBadge({ model }: { model: string }) {
  const c = modelColor(model);
  return (
    <Badge
      variant="outline"
      className="gap-1.5 rounded-full font-medium border"
      style={{ background: `${c}14`, color: c, borderColor: `${c}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c }} />
      {shortModel(model)}
    </Badge>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-muted-foreground p-16 justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function Empty({ children, icon: Icon = Inbox }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center text-muted-foreground p-12 text-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
        <Icon className="h-6 w-6 opacity-50" />
      </div>
      <div>{children}</div>
    </div>
  );
}

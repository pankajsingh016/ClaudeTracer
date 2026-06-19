import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Sparkles,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import {
  Analytics,
  Meta,
  Project,
  SessionSummary,
  api,
  setCostBasis,
  shortModel,
} from "@/api";
import {
  PLANS,
  PLAN_GROUPS,
  planById,
  loadPlanPrefs,
  savePlanPrefs,
  planCostFactor,
  planCostLabel,
} from "@/plans";
import { Spinner } from "@/components/dashboard-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import Overview from "@/tabs/Overview";
import Sessions from "@/tabs/Sessions";
import Transcript from "@/tabs/Transcript";

type Tab = "overview" | "sessions";

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [tab, setTab] = useState<Tab>("overview");
  const [projectFilter, setProjectFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [planPrefs] = useState(loadPlanPrefs);
  const [planId, setPlanId] = useState(planPrefs.planId);
  const [enterpriseDiscountPct, setEnterpriseDiscountPct] = useState(planPrefs.discountPct);
  const [planCustomFactor, setPlanCustomFactor] = useState(planPrefs.customFactor);

  const activePlan = planById(planId);
  const serverDiscount = meta?.modifiers?.enterprise_discount_mult;
  const planFactorValue = planCostFactor(
    planId,
    enterpriseDiscountPct,
    planCustomFactor,
    activePlan.usesEnterpriseDiscount ? serverDiscount : undefined
  );
  setCostBasis(
    planFactorValue,
    planId,
    planCostLabel(planId, enterpriseDiscountPct, planCustomFactor)
  );

  useEffect(() => {
    savePlanPrefs(planId, enterpriseDiscountPct, planCustomFactor);
  }, [planId, enterpriseDiscountPct, planCustomFactor]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    if (silent) setRefreshing(true);
    try {
      const [m, p, a, s] = await Promise.all([
        api.meta(),
        api.projects(),
        api.analytics(projectFilter || undefined, modelFilter || undefined),
        api.sessions(projectFilter || undefined),
      ]);
      setMeta(m);
      setProjects(p);
      setAnalytics(a);
      setSessions(s);
      setLastSync(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectFilter, modelFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => load(true), 10000);
    return () => clearInterval(id);
  }, [auto, load]);

  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => p.models.forEach((m) => set.add(m)));
    return [...set];
  }, [projects]);

  const visibleSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (modelFilter && !s.models.includes(modelFilter)) return false;
      if (q) {
        const hay = `${s.title} ${s.project_name} ${s.branch} ${s.agent_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, modelFilter, query]);

  if (loading)
    return (
      <div className="min-h-full grid place-items-center">
        <Spinner label="Loading ClaudeTracer…" />
      </div>
    );

  const viewKey = selected ? `t-${selected}` : `${tab}-${planId}-${planFactorValue}`;
  const activeTab = selected ? undefined : tab;

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("min-h-full", selected && "h-dvh flex flex-col overflow-hidden")}>
        <header className="sticky top-0 z-20 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2.5 mr-1 shrink-0">
              <div
                className="h-8 w-8 rounded-xl grid place-items-center shadow-glow"
                style={{ background: "linear-gradient(135deg, #e08a6b, #c96a4a)" }}
              >
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <div className="font-semibold text-[15px] tracking-tight sm:hidden">
                  <span className="text-primary">Tracer</span>
                </div>
                <div className="leading-tight hidden sm:block">
                  <div className="font-semibold text-[15px] tracking-tight">
                    Claude<span className="text-primary">Tracer</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">
                    {meta?.claude_dir}
                  </div>
                </div>
              </div>
            </div>

            <Separator orientation="vertical" className="h-6 hidden sm:block" />

            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setTab(v as Tab);
                setSelected(null);
              }}
            >
              <TabsList className="h-9">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="sessions">Sessions</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (e.target.value) {
                      setTab("sessions");
                      setSelected(null);
                    }
                  }}
                  placeholder="Search sessions…"
                  className="w-44 pl-8 h-9"
                />
              </div>

              <Select
                value={projectFilter || "__all__"}
                onValueChange={(v) => {
                  setProjectFilter(v === "__all__" ? "" : v);
                  setSelected(null);
                }}
              >
                <SelectTrigger className="w-[140px] h-9 hidden lg:flex">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={modelFilter || "__all__"}
                onValueChange={(v) => setModelFilter(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="w-[130px] h-9 hidden lg:flex">
                  <SelectValue placeholder="All models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All models</SelectItem>
                  {modelOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {shortModel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Separator orientation="vertical" className="h-6 hidden xl:block" />

              <div className="hidden xl:flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Plan
                </span>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger className="w-[180px] h-9 border-primary/30" title={activePlan.note}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(420px,70vh)]">
                    {PLAN_GROUPS.map((g) => (
                      <SelectGroup key={g}>
                        <SelectLabel>{g}</SelectLabel>
                        {PLANS.filter((p) => p.group === g).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {activePlan.usesEnterpriseDiscount && (
                  <div
                    className="flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-2 py-1"
                    title="Contract discount off list API — tune to match Settings → Usage"
                  >
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Discount
                    </span>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="99"
                      value={enterpriseDiscountPct}
                      onChange={(e) =>
                        setEnterpriseDiscountPct(
                          Math.min(99, Math.max(0, parseFloat(e.target.value) || 0))
                        )
                      }
                      className="w-12 h-7 text-xs border-0 bg-transparent px-1 focus-visible:ring-0"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
                {activePlan.usesCustomFactor && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={planCustomFactor}
                      onChange={(e) => setPlanCustomFactor(parseFloat(e.target.value) || 0)}
                      className="w-16 h-9"
                    />
                  </div>
                )}
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => load(true)}
                    disabled={refreshing}
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {lastSync ? `Last sync ${lastSync.toLocaleTimeString()}` : "Refresh data"}
                </TooltipContent>
              </Tooltip>

              <ThemeToggle />

              <div className="flex items-center gap-2">
                <Checkbox
                  id="auto-refresh"
                  checked={auto}
                  onCheckedChange={(c) => setAuto(c === true)}
                />
                <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
                  Auto
                </Label>
              </div>
            </div>
          </div>
        </header>

        <main
          className={cn(
            "mx-auto flex flex-col min-h-0",
            selected ? "flex-1 overflow-hidden w-full" : "max-w-7xl px-4 sm:px-6 py-6"
          )}
        >
          {error && (
            <Alert variant="destructive" className={cn("mb-4", selected && "mx-4 sm:mx-6 mt-4 shrink-0")}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {meta && !meta.exists && (
            <Alert variant="warning" className={cn("mb-4", selected && "mx-4 sm:mx-6 shrink-0")}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No <code className="font-mono text-xs">projects/</code> under{" "}
                <code className="font-mono text-xs">{meta.claude_dir}</code>. Set{" "}
                <code className="font-mono text-xs">CLAUDE_DIR</code> in <code className="font-mono text-xs">.env</code> or use Claude Code first.
              </AlertDescription>
            </Alert>
          )}

          <div key={viewKey} className={cn("animate-rise", selected && "flex-1 min-h-0 flex flex-col")}>
            {selected ? (
              <Transcript sessionId={selected} onBack={() => setSelected(null)} />
            ) : tab === "overview" && analytics ? (
              <Overview
                analytics={analytics}
                projects={projects}
                onSelectProject={(key) => {
                  setProjectFilter(key);
                  setTab("sessions");
                }}
              />
            ) : (
              <Sessions sessions={visibleSessions} onOpen={setSelected} />
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

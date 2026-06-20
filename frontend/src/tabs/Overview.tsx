import {
  CalendarDays,
  PieChart,
  BarChart3,
  Waves,
  LayoutGrid,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { Analytics, Project, fmtCost, applyFactor, fmtTokens, fmtDay, costState } from "@/api";
import { DashCard, KPI, ModelBadge, Empty } from "@/components/dashboard-ui";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CalendarChart,
  SunburstChart,
  StreamChart,
  TreemapChart,
  ModelCostBar,
  CostLineChart,
} from "@/components/charts";

export default function Overview({
  analytics,
  projects,
  onSelectProject,
}: {
  analytics: Analytics;
  projects: Project[];
  onSelectProject: (key: string) => void;
}) {
  const t = analytics.totals;
  const maxCost = Math.max(1, ...projects.map((p) => p.cost));

  if (!projects.length) return <Empty>No sessions found — open a project in Claude Code first.</Empty>;

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI
          label="Usage cost"
          value={applyFactor(t.cost)}
          prefix="$"
          decimals={2}
          kind="cost"
          sub={costState.basisLabel}
        />
        <KPI
          label="Generation tokens"
          value={t.tokens}
          accent="#a78bfa"
          kind="tokens"
          sub="input + output"
        />
        <KPI
          label="Sessions"
          value={t.sessions}
          accent="#60a5fa"
          kind="sessions"
        />
        <KPI
          label="Saved by caching"
          value={applyFactor(t.savings)}
          prefix="$"
          decimals={2}
          accent="#34d399"
          kind="savings"
          sub="vs. full input price"
        />
      </div>

      {/* Cost over time + calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Daily cost trend" icon={TrendingUp} description={costState.basisLabel}>
          {analytics.cost_over_time.length ? (
            <CostLineChart data={analytics.cost_over_time} />
          ) : (
            <Empty>No dated activity yet.</Empty>
          )}
        </DashCard>
        <DashCard title="Activity heatmap" icon={CalendarDays} description="Daily spend intensity · GitHub-style">
          {analytics.heatmap.length ? (
            <CalendarChart data={analytics.heatmap} />
          ) : (
            <Empty>No dated activity.</Empty>
          )}
        </DashCard>
      </div>

      {/* Spend breakdown — full width for readable project names */}
      <DashCard title="Spend breakdown" icon={PieChart} description="Cost by project and model">
        <SunburstChart data={analytics.sunburst} />
      </DashCard>

      {/* Model costs + stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Cost by model" icon={BarChart3} description="Ranked by spend share">
          <ModelCostBar data={analytics.by_model} />
        </DashCard>

        <DashCard
          title="Token stream"
          icon={Waves}
          description="Usage over time, stacked by model"
        >
          {analytics.stream.length ? (
            <StreamChart data={analytics.stream} keys={analytics.stream_keys} />
          ) : (
            <Empty>No dated token activity yet.</Empty>
          )}
        </DashCard>
      </div>

      {/* Project map */}
      <DashCard
        title="Project map"
        icon={LayoutGrid}
        description="Share of spend by project"
      >
        <TreemapChart data={analytics.treemap} />
      </DashCard>

      {/* Leaderboard */}
      <DashCard
        title="Leaderboard"
        icon={Trophy}
        description={`${projects.length} projects ranked by cost`}
      >
          <div className="space-y-2">
            {projects.map((p, i) => (
              <button
                key={p.key}
                onClick={() => onSelectProject(p.key)}
                className="w-full text-left rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/50 p-3.5 transition-all duration-200 hover:border-primary/30 group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant="outline"
                      className="h-5 w-5 p-0 justify-center shrink-0 text-[10px] font-bold tabular-nums"
                    >
                      {i + 1}
                    </Badge>
                    <div className="font-medium truncate group-hover:text-primary transition-colors">
                      {p.name}
                    </div>
                  </div>
                  <div className="text-primary font-semibold tabular-nums shrink-0">
                    {fmtCost(p.cost)}
                  </div>
                </div>
                <Progress
                  value={(p.cost / maxCost) * 100}
                  className="mt-2.5 h-1.5 bg-background"
                />
                <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground gap-2">
                  <span className="truncate">
                    {p.sessions} sessions · {fmtTokens(p.tokens)} tok · {fmtDay(p.last_active)}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    {p.models.slice(0, 2).map((m) => (
                      <ModelBadge key={m} model={m} />
                    ))}
                  </span>
                </div>
              </button>
            ))}
          </div>
      </DashCard>
    </div>
  );
}

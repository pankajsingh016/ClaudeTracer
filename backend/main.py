"""FastAPI app: serves Claude Code usage data as JSON + the built React UI.

Endpoints:
  GET /api/projects                       project leaderboard
  GET /api/sessions?project=&q=           session summaries (filterable)
  GET /api/sessions/{id}                  full transcript
  GET /api/analytics?project=&model=&from=&to=   charts data
  GET /api/search?q=&project=&model=      prompt/session search
  GET /api/meta                           CLAUDE_DIR + pricing info
"""

from __future__ import annotations

import config  # noqa: F401 — load .env from project root

from collections import Counter, defaultdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pricing import message_cost, pricing_catalog
from store import Store, claude_dir, _ms_to_date, _text_of

app = FastAPI(title="ClaudeTracer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = Store()


# ---------------------------------------------------------------- helpers

def _filtered_sessions(project: str | None = None, model: str | None = None):
    sessions = store.scan()
    out = []
    for s in sessions:
        if project and s.project_key != project:
            continue
        if model and model not in s.models:
            continue
        out.append(s)
    return out


# ---------------------------------------------------------------- API

@app.get("/api/meta")
def meta():
    root = claude_dir()
    projects = root / "projects"
    return {
        "claude_dir": str(root),
        "exists": projects.is_dir(),
        "projects_dir": str(projects),
        "env_file_loaded": (Path(__file__).resolve().parent.parent / ".env").is_file(),
        **pricing_catalog(),
    }


@app.get("/api/projects")
def projects():
    grouped: dict[str, list] = defaultdict(list)
    for s in store.scan():
        grouped[s.project_key].append(s)
    result = []
    for key, sessions in grouped.items():
        name = next((s.project_name for s in sessions if s.project_name), key)
        models: Counter = Counter()
        for s in sessions:
            models.update(s.models)
        last_active = max((s.ended_ms or 0) for s in sessions) or None
        result.append(
            {
                "key": key,
                "name": name,
                "path": getattr(sessions[0], "project_path", None),
                "sessions": len(sessions),
                "cost": round(sum(s.cost for s in sessions), 4),
                "savings": round(sum(s.savings for s in sessions), 4),
                # headline "tokens" = generation tokens (input+output); cache shown separately
                "tokens": sum(s.input_tokens + s.output_tokens for s in sessions),
                "total_tokens": sum(s.total_tokens for s in sessions),
                "input_tokens": sum(s.input_tokens for s in sessions),
                "output_tokens": sum(s.output_tokens for s in sessions),
                "cache_read": sum(s.cache_read for s in sessions),
                "cache_write": sum(s.cache_write for s in sessions),
                "last_active": last_active,
                "models": [m for m, _ in models.most_common()],
                "estimated": any(s.estimated for s in sessions),
            }
        )
    result.sort(key=lambda p: p["cost"], reverse=True)
    return result


@app.get("/api/sessions")
def sessions(project: str | None = None, q: str | None = None):
    items = _filtered_sessions(project=project)
    summaries = [s.summary() for s in items]
    if q:
        ql = q.lower()
        summaries = [
            s for s in summaries
            if ql in (s["title"] or "").lower()
            or ql in (s["project_name"] or "").lower()
            or ql in (s["branch"] or "").lower()
        ]
    summaries.sort(key=lambda s: s["started"] or 0, reverse=True)
    return summaries


@app.get("/api/sessions/{session_id}")
def transcript(session_id: str):
    found = store.events_for(session_id)
    if not found:
        raise HTTPException(404, "session not found")
    sess, events = found
    rendered = []
    for o in events:
        t = o.get("type")
        ts = o.get("timestamp")
        if t == "user":
            content = o.get("message", {}).get("content")
            blocks = []
            if isinstance(content, str):
                blocks.append({"kind": "text", "text": content})
            elif isinstance(content, list):
                for b in content:
                    if not isinstance(b, dict):
                        continue
                    if b.get("type") == "text":
                        blocks.append({"kind": "text", "text": b.get("text", "")})
                    elif b.get("type") == "tool_result":
                        tc = b.get("content")
                        blocks.append(
                            {
                                "kind": "tool_result",
                                "tool_use_id": b.get("tool_use_id"),
                                "is_error": bool(b.get("is_error")),
                                "text": _text_of(tc) if not isinstance(tc, str) else tc,
                            }
                        )
            if not blocks:
                continue
            rendered.append({"role": "user", "ts": ts, "blocks": blocks})
        elif t == "assistant":
            msg = o.get("message", {})
            model = msg.get("model")
            usage = msg.get("usage")
            blocks = []
            for b in msg.get("content") or []:
                if not isinstance(b, dict):
                    continue
                bt = b.get("type")
                if bt == "thinking":
                    blocks.append({"kind": "thinking", "text": b.get("thinking", "")})
                elif bt == "text":
                    blocks.append({"kind": "text", "text": b.get("text", "")})
                elif bt == "tool_use":
                    blocks.append(
                        {"kind": "tool_use", "name": b.get("name"), "input": b.get("input")}
                    )
            rendered.append(
                {
                    "role": "assistant",
                    "ts": ts,
                    "model": model,
                    "blocks": blocks,
                    "cost": round(message_cost(usage, model), 5) if usage else 0.0,
                    "tokens": (
                        (usage.get("input_tokens", 0) or 0)
                        + (usage.get("output_tokens", 0) or 0)
                        if usage else 0
                    ),
                }
            )
    return {"session": sess.summary(), "events": rendered}


@app.get("/api/analytics")
def analytics(
    project: str | None = None,
    model: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    sessions = _filtered_sessions(project=project)

    daily_cost: dict[str, float] = defaultdict(float)
    daily_tokens: dict[str, float] = defaultdict(float)
    stream_rows: dict[str, dict[str, float]] = defaultdict(dict)
    by_model: dict[str, dict[str, float]] = defaultdict(lambda: {"cost": 0.0, "tokens": 0.0})
    by_project: dict[str, dict[str, float]] = defaultdict(lambda: {"cost": 0.0, "tokens": 0.0})
    sunburst: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    stream_models: set[str] = set()
    total_cost = total_tokens = total_savings = 0.0

    proj_name = {s.project_key: s.project_name for s in sessions}

    for s in sessions:
        for date, models in s.daily.items():
            if date_from and date < date_from:
                continue
            if date_to and date > date_to:
                continue
            for m, vals in models.items():
                if model and m != model:
                    continue
                c, tok = vals["cost"], vals["tokens"]
                daily_cost[date] += c
                daily_tokens[date] += tok
                stream_rows[date][m] = stream_rows[date].get(m, 0.0) + tok
                stream_models.add(m)
                by_model[m]["cost"] += c
                by_model[m]["tokens"] += tok
                by_project[s.project_key]["cost"] += c
                by_project[s.project_key]["tokens"] += tok
                sunburst[s.project_key][m] += c
                total_cost += c
                total_tokens += tok
        total_savings += s.savings

    dates = sorted(set(daily_cost) | set(daily_tokens))
    cost_over_time = [
        {"date": d, "cost": round(daily_cost[d], 4), "tokens": int(daily_tokens[d])}
        for d in dates
    ]
    heatmap = [{"day": d, "value": round(daily_cost[d], 4)} for d in dates]
    stream = [
        {"date": d, **{m: int(stream_rows[d].get(m, 0)) for m in sorted(stream_models)}}
        for d in dates
    ]
    sunburst_tree = {
        "name": "usage",
        "children": [
            {
                "name": proj_name.get(pk, pk),
                "children": [
                    {"name": m, "value": round(c, 4)} for m, c in models.items() if c > 0
                ],
            }
            for pk, models in sunburst.items()
        ],
    }
    treemap_tree = {
        "name": "projects",
        "children": [
            {"name": proj_name.get(pk, pk), "value": round(v["cost"], 4)}
            for pk, v in by_project.items()
            if v["cost"] > 0
        ],
    }
    return {
        "totals": {
            "cost": round(total_cost, 4),
            "tokens": int(total_tokens),
            "savings": round(total_savings, 4),
            "sessions": len(sessions),
            "busiest_project": proj_name.get(
                max(by_project.items(), key=lambda kv: kv[1]["cost"], default=(None, None))[0]
            ),
        },
        "cost_over_time": cost_over_time,
        "heatmap": heatmap,
        "stream": stream,
        "stream_keys": sorted(stream_models),
        "by_model": [
            {"model": m, "cost": round(v["cost"], 4), "tokens": int(v["tokens"])}
            for m, v in sorted(by_model.items(), key=lambda kv: kv[1]["cost"], reverse=True)
        ],
        "by_project": [
            {"project": proj_name.get(pk, pk), "key": pk, "cost": round(v["cost"], 4),
             "tokens": int(v["tokens"])}
            for pk, v in sorted(by_project.items(), key=lambda kv: kv[1]["cost"], reverse=True)
        ],
        "sunburst": sunburst_tree,
        "treemap": treemap_tree,
    }


@app.get("/api/search")
def search(q: str, project: str | None = None, model: str | None = None):
    if not q:
        return []
    ql = q.lower()
    hits = []
    for s in _filtered_sessions(project=project, model=model):
        found = store.events_for(s.id)
        prompt = ""
        snippet = ""
        if found:
            _, events = found
            for o in events:
                if o.get("type") == "user":
                    text = _text_of(o.get("message", {}).get("content"))
                    if ql in text.lower():
                        idx = text.lower().find(ql)
                        snippet = text[max(0, idx - 40): idx + 80]
                        break
        title_hit = ql in (s.title or "").lower()
        if snippet or title_hit:
            summ = s.summary()
            summ["snippet"] = snippet
            hits.append(summ)
    hits.sort(key=lambda s: s["started"] or 0, reverse=True)
    return hits


# ---------------------------------------------------------------- static UI

_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(_DIST / "index.html")

    @app.get("/{path:path}")
    def spa(path: str):
        target = _DIST / path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(_DIST / "index.html")

"""Scan, parse, and aggregate Claude Code session data from ~/.claude.

A `Store` scans CLAUDE_DIR/projects for *.jsonl transcripts (including nested
subagent files), parses them with a per-file mtime/size cache so repeated
requests are cheap, and exposes projects, sessions, transcripts, analytics, and
search.

Project identity: the *real* path comes from the `cwd` field inside the lines
(the directory name is a lossy hyphen-encoding and cannot be reversed). The
top-level directory under projects/ is used only as a stable grouping key.
"""

from __future__ import annotations

import config  # noqa: F401 — load .env from project root

import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pricing import cache_savings, message_cost, model_rates

# Event types that carry real conversation content (everything else is metadata).
TRANSCRIPT_TYPES = {"user", "assistant", "attachment"}


def claude_dir() -> Path:
    return Path(os.environ.get("CLAUDE_DIR", str(Path.home() / ".claude"))).expanduser()


def projects_root() -> Path:
    return claude_dir() / "projects"


def _iso_to_ms(ts: str | None) -> int | None:
    if not ts:
        return None
    try:
        return int(
            datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000
        )
    except (ValueError, AttributeError):
        return None


def _ms_to_date(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def _decode_dir(name: str) -> str:
    """Best-effort fallback display name from an encoded project dir."""
    return name.lstrip("-").replace("-", "/")


def _text_of(content) -> str:
    """Flatten a message.content (string or block list) to plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                parts.append(b.get("text", ""))
        return "\n".join(parts)
    return ""


def _first_prompt(events: list[dict]) -> str:
    for o in events:
        if o.get("type") != "user":
            continue
        content = o.get("message", {}).get("content")
        text = _text_of(content).strip()
        # skip tool-result-only turns and local-command meta noise
        if not text or text.startswith("<command-") or text.startswith("<local-command"):
            continue
        return text[:120]
    return ""


class Session:
    """Aggregated view of one transcript file."""

    def __init__(self, sid: str, project_key: str, path: Path, is_subagent: bool):
        self.id = sid
        self.project_key = project_key
        self.path = path
        self.is_subagent = is_subagent
        self.project_name: str | None = None
        self.title = ""
        self.agent_name: str | None = None
        self.branch: str | None = None
        self.started_ms: int | None = None
        self.ended_ms: int | None = None
        self.user_msgs = 0
        self.assistant_msgs = 0
        self.tool_uses = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.cache_read = 0
        self.cache_write = 0
        self.cost = 0.0
        self.savings = 0.0
        self.estimated = False
        self.models: Counter = Counter()
        # date(YYYY-MM-DD) -> {model -> {cost, tokens}} for analytics rollups
        self.daily: dict[str, dict[str, dict[str, float]]] = defaultdict(
            lambda: defaultdict(lambda: {"cost": 0.0, "tokens": 0.0})
        )

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens + self.cache_read + self.cache_write

    def summary(self) -> dict:
        return {
            "id": self.id,
            "project_key": self.project_key,
            "project_name": self.project_name,
            "title": self.title or self.agent_name or self.id[:8],
            "agent_name": self.agent_name,
            "is_subagent": self.is_subagent,
            "branch": self.branch,
            "started": self.started_ms,
            "ended": self.ended_ms,
            "user_msgs": self.user_msgs,
            "assistant_msgs": self.assistant_msgs,
            "tool_uses": self.tool_uses,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cache_read": self.cache_read,
            "cache_write": self.cache_write,
            "total_tokens": self.total_tokens,
            "cost": round(self.cost, 4),
            "savings": round(self.savings, 4),
            "estimated": self.estimated,
            "models": [m for m, _ in self.models.most_common()],
        }


def _parse_file(path: Path, project_key: str, is_subagent: bool) -> tuple[Session, list[dict]]:
    sess = Session(path.stem, project_key, path, is_subagent)
    events: list[dict] = []
    cwd_counter: Counter = Counter()

    for line in path.open(encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = o.get("type")

        if o.get("cwd"):
            cwd_counter[o["cwd"]] += 1
        if o.get("gitBranch"):
            sess.branch = o["gitBranch"]
        if t == "ai-title" and o.get("aiTitle"):
            sess.title = o["aiTitle"]
        if t == "agent-name" and o.get("agentName"):
            sess.agent_name = o["agentName"]

        ts = _iso_to_ms(o.get("timestamp"))
        if ts is not None:
            sess.started_ms = ts if sess.started_ms is None else min(sess.started_ms, ts)
            sess.ended_ms = ts if sess.ended_ms is None else max(sess.ended_ms, ts)

        if t == "user":
            sess.user_msgs += 1
        elif t == "assistant":
            sess.assistant_msgs += 1
            msg = o.get("message", {})
            model = msg.get("model")
            usage = msg.get("usage")
            if model:
                sess.models[model] += 1
            for b in msg.get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    sess.tool_uses += 1
            if usage:
                sess.input_tokens += usage.get("input_tokens", 0) or 0
                sess.output_tokens += usage.get("output_tokens", 0) or 0
                sess.cache_read += usage.get("cache_read_input_tokens", 0) or 0
                sess.cache_write += usage.get("cache_creation_input_tokens", 0) or 0
                c = message_cost(usage, model)
                sess.cost += c
                sess.savings += cache_savings(usage, model)
                _, est = model_rates(model)
                sess.estimated = sess.estimated or est
                date = _ms_to_date(ts)
                if date:
                    tok = (usage.get("input_tokens", 0) or 0) + (usage.get("output_tokens", 0) or 0)
                    bucket = sess.daily[date][model or "unknown"]
                    bucket["cost"] += c
                    bucket["tokens"] += tok

        if t in TRANSCRIPT_TYPES:
            events.append(o)

    if cwd_counter:
        cwd = cwd_counter.most_common(1)[0][0]
        sess.project_name = cwd.rstrip("/").split("/")[-1] or cwd
        sess.project_path = cwd
    else:
        sess.project_name = _decode_dir(project_key).rstrip("/").split("/")[-1]
        sess.project_path = _decode_dir(project_key)
    return sess, events


class Store:
    def __init__(self):
        # path -> (mtime, size, Session, events)
        self._cache: dict[str, tuple[float, int, Session, list[dict]]] = {}

    def scan(self) -> list[Session]:
        root = projects_root()
        sessions: list[Session] = []
        if not root.exists():
            return sessions
        paths = list(root.glob("*/*.jsonl")) + list(root.glob("*/*/subagents/*.jsonl"))
        live = set()
        for path in paths:
            try:
                st = path.stat()
            except OSError:
                continue
            key = str(path)
            live.add(key)
            rel = path.relative_to(root)
            project_key = rel.parts[0]
            is_subagent = "subagents" in rel.parts
            cached = self._cache.get(key)
            if cached and cached[0] == st.st_mtime and cached[1] == st.st_size:
                sessions.append(cached[2])
                continue
            sess, events = _parse_file(path, project_key, is_subagent)
            self._cache[key] = (st.st_mtime, st.st_size, sess, events)
            sessions.append(sess)
        # drop deleted files from cache
        for stale in set(self._cache) - live:
            del self._cache[stale]
        return sessions

    def events_for(self, session_id: str) -> tuple[Session, list[dict]] | None:
        self.scan()
        for mtime, size, sess, events in self._cache.values():
            if sess.id == session_id:
                return sess, events
        return None

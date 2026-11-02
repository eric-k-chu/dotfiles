import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, spaces, theme } from "herdr";

const STATS_MS = 3000;
const QUOTA_MS = 60000;

// quota-axi and the provider CLIs it asks (agy, codex, …) live where the person's interactive
// shell puts them (nvm, ~/.local/bin), which non-interactive shells leave off PATH.
const QUOTA_SCRIPT = `
login_path=$("\${SHELL:-sh}" -lic 'printf "\\n%s" "$PATH"' 2>/dev/null </dev/null | tail -n 1)
[ -n "$login_path" ] && PATH="$login_path:$PATH"
for d in "$HOME"/.nvm/versions/node/*/bin "$HOME/.local/bin" /opt/homebrew/bin /usr/local/bin; do
  [ -d "$d" ] && PATH="$PATH:$d"
done
export PATH
# The default profile, plus each extra Claude profile (~/.claude-<name>), in parallel.
tmp=$(mktemp -d)
(unset CLAUDE_CONFIG_DIR; quota-axi --json --full >"$tmp/default" 2>"$tmp/default.err") &
for d in "$HOME"/.claude-*; do
  [ -d "$d/projects" ] || [ -f "$d/.claude.json" ] || [ -f "$d/.credentials.json" ] || continue
  CLAUDE_CONFIG_DIR="$d" quota-axi --json --full --provider claude >"$tmp/claude-\${d##*/.claude-}" 2>/dev/null &
done
wait
status=1
[ -s "$tmp/default" ] && status=0 || cat "$tmp/default.err" >&2
rm -f "$tmp/default.err"
for f in "$tmp"/*; do [ -s "$f" ] && printf '\\n@@%s\\n' "\${f##*/}" && cat "$f"; done
rm -rf "$tmp"
exit $status
`;

// Prints key=value lines for CPU %, memory and load on macOS or Linux.
const STATS_SCRIPT = `
if [ "$(uname)" = Darwin ]; then
  echo host=$(scutil --get ComputerName 2>/dev/null || hostname -s)
  echo ncpu=$(sysctl -n hw.ncpu)
  top -l 2 -n 0 -s 1 | awk '/CPU usage/ { i = $7 } END { gsub("%", "", i); print "cpu=" 100 - i }'
  echo mem_total=$(sysctl -n hw.memsize)
  vm_stat | awk '/page size of/ { ps = $8 } /Anonymous pages/ { a = $3 } /Pages purgeable/ { p = $3 }
    /Pages wired down/ { w = $4 } /occupied by compressor/ { c = $5 }
    END { printf "mem_used=%.0f\\n", (a - p + w + c) * ps }'
  echo load=$(sysctl -n vm.loadavg | awk '{ print $2, $3, $4 }')
  sysctl -n vm.swapusage | awk '{ print "swap=" $6 " / " $3 }'
else
  echo host=$(hostname -s)
  echo ncpu=$(nproc)
  a=$(head -1 /proc/stat); sleep 1; b=$(head -1 /proc/stat)
  echo "$a" "$b" | awk '{ t1 = 0; for (i = 2; i <= 11; i++) t1 += $i; i1 = $5 + $6
    t2 = 0; for (i = 13; i <= 22; i++) t2 += $i; i2 = $16 + $17
    printf "cpu=%.1f\\n", ((t2 - t1) > 0 ? 100 * (1 - (i2 - i1) / (t2 - t1)) : 0) }'
  awk '/^MemTotal/ { t = $2 } /^MemAvailable/ { a = $2 } /^SwapTotal/ { st = $2 } /^SwapFree/ { sf = $2 }
    END { printf "mem_total=%.0f\\nmem_used=%.0f\\nswap=%.0fM / %.0fM\\n", t * 1024, (t - a) * 1024, (st - sf) / 1024, st / 1024 }' /proc/meminfo
  echo load=$(cut -d' ' -f1-3 /proc/loadavg)
fi
`;

const bytes = (b) => {
  const u = ["B", "K", "M", "G", "T"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i >= 3 ? 1 : 0)}${u[i]}`;
};

const resetIn = (iso) => {
  if (!iso) return "";
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (!(s > 0)) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`;
};

const CACHE_KEY = "machine-monitor.cache";
const COMPACT_KEY = "machine-monitor.compact";
// Providers never shown, even when quota-axi finds an account for them.
const HIDDEN_PROVIDERS = new Set(["copilot"]);

const credits = (c) => (c?.remaining == null ? null
  : c.unit === "usd" ? `$${c.remaining}` : `${c.remaining} ${c.unit}`);

export default class MachineMonitor extends View {
  init(_props, cx) {
    // Per machine ("local" or its name): { stats, statsError, quota, quotaError, quotaAt,
    // loadingStats, loadingQuota }. Quota is kept across restarts so a switch never starts blank.
    this.cache = {};
    try {
      for (const [key, saved] of Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"))) {
        const quota = saved.quota?.filter((p) => !HIDDEN_PROVIDERS.has(p.provider));
        this.cache[key] = { quota, quotaAt: saved.quotaAt ?? 0 };
      }
    } catch { this.cache = {}; }
    this.compact = localStorage.getItem(COMPACT_KEY) !== "0";
    this.machine = this.currentMachine();
    // Cheap check so a space switch shows the right machine at once; stats poll gently.
    let last = 0;
    cx.timer.every(500, (cx) => {
      const machine = this.currentMachine();
      const switched = machine !== this.machine;
      if (!switched && Date.now() - last < STATS_MS) return;
      this.machine = machine;
      last = Date.now();
      this.tick(cx, machine);
      if (switched) cx.notify();
    });
    this.tick(cx, this.machine);
  }

  // The machine of the shown space: null is this computer.
  currentMachine() {
    return spaces().find((s) => s.active)?.machine ?? null;
  }

  entry(machine) {
    const key = machine ?? "local";
    return (this.cache[key] ??= { quotaAt: 0 });
  }

  saveCache() {
    const saved = {};
    for (const [key, e] of Object.entries(this.cache)) {
      if (e.quota) saved[key] = { quota: e.quota, quotaAt: e.quotaAt };
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(saved)); } catch {}
  }

  tick(cx, machine) {
    this.refreshStats(cx, machine);
    const e = this.entry(machine);
    if (Date.now() - (e.quotaTriedAt ?? e.quotaAt) >= QUOTA_MS) this.refreshQuota(cx, machine);
  }

  refreshStats(cx, machine) {
    const e = this.entry(machine);
    if (e.loadingStats) return;
    e.loadingStats = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", STATS_SCRIPT], { on: machine });
        const kv = {};
        for (const line of r.stdout.split("\n")) {
          const i = line.indexOf("=");
          if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1).trim();
        }
        e.stats = kv;
        e.statsError = r.code === 0 ? null : r.stderr.trim().slice(0, 200);
      } catch (err) {
        e.statsError = String(err);
      } finally {
        e.loadingStats = false;
      }
      cx.notify();
    });
  }

  refreshQuota(cx, machine) {
    const e = this.entry(machine);
    if (e.loadingQuota) return;
    e.loadingQuota = true;
    e.quotaTriedAt = Date.now();
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", ["-c", QUOTA_SCRIPT], { on: machine });
        if (r.code !== 0) throw new Error(r.stderr.trim().slice(0, 200) || `exit ${r.code}`);
        // Sections are "@@default" (every provider) and "@@claude-<profile>" (that Claude login).
        // Newer quota-axi finds every Claude profile itself, so each section can repeat the same
        // accounts: keep each account once (by account id) and name it by its profile folder.
        const parts = r.stdout.split(/^@@/m).slice(1).map((part) => {
          const nl = part.indexOf("\n");
          return { name: part.slice(0, nl).trim(), body: part.slice(nl + 1) };
        }).sort((a, b) => (a.name === "default" ? -1 : b.name === "default" ? 1 : 0));
        const quota = [];
        const seen = new Set();
        for (const { name, body } of parts) {
          let providers;
          try { providers = JSON.parse(body).providers; } catch { continue; }
          for (const p of providers) {
            if (p.notSetUp === true) continue;
            if (HIDDEN_PROVIDERS.has(p.provider)) continue;
            if (p.provider === "claude") {
              const id = p.account?.accountId ?? (p.accountKey !== "default" ? p.accountKey : null);
              if (id && seen.has(id)) continue;
              if (id) seen.add(id);
              const folder = p.accountLocator?.path?.split("/").pop();
              const profile = folder != null
                ? folder.replace(/^\.claude-?/, "")
                : name === "default" ? "" : name.replace(/^claude-/, "");
              if (profile) p.provider = `claude · ${profile}`;
            }
            quota.push(p);
          }
        }
        // Keep each extra Claude profile right after the default Claude account.
        const rank = (p) => (p.provider === "claude" ? 0 : p.provider.startsWith("claude ·") ? 1 : 2);
        e.quota = quota.map((p, i) => [p, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([p]) => p);
        e.quotaAt = Date.now();
        e.quotaError = null;
        this.saveCache();
      } catch (err) {
        // Keep the last good quota on screen; retry on the normal schedule.
        e.quotaError = String(err?.message ?? err);
      } finally {
        e.loadingQuota = false;
      }
      cx.notify();
    });
  }

  // Bar colored by how bad `bad` (0-100) is.
  bar(pct, bad) {
    const t = theme();
    const color = bad >= 85 ? t.ansi1 : bad >= 60 ? t.ansi3 : t.ansi2;
    const w = Math.max(0, Math.min(100, Math.round(pct)));
    return div().w_full().h(5).rounded(3).bg(t.raised)
      .child(div().h_full().w(`${w}%`).rounded(3).bg(color));
  }

  meter(label, pct, detail) {
    const t = theme();
    return v_flex().gap(4)
      .child(h_flex().justify_between().items_center()
        .child(div().text_color(t.foreground).child(label))
        .child(div().text_color(t.muted).child(`${Math.round(pct)}%`)))
      .child(this.bar(pct, pct))
      .child(div().text_size(11).text_color(t.dim).truncate().child(detail));
  }

  section(title, right) {
    const t = theme();
    return h_flex().justify_between().items_center().pt(6)
      .child(div().text_size(11).font_semibold().text_color(t.muted).child(title.toUpperCase()))
      .child(div().text_size(11).text_color(t.dim).child(right ?? ""));
  }

  renderStats(e) {
    const t = theme();
    const s = e.stats;
    if (!s) return div().text_color(t.dim).child(e.statsError ?? "reading…");
    const cpu = Number(s.cpu) || 0;
    const total = Number(s.mem_total) || 0;
    const used = Number(s.mem_used) || 0;
    const memPct = total ? (used * 100) / total : 0;
    return v_flex().gap(10)
      .child(this.meter("CPU", cpu, `${s.ncpu ?? "?"} cores · load ${s.load ?? "?"}`))
      .child(this.meter("Memory", memPct, `${bytes(used)} / ${bytes(total)} · swap ${s.swap ?? "?"}`));
  }

  renderQuota(e) {
    const t = theme();
    if (!e.quota) {
      const msg = e.quotaError && !e.loadingQuota
        ? `quota-axi unavailable: ${e.quotaError}`
        : "loading quota-axi…";
      return div().text_size(12).text_color(e.quotaError && !e.loadingQuota ? t.blocked : t.dim).child(msg);
    }
    return v_flex().gap(12)
      .when(Boolean(e.quotaError), (el) => el.child(
        div().text_size(11).text_color(t.blocked).child(`last refresh failed: ${e.quotaError}`)))
      .children(e.quota.map((p) => {
      const windows = (p.windows ?? []).filter((w) => w.percentRemaining != null);
      return v_flex().gap(6)
        .child(h_flex().gap(6).items_center()
          .child(div().font_semibold().text_color(t.foreground).child(p.provider))
          .when(Boolean(p.plan), (el) => el.child(div().text_size(11).text_color(t.dim).child(p.plan))))
        .when(windows.length === 0, (el) => el.child(
          div().text_size(11).text_color(t.dim).child(
            credits(p.credits) ? `${credits(p.credits)} remaining` : p.state?.status ?? "no windows")))
        .children(windows.map((w) => v_flex().gap(3)
          .child(h_flex().justify_between().text_size(11)
            .child(div().text_color(t.muted).truncate().child(w.label ?? w.id))
            .child(div().text_color(t.dim).child(`${w.percentRemaining}% left${w.resetsAt ? ` · ${resetIn(w.resetsAt)}` : ""}`)))
          .child(this.bar(w.percentRemaining, 100 - w.percentRemaining))));
    }));
  }

  // One line: CPU and memory side by side.
  renderStatsCompact(e) {
    const t = theme();
    const s = e.stats;
    if (!s) return div().text_color(t.dim).child(e.statsError ?? "reading…");
    const total = Number(s.mem_total) || 0;
    const memPct = total ? ((Number(s.mem_used) || 0) * 100) / total : 0;
    const item = (label, pct) => h_flex().flex_1().gap(6).items_center()
      .child(div().text_color(t.muted).child(label))
      .child(div().flex_1().child(this.bar(pct, pct)))
      .child(div().text_color(t.foreground).child(`${Math.round(pct)}%`));
    return h_flex().gap(14).items_center()
      .child(item("CPU", Number(s.cpu) || 0))
      .child(item("RAM", memPct));
  }

  // One line per provider: its tightest limit only; providers with no limits are left out.
  renderQuotaCompact(e) {
    const t = theme();
    if (!e.quota) return this.renderQuota(e);
    const rows = [];
    for (const p of e.quota) {
      const windows = (p.windows ?? []).filter((w) => w.percentRemaining != null);
      const tight = windows.reduce((a, w) => (a && a.percentRemaining <= w.percentRemaining ? a : w), null);
      if (!tight && !credits(p.credits)) continue;
      rows.push(h_flex().id(`q-${rows.length}`).gap(8).items_center().h(20)
        .child(h_flex().flex_1().gap(6).items_center().overflow_hidden()
          .child(div().flex_none().font_semibold().text_color(t.foreground).child(p.provider))
          .when(Boolean(tight), (el) => el.child(div().min_w(0).text_size(11).text_color(t.dim).truncate().child(tight.label ?? tight.id))))
        .child(tight
          ? h_flex().gap(6).items_center()
            .child(div().w(44).child(this.bar(tight.percentRemaining, 100 - tight.percentRemaining)))
            .child(div().w(30).text_size(11).text_color(t.foreground).child(`${tight.percentRemaining}%`))
            .child(div().w(42).text_size(11).text_color(t.dim).child(resetIn(tight.resetsAt)))
          : div().text_size(11).text_color(t.dim).child(credits(p.credits))));
    }
    return v_flex().gap(4)
      .when(Boolean(e.quotaError), (el) => el.child(
        div().text_size(11).text_color(t.blocked).truncate().child(`last refresh failed: ${e.quotaError}`)))
      .children(rows);
  }

  compactButton() {
    const t = theme();
    return div().id("compact").px(8).h(22).flex().items_center().rounded(5)
      .border(1).border_color(t.border).bg(t.surface).text_size(11).text_color(t.foreground)
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        this.compact = !this.compact;
        try { localStorage.setItem(COMPACT_KEY, this.compact ? "1" : "0"); } catch {}
        cx.notify();
      })
      .child(this.compact ? "Detailed" : "Compact");
  }

  ago(at) {
    const s = Math.round((Date.now() - at) / 1000);
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  }

  refreshButton(e) {
    const t = theme();
    return h_flex().id("refresh").gap(5).items_center().px(8).h(22).rounded(5)
      .border(1).border_color(t.border).bg(t.surface).text_size(11).text_color(t.foreground)
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        this.refreshQuota(cx, this.machine);
        this.refreshStats(cx, this.machine);
      })
      .child(e.loadingQuota
        ? div().frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)
        : div().child("↻"))
      .child(e.loadingQuota ? "Refreshing" : "Refresh");
  }

  render() {
    const t = theme();
    const e = this.entry(this.machine);
    const host = e.stats?.host ?? this.machine ?? "This computer";
    return v_flex().id("root").size_full().bg(t.chrome).text_size(12.5)
      .child(h_flex().px(12).h(38).gap(8).items_center().justify_between().border_b(1).border_color(t.border)
        .child(div().font_semibold().text_color(t.foreground).truncate().child(host))
        .child(h_flex().gap(6).items_center().child(this.compactButton()).child(this.refreshButton(e))))
      .child(v_flex().id("body").flex_1().overflow_y_scrollbar().p(12).gap(this.compact ? 8 : 10)
        .child(this.section("System"))
        .child(this.compact ? this.renderStatsCompact(e) : this.renderStats(e))
        .child(this.section("Quota", e.quotaAt && e.quota ? `updated ${this.ago(e.quotaAt)}` : ""))
        .child(this.compact ? this.renderQuotaCompact(e) : this.renderQuota(e)));
  }
}

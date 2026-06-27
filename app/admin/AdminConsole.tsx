"use client";

import {
  FileJson,
  FileText,
  ListMusic,
  Lock,
  LogOut,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Summary = {
  repoRoot: string;
  dataRoot: string;
  counts: Record<string, number | { count: number; bytes: number }>;
};

type ListedFile = {
  file: string;
  id?: string;
  size: number;
  updated_at: number;
};

const jsonTargets = [
  { id: "releases", label: "发布清单", hint: "releases.json" },
  { id: "guides", label: "文档内容", hint: "guides.json" },
  { id: "song_ids", label: "歌曲 ID", hint: "data/song_ids.json" }
];

const tabs = [
  { id: "overview", label: "概览", icon: RefreshCw },
  { id: "json", label: "JSON", icon: FileJson },
  { id: "lyrics", label: "歌词", icon: FileText },
  { id: "song-details", label: "歌曲详情", icon: ListMusic },
  { id: "playlists", label: "云歌单", icon: Upload },
  { id: "sync", label: "官网同步", icon: RefreshCw }
];

export default function AdminConsole() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab) setTab(requestedTab);
    fetch("/api/admin/session")
      .then((res) => res.json())
      .then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (response.ok) {
      setAuthenticated(true);
      setPassword("");
    } else {
      setLoginError("密码不正确");
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    setAuthenticated(false);
  }

  if (authenticated === null) {
    return <main className="admin-shell loading">Loading...</main>;
  }

  if (!authenticated) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={login}>
          <div className="login-mark">
            <Lock size={22} aria-hidden />
          </div>
          <h1>NipaPlay 管理后台</h1>
          <label>
            管理密码
            <input
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {loginError ? <p className="form-error">{loginError}</p> : null}
          <button className="primary-button" type="submit">
            <Lock size={16} aria-hidden />
            登录
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand-row">
          <span className="brand-logo" aria-hidden />
          <div>
            <strong>NipaPlay</strong>
            <span>Site Admin</span>
          </div>
        </div>
        <nav>
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
                title={item.label}
              >
                <Icon size={17} aria-hidden />
                {item.label}
              </button>
            );
          })}
        </nav>
        <button className="ghost-button logout" onClick={logout}>
          <LogOut size={16} aria-hidden />
          退出
        </button>
      </aside>

      <section className="admin-main">
        {tab === "overview" ? <Overview /> : null}
        {tab === "json" ? <JsonEditor /> : null}
        {tab === "lyrics" ? <TextManager bucket="lyrics" title="歌词" /> : null}
        {tab === "song-details" ? <TextManager bucket="song-details" title="歌曲详情" /> : null}
        {tab === "playlists" ? <PlaylistManager /> : null}
        {tab === "sync" ? <OfficialSync /> : null}
      </section>
    </main>
  );
}

function Overview() {
  const [summary, setSummary] = useState<Summary | null>(null);

  async function load() {
    const response = await fetch("/api/admin/summary");
    setSummary(await response.json());
  }

  useEffect(() => {
    load();
  }, []);

  const countEntries = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.counts).map(([key, value]) => ({
      key,
      value: typeof value === "number" ? value : value.count
    }));
  }, [summary]);

  return (
    <Panel
      title="站点概览"
      action={
        <button className="icon-button" onClick={load} title="刷新">
          <RefreshCw size={16} aria-hidden />
        </button>
      }
    >
      <div className="metric-grid">
        {countEntries.map((item) => (
          <div className="metric" key={item.key}>
            <span>{labelForCount(item.key)}</span>
            <strong>{item.value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
      {summary ? (
        <dl className="path-list">
          <div>
            <dt>代码目录</dt>
            <dd>{summary.repoRoot}</dd>
          </div>
          <div>
            <dt>数据目录</dt>
            <dd>{summary.dataRoot}</dd>
          </div>
        </dl>
      ) : null}
    </Panel>
  );
}

function JsonEditor() {
  const [target, setTarget] = useState(jsonTargets[0].id);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");

  async function load(id = target) {
    setStatus("读取中...");
    const response = await fetch(`/api/admin/json/${id}`);
    const payload = await response.json();
    setBody(JSON.stringify(payload.data ?? null, null, 2));
    setStatus("已读取");
  }

  async function save() {
    setStatus("保存中...");
    try {
      const data = JSON.parse(body);
      const response = await fetch(`/api/admin/json/${target}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data })
      });
      setStatus(response.ok ? "已保存" : "保存失败");
    } catch {
      setStatus("JSON 格式不正确");
    }
  }

  useEffect(() => {
    load(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <Panel
      title="JSON 编辑"
      action={
        <button className="primary-button compact" onClick={save}>
          <Save size={15} aria-hidden />
          保存
        </button>
      }
    >
      <div className="toolbar">
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          {jsonTargets.map((item) => (
            <option value={item.id} key={item.id}>
              {item.label} - {item.hint}
            </option>
          ))}
        </select>
        <button className="ghost-button" onClick={() => load()}>
          <RefreshCw size={15} aria-hidden />
          重读
        </button>
        <span className="status-text">{status}</span>
      </div>
      <textarea
        className="code-editor"
        spellCheck={false}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
    </Panel>
  );
}

function TextManager({ bucket, title }: { bucket: "lyrics" | "song-details"; title: string }) {
  const [files, setFiles] = useState<ListedFile[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");

  async function loadList() {
    const response = await fetch(`/api/admin/text/${bucket}`);
    const payload = await response.json();
    setFiles(payload.files ?? []);
  }

  async function openFile(file: string) {
    setSelected(file);
    const response = await fetch(`/api/admin/text/${bucket}?file=${encodeURIComponent(file)}`);
    const payload = await response.json();
    setContent(payload.content ?? "");
  }

  async function save() {
    if (!selected.trim()) {
      setStatus("先输入文件名");
      return;
    }
    const response = await fetch(`/api/admin/text/${bucket}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: selected, content })
    });
    setStatus(response.ok ? "已保存" : "保存失败");
    await loadList();
  }

  async function remove() {
    if (!selected || !confirm(`删除 ${selected}？`)) return;
    await fetch(`/api/admin/text/${bucket}?file=${encodeURIComponent(selected)}`, { method: "DELETE" });
    setSelected("");
    setContent("");
    await loadList();
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  const visibleFiles = files.filter((item) => item.file.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Panel
      title={title}
      action={
        <button className="primary-button compact" onClick={save}>
          <Save size={15} aria-hidden />
          保存
        </button>
      }
    >
      <div className="split-view">
        <div className="file-pane">
          <div className="search-box">
            <Search size={15} aria-hidden />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索" />
          </div>
          <button className="ghost-button full" onClick={() => {
            setSelected(bucket === "lyrics" ? "new-song.lrc" : "new-song.txt");
            setContent("");
          }}>
            新建
          </button>
          <div className="file-list">
            {visibleFiles.map((item) => (
              <button
                key={item.file}
                className={selected === item.file ? "selected" : ""}
                onClick={() => openFile(item.file)}
                title={item.file}
              >
                <span>{item.file}</span>
                <small>{formatBytes(item.size)}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="editor-pane">
          <input
            className="filename-input"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            placeholder="文件名"
          />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} />
          <div className="editor-actions">
            <span className="status-text">{status}</span>
            <button className="danger-button" onClick={remove} disabled={!selected}>
              <Trash2 size={15} aria-hidden />
              删除
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function PlaylistManager() {
  const [files, setFiles] = useState<ListedFile[]>([]);
  const [id, setId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  async function load() {
    const response = await fetch("/api/admin/playlists");
    const payload = await response.json();
    setFiles(payload.files ?? []);
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!id || !file) return;
    const body = new FormData();
    body.set("id", id);
    body.set("file", file);
    const response = await fetch("/api/admin/playlists", { method: "POST", body });
    setStatus(response.ok ? "已上传" : "上传失败");
    await load();
  }

  async function remove(targetId: string) {
    if (!confirm(`删除云歌单 ${targetId}？`)) return;
    await fetch(`/api/admin/playlists?id=${encodeURIComponent(targetId)}`, { method: "DELETE" });
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Panel
      title="云歌单"
      action={
        <button className="icon-button" onClick={load} title="刷新">
          <RefreshCw size={16} aria-hidden />
        </button>
      }
    >
      <form className="upload-row" onSubmit={upload}>
        <input value={id} onChange={(event) => setId(event.target.value)} placeholder="Cloud ID" />
        <input type="file" accept=".msz" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <button className="primary-button compact" type="submit">
          <Upload size={15} aria-hidden />
          上传
        </button>
        <span className="status-text">{status}</span>
      </form>
      <div className="table-list">
        {files.map((item) => (
          <div className="table-row" key={item.file}>
            <strong>{item.id}</strong>
            <span>{item.file}</span>
            <span>{formatBytes(item.size)}</span>
            <button className="icon-button danger" onClick={() => remove(item.id ?? "")} title="删除">
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function OfficialSync() {
  const [running, setRunning] = useState("");
  const [output, setOutput] = useState("");

  async function run(task: string) {
    setRunning(task);
    setOutput("同步中，下载新安装包时可能需要几分钟...");
    const response = await fetch("/api/admin/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task })
    });
    const payload = await response.json();
    setRunning("");
    setOutput(JSON.stringify(payload, null, 2));
  }

  return (
    <Panel title="官网自动同步">
      <div className="sync-grid">
        <SyncAction
          title="全部同步"
          description="同步最新安装包、文档和官网截图资源。"
          disabled={Boolean(running)}
          onClick={() => run("all")}
        />
        <SyncAction
          title="Release 包"
          description="从 GitHub Release 下载最新安装包并更新 releases.json。"
          disabled={Boolean(running)}
          onClick={() => run("releases")}
        />
        <SyncAction
          title="文档"
          description="抓取 Documentation 与 CONTRIBUTING_GUIDE 并更新 guides.json。"
          disabled={Boolean(running)}
          onClick={() => run("docs")}
        />
        <SyncAction
          title="截图资源"
          description="拉取 icon、logo、首页截图和功能截图，转换为 WebP。"
          disabled={Boolean(running)}
          onClick={() => run("assets")}
        />
      </div>
      <pre className="sync-output">{output}</pre>
    </Panel>
  );
}

function SyncAction({
  title,
  description,
  disabled,
  onClick
}: {
  title: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className="sync-action" disabled={disabled} onClick={onClick}>
      <strong>{title}</strong>
      <span>{description}</span>
    </button>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h1>{title}</h1>
        {action}
      </header>
      {children}
    </section>
  );
}

function labelForCount(key: string) {
  const labels: Record<string, string> = {
    releases: "发布包",
    guides: "文档篇章",
    songIds: "歌曲 ID",
    lyrics: "歌词",
    songDetails: "歌曲详情",
    playlists: "云歌单",
    watchProgressUsers: "进度用户"
  };
  return labels[key] ?? key;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

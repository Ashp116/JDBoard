import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';

// API page: every backend route (from GET /api/docs/routes, built from the Flask
// app itself - see backend/api_docs.py) with a "Try it" panel. Sending with an
// API key adds "Authorization: Bearer <key>", so nginx checks the key's scope
// exactly as it does for a bot.

type ParamIn = 'path' | 'query' | 'form' | 'file' | 'body';

interface RouteParam {
  name: string;
  in: ParamIn;
  required: boolean;
  type?: string;
  description?: string;
}

interface RouteDoc {
  method: string;
  path: string;
  rule: string;
  group: string;
  summary: string;
  details: string;
  notes: string;
  params: RouteParam[];
  example: unknown;
  scopes: string[];
  admin_password: boolean;
  destructive: boolean;
}

interface ApiResult {
  status: number;
  statusText: string;
  ms: number;
  contentType: string;
  size: number;
  text: string | null;      // pretty JSON or text; null for binary
  downloadUrl: string | null;
  error?: string;           // network error (no response)
}

type SendMode = 'login' | 'key';

const MODE_STORAGE = 'jdboard.apiPage.sendAs';
const MAX_TEXT = 200000;

const METHOD_COLORS: Record<string, string> = {
  GET: '#00BFFF',
  POST: '#76B900',
  PUT: '#FFA500',
  DELETE: '#FF4444',
};

const routeKey = (r: RouteDoc) => `${r.method} ${r.rule}`;

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const readMode = (): SendMode => {
  try {
    return localStorage.getItem(MODE_STORAGE) === 'key' ? 'key' : 'login';
  } catch {
    return 'login';
  }
};

const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// What a destructive request does, for the confirmation prompt
const describeDestructive = (r: RouteDoc, values: Record<string, string>) => {
  const v = (name: string) => values[name] || `<${name}>`;
  switch (`${r.method} ${r.rule}`) {
    case 'POST /system/reboot': return 'This will reboot the Jetson.';
    case 'POST /system/shutdown': return 'This will shut down the Jetson.';
    case 'POST /system/clear-cache': return 'This will drop the system page cache.';
    case 'POST /system/jtop-restart-service': return 'This will restart the jtop service.';
    case 'POST /system/jtop-install-service': return 'This will install and start the jtop service.';
    case 'POST /system/processes/<int:pid>/kill': return `This will kill process ${v('pid')}.`;
    case 'POST /models/emergency-cleanup': return 'This will unload every model and free all GPU memory.';
    case 'POST /logs/inference/clear': return 'This will delete all inference logs.';
    case 'DELETE /models/<model_id>': return `This will delete the model ${v('model_id')}.`;
    case 'DELETE /models/<model_id>/custom-script': return `This will remove the custom script of ${v('model_id')}.`;
    case 'DELETE /api-keys/<key_id>': return `This will revoke the API key ${v('key_id')}.`;
    default: return `This will: ${r.summary || `${r.method} ${r.path}`}`;
  }
};

// ---------------------------------------------------------------------------
// Styles

const Container = styled.div`
  padding: 30px;

  ${props => props.theme.media.tablet} {
    padding: 20px;
  }

  ${props => props.theme.media.mobile} {
    padding: 15px;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    font-size: 24px;
    color: ${props => props.theme.colors.text.primary};
    font-family: ${props => props.theme.fonts.display};

    ${props => props.theme.media.mobile} {
      font-size: 20px;
    }

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }

  .base {
    font-family: monospace;
    font-size: 13px;
    color: ${props => props.theme.colors.text.muted};
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Panel = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 18px;
  min-width: 0;

  ${props => props.theme.media.mobile} {
    padding: 14px;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 14px;
    font-size: 16px;
    color: ${props => props.theme.colors.text.primary};

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const ListPanel = styled(Panel)`
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 140px);

  @media (max-width: 1100px) {
    position: static;
    max-height: 55vh;
  }
`;

const TextInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 8px 11px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 6px;
  background: ${props => props.theme.colors.background.tertiary};
  color: ${props => props.theme.colors.text.primary};
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }
`;

const Search = styled.div`
  position: relative;
  margin-bottom: 12px;

  i {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    color: ${props => props.theme.colors.text.muted};
  }

  input {
    padding-left: 32px;
  }
`;

const RouteList = styled.div`
  overflow-y: auto;
  min-height: 0;
  margin: 0 -6px;
  padding: 0 6px;
`;

const GroupTitle = styled.div`
  margin: 12px 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${props => props.theme.colors.text.muted};

  &:first-child {
    margin-top: 0;
  }
`;

const RouteRow = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  margin-bottom: 4px;
  border: 1px solid ${props => (props.$active ? '#4E7A00' : 'transparent')};
  border-radius: 8px;
  background: ${props => (props.$active ? 'rgba(118, 185, 0, 0.10)' : 'transparent')};
  color: ${props => props.theme.colors.text.primary};
  cursor: pointer;

  &:hover {
    background: ${props => (props.$active ? 'rgba(118, 185, 0, 0.12)' : props.theme.colors.background.hover)};
  }

  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .path {
    font-family: monospace;
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding-left: 58px;
  }
`;

const MethodBadge = styled.span<{ $method: string }>`
  flex: 0 0 auto;
  min-width: 50px;
  box-sizing: border-box;
  padding: 2px 0;
  border-radius: 4px;
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  font-family: monospace;
  color: ${props => METHOD_COLORS[props.$method] || '#ccc'};
  background: ${props => `${METHOD_COLORS[props.$method] || '#cccccc'}22`};
  border: 1px solid ${props => `${METHOD_COLORS[props.$method] || '#cccccc'}55`};
`;

const Chip = styled.span<{ $muted?: boolean }>`
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10.5px;
  white-space: nowrap;
  color: ${props => (props.$muted ? props.theme.colors.text.muted : props.theme.colors.nvidia.green)};
  border: 1px solid ${props => (props.$muted ? props.theme.colors.border.tertiary : 'rgba(118, 185, 0, 0.45)')};
`;

const Flag = styled.span<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 12px;
  color: ${props => (props.$danger ? '#FF6B6B' : '#FFB733')};
  background: ${props => (props.$danger ? 'rgba(255, 68, 68, 0.10)' : 'rgba(255, 165, 0, 0.10)')};
  border: 1px solid ${props => (props.$danger ? 'rgba(255, 68, 68, 0.35)' : 'rgba(255, 165, 0, 0.35)')};
`;

const Detail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
`;

const RouteTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;

  .path {
    font-family: monospace;
    font-size: 16px;
    color: ${props => props.theme.colors.text.primary};
    overflow-wrap: anywhere;
  }
`;

const Prose = styled.div`
  font-size: 14px;
  line-height: 1.5;
  color: ${props => props.theme.colors.text.secondary};

  p {
    margin: 0 0 8px;
  }

  .summary {
    color: ${props => props.theme.colors.text.primary};
  }

  .note {
    color: ${props => props.theme.colors.text.muted};
    font-size: 13px;
  }
`;

const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: ${props => props.theme.colors.text.muted};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 14px;
  font-size: 13px;

  th, td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
    vertical-align: top;
  }

  th {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${props => props.theme.colors.text.muted};
  }

  td {
    color: ${props => props.theme.colors.text.secondary};
  }

  td code {
    color: ${props => props.theme.colors.text.primary};
  }

  .desc {
    display: block;
    color: ${props => props.theme.colors.text.muted};
    font-size: 12px;
  }
`;

const Fields = styled.div`
  display: grid;
  grid-template-columns: minmax(110px, max-content) minmax(0, 1fr);
  gap: 8px 12px;
  align-items: center;
  margin-bottom: 14px;

  ${props => props.theme.media.mobile} {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }

  label {
    font-family: monospace;
    font-size: 12.5px;
    color: ${props => props.theme.colors.text.primary};

    .where {
      font-family: inherit;
      color: ${props => props.theme.colors.text.muted};
      margin-left: 6px;
    }

    .req {
      color: #FF6B6B;
      margin-left: 2px;
    }
  }

  input[type='file'] {
    font-size: 12.5px;
    color: ${props => props.theme.colors.text.secondary};
  }
`;

const BodyArea = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  min-height: 110px;
  padding: 10px 12px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 6px;
  background: ${props => props.theme.colors.background.tertiary};
  color: ${props => props.theme.colors.text.primary};
  font-family: monospace;
  font-size: 12.5px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }
`;

const SubTitle = styled.div`
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: ${props => props.theme.colors.text.secondary};
`;

const SendRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin: 14px 0;

  .modes {
    display: inline-flex;
    border: 1px solid ${props => props.theme.colors.border.tertiary};
    border-radius: 6px;
    overflow: hidden;
  }

  .key {
    flex: 1 1 220px;
    min-width: 0;
  }

  .send-as {
    font-size: 13px;
    color: ${props => props.theme.colors.text.secondary};
  }
`;

const ModeButton = styled.button<{ $active: boolean }>`
  padding: 7px 12px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  background: ${props => (props.$active ? '#4E7A00' : props.theme.colors.background.tertiary)};
  color: ${props => (props.$active ? '#fff' : props.theme.colors.text.secondary)};

  &:hover:not(:disabled) {
    color: #fff;
  }
`;

const PrimaryButton = styled.button`
  padding: 9px 18px;
  border: none;
  border-radius: 6px;
  background: #4E7A00;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &:hover:not(:disabled) {
    background: #416600;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const PlainButton = styled.button`
  padding: 5px 10px;
  border: 1px solid ${props => props.theme.colors.border.tertiary};
  border-radius: 6px;
  background: transparent;
  color: ${props => props.theme.colors.text.secondary};
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;

  &:hover {
    color: ${props => props.theme.colors.text.primary};
    border-color: ${props => props.theme.colors.nvidia.green};
  }
`;

const Code = styled.pre`
  margin: 0;
  padding: 12px;
  max-height: 460px;
  overflow: auto;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  background: ${props => props.theme.colors.background.primary};
  color: ${props => props.theme.colors.text.primary};
  font-size: 12.5px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
`;

const CodeHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 16px 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: ${props => props.theme.colors.text.secondary};
`;

const Status = styled.div<{ $ok: boolean }>`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: ${props => props.theme.colors.text.muted};

  .code {
    font-weight: 700;
    color: ${props => (props.$ok ? props.theme.colors.nvidia.green : '#FF6B6B')};
  }

  a {
    color: ${props => props.theme.colors.nvidia.green};
  }
`;

const Message = styled.div<{ $error?: boolean }>`
  padding: 30px 10px;
  text-align: center;
  font-size: 14px;
  color: ${props => (props.$error ? '#FF6B6B' : props.theme.colors.text.muted)};
`;

const Inline = styled.div`
  font-size: 13px;
  color: #FF6B6B;
  margin-bottom: 10px;
`;

// ---------------------------------------------------------------------------

const ApiSection: React.FC = () => {
  const { addNotification } = useNotifications();

  const [routes, setRoutes] = useState<RouteDoc[]>([]);
  const [scopeLabels, setScopeLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // "Try it" inputs (reset when another route is selected)
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [bodyText, setBodyText] = useState('');
  const [mode, setMode] = useState<SendMode>(readMode);
  const [apiKey, setApiKey] = useState('');   // never stored
  const [sending, setSending] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  const detailRef = useRef<HTMLDivElement>(null);

  const loadRoutes = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${getBackendUrl()}/docs/routes`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setRoutes(data.routes || []);
      const labels: Record<string, string> = {};
      (data.scopes || []).forEach((s: { value: string; label: string }) => { labels[s.value] = s.label; });
      setScopeLabels(labels);
      setSelected(prev => prev ?? (data.routes?.[0] ? routeKey(data.routes[0]) : null));
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load the route list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  const route = useMemo(() => routes.find(r => routeKey(r) === selected) || null, [routes, selected]);

  const multipart = !!route && route.params.some(p => p.in === 'form' || p.in === 'file');
  const bodyParams = route ? route.params.filter(p => p.in === 'body') : [];
  const jsonBody = !!route && !multipart && route.method !== 'GET' && (bodyParams.length > 0 || route.example != null);

  // Reset the form for the newly selected route
  useEffect(() => {
    setValues({});
    setFiles({});
    setResult(null);
    setInputError(null);
    if (!route) return;
    if (route.example != null) {
      setBodyText(JSON.stringify(route.example, null, 2));
    } else if (bodyParams.length) {
      setBodyText(JSON.stringify(Object.fromEntries(bodyParams.map(p => [p.name, ''])), null, 2));
    } else {
      setBodyText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, routes]);

  // Free the download link of the previous response
  useEffect(() => () => {
    if (result?.downloadUrl) URL.revokeObjectURL(result.downloadUrl);
  }, [result]);

  const changeMode = (next: SendMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_STORAGE, next);
    } catch {
      // private window / storage blocked: just don't remember it
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter(r =>
      r.path.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q) || r.method.toLowerCase() === q);
  }, [routes, search]);

  const grouped = useMemo(() => {
    const groups: { name: string; routes: RouteDoc[] }[] = [];
    filtered.forEach(r => {
      const last = groups[groups.length - 1];
      if (last && last.name === r.group) last.routes.push(r);
      else groups.push({ name: r.group, routes: [r] });
    });
    return groups;
  }, [filtered]);

  const selectRoute = (r: RouteDoc) => {
    setSelected(routeKey(r));
    if (window.innerWidth <= 1100) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
  };

  // ---- building the request -------------------------------------------------

  const setValue = (name: string, value: string) => setValues(prev => ({ ...prev, [name]: value }));

  const buildPath = (r: RouteDoc, placeholders: boolean) =>
    r.rule.replace(/<(?:\w+:)?(\w+)>/g, (_m, name: string) => {
      const v = (values[name] || '').trim();
      return v ? encodeURIComponent(v) : (placeholders ? `<${name}>` : '');
    });

  const buildQuery = (r: RouteDoc) => {
    const qs = new URLSearchParams();
    r.params.filter(p => p.in === 'query').forEach(p => {
      const v = (values[p.name] || '').trim();
      if (v) qs.append(p.name, v);
    });
    const s = qs.toString();
    return s ? `?${s}` : '';
  };

  // JSON body with empty optional fields left out; throws on invalid JSON
  const parseBody = (r: RouteDoc): unknown => {
    if (!bodyText.trim()) return undefined;
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const required = new Set(r.params.filter(p => p.required).map(p => p.name));
      return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => v !== '' || required.has(k)));
    }
    return parsed;
  };

  // Fields sent as multipart form fields: form params plus body params
  // (routes with files read their other fields from the form)
  const formFields = (r: RouteDoc) => r.params.filter(p => p.in === 'form' || p.in === 'body');

  const curlCommand = useMemo(() => {
    if (!route) return '';
    const parts = ['curl -k'];
    if (route.method !== 'GET') parts.push(`-X ${route.method}`);
    parts.push(mode === 'key' ? `-H ${shellQuote('Authorization: Bearer <your key>')}` : `-u ${shellQuote('<user>:<password>')}`);
    if (multipart) {
      formFields(route).forEach(p => {
        const v = values[p.name] || '';
        if (!v && !p.required) return;
        const flag = /^[@<]/.test(v) ? '--form-string' : '-F';
        parts.push(`${flag} ${shellQuote(`${p.name}=${v}`)}`);
      });
      route.params.filter(p => p.in === 'file').forEach(p => {
        const f = files[p.name];
        if (!f && !p.required) return;
        parts.push(`-F ${shellQuote(`${p.name}=@${f ? f.name : `<${p.name} file>`}`)}`);
      });
    } else if (jsonBody) {
      let body: unknown;
      try {
        body = parseBody(route);
      } catch {
        body = bodyText.trim();
      }
      if (body !== undefined) {
        parts.push(`-H ${shellQuote('Content-Type: application/json')}`);
        parts.push(`-d ${shellQuote(typeof body === 'string' ? body : JSON.stringify(body))}`);
      }
    }
    if (route.rule.startsWith('/logs/inference/export/')) parts.push('-o inference-logs.out');
    parts.push(shellQuote(`${window.location.origin}/api${buildPath(route, true)}${buildQuery(route)}`));
    return parts.join(' \\\n  ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, values, files, bodyText, mode, multipart, jsonBody]);

  const send = async () => {
    if (!route) return;
    setInputError(null);

    const missing = route.params.filter(p => p.required && (
      p.in === 'file' ? !files[p.name] : p.in === 'body' ? false : !(values[p.name] || '').trim()));
    if (missing.length) {
      setInputError(`Fill in: ${missing.map(p => p.name).join(', ')}`);
      return;
    }
    if (mode === 'key' && !apiKey.trim()) {
      setInputError('Enter the API key to send with');
      return;
    }

    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;
    if (multipart) {
      const form = new FormData();
      formFields(route).forEach(p => {
        const v = values[p.name] || '';
        if (v || p.required) form.append(p.name, v);
      });
      route.params.filter(p => p.in === 'file').forEach(p => {
        const f = files[p.name];
        if (f) form.append(p.name, f);
      });
      body = form;
    } else if (jsonBody) {
      let parsed: unknown;
      try {
        parsed = parseBody(route);
      } catch (e: any) {
        setInputError(`Body is not valid JSON: ${e?.message || e}`);
        return;
      }
      if (parsed !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(parsed);
      }
    }
    if (mode === 'key') headers.Authorization = `Bearer ${apiKey.trim()}`;

    if (route.destructive) {
      const what = describeDestructive(route, values);
      if (!window.confirm(`${what}\n\nSend ${route.method} /api${buildPath(route, true)}?`)) return;
    }

    const url = `${getBackendUrl()}${buildPath(route, false)}${buildQuery(route)}`;
    setSending(true);
    setResult(null);
    const started = performance.now();
    try {
      const res = await fetch(url, { method: route.method, headers, body });
      const blob = await res.blob();
      const ms = Math.round(performance.now() - started);
      const contentType = res.headers.get('Content-Type') || '';
      let text: string | null = null;
      let downloadUrl: string | null = null;
      if (contentType.includes('json')) {
        const raw = await blob.text();
        try {
          text = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          text = raw;
        }
      } else if (/^text\/|xml|csv|javascript/.test(contentType) || !contentType) {
        text = await blob.text();
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      if (text === null || /attachment/i.test(disposition)) downloadUrl = URL.createObjectURL(blob);
      setResult({ status: res.status, statusText: res.statusText, ms, contentType, size: blob.size, text, downloadUrl });
    } catch (e: any) {
      setResult({
        status: 0, statusText: '', ms: Math.round(performance.now() - started), contentType: '', size: 0,
        text: null, downloadUrl: null, error: e?.message || String(e),
      });
    } finally {
      setSending(false);
    }
  };

  const copy = (text: string, what: string) => {
    const done = () => addNotification({ type: 'success', title: 'Copied', message: `${what} copied to the clipboard` });
    const failed = () => addNotification({ type: 'error', title: 'Copy Failed', message: 'Select it and copy it manually' });
    // The clipboard API isn't available on every page (e.g. plain HTTP); fall back to a hidden text box
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand('copy')) { done(); } else { failed(); }
      } catch {
        failed();
      } finally {
        document.body.removeChild(area);
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  };

  // ---- rendering --------------------------------------------------------------

  const scopeChips = (r: RouteDoc) =>
    r.scopes.length
      ? r.scopes.map(s => <Chip key={s} title={scopeLabels[s] || s}>{s}</Chip>)
      : <Chip $muted title="Only with the dashboard login, never with an API key">login only</Chip>;

  const fieldInputs = (params: RouteParam[]) => params.map(p => (
    <React.Fragment key={`${p.in}-${p.name}`}>
      <label htmlFor={`api-field-${p.in}-${p.name}`}>
        {p.name}{p.required && <span className="req">*</span>}
        <span className="where">{p.in}</span>
      </label>
      {p.in === 'file' ? (
        <input
          id={`api-field-${p.in}-${p.name}`}
          key={selected || ''}
          type="file"
          onChange={e => {
            const f = e.target.files?.[0] || null;
            setFiles(prev => ({ ...prev, [p.name]: f }));
          }}
        />
      ) : (
        <TextInput
          id={`api-field-${p.in}-${p.name}`}
          type={/password/i.test(p.name) ? 'password' : 'text'}
          autoComplete="off"
          value={values[p.name] || ''}
          placeholder={p.type && p.type !== 'string' ? p.type : p.description || ''}
          onChange={e => setValue(p.name, e.target.value)}
        />
      )}
    </React.Fragment>
  ));

  const renderTryIt = (r: RouteDoc) => {
    const pathParams = r.params.filter(p => p.in === 'path');
    const queryParams = r.params.filter(p => p.in === 'query');
    const fields = multipart
      ? [...formFields(r), ...r.params.filter(p => p.in === 'file')]
      : [];
    const inputs = [...pathParams, ...queryParams, ...fields];

    return (
      <Panel>
        <h3><i className="fas fa-paper-plane"></i> Try it</h3>

        {inputs.length > 0 && <Fields>{fieldInputs(inputs)}</Fields>}

        {jsonBody && (
          <>
            <SubTitle>JSON body</SubTitle>
            <BodyArea
              value={bodyText}
              spellCheck={false}
              onChange={e => setBodyText(e.target.value)}
              rows={Math.min(14, Math.max(4, bodyText.split('\n').length + 1))}
            />
          </>
        )}

        <SendRow>
          <span className="send-as">Send as</span>
          <div className="modes">
            <ModeButton $active={mode === 'login'} onClick={() => changeMode('login')}>My login</ModeButton>
            <ModeButton $active={mode === 'key'} onClick={() => changeMode('key')}>API key</ModeButton>
          </div>
          {mode === 'key' && (
            <TextInput
              className="key"
              type="password"
              autoComplete="off"
              placeholder="jdb_..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          )}
          <PrimaryButton onClick={send} disabled={sending} style={{ marginLeft: 'auto' }}>
            {sending
              ? <><i className="fas fa-spinner fa-spin"></i> Sending</>
              : <><i className={r.destructive ? 'fas fa-exclamation-triangle' : 'fas fa-play'}></i> Send</>}
          </PrimaryButton>
        </SendRow>

        {inputError && <Inline>{inputError}</Inline>}

        {result && (
          <>
            <Status $ok={result.status >= 200 && result.status < 300}>
              {result.error
                ? <span className="code">Request failed: {result.error}</span>
                : <span className="code">{result.status} {result.statusText}</span>}
              <span>{result.ms} ms</span>
              {!result.error && <span>{formatBytes(result.size)}</span>}
              {result.contentType && <span>{result.contentType.split(';')[0]}</span>}
              {result.downloadUrl && (
                <a href={result.downloadUrl} download={r.rule.startsWith('/logs/inference/export/') ? `inference-logs.${values.format || 'txt'}` : 'response'}>
                  <i className="fas fa-download"></i> Download
                </a>
              )}
            </Status>
            {result.text !== null && (
              <Code>
                {result.text.length > MAX_TEXT ? `${result.text.slice(0, MAX_TEXT)}\n... (${formatBytes(result.text.length)} total)` : result.text || '(empty)'}
              </Code>
            )}
            {result.text === null && !result.error && <Code>(binary response, {formatBytes(result.size)})</Code>}
          </>
        )}

        <CodeHeader>
          <span>curl</span>
          <PlainButton onClick={() => copy(curlCommand, 'Command')} title="Copy the command">
            <i className="fas fa-copy"></i> Copy
          </PlainButton>
        </CodeHeader>
        <Code>{curlCommand}</Code>
      </Panel>
    );
  };

  const renderDetail = (r: RouteDoc) => (
    <>
      <Panel>
        <RouteTitle>
          <MethodBadge $method={r.method}>{r.method}</MethodBadge>
          <span className="path">{r.path}</span>
        </RouteTitle>
        <Prose>
          {r.summary && <p className="summary">{r.summary}</p>}
          {r.details && <p>{r.details}</p>}
          {r.notes && <p className="note">{r.notes}</p>}
        </Prose>
        <MetaRow>
          <span>Key scopes:</span>
          {scopeChips(r)}
          {r.admin_password && <Flag><i className="fas fa-lock"></i> Admin password (if set)</Flag>}
          {r.destructive && <Flag $danger><i className="fas fa-exclamation-triangle"></i> Destructive</Flag>}
        </MetaRow>
        {r.params.length > 0 && (
          <Table>
            <thead>
              <tr><th>Name</th><th>In</th><th>Type</th><th>Required</th></tr>
            </thead>
            <tbody>
              {r.params.map(p => (
                <tr key={`${p.in}-${p.name}`}>
                  <td>
                    <code>{p.name}</code>
                    {p.description && <span className="desc">{p.description}</span>}
                  </td>
                  <td>{p.in}</td>
                  <td>{p.type || (p.in === 'file' ? 'file' : 'string')}</td>
                  <td>{p.required ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {renderTryIt(r)}
    </>
  );

  return (
    <Container>
      <Header>
        <h2><i className="fas fa-plug"></i> API</h2>
        <span className="base">{getBackendUrl()}</span>
      </Header>

      {loading && routes.length === 0 ? (
        <Message><i className="fas fa-spinner fa-spin"></i> Loading routes...</Message>
      ) : loadError ? (
        <Message $error>
          {loadError}{' '}
          <PlainButton onClick={loadRoutes}><i className="fas fa-redo"></i> Retry</PlainButton>
        </Message>
      ) : (
        <Layout>
          <ListPanel>
            <Search>
              <i className="fas fa-search"></i>
              <TextInput
                type="search"
                placeholder={`Search ${routes.length} routes`}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </Search>
            <RouteList>
              {grouped.length === 0 && <Message>No routes match</Message>}
              {grouped.map(g => (
                <div key={g.name}>
                  <GroupTitle>{g.name}</GroupTitle>
                  {g.routes.map(r => (
                    <RouteRow key={routeKey(r)} $active={routeKey(r) === selected} onClick={() => selectRoute(r)} title={r.summary}>
                      <span className="line">
                        <MethodBadge $method={r.method}>{r.method}</MethodBadge>
                        <span className="path">{r.path.replace(/^\/api/, '')}</span>
                      </span>
                      <span className="chips">{scopeChips(r)}</span>
                    </RouteRow>
                  ))}
                </div>
              ))}
            </RouteList>
          </ListPanel>

          <Detail ref={detailRef}>
            {route ? renderDetail(route) : <Panel><Message>Select a route</Message></Panel>}
          </Detail>
        </Layout>
      )}
    </Container>
  );
};

export default ApiSection;

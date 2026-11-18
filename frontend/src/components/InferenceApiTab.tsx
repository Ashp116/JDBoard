import React, { useState } from 'react';
import styled from 'styled-components';
import { getBackendUrl } from '../utils/api';

// Inference page > API Routes: the routes a program needs to run inference,
// with up-to-date examples (API key + HTTPS) and a test panel for each.

interface Model {
  id: string;
  framework: string;
  status: 'loaded' | 'unloaded';
}

interface Props {
  models: Model[];
  selectedModel: string | null;
  onSelectModel: (id: string) => void;
  onModelsChanged: () => void;   // refresh after load/unload from the test panel
}

type RouteId = 'inference' | 'list' | 'load' | 'unload' | 'reload';

interface RouteDoc {
  id: RouteId;
  method: 'GET' | 'POST';
  path: string;              // {model} is replaced with the selected model
  title: string;
  description: string;
  keys: string;              // which API key scopes may call it
  needsModel: boolean;
  needsImage: boolean;
  response: string;          // shape of a successful response
}

const ROUTES: RouteDoc[] = [
  {
    id: 'inference', method: 'POST', path: '/inference/{model}', title: 'Run inference',
    description: 'Send an image (multipart field "image"); the model must be loaded.',
    keys: 'Inference only, Full access', needsModel: true, needsImage: true,
    response: `{
  "success": true,
  "data": {
    "inference_time": 0.042,
    "result": {
      "predictions": [
        { "class": "person", "class_id": 0, "confidence": 0.91,
          "bbox": { "x": 412.5, "y": 300.1, "width": 120.4, "height": 340.0 } }
      ],
      "inference_handler": "default"
    }
  }
}
// bbox is in original-image pixels; x/y is the box centre`,
  },
  {
    id: 'list', method: 'GET', path: '/models/list', title: 'List models',
    description: 'Every model with its id, framework, precision and whether it is loaded.',
    keys: 'Inference only, Read only, Full access', needsModel: false, needsImage: false,
    response: `{
  "success": true,
  "models": [
    { "id": "YOLOv11n", "framework": "tensorrt", "loaded": true,
      "precision": "fp16", "inference_handler": "default" }
  ]
}`,
  },
  {
    id: 'load', method: 'POST', path: '/models/{model}/load', title: 'Load a model',
    description: 'Loads the model into memory so it can run inference.',
    keys: 'Inference only, Full access', needsModel: true, needsImage: false,
    response: `{ "success": true, "data": { "status": "loaded", "model_id": "YOLOv11n", "load_time": 1.8 } }`,
  },
  {
    id: 'unload', method: 'POST', path: '/models/{model}/unload', title: 'Unload a model',
    description: 'Frees the memory the model uses; the last unload stops the inference process.',
    keys: 'Inference only, Full access', needsModel: true, needsImage: false,
    response: `{ "success": true, "data": { "status": "unloaded", "model_id": "YOLOv11n" } }`,
  },
  {
    id: 'reload', method: 'POST', path: '/models/{model}/force-reload', title: 'Force reload a model',
    description: 'Unloads and loads the model again (clears a stuck state).',
    keys: 'Full access', needsModel: true, needsImage: false,
    response: `{ "success": true, "data": { "status": "loaded", "model_id": "YOLOv11n" } }`,
  },
];

const METHOD_COLOURS: Record<string, string> = { GET: '#2f81f7', POST: '#4E7A00' };

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: ${props => props.theme.colors.text.primary};
`;

const TopBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding: 16px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 10px;
  background: ${props => props.theme.colors.background.secondary};
  font-size: 14px;

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${props => props.theme.colors.text.secondary};
  }

  select, input[type='password'] {
    padding: 7px 10px;
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 6px;
    background: ${props => props.theme.colors.background.tertiary};
    color: ${props => props.theme.colors.text.primary};
    font-size: 13px;
  }

  input[type='password'] {
    width: 260px;
    max-width: 100%;
  }

  .base {
    font-family: 'Courier New', monospace;
    color: ${props => props.theme.colors.text.primary};
  }

  .auth {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }

  .auth label {
    cursor: pointer;
  }

  input[type='radio'] {
    accent-color: #4E7A00;
    margin: 0;
  }
`;

const RouteCard = styled.div<{ $open: boolean }>`
  border: 1px solid ${props => props.$open ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  border-radius: 10px;
  background: ${props => props.theme.colors.background.secondary};
  overflow: hidden;

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    border: none;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .method {
    min-width: 46px;
    padding: 3px 8px;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }

  .path {
    font-family: 'Courier New', monospace;
    font-size: 14px;
  }

  .title {
    margin-left: auto;
    font-size: 13px;
    color: ${props => props.theme.colors.text.secondary};
  }

  .body {
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: 13px;
  }

  .meta {
    color: ${props => props.theme.colors.text.secondary};
  }

  h4 {
    margin: 0 0 6px;
    font-size: 13px;
    color: ${props => props.theme.colors.nvidia.green};
  }
`;

const Code = styled.div`
  position: relative;

  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }

  .tabs button {
    padding: 4px 10px;
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 5px;
    background: none;
    color: ${props => props.theme.colors.text.secondary};
    font-size: 12px;
    cursor: pointer;
  }

  .tabs button.active {
    background: #4E7A00;
    border-color: #4E7A00;
    color: #fff;
  }

  pre {
    margin: 0;
    padding: 12px 44px 12px 12px;
    border-radius: 6px;
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 340px;
    overflow: auto;
  }

  .copy {
    position: absolute;
    right: 8px;
    bottom: 8px;
    padding: 4px 8px;
    border: 1px solid #444;
    border-radius: 4px;
    background: #2a2a2a;
    color: #ddd;
    cursor: pointer;
  }
`;

const Tester = styled.div`
  padding: 12px;
  border: 1px dashed ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .send {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: #4E7A00;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .hint {
    color: ${props => props.theme.colors.text.secondary};
  }

  .status {
    font-weight: 600;
  }
`;

const LANGS = ['curl', 'JavaScript', 'Python'] as const;
type Lang = typeof LANGS[number];

const copyText = (text: string) => {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
};

const fallbackCopy = (text: string) => {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); } catch { /* nothing else to try */ }
  document.body.removeChild(area);
};

const example = (route: RouteDoc, lang: Lang, base: string, model: string) => {
  const url = `${base}${route.path.replace('{model}', model)}`;
  if (lang === 'curl') {
    return [
      `curl -k -X ${route.method} "${url}" \\`,
      `  -H "Authorization: Bearer YOUR_API_KEY"${route.needsImage ? ' \\' : ''}`,
      ...(route.needsImage ? ['  -F "image=@photo.jpg"'] : []),
    ].join('\n');
  }
  if (lang === 'JavaScript') {
    return [
      ...(route.needsImage ? ['const form = new FormData();', "form.append('image', imageFile);   // a File/Blob", ''] : []),
      `const response = await fetch("${url}", {`,
      `  method: "${route.method}",`,
      '  headers: { Authorization: "Bearer YOUR_API_KEY" },',
      ...(route.needsImage ? ['  body: form,'] : []),
      '});',
      'const result = await response.json();',
      route.id === 'inference' ? 'console.log(result.data.result.predictions);' : 'console.log(result);',
      '',
      '// Node.js: the Jetson uses a self-signed certificate, so run with',
      '// NODE_TLS_REJECT_UNAUTHORIZED=0 (or trust /etc/jdboard/tls/jdboard.crt)',
    ].join('\n');
  }
  return [
    'import requests, urllib3',
    'urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)  # self-signed certificate',
    '',
    `response = requests.${route.method.toLowerCase()}(`,
    `    "${url}",`,
    '    headers={"Authorization": "Bearer YOUR_API_KEY"},',
    ...(route.needsImage ? ['    files={"image": open("photo.jpg", "rb")},'] : []),
    '    verify=False,',
    ')',
    route.id === 'inference' ? 'print(response.json()["data"]["result"]["predictions"])' : 'print(response.json())',
  ].join('\n');
};

const InferenceApiTab: React.FC<Props> = ({ models, selectedModel, onSelectModel, onModelsChanged }) => {
  const base = getBackendUrl();
  const model = selectedModel || 'MODEL_ID';
  const [open, setOpen] = useState<RouteId | null>('inference');
  const [lang, setLang] = useState<Lang>('curl');
  const [authMode, setAuthMode] = useState<'login' | 'key'>('login');
  const [apiKey, setApiKey] = useState('');      // only kept in memory, never stored
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState<RouteId | null>(null);
  const [results, setResults] = useState<Partial<Record<RouteId, { status: string; ok: boolean; ms: number; body: string }>>>({});

  const selected = models.find(m => m.id === selectedModel);

  const send = async (route: RouteDoc) => {
    if (route.needsModel && !selectedModel) return;
    if (route.needsImage && !image) return;
    setBusy(route.id);
    const started = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (authMode === 'key' && apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
      let body: FormData | undefined;
      if (route.needsImage && image) {
        body = new FormData();
        body.append('image', image);
      }
      const response = await fetch(`${base}${route.path.replace('{model}', encodeURIComponent(selectedModel || ''))}`,
        { method: route.method, headers, body });
      const text = await response.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
      setResults(prev => ({
        ...prev,
        [route.id]: {
          status: `${response.status} ${response.statusText}`.trim(),
          ok: response.ok,
          ms: Math.round(performance.now() - started),
          body: pretty || '(empty response)',
        },
      }));
      if (response.ok && ['load', 'unload', 'reload'].includes(route.id)) onModelsChanged();
    } catch (error) {
      setResults(prev => ({
        ...prev,
        [route.id]: { status: 'Request failed', ok: false, ms: Math.round(performance.now() - started), body: String(error) },
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Wrapper>
      <TopBar>
        <label>
          Model
          <select value={selectedModel || ''} onChange={(e) => onSelectModel(e.target.value)}>
            <option value="">Select a model...</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.id} ({m.framework}){m.status !== 'loaded' ? ' - not loaded' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Base URL <span className="base">{base}</span>
        </label>
        <div className="auth">
          <span style={{ color: 'inherit' }}>Test as</span>
          <label>
            <input type="radio" name="api-tab-auth" checked={authMode === 'login'} onChange={() => setAuthMode('login')} />
            My login
          </label>
          <label>
            <input type="radio" name="api-tab-auth" checked={authMode === 'key'} onChange={() => setAuthMode('key')} />
            API key
          </label>
          {authMode === 'key' && (
            <input
              type="password"
              placeholder="jdb_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          )}
        </div>
      </TopBar>

      {ROUTES.map(route => {
        const isOpen = open === route.id;
        const code = example(route, lang, base, model);
        const result = results[route.id];
        const missing = route.needsModel && !selectedModel ? 'Select a model above'
          : route.needsImage && !image ? 'Choose an image'
          : authMode === 'key' && !apiKey.trim() ? 'Paste an API key above'
          : '';
        return (
          <RouteCard key={route.id} $open={isOpen}>
            <button className="head" onClick={() => setOpen(isOpen ? null : route.id)} aria-expanded={isOpen}>
              <span className="method" style={{ background: METHOD_COLOURS[route.method] }}>{route.method}</span>
              <span className="path">/api{route.path.replace('{model}', selectedModel ? selectedModel : '{model_id}')}</span>
              <span className="title">{route.title}</span>
              <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ color: '#76b900' }}></i>
            </button>
            {isOpen && (
              <div className="body">
                <div>{route.description}</div>
                <div className="meta">
                  <i className="fas fa-key"></i> API keys: {route.keys}
                  {route.id === 'inference' && selected && selected.status !== 'loaded' && (
                    <span style={{ color: '#ffb020' }}> · {selected.id} isn't loaded yet</span>
                  )}
                </div>

                <Code>
                  <div className="tabs">
                    {LANGS.map(l => (
                      <button key={l} className={lang === l ? 'active' : ''} onClick={() => setLang(l)}>{l}</button>
                    ))}
                  </div>
                  <pre>{code}</pre>
                  <button className="copy" onClick={() => copyText(code)} title="Copy"><i className="fas fa-copy"></i></button>
                </Code>

                <div>
                  <h4>Response</h4>
                  <Code><pre>{route.response}</pre></Code>
                </div>

                <Tester>
                  <h4 style={{ margin: 0 }}><i className="fas fa-vial"></i> Test</h4>
                  <div className="row">
                    {route.needsImage && (
                      <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)} />
                    )}
                    <button className="send" onClick={() => send(route)} disabled={!!missing || busy === route.id}>
                      <i className={busy === route.id ? 'fas fa-spinner fa-spin' : 'fas fa-paper-plane'}></i>
                      Send {route.method}
                    </button>
                    {missing && <span className="hint">{missing}</span>}
                  </div>
                  {result && (
                    <>
                      <div className="row">
                        <span className="status" style={{ color: result.ok ? '#76b900' : '#ff6b6b' }}>{result.status}</span>
                        <span className="hint">{result.ms} ms</span>
                      </div>
                      <Code>
                        <pre>{result.body}</pre>
                        <button className="copy" onClick={() => copyText(result.body)} title="Copy"><i className="fas fa-copy"></i></button>
                      </Code>
                    </>
                  )}
                </Tester>
              </div>
            )}
          </RouteCard>
        );
      })}
    </Wrapper>
  );
};

export default InferenceApiTab;

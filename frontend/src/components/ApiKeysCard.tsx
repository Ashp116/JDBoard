import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';

// Settings > API Keys: keys for bots and scripts (see backend/api_keys.py).
// Programs send "Authorization: Bearer <key>" instead of the dashboard login.

interface ApiKey {
  id: string;
  name: string;
  scope: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  last_used_ip: string | null;
}

const SCOPE_INFO: Record<string, { label: string; hint: string }> = {
  inference: { label: 'Inference only', hint: 'List, load and unload models, run inference' },
  read: { label: 'Read only', hint: 'View anything (monitoring, models, logs, live data); change nothing' },
  full: { label: 'Full access', hint: 'Everything except the terminal and managing keys' },
};

const Card = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 24px;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
  }

  ${props => props.theme.media.mobile} {
    padding: 18px;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 18px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 18px;

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const CreateRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  margin-bottom: 18px;

  input[type='text'] {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 12px;
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 6px;
    background: ${props => props.theme.colors.background.tertiary};
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.nvidia.green};
    }
  }

  .scopes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: ${props => props.theme.colors.text.primary};
    cursor: pointer;
  }

  input[type='radio'] {
    accent-color: #4E7A00;
    margin: 0;
  }
`;

const PrimaryButton = styled.button`
  padding: 9px 16px;
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

const NewKey = styled.div`
  border: 1px solid #4E7A00;
  background: rgba(118, 185, 0, 0.08);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 18px;
  font-size: 13px;
  color: ${props => props.theme.colors.text.primary};

  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 8px 0;
  }

  code {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    white-space: nowrap;
    padding: 8px 10px;
    border-radius: 6px;
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }

  pre {
    margin: 8px 0 0;
    padding: 8px 10px;
    border-radius: 6px;
    background: #1e1e1e;
    color: #d4d4d4;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .warn {
    color: #ffb020;
  }

  button.plain {
    background: none;
    border: 1px solid ${props => props.theme.colors.border.secondary};
    color: ${props => props.theme.colors.text.primary};
    border-radius: 6px;
    padding: 7px 12px;
    cursor: pointer;
  }
`;

const KeyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  .empty {
    font-size: 13px;
    color: ${props => props.theme.colors.text.secondary};
  }

  .key {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'title revoke'
      'meta  revoke';
    align-items: center;
    gap: 4px 12px;
    padding: 10px 12px;
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 8px;
    font-size: 13px;
    color: ${props => props.theme.colors.text.primary};
  }

  .title {
    grid-area: title;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .meta {
    grid-area: meta;
    font-size: 12px;
    color: ${props => props.theme.colors.text.secondary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scope {
    padding: 2px 8px;
    border-radius: 10px;
    background: ${props => props.theme.colors.background.tertiary};
    font-size: 12px;
    white-space: nowrap;
  }

  .prefix {
    font-family: 'Courier New', monospace;
  }

  button.revoke {
    grid-area: revoke;
    background: none;
    border: 1px solid rgba(255, 82, 82, 0.6);
    color: #ff6b6b;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;

    &:disabled {
      opacity: 0.6;
      cursor: wait;
    }
  }
`;

const ApiKeysCard: React.FC = () => {
  const { addNotification } = useNotifications();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('inference');
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);

  const loadKeys = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/api-keys`);
      const data = await response.json();
      if (data.success) setKeys(data.keys);
    } catch (error) {
      console.error('Error loading API keys:', error);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const createKey = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const response = await fetch(`${getBackendUrl()}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Could not create the key');
      setCreated({ key: data.key, name: data.info.name });
      setName('');
      loadKeys();
    } catch (error) {
      addNotification({ type: 'error', title: 'API Keys', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (key: ApiKey) => {
    if (!window.confirm(`Revoke "${key.name}"? Anything using this key will stop working.`)) return;
    setRevoking(key.id);
    try {
      const response = await fetch(`${getBackendUrl()}/api-keys/${encodeURIComponent(key.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Could not revoke the key');
      setKeys(prev => prev.filter(k => k.id !== key.id));
      addNotification({ type: 'success', title: 'API Keys', message: `"${key.name}" revoked` });
    } catch (error) {
      addNotification({ type: 'error', title: 'API Keys', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setRevoking(null);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => addNotification({ type: 'success', title: 'Copied', message: 'API key copied to the clipboard' }),
      () => addNotification({ type: 'error', title: 'Copy Failed', message: 'Select the key and copy it manually' }),
    );
  };

  const origin = window.location.origin;

  return (
    <Card>
      <h3>
        <i className="fas fa-key"></i>
        API Keys
      </h3>

      <CreateRow>
        <input
          type="text"
          placeholder="Key name, e.g. door-camera"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createKey(); }}
        />
        <div className="scopes" role="radiogroup" aria-label="What the key may do">
          {Object.entries(SCOPE_INFO).map(([value, info]) => (
            <label key={value} title={info.hint}>
              <input type="radio" name="api-key-scope" checked={scope === value} onChange={() => setScope(value)} />
              {info.label}
            </label>
          ))}
        </div>
        <div className="actions">
          <PrimaryButton onClick={createKey} disabled={!name.trim() || creating}>
            <i className={creating ? 'fas fa-spinner fa-spin' : 'fas fa-plus'}></i>
            Create Key
          </PrimaryButton>
        </div>
      </CreateRow>

      {created && (
        <NewKey>
          <div><strong>{created.name}</strong> - <span className="warn">copy this key now; it won't be shown again.</span></div>
          <div className="row">
            <code>{created.key}</code>
            <PrimaryButton onClick={() => copy(created.key)}><i className="fas fa-copy"></i> Copy</PrimaryButton>
          </div>
          <div>Example:</div>
          <pre>{`curl -k -H "Authorization: Bearer ${created.key}" ${origin}/api/models/list`}</pre>
          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
            <button className="plain" onClick={() => setCreated(null)}>Done</button>
          </div>
        </NewKey>
      )}

      <KeyList>
        {loaded && keys.length === 0 && <div className="empty">No API keys yet.</div>}
        {keys.map(key => (
          <div className="key" key={key.id}>
            <div className="title">
              <span className="name" title={key.name}>{key.name}</span>
              <span className="scope" title={SCOPE_INFO[key.scope]?.hint}>{SCOPE_INFO[key.scope]?.label || key.scope}</span>
            </div>
            <div className="meta">
              <span className="prefix">{key.prefix}…</span>
              {' · '}
              {key.last_used_at
                ? `used ${new Date(key.last_used_at).toLocaleString()}${key.last_used_ip ? ` from ${key.last_used_ip}` : ''}`
                : 'never used'}
            </div>
            <button className="revoke" onClick={() => revokeKey(key)} disabled={revoking === key.id}>
              {revoking === key.id ? <i className="fas fa-spinner fa-spin"></i> : 'Revoke'}
            </button>
          </div>
        ))}
      </KeyList>
    </Card>
  );
};

export default ApiKeysCard;

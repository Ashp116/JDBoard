import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalCloseButton } from './shared/Modal';

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
  viewable: boolean;   // stored so it can be shown again (keys created before that can't)
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

  .top {
    display: flex;
    gap: 10px;
  }

  input[type='text'] {
    flex: 1;
    min-width: 0;
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
      'title buttons'
      'meta  buttons'
      'shown shown';
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

  .buttons {
    grid-area: buttons;
    display: flex;
    gap: 6px;
  }

  button.view {
    background: none;
    border: 1px solid ${props => props.theme.colors.border.secondary};
    color: ${props => props.theme.colors.text.primary};
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .shown {
    grid-area: shown;
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;

    code {
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      white-space: nowrap;
      padding: 6px 8px;
      border-radius: 6px;
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }

    button {
      background: none;
      border: 1px solid ${props => props.theme.colors.border.secondary};
      color: ${props => props.theme.colors.text.primary};
      border-radius: 6px;
      padding: 5px 9px;
      cursor: pointer;
    }
  }

  button.revoke {
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

const PromptBody = styled.div`
  font-size: 14px;
  color: ${props => props.theme.colors.text.primary};

  input {
    width: 100%;
    box-sizing: border-box;
    margin-top: 10px;
    padding: 10px 12px;
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

  .error {
    margin-top: 8px;
    color: #ff6b6b;
    font-size: 13px;
  }
`;

const PromptButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;

  button.cancel {
    background: none;
    border: 1px solid ${props => props.theme.colors.border.secondary};
    color: ${props => props.theme.colors.text.primary};
    border-radius: 6px;
    padding: 9px 16px;
    cursor: pointer;
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
  // Creating and viewing keys need the admin password when one is set
  const [adminPassword, setAdminPassword] = useState(false);
  const [prompt, setPrompt] = useState<{ purpose: 'create' | 'view'; key?: ApiKey } | null>(null);
  const [promptPassword, setPromptPassword] = useState('');
  const [promptError, setPromptError] = useState('');
  const [promptBusy, setPromptBusy] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const loadKeys = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/api-keys`);
      const data = await response.json();
      if (data.success) {
        setKeys(data.keys);
        setAdminPassword(!!data.admin_password);
      }
    } catch (error) {
      console.error('Error loading API keys:', error);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const openPrompt = (purpose: 'create' | 'view', key?: ApiKey) => {
    setPrompt({ purpose, key });
    setPromptPassword('');
    setPromptError('');
  };

  const closePrompt = () => {
    if (promptBusy) return;
    setPrompt(null);
    setPromptPassword('');
    setPromptError('');
  };

  // Returns an error message, or null when it worked
  const sendCreate = async (password?: string): Promise<string | null> => {
    const response = await fetch(`${getBackendUrl()}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), scope, admin_password: password }),
    });
    const data = await response.json();
    if (!data.success) return data.error || 'Could not create the key';
    setCreated({ key: data.key, name: data.info.name });
    setName('');
    loadKeys();
    return null;
  };

  const createKey = async () => {
    if (!name.trim() || creating) return;
    if (adminPassword) {
      openPrompt('create');
      return;
    }
    setCreating(true);
    try {
      const error = await sendCreate();
      if (error) addNotification({ type: 'error', title: 'API Keys', message: error });
    } catch (error) {
      addNotification({ type: 'error', title: 'API Keys', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setCreating(false);
    }
  };

  const submitPrompt = async () => {
    if (!prompt || !promptPassword || promptBusy) return;
    setPromptBusy(true);
    setPromptError('');
    try {
      if (prompt.purpose === 'create') {
        const error = await sendCreate(promptPassword);
        if (error) {
          setPromptError(error);
          return;
        }
      } else if (prompt.key) {
        const response = await fetch(`${getBackendUrl()}/api-keys/${encodeURIComponent(prompt.key.id)}/reveal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_password: promptPassword }),
        });
        const data = await response.json();
        if (!data.success) {
          setPromptError(data.error || 'Could not show the key');
          return;
        }
        const keyId = prompt.key.id;
        setRevealed(prev => ({ ...prev, [keyId]: data.key }));
      }
      setPrompt(null);
      setPromptPassword('');
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : String(error));
    } finally {
      setPromptBusy(false);
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
      setRevealed(prev => { const next = { ...prev }; delete next[key.id]; return next; });
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
        <div className="top">
          <input
            type="text"
            placeholder="Key name, e.g. door-camera"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createKey(); }}
          />
          <PrimaryButton onClick={createKey} disabled={!name.trim() || creating}>
            <i className={creating ? 'fas fa-spinner fa-spin' : 'fas fa-plus'}></i>
            Create Key
          </PrimaryButton>
        </div>
        <div className="scopes" role="radiogroup" aria-label="What the key may do">
          {Object.entries(SCOPE_INFO).map(([value, info]) => (
            <label key={value} title={info.hint}>
              <input type="radio" name="api-key-scope" checked={scope === value} onChange={() => setScope(value)} />
              {info.label}
            </label>
          ))}
        </div>
      </CreateRow>

      {created && (
        <NewKey>
          <div>
            <strong>{created.name}</strong> -{' '}
            {adminPassword
              ? 'copy it now; you can view it again later with the admin password.'
              : <span className="warn">copy it now; set an admin password (sudo jdboard-passwd --admin) to be able to view it again.</span>}
          </div>
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
            <div className="buttons">
              <button
                className="view"
                onClick={() => (revealed[key.id]
                  ? setRevealed(prev => { const next = { ...prev }; delete next[key.id]; return next; })
                  : openPrompt('view', key))}
                disabled={!revealed[key.id] && (!key.viewable || !adminPassword)}
                title={revealed[key.id] ? 'Hide the key'
                  : !key.viewable ? 'Created before keys could be shown again'
                  : !adminPassword ? 'Set an admin password (sudo jdboard-passwd --admin) to view keys again'
                  : 'Show the key (needs the admin password)'}
              >
                <i className={revealed[key.id] ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
              </button>
              <button className="revoke" onClick={() => revokeKey(key)} disabled={revoking === key.id}>
                {revoking === key.id ? <i className="fas fa-spinner fa-spin"></i> : 'Revoke'}
              </button>
            </div>
            {revealed[key.id] && (
              <div className="shown">
                <code>{revealed[key.id]}</code>
                <button onClick={() => copy(revealed[key.id])} title="Copy"><i className="fas fa-copy"></i></button>
              </div>
            )}
          </div>
        ))}
      </KeyList>
      {prompt && (
        <Modal isOpen={true} onClose={closePrompt} maxWidth="420px">
          <ModalHeader>
            <h3>
              <i className="fas fa-lock"></i>
              Admin password
            </h3>
            <ModalCloseButton onClick={closePrompt}>
              <i className="fas fa-times"></i>
            </ModalCloseButton>
          </ModalHeader>
          <ModalBody>
            <PromptBody>
              {prompt.purpose === 'create'
                ? <>Enter the admin password to create the key <strong>{name.trim()}</strong>.</>
                : <>Enter the admin password to show the key <strong>{prompt.key?.name}</strong>.</>}
              <input
                type="password"
                autoFocus
                placeholder="Admin password"
                value={promptPassword}
                onChange={(e) => setPromptPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitPrompt(); }}
              />
              {promptError && <div className="error">{promptError}</div>}
            </PromptBody>
          </ModalBody>
          <ModalFooter>
            <PromptButtons>
              <button className="cancel" onClick={closePrompt} disabled={promptBusy}>Cancel</button>
              <PrimaryButton onClick={submitPrompt} disabled={!promptPassword || promptBusy}>
                {promptBusy && <i className="fas fa-spinner fa-spin"></i>}
                {prompt.purpose === 'create' ? 'Create Key' : 'Show Key'}
              </PrimaryButton>
            </PromptButtons>
          </ModalFooter>
        </Modal>
      )}
    </Card>
  );
};

export default ApiKeysCard;

"""
API keys for bots and scripts.

People log in to the dashboard with the nginx login. Programs use an API key
instead, sent as ``Authorization: Bearer <key>``: nginx asks the backend
(/api/_internal/key-check, via auth_request) whether the key is valid and
whether its scope allows the requested path, so a key never needs anyone's
password and can be revoked on its own.

Keys look like ``jdb_<id>_<secret>``. Only a SHA-256 of the secret is stored
(the secret is 256 random bits, so a slow hash isn't needed); the full key is
shown once, when it is created.

Scopes
    inference   list models, load/unload them, run inference
    read        any GET request (monitoring, models, logs, live updates)
    full        everything except the web terminal, key management and the
                sudo/admin-password login (admin actions still need the admin
                password if one is set)
"""

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import threading
import time
from datetime import datetime

logger = logging.getLogger(__name__)

SCOPES = {
    'inference': 'Inference only',
    'read': 'Read only',
    'full': 'Full access',
}

# Never reachable with a key, whatever its scope
_ALWAYS_DENIED = re.compile(r'^/(terminal|api-keys|auth|_internal)(/|$)')

# Scope 'inference'
_INFERENCE_RULES = [
    ('GET', re.compile(r'^/models(/list)?/?$')),
    ('GET', re.compile(r'^/models/[^/]+/?$')),
    ('POST', re.compile(r'^/models/[^/]+/(load|unload)/?$')),
    ('POST', re.compile(r'^/inference/[^/]+/?$')),
]

# Live updates (Socket.IO long-polling also POSTs) for 'read'
_SOCKET_IO = re.compile(r'^/socket\.io(/|$)')

MAX_BAD_KEYS = 10            # wrong keys allowed per client IP...
BAD_KEY_WINDOW_S = 60        # ...within this many seconds,
BAD_KEY_LOCKOUT_S = 600      # then that IP's keys are refused for 10 minutes
LAST_USED_SAVE_EVERY_S = 60  # don't rewrite the file on every request


def scope_allows(scope, method, path):
    """Whether a key with ``scope`` may make this request (path without /api)."""
    method = (method or 'GET').upper()
    path = (path or '/').split('?', 1)[0] or '/'
    if _ALWAYS_DENIED.match(path):
        return False
    if scope == 'full':
        return True
    if scope == 'read':
        return method in ('GET', 'HEAD') or bool(_SOCKET_IO.match(path))
    if scope == 'inference':
        return any(method == m and rule.match(path) for m, rule in _INFERENCE_RULES)
    return False


def _hash(secret):
    return hashlib.sha256(secret.encode('utf-8')).hexdigest()


class ApiKeyStore:
    def __init__(self, path):
        self.path = path
        self._lock = threading.Lock()
        self._keys = self._load()
        self._dirty_since = None
        self._bad = {}        # ip -> [timestamps]
        self._locked = {}     # ip -> until
        self._used_since_start = set()

    # --- storage --------------------------------------------------------------
    def _load(self):
        try:
            with open(self.path, encoding='utf-8') as f:
                return {k['id']: k for k in json.load(f).get('keys', [])}
        except FileNotFoundError:
            return {}
        except (OSError, ValueError) as e:
            logger.error(f"Could not read API keys from {self.path}: {e}")
            return {}

    def _save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({'keys': list(self._keys.values())}, f, indent=2)
        os.chmod(tmp, 0o640)
        os.replace(tmp, self.path)
        self._dirty_since = None

    @staticmethod
    def _public(entry):
        return {k: entry.get(k) for k in ('id', 'name', 'scope', 'prefix', 'created_at',
                                          'last_used_at', 'last_used_ip')}

    # --- management -------------------------------------------------------------
    def list(self):
        with self._lock:
            return sorted((self._public(k) for k in self._keys.values()),
                          key=lambda k: k['created_at'] or '', reverse=True)

    def create(self, name, scope):
        name = (name or '').strip()
        if not name or len(name) > 60:
            raise ValueError("Give the key a name (up to 60 characters)")
        if scope not in SCOPES:
            raise ValueError(f"Scope must be one of: {', '.join(SCOPES)}")
        with self._lock:
            if any(k['name'].lower() == name.lower() for k in self._keys.values()):
                raise ValueError(f"A key named '{name}' already exists")
            key_id = secrets.token_hex(4)
            while key_id in self._keys:
                key_id = secrets.token_hex(4)
            secret = secrets.token_urlsafe(32)
            full_key = f"jdb_{key_id}_{secret}"
            self._keys[key_id] = {
                'id': key_id, 'name': name, 'scope': scope,
                'prefix': full_key[:12], 'hash': _hash(secret),
                'created_at': datetime.now().isoformat(timespec='seconds'),
                'last_used_at': None, 'last_used_ip': None,
            }
            self._save()
            logger.info(f"API key '{name}' ({scope}) created")
            return full_key, self._public(self._keys[key_id])

    def revoke(self, key_id):
        with self._lock:
            entry = self._keys.pop(key_id, None)
            if entry is None:
                raise KeyError(key_id)
            self._save()
            logger.info(f"API key '{entry['name']}' revoked")

    # --- checking (called by nginx for every request that carries a key) --------
    def check(self, authorization, method, path, client_ip):
        """(status, key_id): 204 allowed, 401 bad/missing key, 403 not allowed
        for this key's scope, 429 this IP sent too many bad keys."""
        now = time.time()
        if self._locked.get(client_ip, 0) > now:
            return 429, None
        match = re.fullmatch(r'Bearer\s+jdb_([0-9a-f]{8})_([A-Za-z0-9_-]{20,})', (authorization or '').strip())
        entry = None
        if match:
            with self._lock:
                entry = self._keys.get(match.group(1))
            if entry and not hmac.compare_digest(entry['hash'], _hash(match.group(2))):
                entry = None
        if entry is None:
            if authorization:
                self._record_bad(client_ip, now)
            return 401, None
        if not scope_allows(entry['scope'], method, path):
            logger.info(f"API key '{entry['name']}' ({entry['scope']}) not allowed: {method} {path}")
            return 403, entry['id']
        self._touch(entry['id'], client_ip, now)
        return 204, entry['id']

    def _record_bad(self, client_ip, now):
        recent = [t for t in self._bad.get(client_ip, []) if now - t < BAD_KEY_WINDOW_S] + [now]
        self._bad[client_ip] = recent
        logger.warning(f"Rejected API key from {client_ip}")
        if len(recent) >= MAX_BAD_KEYS:
            self._locked[client_ip] = now + BAD_KEY_LOCKOUT_S
            self._bad.pop(client_ip, None)
            logger.warning(f"Too many bad API keys from {client_ip}; refusing its keys for "
                           f"{BAD_KEY_LOCKOUT_S // 60} minutes")

    def _touch(self, key_id, client_ip, now):
        """Record last use. Saved right away the first time a key is used after
        startup, then at most once a minute (bots may call many times a second)."""
        with self._lock:
            entry = self._keys.get(key_id)
            if entry is None:
                return
            entry['last_used_at'] = datetime.now().isoformat(timespec='seconds')
            entry['last_used_ip'] = client_ip
            first_use = key_id not in self._used_since_start
            self._used_since_start.add(key_id)
            if self._dirty_since is None:
                self._dirty_since = now
            if first_use or now - self._dirty_since >= LAST_USED_SAVE_EVERY_S:
                try:
                    self._save()
                except OSError as e:
                    logger.warning(f"Could not save API key usage: {e}")

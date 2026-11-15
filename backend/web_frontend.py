"""
Serve JDBoard from a single port, optionally behind a password.

Layout (same as the Vite dev proxy and nginx_proxy_TEMPLATE):
    /api/...            -> the Flask API (prefix stripped), incl. /api/socket.io
    everything else     -> the built frontend (frontend/dist), with SPA fallback

Requests without the /api prefix that match an API route are still passed to
the API, so older proxies that strip /api themselves keep working.

Password protection is HTTP Basic auth, enabled when an auth file exists
(JDBOARD_AUTH_FILE, default /etc/jdboard/auth) containing one line:
    username:<werkzeug password hash>
Create it with scripts/install-service.sh (or scripts/set-password.sh).
"""

import base64
import hmac
import logging
import os
import threading

from flask import Flask, send_from_directory
from werkzeug.exceptions import MethodNotAllowed, NotFound
from werkzeug.security import check_password_hash

logger = logging.getLogger(__name__)

DEFAULT_DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))
DEFAULT_AUTH_FILE = '/etc/jdboard/auth'


def load_auth(path=None):
    """Return (username, password_hash) from the auth file, or None if absent."""
    path = path or os.environ.get('JDBOARD_AUTH_FILE') or DEFAULT_AUTH_FILE
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        line = f.readline().strip()
    username, sep, pw_hash = line.partition(':')
    if not sep or not username or not pw_hash:
        raise ValueError(f"Auth file {path} must contain 'username:password_hash'")
    return username, pw_hash


class BasicAuth:
    """HTTP Basic auth check. Password hashes are slow by design (scrypt), and
    the dashboard polls several times a second, so successful headers are
    remembered (in memory, for the life of the process)."""

    def __init__(self, username, pw_hash):
        self.username = username
        self.pw_hash = pw_hash
        self._accepted = set()
        self._lock = threading.Lock()

    def check(self, header):
        if not header or not header.startswith('Basic '):
            return False
        if header in self._accepted:
            return True
        try:
            decoded = base64.b64decode(header[6:], validate=True).decode('utf-8')
        except Exception:
            return False
        username, _, password = decoded.partition(':')
        ok = hmac.compare_digest(username, self.username) and check_password_hash(self.pw_hash, password)
        if ok:
            with self._lock:
                if len(self._accepted) > 32:
                    self._accepted.clear()
                self._accepted.add(header)
        return ok


def _unauthorized(start_response):
    body = b'Authentication required'
    start_response('401 Unauthorized', [
        ('WWW-Authenticate', 'Basic realm="JDBoard", charset="UTF-8"'),
        ('Content-Type', 'text/plain'),
        ('Content-Length', str(len(body))),
    ])
    return [body]


def _make_frontend_app(dist_dir):
    frontend = Flask('jdboard_frontend', static_folder=None)

    @frontend.route('/', defaults={'path': ''})
    @frontend.route('/<path:path>')
    def serve(path):
        full = os.path.join(dist_dir, path)
        if path and os.path.isfile(full):
            response = send_from_directory(dist_dir, path)
            if path.startswith('assets/'):
                # Vite puts a content hash in asset names
                response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
            return response
        if path.startswith('assets/'):
            return 'Not found', 404
        # Client-side routes (/models, /inference/...) all load the app
        response = send_from_directory(dist_dir, 'index.html')
        response.headers['Cache-Control'] = 'no-cache'
        return response

    return frontend


class JDBoardWSGI:
    """WSGI wrapper: auth, /api prefix routing, and frontend serving."""

    def __init__(self, flask_app, api_wsgi, dist_dir=None, auth=None):
        self.flask_app = flask_app
        self.api = api_wsgi
        self.auth = auth
        self.dist_dir = dist_dir or DEFAULT_DIST_DIR
        self.frontend = None
        if os.path.isfile(os.path.join(self.dist_dir, 'index.html')):
            self.frontend = _make_frontend_app(self.dist_dir).wsgi_app

    def _is_api_route(self, environ):
        path = environ.get('PATH_INFO', '')
        if path.startswith('/socket.io'):
            return True
        # A browser loading a page (e.g. refreshing on /models) wants the app,
        # even when the API has a route with the same path.
        if environ.get('HTTP_SEC_FETCH_MODE') == 'navigate' or \
                'text/html' in environ.get('HTTP_ACCEPT', ''):
            return False
        adapter = self.flask_app.url_map.bind_to_environ(environ)
        try:
            adapter.match()
            return True
        except MethodNotAllowed:
            return True
        except NotFound:
            return False
        except Exception:
            # e.g. RequestRedirect for a missing trailing slash
            return True

    def __call__(self, environ, start_response):
        if self.auth and not self.auth.check(environ.get('HTTP_AUTHORIZATION')):
            return _unauthorized(start_response)

        path = environ.get('PATH_INFO', '')
        if path == '/api' or path.startswith('/api/'):
            environ['PATH_INFO'] = path[4:] or '/'
            environ['SCRIPT_NAME'] = environ.get('SCRIPT_NAME', '') + '/api'
            return self.api(environ, start_response)

        if self.frontend is None or self._is_api_route(environ):
            return self.api(environ, start_response)
        return self.frontend(environ, start_response)


def install(flask_app):
    """Wrap ``flask_app.wsgi_app`` (call after SocketIO(app) so the Socket.IO
    middleware sits inside this one)."""
    dist_dir = os.environ.get('JDBOARD_FRONTEND_DIST') or DEFAULT_DIST_DIR
    auth = None
    creds = load_auth()
    if creds:
        auth = BasicAuth(*creds)
        logger.info(f"Password protection enabled (user '{creds[0]}')")
    else:
        logger.warning("No auth file found - JDBoard is open to anyone who can reach it. "
                       "Run scripts/set-password.sh to add a password.")
    wrapper = JDBoardWSGI(flask_app, flask_app.wsgi_app, dist_dir=dist_dir, auth=auth)
    if wrapper.frontend:
        logger.info(f"Serving frontend from {dist_dir}")
    else:
        logger.info("No frontend build found (frontend/dist) - API only; use the Vite dev server")
    flask_app.wsgi_app = wrapper
    return wrapper

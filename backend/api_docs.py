"""
Route reference for the dashboard's API page (GET /api/docs/routes).

Built from the Flask app itself so it can't fall out of date: every route's
methods and path come from the URL map, its description from the view's
docstring, the parameters it reads from its source (request.args / form /
files / JSON fields), and which API key scopes may call it from the same
rules nginx enforces (api_keys.scope_allows). A few routes get extra notes
below (types, examples) that the source can't tell.
"""

import inspect
import re

from api_keys import SCOPES, scope_allows

# Not part of the public API (used internally by nginx or the dashboard itself)
HIDDEN = re.compile(r'^/(_internal|debug|auth)(/|$)|^/docs/routes$')

GROUPS = [
    ('Models', re.compile(r'^/models')),
    ('Inference', re.compile(r'^/inference')),
    ('Logs', re.compile(r'^/logs')),
    ('System', re.compile(r'^/(system|gpu)')),
    ('Settings', re.compile(r'^/settings')),
    ('API keys', re.compile(r'^/api-keys')),
    ('Terminal', re.compile(r'^/terminal')),
]

# Need the admin password when one is set (sent as sudo_password / admin_password)
ADMIN_PASSWORD = {
    ('POST', '/system/reboot'), ('POST', '/system/shutdown'), ('POST', '/system/clear-cache'),
    ('POST', '/system/jtop-install-service'), ('POST', '/system/jtop-restart-service'),
    ('POST', '/system/autostart'), ('POST', '/api-keys'), ('POST', '/api-keys/<key_id>/reveal'),
}

# Change or remove something, or affect the whole device: the tester asks first
DESTRUCTIVE = re.compile(
    r'^(DELETE )|^POST /system/(reboot|shutdown|clear-cache|jtop-restart-service|jtop-install-service)$'
    r'|^POST /system/processes/<int:pid>/kill$|^POST /models/emergency-cleanup$|^POST /logs/inference/clear$')

# Details the source doesn't show: (method, path) -> overrides/additions
EXTRA = {
    ('POST', '/inference/<model_id>'): {
        'params': [{'name': 'image', 'in': 'file', 'required': True, 'description': 'Image to run the model on (JPEG/PNG)'}],
        'notes': 'The model must be loaded first (POST /models/<model_id>/load). '
                 'Predictions are in data.result.predictions: class, class_id, confidence, '
                 'bbox {x, y, width, height} in original-image pixels (x/y = box centre).',
    },
    ('POST', '/models/upload'): {
        'params': [{'name': 'file', 'in': 'file', 'required': True, 'description': 'The model file (.pt, .onnx, .engine)'}],
        'notes': 'target_format: PyTorch (keep), TensorRT; precision fp32/fp16/int8; '
                 'progress arrives over Socket.IO and GET /models/downloads/<download_id>/status.',
    },
    ('POST', '/models/download-yolo'): {
        'notes': 'model_url: an Ultralytics .pt URL; target_format PyTorch or TensorRT.',
    },
    ('GET', '/logs/inference/export/<format>'): {
        'notes': 'format: json, csv or txt',
    },
    ('POST', '/system/autostart'): {'example': {'enabled': False}},
    ('POST', '/settings'): {'example': {'updateInterval': '2s', 'enableNotifications': True}},
    ('POST', '/system/power-mode'): {'example': {'mode': 'MAXN_SUPER'}},
    ('POST', '/system/fan-mode'): {'example': {'mode': 'quiet'}},
    ('POST', '/system/jetson-clocks'): {'example': {'enabled': True}},
    ('PUT', '/models/<model_id>/rename'): {'example': {'new_name': 'my-model'}},
    ('POST', '/api-keys'): {'example': {'name': 'door-camera', 'scope': 'inference', 'admin_password': ''}},
}

_QUERY = re.compile(r"request\.args\.get\(\s*['\"](\w+)['\"]")
_FORM = re.compile(r"request\.form\.get\(\s*['\"](\w+)['\"]")
_FILES = re.compile(r"request\.files(?:\.get\(\s*['\"](\w+)['\"]|\[\s*['\"](\w+)['\"]\s*\])")
_BODY = re.compile(r"\bdata\.get\(\s*['\"](\w+)['\"]|\(request\.json or \{\}\)\.get\(\s*['\"](\w+)['\"]")
_PATH_PARAM = re.compile(r'<(?:(\w+):)?(\w+)>')


def _params_from_source(func):
    try:
        src = inspect.getsource(func)
    except (OSError, TypeError):
        return []
    params, seen = [], set()

    def add(name, where):
        if name and (name, where) not in seen:
            seen.add((name, where))
            params.append({'name': name, 'in': where, 'required': False})

    for m in _QUERY.finditer(src):
        add(m.group(1), 'query')
    for m in _FILES.finditer(src):
        add(m.group(1) or m.group(2), 'file')
    for m in _FORM.finditer(src):
        add(m.group(1), 'form')
    # JSON body fields (skip ones already read from the form)
    form_names = {p['name'] for p in params if p['in'] == 'form'}
    for m in _BODY.finditer(src):
        name = m.group(1) or m.group(2)
        if name not in form_names:
            add(name, 'body')
    return params


def build_route_docs(app):
    routes = []
    for rule in app.url_map.iter_rules():
        if rule.endpoint == 'static' or HIDDEN.match(rule.rule):
            continue
        func = app.view_functions[rule.endpoint]
        doc = inspect.getdoc(func) or ''
        summary, _, details = doc.partition('\n')
        sample_path = _PATH_PARAM.sub('x', rule.rule)
        for method in sorted(rule.methods - {'HEAD', 'OPTIONS'}):
            extra = EXTRA.get((method, rule.rule), {})
            params = [{'name': name, 'in': 'path', 'required': True, 'type': conv or 'string'}
                      for conv, name in _PATH_PARAM.findall(rule.rule)]
            from_source = _params_from_source(func)
            # Routes that serve several methods: only show fields for methods that send a body
            if method in ('GET', 'DELETE'):
                from_source = [p for p in from_source if p['in'] == 'query']
            else:
                from_source = [p for p in from_source if p['in'] != 'query' or method == 'GET']
            for p in extra.get('params', []):
                from_source = [q for q in from_source if q['name'] != p['name']] + [p]
            params += from_source
            if (method, rule.rule) in ADMIN_PASSWORD and not any(
                    p['name'] in ('sudo_password', 'admin_password', 'password') for p in params):
                params.append({'name': 'sudo_password', 'in': 'body', 'required': False})
            group = next((g for g, pattern in GROUPS if pattern.match(rule.rule)), 'Other')
            routes.append({
                'method': method,
                'path': '/api' + rule.rule,
                'rule': rule.rule,
                'group': group,
                'summary': summary.strip(),
                'details': ' '.join(details.split()),
                'notes': extra.get('notes', ''),
                'params': params,
                'example': extra.get('example'),
                'scopes': [s for s in SCOPES if scope_allows(s, method, sample_path)],
                'admin_password': (method, rule.rule) in ADMIN_PASSWORD,
                'destructive': bool(DESTRUCTIVE.search(f'{method} {rule.rule}')),
            })
    order = {g: i for i, (g, _) in enumerate(GROUPS)}
    routes.sort(key=lambda r: (order.get(r['group'], 99), r['rule'], r['method']))
    return routes

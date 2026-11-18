#!/usr/bin/env python3
"""
System Monitor for the JDBoard Jetson dashboard.

All Jetson telemetry and hardware controls go through jetson-stats (jtop >= 4.x,
tested on 7.2.x) using its structured API:

    jt.cpu, jt.memory, jt.gpu, jt.temperature, jt.power, jt.fan, jt.disk,
    jt.board, jt.uptime, jt.nvpmodel, jt.jetson_clocks

We intentionally do NOT use ``jt.stats``: on recent L4T releases jtop 7.2.x
raises ``KeyError: 'online'`` from that convenience property because some
engine entries do not carry an ``online`` flag.

A single background thread owns the jtop client. It follows the canonical
``while jt.ok()`` loop (which blocks until fresh data is available) and
automatically reconnects with back-off when the jtop.service goes away, so no
manual "force reconnect" dance is needed on the frontend.

Controls (jetson_clocks, nvpmodel, fan profile) are sent through jtop's
setters. The jtop.service runs as root, so these do not require sudo; the user
only needs to be in the ``jtop`` group.
"""

import logging
import math
import os
import platform
import subprocess
import threading
import time
from datetime import datetime

import psutil

try:
    from jtop import jtop, JtopException
    JTOP_AVAILABLE = True
except Exception:  # pragma: no cover - only on non-Jetson hosts
    jtop = None
    JtopException = Exception
    JTOP_AVAILABLE = False

logger = logging.getLogger(__name__)


def _patch_jtop_library_versions():
    """jtop's client looks up the cuDNN/TensorRT/VPI versions by loading those
    libraries into this process with ctypes. TensorRT's library initializes
    itself on load, which costs ~250 MB of RAM for the life of the process -
    in JDBoard's always-on main process, which otherwise never needs it. Do
    the same lookup in a short-lived subprocess instead (same results)."""
    try:
        import json
        import sys
        import jtop  # noqa: F401  (loads the jtop.jtop module)
        # The package exports a class named `jtop` that shadows the module of
        # the same name, so fetch the module itself
        jtop_module = sys.modules['jtop.jtop']
    except Exception:
        return
    cache = {}

    def get_libraries_isolated():
        if 'libraries' not in cache:
            code = ("import json\n"
                    "from jtop.core.jetson_libraries import get_libraries\n"
                    "print(json.dumps(get_libraries()))")
            try:
                out = subprocess.run([sys.executable, '-c', code], capture_output=True,
                                     text=True, timeout=30)
                cache['libraries'] = json.loads(out.stdout.strip().splitlines()[-1])
            except Exception as e:
                logger.debug(f"Library version lookup failed: {e}")
                cache['libraries'] = {}
        return dict(cache['libraries'])

    jtop_module.get_libraries = get_libraries_isolated


if JTOP_AVAILABLE:
    _patch_jtop_library_versions()

JTOP_INTERVAL = 0.5          # seconds between jtop samples
RECONNECT_MIN_DELAY = 1.0     # seconds
RECONNECT_MAX_DELAY = 10.0    # seconds
LOG_REFRESH_INTERVAL = 5.0    # seconds between journalctl reads
CONTROL_TIMEOUT = 15.0        # seconds to wait for a control change to apply
FAN_HIDDEN_PROFILES = {'manual'}  # needs an explicit speed, not exposed in the UI


def _num(value, default=0.0, ndigits=1):
    """Convert to a finite rounded float, falling back to ``default``."""
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(result) or math.isinf(result):
        return default
    return round(result, ndigits)


def _sanitize(data):
    """Recursively make data JSON-safe (no NaN/inf)."""
    if isinstance(data, dict):
        return {k: _sanitize(v) for k, v in data.items()}
    if isinstance(data, (list, tuple)):
        return [_sanitize(v) for v in data]
    if isinstance(data, float):
        return 0 if (math.isnan(data) or math.isinf(data)) else round(data, 3)
    return data


def _format_uptime(delta):
    total = int(delta.total_seconds()) if hasattr(delta, 'total_seconds') else 0
    return f"{total // 3600}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def _classify_error(exc):
    """Map a jtop failure to the error payload the frontend understands."""
    text = str(exc)
    lower = text.lower()
    now = datetime.now().isoformat()
    if "can't access jtop.service" in lower or 'permission' in lower:
        return {
            'type': 'permission_error',
            'message': 'Cannot access jtop.service. Make sure your user is in the "jtop" group, then log out and back in.',
            'command': f'sudo usermod -aG jtop {os.environ.get("USER", "$USER")}',
            'timestamp': now,
        }
    if 'not active' in lower or 'install-service' in lower:
        return {
            'type': 'jtop_service_inactive',
            'message': 'The jtop.service is not active.',
            'command': 'sudo jtop --install-service',
            'timestamp': now,
        }
    return {
        'type': 'jtop_service_inactive',
        'message': f'Lost connection to jtop.service ({text or type(exc).__name__}). Reconnecting automatically...',
        'command': 'sudo systemctl restart jtop.service',
        'timestamp': now,
    }


class SystemMonitor:
    def __init__(self):
        if not JTOP_AVAILABLE:
            raise RuntimeError(
                "jetson-stats (jtop) is required. Install it with: sudo pip3 install -U jetson-stats"
            )

        self._jt = None
        self._jt_lock = threading.RLock()     # guards self._jt and control calls
        self._data_lock = threading.Lock()    # guards self.system_data
        self._running = False
        self._thread = None
        self._connected = threading.Event()
        self._reconnect_requested = threading.Event()
        self._last_log_refresh = 0.0

        self.system_data = {
            'cpu': {'usage': 0, 'frequency': 0, 'temperature': 0, 'cores': [], 'core_count': 0},
            'memory': {'total': 0, 'used': 0, 'available': 0, 'percent': 0},
            'gpu': {'usage': 0, 'memory_used': 0, 'memory_total': 0, 'temperature': 0,
                    'frequency': 0, 'power': 0, 'name': 'Jetson GPU'},
            'disk': {'total': 0, 'used': 0, 'free': 0, 'percent': 0},
            'network': {'bytes_sent': 0, 'bytes_recv': 0},
            'fan': {'speed': 0, 'rpm': 0, 'cpu_temp': 0, 'gpu_temp': 0, 'total_power': 0, 'profile': None},
            'processes': 0,
            'uptime': '0:00:00',
            'nvp_model': 'Unknown',
            'jetson_model': 'Unknown',
            'jetson_module': 'Unknown',
            'jetpack_version': 'Unknown',
            'kernel_version': platform.release() or 'Unknown',
            'jetson_clocks': False,
            'system_logs': {'recent_logs': [], 'log_count': 0, 'last_updated': None},
            'error': None,
            'last_updated': None,
        }

    # ------------------------------------------------------------------ lifecycle

    def start_monitoring(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, name='jtop-monitor', daemon=True)
        self._thread.start()
        logger.info("System monitoring started (jtop)")

    def stop_monitoring(self):
        self._running = False
        self._reconnect_requested.set()
        if self._thread:
            self._thread.join(timeout=5)
        self._close()
        logger.info("System monitoring stopped")

    def _close(self):
        with self._jt_lock:
            jt, self._jt = self._jt, None
        self._connected.clear()
        if jt is not None:
            try:
                jt.close()
            except Exception:
                pass

    def _run(self):
        delay = RECONNECT_MIN_DELAY
        while self._running:
            try:
                jt = jtop(interval=JTOP_INTERVAL)
                jt.start()
                with self._jt_lock:
                    self._jt = jt
                self._reconnect_requested.clear()
                logger.info("Connected to jtop.service")
                delay = RECONNECT_MIN_DELAY

                while self._running and not self._reconnect_requested.is_set() and jt.ok():
                    self._update(jt)
                    self._connected.set()
            except Exception as exc:
                error = _classify_error(exc)
                with self._data_lock:
                    self.system_data['error'] = error
                logger.warning(f"jtop connection problem: {exc}")
            finally:
                self._close()

            if not self._running:
                break
            # Back off before reconnecting (a reconnect request skips the wait)
            self._reconnect_requested.wait(delay)
            self._reconnect_requested.clear()
            delay = min(delay * 2, RECONNECT_MAX_DELAY)

    # ------------------------------------------------------------------ sampling

    def _update(self, jt):
        snapshot = {
            'cpu': self._read_cpu(jt),
            'memory': self._read_memory(jt),
            'gpu': self._read_gpu(jt),
            'disk': self._read_disk(jt),
            'network': self._read_network(),
            'fan': self._read_fan(jt),
            'processes': len(psutil.pids()),
            'uptime': _format_uptime(jt.uptime),
            'nvp_model': jt.nvpmodel.name if jt.nvpmodel is not None else 'N/A',
            'jetson_clocks': bool(jt.jetson_clocks) if jt.jetson_clocks is not None else False,
            'error': None,
            'last_updated': datetime.now().isoformat(),
        }

        hardware = jt.board.get('hardware', {}) if jt.board else {}
        plat = jt.board.get('platform', {}) if jt.board else {}
        snapshot['jetson_model'] = hardware.get('Model', 'Jetson Device')
        snapshot['jetson_module'] = hardware.get('Module', 'Unknown Module')
        snapshot['jetpack_version'] = hardware.get('Jetpack', 'Unknown')
        snapshot['kernel_version'] = plat.get('Release') or platform.release() or 'Unknown'

        if time.monotonic() - self._last_log_refresh > LOG_REFRESH_INTERVAL:
            self._last_log_refresh = time.monotonic()
            snapshot['system_logs'] = self._read_system_logs()

        with self._data_lock:
            self.system_data.update(snapshot)

    @staticmethod
    def _temp(jt, *names):
        for name in names:
            sensor = jt.temperature.get(name)
            if sensor and sensor.get('online', True) and sensor.get('temp', -256) > -100:
                return _num(sensor['temp'])
        return 0

    def _read_cpu(self, jt):
        cores = []
        freqs = []
        for core in jt.cpu.get('cpu', []):
            if core.get('online'):
                cores.append(_num(100 - core.get('idle', 100)))
                cur = core.get('freq', {}).get('cur')
                if cur:
                    freqs.append(cur)
            else:
                cores.append(0)
        total = jt.cpu.get('total', {})
        usage = _num(100 - total['idle']) if 'idle' in total else (_num(sum(cores) / len(cores)) if cores else 0)
        return {
            'usage': usage,
            'frequency': _num(max(freqs) / 1000, ndigits=0) if freqs else 0,   # kHz -> MHz
            'temperature': self._temp(jt, 'cpu', 'tj'),
            'cores': cores,
            'core_count': len(cores),
        }

    @staticmethod
    def _read_memory(jt):
        ram = jt.memory.get('RAM', {})
        kb = 1024
        total = int(ram.get('tot', 0)) * kb
        used = int(ram.get('used', 0)) * kb
        free = int(ram.get('free', 0)) * kb
        cached = int(ram.get('cached', 0)) * kb
        buffers = int(ram.get('buffers', 0)) * kb
        shared = int(ram.get('shared', 0)) * kb
        available = max(total - used, 0)
        gb = 1024 ** 3
        swap = jt.memory.get('SWAP', {})
        return {
            'total': total,
            'used': used,
            'available': available,
            'free': free,
            'percent': _num(used / total * 100, ndigits=2) if total else 0,
            'swap_total': int(swap.get('tot', 0)) * kb,
            'swap_used': int(swap.get('used', 0)) * kb,
            'detailed': {
                'total_gb': round(total / gb, 3),
                'used_gb': round(used / gb, 3),
                'available_gb': round(available / gb, 3),
                'cached': cached,
                'cached_gb': round(cached / gb, 3),
                'buffers': buffers,
                'buffers_gb': round(buffers / gb, 3),
                'shared': shared,
                'shared_gb': round(shared / gb, 3),
                'free': free,
                'free_gb': round(free / gb, 3),
                'timestamp': time.time(),
            },
        }

    def _read_gpu(self, jt):
        gpu = next(iter(jt.gpu.values()), None) if jt.gpu else None
        ram = jt.memory.get('RAM', {})
        data = {
            'usage': 0,
            'temperature': self._temp(jt, 'gpu'),
            'frequency': 0,
            # Jetson GPUs share system RAM; jtop reports GPU-shared memory as RAM['shared']
            'memory_used': int(ram.get('shared', 0)) * 1024,
            'memory_total': int(ram.get('tot', 0)) * 1024,
            'power': 0,
            'name': 'Jetson GPU',
        }
        if gpu:
            data['usage'] = _num(gpu.get('status', {}).get('load', 0))
            data['frequency'] = _num(gpu.get('freq', {}).get('cur', 0) / 1000, ndigits=0)  # kHz -> MHz
        if jt.power:
            for name, rail in jt.power.get('rail', {}).items():
                if 'GPU' in name.upper():
                    data['power'] = _num(rail.get('power', 0) / 1000, ndigits=2)  # mW -> W
                    break
        return data

    @staticmethod
    def _read_disk(jt):
        disk = jt.disk or {}
        scale = {'k': 1024, 'M': 1024 ** 2, 'G': 1024 ** 3, 'T': 1024 ** 4}.get(disk.get('unit', 'G'), 1024 ** 3)
        total = int(disk.get('total', 0) * scale)
        used = int(disk.get('used', 0) * scale)
        free = int(disk.get('available', 0) * scale)
        return {
            'total': total,
            'used': used,
            'free': free,
            'percent': _num(used / total * 100) if total else 0,
        }

    @staticmethod
    def _read_network():
        # jtop exposes interface addresses but not byte counters
        io = psutil.net_io_counters()
        return {'bytes_sent': io.bytes_sent, 'bytes_recv': io.bytes_recv}

    def _read_fan(self, jt):
        fan = {'speed': 0, 'rpm': 0, 'profile': None}
        if jt.fan:
            first = next(iter(jt.fan.values()))
            if first.get('speed'):
                fan['speed'] = _num(first['speed'][0])
            if first.get('rpm'):
                fan['rpm'] = int(first['rpm'][0])
            fan['profile'] = first.get('profile')
        fan['cpu_temp'] = self._temp(jt, 'cpu', 'tj')
        fan['gpu_temp'] = self._temp(jt, 'gpu')
        fan['total_power'] = _num(jt.power['tot'].get('power', 0) / 1000, ndigits=2) if jt.power else 0  # mW -> W
        return fan

    @staticmethod
    def _read_system_logs():
        logs = []
        try:
            result = subprocess.run(
                ['journalctl', '--no-pager', '-n', '20', '--since', '1 hour ago'],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                logs = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        except (subprocess.SubprocessError, FileNotFoundError):
            logs = ['System logs unavailable']
        return {'recent_logs': logs[-20:], 'log_count': len(logs), 'last_updated': datetime.now().isoformat()}

    # ------------------------------------------------------------------ read API

    def get_system_status(self):
        with self._data_lock:
            return _sanitize(dict(self.system_data))

    def get_system_data(self):
        return self.get_system_status()

    def get_gpu_status(self):
        with self._data_lock:
            return dict(self.system_data['gpu'])

    def get_system_logs(self):
        with self._data_lock:
            if not self.system_data['system_logs']['last_updated']:
                self.system_data['system_logs'] = self._read_system_logs()
            return _sanitize(self.system_data['system_logs'])

    def is_connected(self):
        return self._connected.is_set()

    def get_board_info(self):
        with self._data_lock:
            return {
                'Model': self.system_data['jetson_model'],
                'Module': self.system_data['jetson_module'],
                'Jetpack': self.system_data['jetpack_version'],
            }

    def reconnect(self, timeout=15.0):
        """Drop the current jtop client and wait for a fresh connection."""
        logger.info("Reconnecting to jtop.service")
        self._connected.clear()
        with self._data_lock:
            self.system_data['error'] = None
        if not self._running:
            self.start_monitoring()
        self._reconnect_requested.set()
        return self._connected.wait(timeout)

    # Backwards-compatible alias used by the service install/restart endpoints
    def force_restart_monitoring(self):
        return self.reconnect()

    # ------------------------------------------------------------------ controls

    def _require_jtop(self):
        jt = self._jt
        if jt is None or not self._connected.is_set():
            raise RuntimeError('jtop.service is not connected')
        return jt

    @staticmethod
    def _wait_for(predicate, timeout=CONTROL_TIMEOUT):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return True
            time.sleep(0.25)
        return predicate()

    def get_power_modes(self):
        with self._jt_lock:
            jt = self._require_jtop()
            if jt.nvpmodel is None:
                return {'available_modes': [], 'current_mode': 'N/A', 'default_mode': None}
            default = jt.nvpmodel.get_default() or {}
            return {
                'available_modes': list(jt.nvpmodel.models),
                'current_mode': jt.nvpmodel.name,
                'default_mode': default.get('name'),
            }

    def set_power_mode(self, mode):
        with self._jt_lock:
            jt = self._require_jtop()
            if jt.nvpmodel is None:
                raise RuntimeError('nvpmodel is not available on this board')
            if mode not in jt.nvpmodel.models:
                raise ValueError(f"Invalid power mode '{mode}'. Available: {', '.join(jt.nvpmodel.models)}")
            jt.nvpmodel = mode
        if not self._wait_for(lambda: self._jt is not None and self._jt.nvpmodel.name == mode):
            raise RuntimeError(f'Power mode did not switch to {mode} (it may require a reboot)')
        with self._data_lock:
            self.system_data['nvp_model'] = mode
        return mode

    def set_jetson_clocks(self, enabled):
        enabled = bool(enabled)
        with self._jt_lock:
            jt = self._require_jtop()
            if jt.jetson_clocks is None:
                raise RuntimeError('jetson_clocks is not available on this board')
            jt.jetson_clocks = enabled
        if not self._wait_for(lambda: self._jt is not None and bool(self._jt.jetson_clocks) == enabled):
            raise RuntimeError(f"jetson_clocks did not turn {'on' if enabled else 'off'}")
        with self._data_lock:
            self.system_data['jetson_clocks'] = enabled
        return enabled

    def get_fan_modes(self):
        with self._jt_lock:
            jt = self._require_jtop()
            if not jt.fan:
                return {'available_modes': [], 'current_mode': None}
            name = next(iter(jt.fan.keys()))
            profiles = [p for p in jt.fan.all_profiles(name) if p not in FAN_HIDDEN_PROFILES]
            return {'available_modes': profiles, 'current_mode': jt.fan.get_profile(name)}

    def set_fan_mode(self, mode):
        with self._jt_lock:
            jt = self._require_jtop()
            if not jt.fan:
                raise RuntimeError('No controllable fan found on this board')
            name = next(iter(jt.fan.keys()))
            jt.fan.set_profile(name, mode)  # raises JtopException on unknown profile
        if not self._wait_for(lambda: self._jt is not None and self._jt.fan.get_profile(name) == mode):
            raise RuntimeError(f'Fan profile did not switch to {mode}')
        return mode

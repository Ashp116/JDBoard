"""
Main-process side of the inference worker (see inference_worker.py).

ManagedModelManager is the AIModelManager the web app uses. It keeps the model
registry, downloads and conversions in this always-on process, and hands
everything that needs PyTorch/TensorRT (loading, inference, custom scripts) to
a worker process that only runs while at least one model is loaded.
"""

import json
import logging
import logging.handlers
import multiprocessing
import os
import subprocess
import sys
import threading
import time
from datetime import datetime

import psutil

from ai_inference import AIModelManager, ScriptError

logger = logging.getLogger('ai_inference')

WORKER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'inference_worker.py')
# A load can take a while (large TensorRT engines); inference should not
LOAD_TIMEOUT_S = 600
INFER_TIMEOUT_S = 120
DEFAULT_TIMEOUT_S = 60
SCRIPT_CHECK_TIMEOUT_S = 180


class WorkerGone(RuntimeError):
    """The worker process exited or stopped responding."""


class _LogForwarder(logging.handlers.QueueListener):
    """Re-emits the worker's log records through this process's loggers, so
    they reach the journal and the dashboard's log stream like local ones."""

    def __init__(self, queue):
        super().__init__(queue, respect_handler_level=False)

    def handle(self, record):
        logging.getLogger(record.name).handle(record)


class InferenceWorker:
    """Starts, talks to and stops the worker process. Calls are serialized."""

    def __init__(self, models_dir):
        self.models_dir = os.path.abspath(str(models_dir))
        self._ctx = multiprocessing.get_context('spawn')   # fresh interpreter, nothing inherited
        self._lock = threading.RLock()
        self._process = None
        self._conn = None
        self._log_queue = None
        self._log_listener = None

    @property
    def running(self):
        return self._process is not None and self._process.is_alive()

    @property
    def pid(self):
        return self._process.pid if self.running else None

    def _start(self):
        logger.info("Starting the inference worker process (loads PyTorch/TensorRT)...")
        self._log_queue = self._ctx.Queue()
        self._log_listener = _LogForwarder(self._log_queue)
        self._log_listener.start()
        parent_conn, child_conn = self._ctx.Pipe()
        from inference_worker import worker_main
        # Not daemonic: daemonic processes may not start child processes, which
        # some libraries do. If this process dies the worker's pipe closes and it exits.
        self._process = self._ctx.Process(target=worker_main, name='jdboard-inference',
                                          args=(child_conn, self._log_queue, self.models_dir))
        # 'spawn' re-imports the main script (app.py) in the child to recreate
        # it - that would start a second web app and jtop client there. Hide its
        # path while starting so the child only imports inference_worker.
        main_module = sys.modules.get('__main__')
        main_file = getattr(main_module, '__file__', None)
        try:
            if main_file is not None:
                del main_module.__file__
            self._process.start()
        finally:
            if main_file is not None:
                main_module.__file__ = main_file
        child_conn.close()
        self._conn = parent_conn

    def call(self, op, timeout=DEFAULT_TIMEOUT_S, start=False, **payload):
        """Send one request; returns (result, models_state). Raises RuntimeError
        for a failed operation and WorkerGone if the process died."""
        with self._lock:
            if self._process is not None and not self._process.is_alive():
                # Died since the last call (e.g. killed for running out of memory)
                code = self._process.exitcode
                self._cleanup()
                if not start:
                    raise WorkerGone(self._exit_reason(code))
            if not self.running:
                if not start:
                    raise WorkerGone("The inference worker is not running. Load the model again.")
                self._start()
            try:
                self._conn.send({'op': op, **payload})
                deadline = time.monotonic() + timeout
                while not self._conn.poll(0.5):
                    if not self._process.is_alive():
                        code = self._process.exitcode
                        self._cleanup()
                        raise WorkerGone(self._exit_reason(code))
                    if time.monotonic() > deadline:
                        self._kill()
                        raise WorkerGone(f"The inference worker did not answer within {timeout}s and was stopped")
                ok, result, state = self._conn.recv()
            except (EOFError, BrokenPipeError, ConnectionResetError, OSError) as e:
                code = self._process.exitcode if self._process else None
                self._kill()
                raise WorkerGone(self._exit_reason(code) if code is not None else f"Lost the inference worker: {e}")
            if not ok:
                raise RuntimeError(result)
            return result, state

    @staticmethod
    def _exit_reason(code):
        if code == -9:
            return ("The inference worker was killed by the system, most likely because it ran out of "
                    "memory. All models were unloaded.")
        if code is not None and code < 0:
            return f"The inference worker crashed (signal {-code}). All models were unloaded."
        return f"The inference worker stopped unexpectedly (exit code {code}). All models were unloaded."

    def check_died(self):
        """If the worker exited on its own, clean up and return why; else None.
        Never waits: called every second from the status loop, and a running
        load/inference holds the lock (a dead worker is noticed by that call)."""
        if not self._lock.acquire(blocking=False):
            return None
        try:
            if self._process is not None and not self._process.is_alive():
                code = self._process.exitcode
                self._cleanup()
                return self._exit_reason(code)
            return None
        finally:
            self._lock.release()

    def stop(self):
        """Stop the worker and give its memory back. If it is busy (e.g. stuck
        loading a model), kill it - the waiting call then fails cleanly."""
        if not self._lock.acquire(timeout=5):
            process = self._process
            if process is not None and process.is_alive():
                logger.warning("Inference worker is busy - killing it")
                process.kill()
            return
        try:
            if not self.running:
                self._cleanup()
                return
            try:
                self._conn.send({'op': 'shutdown'})
                self._process.join(timeout=15)
            except Exception:
                pass
            self._kill()
            logger.info("Inference worker stopped - its memory has been released")
        finally:
            self._lock.release()

    def _kill(self):
        if self._process is not None and self._process.is_alive():
            self._process.terminate()
            self._process.join(timeout=5)
            if self._process.is_alive():
                self._process.kill()
                self._process.join(timeout=5)
        self._cleanup()

    def _cleanup(self):
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
        if self._log_listener is not None:
            try:
                self._log_listener.stop()
            except Exception:
                pass
        self._process = self._conn = self._log_listener = self._log_queue = None


class _WorkerMemoryInfo:
    """Stand-in for CUDAMemoryManager in the main process: asks the worker,
    or reports the shared system memory when no worker is running (on Jetson
    the GPU uses system RAM)."""

    def __init__(self, worker):
        self.worker = worker

    def get_gpu_memory_info(self):
        # Don't wait behind a running load/inference - fall back to system memory
        if self.worker.running and self.worker._lock.acquire(blocking=False):
            try:
                result, _ = self.worker.call('gpu_memory', timeout=10)
                return result
            except Exception as e:
                logger.debug(f"GPU memory query failed: {e}")
            finally:
                self.worker._lock.release()
        vm = psutil.virtual_memory()
        return {
            "total": vm.total, "allocated": 0, "cached": 0, "free": vm.available,
            "total_gb": vm.total / 1024 ** 3, "allocated_gb": 0, "cached_gb": 0,
            "free_gb": vm.available / 1024 ** 3, "usage_percent": 0,
            "worker_running": False,
        }

    def clear_cuda_cache(self, aggressive=False):
        pass

    def check_memory_available(self, required_mb=1024):
        return True

    def force_memory_cleanup(self):
        pass

    def monitor_and_cleanup_if_needed(self):
        return self.get_gpu_memory_info()


class ManagedModelManager(AIModelManager):
    """AIModelManager for the main process: model work happens in the worker."""

    def __init__(self, models_dir='../models'):
        super().__init__(models_dir=models_dir)
        self.worker = InferenceWorker(self.models_dir)
        self.memory_manager = _WorkerMemoryInfo(self.worker)
        # Mirror of the worker's loaded models: id -> loaded_at, load_time, script_error...
        self.loaded_models = {}
        # Nothing is loaded at startup, whatever the registry file says
        changed = False
        for info in self.models_registry.values():
            if info.get('loaded'):
                info['loaded'] = False
                changed = True
        if changed:
            self._save_registry()

    # --- state sync -----------------------------------------------------------

    def _sync(self, state):
        self.loaded_models = {model_id: {**data, 'info': self.models_registry.get(model_id, {})}
                              for model_id, data in state.items()}
        for model_id, info in self.models_registry.items():
            loaded = model_id in self.loaded_models
            if info.get('loaded') != loaded:
                info['loaded'] = loaded
        self._save_registry()

    def _worker_lost(self, error):
        logger.error(str(error))
        self.loaded_models = {}
        for info in self.models_registry.values():
            info['loaded'] = False
        self._save_registry()

    def _stop_worker_if_idle(self):
        if not self.loaded_models and self.worker.running:
            self.worker.stop()

    def _call(self, op, **kwargs):
        try:
            result, state = self.worker.call(op, **kwargs)
        except WorkerGone as e:
            self._worker_lost(e)
            raise RuntimeError(str(e))
        except RuntimeError:
            # The operation failed but the worker is fine; refresh our mirror
            try:
                _, state = self.worker.call('ping', timeout=10)
                self._sync(state)
            except Exception:
                pass
            raise
        self._sync(state)
        return result

    def _check_worker(self):
        """Notice a worker that died between requests (e.g. out of memory)."""
        if self.loaded_models:
            reason = self.worker.check_died()
            if reason:
                self._worker_lost(reason)

    def list_models(self):
        self._check_worker()
        return super().list_models()

    def get_detailed_models_list(self):
        self._check_worker()
        return super().get_detailed_models_list()

    # --- operations handed to the worker ------------------------------------

    def load_model(self, model_id):
        if model_id not in self.models_registry:
            raise ValueError(f"Model {model_id} not found in registry")
        if model_id in self.loaded_models:
            return {"status": "already_loaded", "model_id": model_id,
                    "framework": self.models_registry[model_id]['framework']}
        problem = self.missing_requirement(self.models_registry[model_id].get('framework'))
        if problem:
            raise RuntimeError(f"Failed to load model {model_id}: {problem}")
        try:
            return self._call('load', start=True, timeout=LOAD_TIMEOUT_S,
                              model_id=model_id, model_info=dict(self.models_registry[model_id]))
        finally:
            self._stop_worker_if_idle()   # e.g. the first load failed

    def unload_model(self, model_id):
        if model_id not in self.loaded_models:
            if model_id in self.models_registry:
                self.models_registry[model_id]['loaded'] = False
                self._save_registry()
            return {"status": "not_loaded", "model_id": model_id,
                    "message": "Model was not loaded", "gpu_memory_freed_gb": 0}
        before = psutil.virtual_memory().available
        try:
            self._call('unload', model_id=model_id)
        except RuntimeError as e:
            logger.warning(f"Unload of {model_id} failed in the worker ({e}); stopping the worker")
            self.loaded_models.pop(model_id, None)
            if self.loaded_models:
                raise
        self._stop_worker_if_idle()
        freed = (psutil.virtual_memory().available - before) / 1024 ** 3
        logger.info(f"Model {model_id} unloaded ({freed:.2f} GB of memory freed)")
        return {"status": "unloaded", "model_id": model_id, "gpu_memory_freed_gb": round(max(freed, 0), 2)}

    def force_reload_model(self, model_id):
        logger.info(f"Force reloading model {model_id}")
        self.unload_model(model_id)
        return self.load_model(model_id)

    def emergency_cleanup(self):
        """Unload everything by stopping the worker - frees all of its memory."""
        logger.warning("Emergency cleanup - stopping the inference worker and unloading all models")
        self.worker.stop()
        self._worker_lost("Emergency cleanup: all models unloaded")
        return True

    def run_inference(self, model_id, image):
        if model_id not in self.loaded_models:
            raise ValueError(f"Model {model_id} not loaded")
        response = self._call('infer', timeout=INFER_TIMEOUT_S, model_id=model_id,
                              model_info=dict(self.models_registry[model_id]), image=image)
        info = self.models_registry.get(model_id)
        if info is not None:
            info['last_used'] = datetime.now().isoformat()
            info['inference_count'] = info.get('inference_count', 0) + 1
            self._save_registry()
        return response

    def _refresh_handler(self, model_id):
        if model_id in self.loaded_models:
            try:
                self._call('refresh_handler', model_id=model_id,
                           model_info=dict(self.models_registry[model_id]))
            except RuntimeError as e:
                logger.warning(f"Could not update the script of loaded model {model_id}: {e}")

    def rename_model(self, model_id, new_name):
        was_loaded = model_id in self.loaded_models
        result = super().rename_model(model_id, new_name)
        if was_loaded:
            self._call('rename', old_id=model_id, new_id=result['new_id'])
        return result

    def validate_script_file(self, script_path):
        """Import the script in a throwaway subprocess, so its libraries (and
        PyTorch) are never loaded into this process."""
        try:
            out = subprocess.run([sys.executable, WORKER_SCRIPT, '--check-script', str(script_path)],
                                 capture_output=True, text=True, timeout=SCRIPT_CHECK_TIMEOUT_S,
                                 cwd=os.path.dirname(WORKER_SCRIPT))
        except subprocess.TimeoutExpired:
            raise ScriptError(f"Checking the script took longer than {SCRIPT_CHECK_TIMEOUT_S}s "
                              "(does it do heavy work at import time?)")
        lines = [l for l in out.stdout.strip().splitlines() if l.strip()]
        try:
            result = json.loads(lines[-1])
        except (IndexError, ValueError):
            detail = (out.stderr or out.stdout).strip()[-400:]
            raise ScriptError(f"Could not check the script: {detail or f'exit code {out.returncode}'}")
        if not result.get('ok'):
            raise ScriptError(result.get('error') or 'Invalid script',
                              line=result.get('line'), traceback_text=result.get('traceback'))

    def shutdown(self):
        self.worker.stop()

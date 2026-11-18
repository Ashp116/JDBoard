"""
JDBoard inference worker process.

PyTorch, TensorRT and Ultralytics take ~850 MB once imported, and Python never
releases an imported library. So everything that needs them - loading models,
running inference and custom scripts - happens in this separate process. The
main process (app.py) starts it when the first model is loaded and stops it
when the last one is unloaded, which gives all of that memory back.

The main process talks to it over a multiprocessing Pipe (see
inference_client.py). Each request is a dict with an 'op'; each reply is
(ok, result_or_error_message, models_state).

Also usable from the command line to check a custom script in isolation:
    python inference_worker.py --check-script path/to/script.py
prints JSON {"ok": bool, "error": str, "line": int|null, "traceback": str}.

Important: this module must not import ai_inference at the top level - the
worker sets JDBOARD_INFERENCE_WORKER=1 first, which is what makes ai_inference
import the heavy libraries.
"""

import json
import logging
import logging.handlers
import os
import sys
import traceback


def _models_state(manager):
    """What the main process mirrors about each loaded model."""
    state = {}
    for model_id, data in manager.loaded_models.items():
        state[model_id] = {
            'loaded_at': data.get('loaded_at'),
            'load_time': data.get('load_time'),
            'script_error': data.get('script_error'),
            'script_error_line': data.get('script_error_line'),
            'script_traceback': data.get('script_traceback'),
        }
    return state


def worker_main(conn, log_queue, models_dir):
    """Entry point of the worker process (multiprocessing 'spawn' target)."""
    os.environ['JDBOARD_INFERENCE_WORKER'] = '1'

    # Send log records to the main process, which shows them in the dashboard
    root = logging.getLogger()
    root.handlers[:] = [logging.handlers.QueueHandler(log_queue)]
    root.setLevel(logging.INFO)
    for name in ('ai_inference', 'ultralytics', 'torch', 'tensorrt'):
        logging.getLogger(name).setLevel(logging.INFO)
    log = logging.getLogger('inference_worker')

    import ai_inference  # heavy imports happen here, in this process only

    manager = ai_inference.AIModelManager(models_dir=models_dir)
    # The registry belongs to the main process; the worker gets each model's
    # info with the request and must never write the file
    manager._save_registry = lambda: None
    manager.models_registry = {}
    log.info("Inference worker ready")

    def use_info(model_id, model_info):
        info = dict(model_info)
        info.setdefault('loaded', False)
        info.setdefault('inference_count', 0)
        manager.models_registry[model_id] = info

    while True:
        try:
            request = conn.recv()
        except (EOFError, OSError):
            break   # main process went away
        op = request.get('op')
        try:
            if op == 'shutdown':
                conn.send((True, None, _models_state(manager)))
                break
            elif op == 'load':
                use_info(request['model_id'], request['model_info'])
                result = manager.load_model(request['model_id'])
            elif op == 'unload':
                result = manager.unload_model(request['model_id']) \
                    if request['model_id'] in manager.loaded_models else {'status': 'not_loaded'}
                manager.models_registry.pop(request['model_id'], None)
            elif op == 'infer':
                use_info(request['model_id'], request['model_info'])
                data = manager.loaded_models.get(request['model_id'])
                if data:
                    data['info'] = manager.models_registry[request['model_id']]
                result = manager.run_inference(request['model_id'], request['image'])
            elif op == 'refresh_handler':
                use_info(request['model_id'], request['model_info'])
                manager._refresh_handler(request['model_id'])
                result = None
            elif op == 'rename':
                old, new = request['old_id'], request['new_id']
                if old in manager.loaded_models:
                    manager.loaded_models[new] = manager.loaded_models.pop(old)
                if old in manager.models_registry:
                    manager.models_registry[new] = manager.models_registry.pop(old)
                result = None
            elif op == 'gpu_memory':
                result = manager.memory_manager.get_gpu_memory_info()
            elif op == 'emergency_cleanup':
                result = manager.emergency_cleanup()
            elif op == 'ping':
                result = 'pong'
            else:
                raise ValueError(f"Unknown worker operation: {op}")
            conn.send((True, result, _models_state(manager)))
        except Exception as e:
            log.debug(traceback.format_exc())
            try:
                conn.send((False, str(e), _models_state(manager)))
            except (EOFError, OSError):
                break


def check_script(path):
    """Import a custom script once, in this throwaway process."""
    os.environ['JDBOARD_INFERENCE_WORKER'] = '1'
    logging.basicConfig(level=logging.WARNING)
    import ai_inference
    manager = ai_inference.AIModelManager.__new__(ai_inference.AIModelManager)
    manager.script_loader = ai_inference.CustomScriptLoader()
    try:
        manager.validate_script_file(path)
        return {'ok': True, 'error': None, 'line': None, 'traceback': None}
    except ai_inference.ScriptError as e:
        return {'ok': False, 'error': str(e), 'line': e.line, 'traceback': e.traceback_text}
    except Exception as e:
        return {'ok': False, 'error': str(e), 'line': None, 'traceback': None}


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--check-script':
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        result = check_script(sys.argv[2])
        # Last line of stdout is the result (scripts may print their own output)
        print('\n' + json.dumps(result))
        sys.exit(0)
    print(__doc__)
    sys.exit(2)

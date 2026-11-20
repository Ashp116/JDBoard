---
sidebar_position: 4
---

# Models

`<model_id>` is the model's name as shown on its card, for example `YOLOv11n`.

## List

### <span className="method method--get">GET</span> `/api/models/list`

All models with their details: id, name, framework (`tensorrt`, `pytorch`, …),
precision, image size, size on disk, whether loaded, and custom script status.
Key scopes: **Inference**, **Read**, **Full**.

```bash
curl -k -H "Authorization: Bearer jdb_..." https://<jetson-ip>/api/models/list
```

`GET /api/models` returns a shorter list in the shape the dashboard's pickers use.

## Load and unload

### <span className="method method--post">POST</span> `/api/models/<model_id>/load`

Loads the model into GPU memory, starting the inference worker if needed. Key scopes:
**Inference**, **Full**. Optional body: `{"force_reload": true}` reloads it if it's
already loaded.

### <span className="method method--post">POST</span> `/api/models/<model_id>/unload`

Frees its memory. When no models are left loaded, the inference worker stops. Key
scopes: **Inference**, **Full**.

### <span className="method method--post">POST</span> `/api/models/<model_id>/force-reload`

Unloads and loads it again, for example after changing its script. Key scope: **Full**.

### <span className="method method--post">POST</span> `/api/models/emergency-cleanup`

Unloads everything and frees all GPU memory.

## Add models

### <span className="method method--post">POST</span> `/api/models/upload`

`multipart/form-data`:

| Field | Required | Meaning |
|---|---|---|
| `file` | yes | The model: `.pt`, `.pth`, `.onnx`, `.engine` or `.trt` |
| `model_name` | | Name (the id); defaults to the file name |
| `target_format` | | `PyTorch` (keep as is), `ONNX` or `TensorRT` |
| `precision` | | `fp32`, `fp16` or `int8` |
| `imgsz` | | Input size for the conversion, 160 to 1280 in steps of 32; default 640 |
| `workspace` | | TensorRT builder memory in GB |
| `calibration` | | For INT8: `coco`, or `upload` with `calibration_zip` |
| `calibration_zip` | | A `.zip` of calibration images |
| `custom_script` | | A `.py` [custom inference script](../custom-models/custom-scripts.md) |
| `download_id` | | Your own id to follow progress with (see below) |

```bash
curl -k -u admin:password \
     -F file=@yolo11n-pose.pt -F model_name=pose -F target_format=TensorRT -F precision=fp16 \
     https://<jetson-ip>/api/models/upload
```

Conversions take minutes. Follow them with
`GET /api/models/downloads/<download_id>/status` or the
[live updates](realtime.md).

### <span className="method method--post">POST</span> `/api/models/download-yolo`

Downloads a YOLO model, and converts it if asked. JSON body (or multipart, to attach
`custom_script` or `calibration_zip`) with `model_url`, `model_name`, and the same
`target_format`, `precision`, `imgsz`, `workspace`, `calibration` and `download_id`
fields as an upload.

### Progress

| Route | |
|---|---|
| <span className="method method--get">GET</span> `/api/models/downloads/<download_id>/status` | One download or conversion: active (with progress), completed, failed or unknown |
| <span className="method method--get">GET</span> `/api/models/active-downloads` | Everything in progress |
| <span className="method method--post">POST</span> `/api/models/cancel-download` | Cancel one: `{"download_id": "..."}` |

## Change and delete

| Route | |
|---|---|
| <span className="method method--put">PUT</span> `/api/models/<model_id>/rename` | `{"new_name": "..."}` |
| <span className="method method--delete">DELETE</span> `/api/models/<model_id>` | Delete the model and its files |

## Custom scripts

| Route | |
|---|---|
| <span className="method method--get">GET</span> `/api/models/custom-script-template` | The template |
| <span className="method method--get">GET</span> `/api/models/<model_id>/custom-script` | The model's script |
| <span className="method method--put">PUT</span> `/api/models/<model_id>/custom-script` | Save a script: `{"script_content": "..."}`. It's checked first; errors come back with the line number. |
| <span className="method method--delete">DELETE</span> `/api/models/<model_id>/custom-script` | Remove it; the model uses the built-in handler again |

## GPU memory

### <span className="method method--get">GET</span> `/api/gpu/memory`

Total, free and allocated GPU memory, in GB.

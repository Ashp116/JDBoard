---
sidebar_position: 3
---

# Inference

## <span className="method method--post">POST</span> `/api/inference/<model_id>`

Runs a loaded model on one image. Key scopes: **Inference**, **Full**.

The model must be loaded first, with
[`POST /api/models/<model_id>/load`](models.md#load-and-unload).

### Request

`multipart/form-data` with the image in the field `image` (JPEG, PNG or anything
OpenCV reads).

```bash
curl -k -H "Authorization: Bearer jdb_..." \
     -F image=@photo.jpg \
     https://<jetson-ip>/api/inference/YOLOv11n
```

```python
with open("photo.jpg", "rb") as f:
    r = requests.post(f"{BASE}/inference/YOLOv11n", headers=HEADERS,
                      files={"image": f}, verify=False)
```

```javascript
const form = new FormData();
form.append("image", fileInput.files[0]);
const r = await fetch("https://<jetson-ip>/api/inference/YOLOv11n", {
  method: "POST",
  headers: { Authorization: "Bearer jdb_..." },
  body: form,
});
```

### Response

```json
{
  "success": true,
  "data": {
    "model_id": "YOLOv11n",
    "inference_time": 0.031,
    "result": {
      "model_id": "YOLOv11n",
      "framework": "tensorrt",
      "inference_handler": "default",
      "inference_time": 0.024,
      "predictions": [
        {
          "class": "bus",
          "class_id": 5,
          "confidence": 0.94,
          "bbox": {"x": 412.3, "y": 482.1, "width": 789.0, "height": 512.6}
        }
      ],
      "memory_info": {
        "pre_inference_free_gb": 3.1,
        "post_inference_free_gb": 3.1,
        "usage_percent": 59.8
      }
    }
  }
}
```

| Field | Meaning |
|---|---|
| `data.inference_time` | Seconds for the whole request, including decoding the image |
| `result.inference_time` | Seconds for the model itself |
| `result.inference_handler` | `default` (built-in) or `custom` (the model's [script](../custom-models/custom-scripts.md)) |
| `result.predictions` | The predictions, highest confidence first |

Each prediction has `class`, `class_id` and `confidence`, an optional `bbox` (centre
`x`/`y`, `width`, `height` in original-image pixels) and optional `shapes`:
segmentation outlines, pose keypoints and more. The full format is in
[Annotations](../custom-models/annotations.md).

A pose prediction, for example:

```json
{
  "class": "person", "class_id": 0, "confidence": 0.89,
  "bbox": {"x": 148.2, "y": 615.0, "width": 233.9, "height": 495.4},
  "shapes": [{
    "type": "keypoints",
    "points": [[143.1, 436.4, 0.97], [151.0, 428.9, 0.93], "..."],
    "names": ["nose", "left_eye", "..."],
    "edges": [[15, 13], [13, 11], "..."]
  }]
}
```

### Errors

| Status | `error` |
|---|---|
| 400 | `No image provided`, `Invalid image format` |
| 500 | `Model <id> not loaded`, or the error from the model or its script |
| 507 | `GPU memory exhausted...`: all models were unloaded to recover; load the model again |

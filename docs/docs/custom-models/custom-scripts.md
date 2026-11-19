---
sidebar_position: 1
---

# Custom inference scripts

Ultralytics models work out of the box. For anything else, or to change how a model's
output is handled, give the model a **custom inference script**: a Python file with
one class that turns an image into predictions.

Typical reasons:

- A model that isn't from Ultralytics, such as an RF-DETR TensorRT engine with its own
  input and output layout.
- Your own thresholds, class names or filtering.
- Drawing something different, for example only keypoints without boxes.

## Adding a script

- **When uploading** a model, attach the `.py` file on the **File Upload** tab.
- **Later**, click **Edit Inference Script** on the model's card. The editor starts
  from the template, highlights Python, and points at the line of any error before
  saving.
- **View Template** on the upload tab shows the template; it's also served at
  [`GET /api/models/custom-script-template`](../api/models.md#custom-scripts).

After changing a script, **Reload** the model to use it.

## The contract

The file defines a class named `CustomModelInference`:

```python
class CustomModelInference:
    def __init__(self, model, model_info, logger):
        ...

    def preprocess(self, image, original_width=None, original_height=None):
        ...   # -> whatever inference() needs

    def inference(self, data):
        ...   # -> the model's raw output

    def postprocess(self, output, original_width=None, original_height=None):
        ...   # -> a list of prediction dicts
```

| Argument | What it is |
|---|---|
| `model` | What JDBoard loaded from your file. For Ultralytics `.pt`, `.onnx` and `.engine` files, an `ultralytics.YOLO`. |
| `model_info` | The model's registry entry: `name`, `framework`, `file_path`, `precision`, `imgsz`, … |
| `logger` | A `logging.Logger`; its output appears in JDBoard's [logs](../using/monitoring.md#logs). |
| `image` | The image as an OpenCV BGR `numpy.ndarray` (height × width × 3, `uint8`). |

For every image JDBoard calls:

```python
data   = handler.preprocess(image, original_width=w, original_height=h)
output = handler.inference(data)
preds  = handler.postprocess(output, original_width=w, original_height=h)
```

`postprocess` returns a list of predictions in **original-image pixels**. Their format,
and everything the dashboard can draw, is described in
[Annotations](annotations.md).

If a method raises an exception, JDBoard logs it and falls back to its built-in
handler for that request.

## Example: any Ultralytics model

The helper `from_ultralytics` converts Ultralytics results of any task (detect,
segment, pose, OBB, classify) into predictions:

```python
from jdboard_annotations import from_ultralytics


class CustomModelInference:
    CONFIDENCE_THRESHOLD = 0.25
    IOU_THRESHOLD = 0.45

    def __init__(self, model, model_info, logger):
        self.model = model
        self.class_names = getattr(model, 'names', None) or {}

    def preprocess(self, image, original_width=None, original_height=None):
        return image   # Ultralytics resizes and normalises by itself

    def inference(self, data):
        return self.model(data, conf=self.CONFIDENCE_THRESHOLD,
                          iou=self.IOU_THRESHOLD, verbose=False)

    def postprocess(self, output, original_width=None, original_height=None):
        return from_ultralytics(output, self.class_names)
```

## Example: keypoints or masks without boxes

`bbox` is optional. Without it, no box outline is drawn, but the label, hover and click
still work:

```python
    def postprocess(self, output, original_width=None, original_height=None):
        predictions = from_ultralytics(output, self.class_names)
        for p in predictions:
            p.pop('bbox', None)
        return predictions
```

## Example: a model with its own output

For other models, build the dicts yourself. A pose model whose output you've decoded
into `people = [(score, (cx, cy, w, h), [(x, y, conf), ...]), ...]`:

```python
predictions = []
for score, (cx, cy, w, h), points in people:
    predictions.append({
        'class_id': 0,
        'class': 'person',
        'confidence': float(score),
        'bbox': {'x': cx, 'y': cy, 'width': w, 'height': h},
        'shapes': [{
            'type': 'keypoints',
            'points': [[x, y, c] for x, y, c in points],
            'edges': [[5, 7], [7, 9], [6, 8], [8, 10]],   # which points to join
        }],
    })
return predictions
```

## Extra Python packages

Scripts run in JDBoard's Python environment. To use a library that isn't there, add it
with [`jdboard-pip`](../commands/jdboard-pip.md), which protects the packages JDBoard
depends on:

```bash
sudo jdboard-pip install shapely
sudo systemctl restart jdboard
```

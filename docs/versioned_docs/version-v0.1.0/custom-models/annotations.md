---
sidebar_position: 2
---

# Annotations

A model's predictions decide what the dashboard draws. The built-in handler produces
them for Ultralytics models; a [custom script](custom-scripts.md) can return anything
in this format. The same predictions are returned by the
[inference API](../api/inference.md).

## Predictions

Each prediction is a dict. All coordinates are **pixels in the original image**.

```python
{
    'class_id':   0,
    'class':      'person',
    'confidence': 0.89,                         # 0 to 1
    'bbox': {'x': 320.5, 'y': 240.0,            # optional: box centre,
             'width': 120.0, 'height': 300.0},  #   width and height
    'shapes': [ ... ],                          # optional: anything else to draw
    'color': '#ff8800',                         # optional: overrides the class colour
}
```

How a prediction is shown depends on what it has:

| Has | Shown as |
|---|---|
| `bbox` | A box with a label. Its shapes, if any, are drawn too. |
| `shapes` but no `bbox` | The shapes and a label, with no box outline. Hover and click use the area around the shapes. |
| Neither | A whole-image result, for example a classification: a tag in the image's top-left corner. |

Hover highlights a prediction (its box, shapes and label) and fades the rest; click
opens its details. Predictions are listed highest confidence first.

## Shapes

Every shape has a `type`. Any shape may also set its own `color`. Shapes of unknown
types are ignored, so a script written for a newer JDBoard doesn't break an older one.

### polygon

Segmentation outlines, rotated boxes, regions.

```python
{'type': 'polygon', 'points': [[x, y], [x, y], ...], 'fill': True}
```

Filled semi-transparent unless `fill` is `False`. Needs at least 3 points.

### keypoints

Pose, face or hand landmarks, optionally joined into a skeleton.

```python
{'type': 'keypoints',
 'points': [[x, y, conf], ...],      # conf is optional
 'edges': [[5, 7], [7, 9], ...],     # optional: join point i to point j
 'names': ['nose', 'left_eye', ...], # optional
 'min_confidence': 0.5}              # optional: hide points below this (default 0.5)
```

Points at `(0, 0)` are treated as "not detected" and hidden, as Ultralytics does.
Lines are only drawn between two visible points.

### polyline

Lanes, tracks, paths.

```python
{'type': 'polyline', 'points': [[x, y], ...]}
```

### circle

```python
{'type': 'circle', 'x': x, 'y': y, 'radius': r, 'fill': False}
```

### text

```python
{'type': 'text', 'x': x, 'y': y, 'text': 'lane 2'}
```

### image

Raster overlays: pixel-exact masks, heatmaps, depth maps.

```python
{'type': 'image', 'x': x, 'y': y, 'width': w, 'height': h,
 'src': 'data:image/png;base64,...', 'opacity': 0.5}
```

Only inline `data:image/...` URLs are drawn; links to other sites are ignored.

## What the built-in handler returns

`from_ultralytics(results, names)` in `backend/jdboard_annotations.py`:

| Task | Prediction |
|---|---|
| Detect | `bbox` |
| Segment | `bbox` + a filled `polygon` (the mask outline, simplified to within 1 pixel) |
| Pose | `bbox` + `keypoints`; 17-point models get COCO names and skeleton |
| OBB | `bbox` around the rotated box + an unfilled `polygon` of its corners |
| Classify | The top 5 classes, no `bbox` or shapes |

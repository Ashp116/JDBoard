"""
What the dashboard can draw on an inference result.

A prediction is a dict. ``class``/``class_id``/``confidence`` describe it, an
optional ``bbox`` (centre x/y, width, height) gets the usual box with a
hoverable label, and an optional ``shapes`` list is drawn on top of the image
by the dashboard. All coordinates are pixels in the ORIGINAL image.

Shapes (every shape may also set ``"color": "#rrggbb"``, and ``"label"``):

    {"type": "polygon",   "points": [[x, y], ...], "fill": True}
        segmentation outlines, rotated boxes, regions
    {"type": "keypoints", "points": [[x, y, conf], ...], "edges": [[i, j], ...],
                          "names": ["nose", ...], "min_confidence": 0.5}
        pose / face / hand landmarks; conf and names are optional, edges join
        point i to point j (a skeleton); points under min_confidence are hidden
    {"type": "polyline",  "points": [[x, y], ...]}
        lanes, tracks, paths
    {"type": "circle",    "x": x, "y": y, "radius": r, "fill": False}
    {"type": "text",      "x": x, "y": y, "text": "..."}
    {"type": "image",     "x": x, "y": y, "width": w, "height": h,
                          "src": "data:image/png;base64,...", "opacity": 0.5}
        raster overlays: masks, heatmaps, depth maps

Without a ``bbox``, no box outline is drawn, but the label shows above the
shapes and hovering or clicking around them works the same. A prediction
without ``bbox`` or ``shapes`` (e.g. image classification) is about the whole
image: its label is shown in the image's top-left corner, in order.

Custom inference scripts can build these by hand, or use ``from_ultralytics``
for any Ultralytics result (detect, segment, pose, OBB, classify):

    from jdboard_annotations import from_ultralytics
    ...
    def postprocess(self, output, **kwargs):
        return from_ultralytics(output, self.class_names)
"""

# COCO keypoint order used by Ultralytics pose models, and the skeleton joining them
COCO_KEYPOINT_NAMES = [
    'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
]
COCO_SKELETON = [
    [15, 13], [13, 11], [16, 14], [14, 12], [11, 12],          # legs, hips
    [5, 11], [6, 12], [5, 6],                                   # torso
    [5, 7], [6, 8], [7, 9], [8, 10],                            # arms
    [1, 2], [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6],     # face, ears to shoulders
]

TOP_CLASSES = 5   # classification: how many classes to report
OUTLINE_TOLERANCE_PX = 1.0   # segmentation outlines are simplified to within this


def simplify_polygon(points, tolerance=OUTLINE_TOLERANCE_PX):
    """Fewer points for the same outline (Douglas-Peucker, within ``tolerance``
    pixels). Mask outlines often have hundreds of points one pixel apart."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return points
    contour = np.asarray(points, dtype=np.float32).reshape(-1, 1, 2)
    if len(contour) <= 8:
        return points
    simplified = cv2.approxPolyDP(contour, tolerance, True).reshape(-1, 2)
    return simplified if len(simplified) >= 3 else points


def _r(value):
    """Round to 0.1 px: keeps responses small without visible loss."""
    return round(float(value), 1)


def _name(names, class_id):
    if isinstance(names, dict):
        return str(names.get(class_id, f'class_{class_id}'))
    if isinstance(names, (list, tuple)) and 0 <= class_id < len(names):
        return str(names[class_id])
    return f'class_{class_id}'


def _xywh(values):
    return {'x': _r(values[0]), 'y': _r(values[1]), 'width': _r(values[2]), 'height': _r(values[3])}


def from_ultralytics(results, names=None):
    """Convert Ultralytics ``Results`` (one or a list) into dashboard predictions.

    Handles detection boxes, segmentation masks (as polygons), pose keypoints
    (with the COCO skeleton for 17-point models), oriented boxes (OBB) and
    classification. Predictions are sorted by confidence, highest first."""
    if results is None:
        return []
    if not isinstance(results, (list, tuple)):
        results = [results]
    predictions = []
    for result in results:
        result_names = names if names is not None else getattr(result, 'names', None) or {}

        # Classification: the top classes, nothing to draw
        probs = getattr(result, 'probs', None)
        if probs is not None and getattr(result, 'boxes', None) is None and getattr(result, 'obb', None) is None:
            scores = probs.data.cpu().numpy() if hasattr(probs, 'data') else probs
            order = scores.argsort()[::-1][:TOP_CLASSES]
            for class_id in order:
                predictions.append({'class_id': int(class_id), 'class': _name(result_names, int(class_id)),
                                    'confidence': float(scores[class_id])})
            continue

        # Oriented boxes: a polygon per box (and the unrotated box for the label)
        obb = getattr(result, 'obb', None)
        if obb is not None and len(obb):
            obb = obb.cpu()
            corners = obb.xyxyxyxy.numpy()
            for i, (conf, cls) in enumerate(zip(obb.conf.numpy(), obb.cls.numpy())):
                class_id = int(cls)
                xs, ys = corners[i][:, 0], corners[i][:, 1]
                predictions.append({
                    'class_id': class_id, 'class': _name(result_names, class_id), 'confidence': float(conf),
                    'bbox': _xywh([(xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2,
                                   xs.max() - xs.min(), ys.max() - ys.min()]),
                    'shapes': [{'type': 'polygon', 'points': [[_r(x), _r(y)] for x, y in corners[i]], 'fill': False}],
                })
            continue

        boxes = getattr(result, 'boxes', None)
        if boxes is None or not len(boxes):
            continue
        boxes = boxes.cpu()
        xywh = boxes.xywh.numpy()

        masks = getattr(result, 'masks', None)
        polygons = masks.xy if masks is not None else None          # list of (n, 2) arrays

        keypoints = getattr(result, 'keypoints', None)
        kpt_xy = kpt_conf = None
        if keypoints is not None:
            keypoints = keypoints.cpu()
            kpt_xy = keypoints.xy.numpy()
            kpt_conf = keypoints.conf.numpy() if keypoints.conf is not None else None

        for i, (conf, cls) in enumerate(zip(boxes.conf.numpy(), boxes.cls.numpy())):
            class_id = int(cls)
            prediction = {'class_id': class_id, 'class': _name(result_names, class_id),
                          'confidence': float(conf), 'bbox': _xywh(xywh[i])}
            shapes = []
            if polygons is not None and i < len(polygons) and len(polygons[i]) >= 3:
                outline = simplify_polygon(polygons[i])
                shapes.append({'type': 'polygon', 'points': [[_r(x), _r(y)] for x, y in outline], 'fill': True})
            if kpt_xy is not None and i < len(kpt_xy):
                points = []
                for j, (x, y) in enumerate(kpt_xy[i]):
                    point = [_r(x), _r(y)]
                    if kpt_conf is not None:
                        point.append(round(float(kpt_conf[i][j]), 3))
                    points.append(point)
                shape = {'type': 'keypoints', 'points': points}
                if len(points) == len(COCO_KEYPOINT_NAMES):
                    shape['names'] = COCO_KEYPOINT_NAMES
                    shape['edges'] = COCO_SKELETON
                shapes.append(shape)
            if shapes:
                prediction['shapes'] = shapes
            predictions.append(prediction)

    predictions.sort(key=lambda p: p.get('confidence', 0), reverse=True)
    return predictions

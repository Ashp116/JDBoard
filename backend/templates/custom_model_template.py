"""
JDBoard custom inference script template
========================================

Upload a file like this one with a model ("Custom script" option) when the
built-in handler doesn't understand your model, e.g. a segmentation/pose model,
a raw ONNX/TensorRT engine with its own input layout, or custom thresholds.
Models without a custom script use JDBoard's built-in (default) handler.

Contract
--------
* The file must define a class named ``CustomModelInference``.
* ``__init__(self, model, model_info, logger)`` receives:
    - ``model``:      the object JDBoard loaded from your file. For Ultralytics
                      .pt/.onnx/.engine files this is an ``ultralytics.YOLO``;
                      for plain ONNX it is an ``onnxruntime.InferenceSession``;
                      for PyTorch it is the ``torch.nn.Module``.
    - ``model_info``: dict from the model registry (name, framework, file_path, ...)
    - ``logger``:     a ``logging.Logger`` - its output shows in the JDBoard logs.
* JDBoard calls, for every image:
      data   = preprocess(image, original_width=..., original_height=...)
      output = inference(data)
      preds  = postprocess(output, original_width=..., original_height=...)
  ``image`` is an OpenCV BGR ``numpy.ndarray`` (H x W x 3, uint8).
* ``postprocess`` must return a list of prediction dicts. All coordinates are
  pixels in the ORIGINAL image. The dashboard draws whatever they contain:

      {
          'class_id':   int,
          'class':      str,
          'confidence': float,                      # 0..1
          'bbox': {'x': cx, 'y': cy,                # optional: a box with a label
                   'width': w, 'height': h},        # (x/y is the box centre)
          'shapes': [ ... ],                        # optional: anything else to draw
          'color': '#ff8800',                       # optional colour override
      }

  Shapes (each may also set its own 'color'):

      {'type': 'polygon',   'points': [[x, y], ...], 'fill': True}      # segmentation, regions
      {'type': 'keypoints', 'points': [[x, y, conf], ...],                # pose / landmarks
                            'edges': [[i, j], ...], 'names': [...]}       #   edges = skeleton lines
      {'type': 'polyline',  'points': [[x, y], ...]}                      # lanes, tracks
      {'type': 'circle',    'x': x, 'y': y, 'radius': r}
      {'type': 'text',      'x': x, 'y': y, 'text': '...'}
      {'type': 'image',     'x': x, 'y': y, 'width': w, 'height': h,      # masks, heatmaps,
                            'src': 'data:image/png;base64,...'}           #   depth maps

  A prediction with neither (e.g. classification) is listed but not drawn. The
  full description is in backend/jdboard_annotations.py.

* For Ultralytics models (detect, segment, pose, OBB, classify) the helper
  ``from_ultralytics`` builds all of this for you - see ``postprocess`` below.

* If any method raises, JDBoard logs the error and falls back to the default
  handler for that request; the model card shows "Custom script failed".

The example below works as-is for Ultralytics models of any task and shows
where to plug in your own pre/post-processing.
"""

import numpy as np

from jdboard_annotations import from_ultralytics


class CustomModelInference:
    # Tweak these for your model
    CONFIDENCE_THRESHOLD = 0.25
    IOU_THRESHOLD = 0.45

    def __init__(self, model, model_info, logger):
        self.model = model
        self.model_info = model_info
        self.logger = logger
        # Class names: Ultralytics models carry them; otherwise define your own list
        self.class_names = getattr(model, 'names', None) or {}
        self.logger.info(f"Custom script ready for {model_info.get('name', 'model')}")

    def preprocess(self, image, original_width=None, original_height=None):
        """Turn the BGR image into whatever ``inference`` needs.

        Ultralytics does its own letterboxing/normalisation, so we pass the image
        through. For a raw ONNX/TensorRT model you would typically resize,
        convert BGR->RGB, scale to 0..1 and transpose to NCHW here, e.g.:

            import cv2
            blob = cv2.resize(image, (640, 640))[:, :, ::-1].astype(np.float32) / 255.0
            return np.ascontiguousarray(blob.transpose(2, 0, 1)[None])
        """
        return image

    def inference(self, data):
        """Run the model. Return its raw output."""
        # For onnxruntime instead:
        #   input_name = self.model.get_inputs()[0].name
        #   return self.model.run(None, {input_name: data})
        return self.model(data, conf=self.CONFIDENCE_THRESHOLD, iou=self.IOU_THRESHOLD, verbose=False)

    def postprocess(self, output, original_width=None, original_height=None):
        """Convert raw output into JDBoard prediction dicts (see module docstring)."""
        # Ultralytics results -> boxes, masks, keypoints, oriented boxes or classes
        return from_ultralytics(output, self.class_names)

        # For any other model, build the dicts yourself, e.g. a pose model with
        # its own output layout (people = [(score, box_xywh, [(x, y, conf), ...]), ...]):
        #
        # predictions = []
        # for score, (cx, cy, w, h), points in people:
        #     predictions.append({
        #         'class_id': 0, 'class': 'person', 'confidence': float(score),
        #         'bbox': {'x': cx, 'y': cy, 'width': w, 'height': h},
        #         'shapes': [{'type': 'keypoints',
        #                     'points': [[x, y, c] for x, y, c in points],
        #                     'edges': [[5, 7], [7, 9], [6, 8], [8, 10]]}],   # which points to join
        #     })
        # return predictions

---
sidebar_position: 2
---

# Models

The **Models** page lists your models as cards and lets you add new ones.

## Supported formats

| Format | Extensions | How JDBoard runs it |
|---|---|---|
| TensorRT | `.engine`, `.trt` | TensorRT on the GPU. Fastest. |
| PyTorch | `.pt` (Ultralytics YOLO) | PyTorch on the GPU, FP32 or FP16. Can be converted to TensorRT. |
| ONNX | `.onnx` | Converted to TensorRT when uploaded (with NVIDIA's `trtexec`). Not run directly: ONNX Runtime is disabled on Jetson because it crashes there. |

Ultralytics models work without any extra code for every task: detection,
segmentation, pose, oriented boxes (OBB) and classification. Anything else needs a
[custom inference script](../custom-models/custom-scripts.md).

:::warning[TensorRT engines are tied to the device]
A `.engine` file only works on the same kind of device and TensorRT version it was
built on. An engine built on another computer fails to load with *"plan files are only
supported on the target runtime platform"*. Upload the `.pt` or `.onnx` instead and
convert it on the Jetson.
:::

## Download a YOLO model

On the **YOLO Models** tab, pick a version (YOLOv5, YOLOv8 or YOLOv11) and a size from
**n**ano to e**x**tra-large. Smaller is faster; larger is more accurate. Choose PyTorch
or TensorRT and click **Download & Convert**.

## Upload your own model

On the **File Upload** tab, drop a model file, give it a name, and choose what to
convert it to. Click **Upload & Convert** (or **Upload Model** when nothing needs
converting). You can also attach a custom inference script here, or add one later.

## Conversion settings

When converting to TensorRT you choose:

| Setting | Options | Notes |
|---|---|---|
| **Precision** | FP32, **FP16**, INT8 | FP16 is recommended: fast, with accuracy close to FP32. INT8 is fastest but loses some accuracy, and needs calibration images. |
| **Image size** (Advanced) | 160 to 1280, a multiple of 32; default 640 | The engine's input size is fixed when it's built. Match what the model was trained at: 640 for most detection models, **1024 for OBB**, **224 for classification**. |
| **Workspace** (Advanced) | GB of memory for the TensorRT builder | More can find faster engines but needs free memory. |
| **Calibration** (INT8) | COCO sample images, or a `.zip` of your own | Use images like the ones the model will see. |

Building an engine takes a few minutes on an Orin Nano, and longer for large models
or INT8. The build log is shown while it runs.

:::note
Updating or restarting JDBoard stops a conversion that's running. Wait for it to
finish first.
:::

## Model cards

Each card shows the model's format, precision, image size and size on disk, and
whether it's loaded. From the card you can:

- **Load** it: starts the inference worker and puts the model in GPU memory. Several
  models can be loaded at once if memory allows.
- **Unload** it to free GPU memory. When the last model is unloaded, the inference
  worker stops and all its memory is released.
- **Reload** it (unload and load again), for example after editing its script.
- **Edit Inference Script**: write or change its
  [custom script](../custom-models/custom-scripts.md) in the browser, with syntax
  highlighting and error lines.
- **Rename**, see **Info**, or **Delete** it.

Use search, sort and the filters to find models when you have many.

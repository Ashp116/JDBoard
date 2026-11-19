---
sidebar_position: 3
---

# First steps

A quick tour from a fresh install to your first inference.

## 1. Check the system

Open **Dashboard**. You should see CPU, GPU and memory updating every second or two. If
the values stay at zero, jtop isn't reachable; see
[Troubleshooting](../troubleshooting.md#no-system-data).

## 2. Get a model

Open **Models** and choose the **YOLO Models** tab. Pick a version and size (for
example YOLOv11 **n**ano), choose **TensorRT** with **FP16**, and click
**Download & Convert**. JDBoard downloads the model and builds a TensorRT engine for
your Jetson. That takes a few minutes; the progress and build log are shown while it
runs.

Already have a model file? Use the **File Upload** tab instead; see
[Models](../using/models.md).

## 3. Load it

On the model's card, click **Load**. Loading starts the inference worker and puts the
model in GPU memory.

## 4. Run inference

Open **Inference**, pick the model, choose an image and click **Run Inference**. The
detections are drawn on the image. Hover one to highlight it; click it for details.

## 5. Optional: an API key

To run inference from your own code, create a key in **Settings → API Keys** and see
the [API reference](../api/overview.md):

```bash
curl -k -H "Authorization: Bearer jdb_..." -F image=@photo.jpg \
     https://<jetson-ip>/api/inference/YOLOv11n
```

---
sidebar_position: 3
---

# Inference

The **Inference** page has three tabs: **Inference**, **Analytics** and **API Routes**.

## Run a model

1. Choose an image (drop it, or click to browse).
2. Pick a model. Only loaded models can be chosen; load one on the
   [Models](models.md) page first. The **🔄** button next to the list refreshes it
   if you loaded a model in another tab.
3. Click **Run Inference**.

## Reading the result

What's drawn depends on what the model returns:

| Model | Drawn on the image |
|---|---|
| Detection | A box and label per object |
| Segmentation | The object's mask, filled, with its box |
| Pose | Keypoints joined into a skeleton, with a box |
| Oriented boxes (OBB) | A rotated outline per object |
| Classification | The top classes as tags in the image's top-left corner |
| Custom scripts | Whatever the script returns: see [Annotations](../custom-models/annotations.md) |

- **Hover** an object to highlight it; everything else fades.
- **Click** an object for its details (class, confidence, position, size). Click it
  again, click elsewhere, press **Esc** or scroll to close them.
- Use the class filter to show or hide classes.

Below the image are the number of objects, the inference time and the list of
predictions.

## Analytics

Every inference is logged: which model, how long it took, how many objects, and from
which client. The **Analytics** tab shows that history with filters, statistics and
export. Settings has options to export or clear it.

## API Routes

The **API Routes** tab lists the inference API routes with curl, JavaScript and Python
examples, and a test panel that calls them with your login or an API key. See the
[API reference](../api/inference.md) for details.

import React from 'react';

// Draws the "shapes" a prediction carries (see backend/jdboard_annotations.py):
// segmentation polygons, pose keypoints + skeleton, polylines, circles, text
// and image overlays. Coordinates are original-image pixels, so the SVG uses
// the image's own size as its viewBox and stretches over the displayed image.

export interface Shape {
  type: 'polygon' | 'keypoints' | 'polyline' | 'circle' | 'text' | 'image' | string;
  points?: number[][];                 // [x, y] or [x, y, confidence]
  edges?: number[][];                  // keypoints: [i, j] pairs to join
  names?: string[];                    // keypoints: point names (in the API response)
  min_confidence?: number;             // keypoints: hide points below this (default 0.5)
  fill?: boolean;
  x?: number;
  y?: number;
  radius?: number;
  width?: number;
  height?: number;
  text?: string;
  src?: string;                        // image: data URL
  opacity?: number;
  color?: string;
  label?: string;
}

interface Props {
  predictions: any[];
  imageWidth: number;
  imageHeight: number;
  colorFor: (prediction: any, index: number) => string;
  hovered: number | null;              // dim other predictions while one is hovered
}

const visible = (point: number[] | undefined, minConfidence: number) =>
  !!point && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
  && (point.length < 3 || point[2] >= minConfidence)
  && !(point[0] === 0 && point[1] === 0);   // Ultralytics uses (0, 0) for "not detected"

const PredictionShapes: React.FC<Props> = ({ predictions, imageWidth, imageHeight, colorFor, hovered }) => {
  if (!imageWidth || !imageHeight) return null;
  const withShapes = predictions.map((p, i) => ({ p, i })).filter(({ p }) => Array.isArray(p?.shapes) && p.shapes.length);
  if (withShapes.length === 0) return null;

  // Sizes relative to the image, so dots and text look the same on any resolution
  const unit = Math.max(imageWidth, imageHeight) / 1000;
  const dot = Math.max(2, unit * 4);
  const fontSize = Math.max(10, unit * 16);

  const renderShape = (shape: Shape, key: string, color: string) => {
    const stroke = { stroke: color, strokeWidth: 2, vectorEffect: 'non-scaling-stroke' as const };
    switch (shape.type) {
      case 'polygon': {
        if (!shape.points || shape.points.length < 3) return null;
        const pts = shape.points.map(p => `${p[0]},${p[1]}`).join(' ');
        return (
          <polygon key={key} points={pts} {...stroke}
            fill={shape.fill === false ? 'none' : color} fillOpacity={shape.fill === false ? undefined : 0.3} />
        );
      }
      case 'polyline': {
        if (!shape.points || shape.points.length < 2) return null;
        return <polyline key={key} points={shape.points.map(p => `${p[0]},${p[1]}`).join(' ')} fill="none" {...stroke} />;
      }
      case 'keypoints': {
        const points = shape.points || [];
        const minConf = shape.min_confidence ?? 0.5;
        return (
          <g key={key}>
            {(shape.edges || []).map(([a, b], j) => (
              visible(points[a], minConf) && visible(points[b], minConf) ? (
                <line key={`e${j}`} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} {...stroke} />
              ) : null
            ))}
            {points.map((p, j) => (
              visible(p, minConf) ? (
                <circle key={`p${j}`} cx={p[0]} cy={p[1]} r={dot} fill={color} stroke="#000" strokeWidth={1}
                  vectorEffect="non-scaling-stroke" />
              ) : null
            ))}
          </g>
        );
      }
      case 'circle':
        if (shape.x === undefined || shape.y === undefined) return null;
        return (
          <circle key={key} cx={shape.x} cy={shape.y} r={shape.radius ?? dot * 2} {...stroke}
            fill={shape.fill ? color : 'none'} fillOpacity={shape.fill ? 0.3 : undefined} />
        );
      case 'text':
        if (shape.x === undefined || shape.y === undefined || !shape.text) return null;
        return (
          <text key={key} x={shape.x} y={shape.y} fill={color} fontSize={fontSize} fontWeight={600}
            stroke="#000" strokeWidth={unit * 3} paintOrder="stroke">{shape.text}</text>
        );
      case 'image':
        if (!shape.src || shape.x === undefined || shape.y === undefined || !shape.width || !shape.height) return null;
        if (!/^data:image\//.test(shape.src)) return null;   // only inline images
        return (
          <image key={key} href={shape.src} x={shape.x} y={shape.y} width={shape.width} height={shape.height}
            opacity={shape.opacity ?? 0.5} preserveAspectRatio="none" />
        );
      default:
        return null;   // unknown types are ignored, so new ones never break the page
    }
  };

  return (
    <svg
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
      aria-hidden="true"
    >
      {withShapes.map(({ p, i }) => {
        const color = p.color || colorFor(p, i);
        return (
          <g key={i} opacity={hovered !== null && hovered !== i ? 0.25 : 1}>
            {(p.shapes as Shape[]).map((shape, j) => renderShape(shape, `${i}-${j}`, shape.color || color))}
          </g>
        );
      })}
    </svg>
  );
};

export default PredictionShapes;

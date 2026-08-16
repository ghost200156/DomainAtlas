import type { ViewState } from "../../lib/atlas/types";

type MapToolbarProps = {
  view: ViewState;
  onZoom: (factor: number) => void;
  onFit: () => void;
};

export function MapToolbar({ onFit, onZoom, view }: MapToolbarProps) {
  return (
    <div className="map-toolbar">
      <div>
        <strong>理解一个概念，显现与它直接关联的知识分支</strong>
      </div>
      <nav aria-label="地图控制">
        <output className="zoom-readout" aria-label="当前地图缩放比例">{Math.round(view.scale * 100)}%</output>
        <button onClick={() => onZoom(1.25)} aria-label="放大地图">＋</button>
        <button onClick={() => onZoom(0.8)} aria-label="缩小地图">−</button>
        <button className="fit-map" onClick={onFit}>全图</button>
      </nav>
    </div>
  );
}

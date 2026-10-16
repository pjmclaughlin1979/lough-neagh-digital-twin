import { useEffect, useRef } from "react";

// Adds a transparency slider to every layer list item, as an item panel toggled from the item's
// "transparency" icon. Slider is 0% (opaque) to 100% (invisible) and drives layer.opacity directly.
function addTransparencySlider({ item }) {
  const { layer } = item;
  if (!layer || !("opacity" in layer)) return;

  const wrap = document.createElement("div");
  wrap.className = "opacity-control";
  const label = document.createElement("span");
  label.className = "opacity-label";
  const slider = document.createElement("calcite-slider");
  slider.min = 0;
  slider.max = 100;
  slider.step = 5;
  slider.scale = "s";
  slider.value = Math.round((1 - layer.opacity) * 100);
  slider.label = `${item.title || layer.title} transparency`;

  const show = (v) => (label.textContent = `Transparency ${v}%`);
  show(slider.value);
  slider.addEventListener("calciteSliderInput", () => {
    const v = Number(slider.value);
    layer.opacity = 1 - v / 100;
    show(v);
  });

  wrap.append(label, slider);
  item.panel = { content: wrap, icon: "transparency", title: "Transparency", open: false };
}

// The SDK's own Layer List component, bound to the scene by id. The legend lives in the scene UI.
export function LayersPanel({ onClose }) {
  const listRef = useRef(null);
  useEffect(() => {
    if (listRef.current) listRef.current.listItemCreatedFunction = addTransparencySlider;
  }, []);

  return (
    <calcite-panel heading="Layers" description="DAERA / NIEA open data" closable oncalcitePanelClose={onClose}>
      <div className="panel-body">
        <arcgis-layer-list
          ref={listRef}
          reference-element="lough-scene"
          drag-enabled
          visibility-appearance="checkbox"
          show-collapse-button={false}
        />
        <p className="muted small">Use the transparency icon on a layer to fade it, e.g. to see the basemap through the Sentinel-2 overlay.</p>
      </div>
    </calcite-panel>
  );
}

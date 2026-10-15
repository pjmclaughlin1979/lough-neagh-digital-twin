// The SDK's own Layer List and Legend components, bound to the scene by id.
export function LayersPanel({ onClose }) {
  return (
    <calcite-panel heading="Layers & legend" description="DAERA / NIEA open data" closable oncalcitePanelClose={onClose}>
      <div className="panel-body">
        <arcgis-layer-list reference-element="lough-scene" drag-enabled visibility-appearance="checkbox" show-collapse-button={false} />
        <h3>Legend</h3>
        <arcgis-legend reference-element="lough-scene" respect-layer-visibility />
      </div>
    </calcite-panel>
  );
}

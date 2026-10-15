// Operational layers for the twin. Everything here is public, anonymous ArcGIS Online content
// published by DAERA (Department of Agriculture, Environment and Rural Affairs) / NIEA under the
// UK Open Government Licence, hosted in the DAERA organisation.

export const DAERA = "https://services-eu1.arcgis.com/kswen6BYexuc1SUk/ArcGIS/rest/services";

export const PROBES_URL = `${DAERA}/DAERA_Probes_and_Metrics_Master_Layers_View/FeatureServer`;

// Local Management Areas that drain to Lough Neagh (the Lower Bann LMA is downstream of the lough).
export const CATCHMENT_WHERE = "CSG IN ('Upper Neagh Bann','Lower Neagh Bann') AND NAME <> 'Lower Bann'";

export const LOUGH_WHERE = "namespace = 'Lough Neagh'";

const outline = (color, width = 1) => ({ color, width });
const fill = (color, line = [255, 255, 255, 0.6], width = 1) => ({
  type: "simple-fill",
  color,
  outline: outline(line, width),
});

// A 3D pin: an icon lifted off the ground with a callout line, so points stay readable from oblique
// camera angles over terrain.
const pin = (color, size = 11, primitive = "circle") => ({
  type: "point-3d",
  symbolLayers: [
    {
      type: "icon",
      resource: { primitive },
      material: { color },
      outline: { color: [255, 255, 255, 0.95], size: 1.5 },
      size,
    },
  ],
  verticalOffset: { screenLength: 36, maxWorldLength: 3000, minWorldLength: 30 },
  callout: { type: "line", size: 1, color: [255, 255, 255, 0.75], border: { color: [0, 0, 0, 0.35] } },
});

const flatIcon = (color, size = 8, primitive = "circle") => ({
  type: "point-3d",
  symbolLayers: [
    { type: "icon", resource: { primitive }, material: { color }, outline: { color: [20, 20, 20, 0.8], size: 0.8 }, size },
  ],
});

const label = (expression, size = 10, minScale = 0) => ({
  labelExpressionInfo: { expression },
  minScale,
  symbol: {
    type: "label-3d",
    symbolLayers: [
      { type: "text", material: { color: [255, 255, 255, 1] }, halo: { color: [10, 20, 25, 0.85], size: 1.2 }, size },
    ],
  },
});

// DAERA's services carry no field aliases, so derive readable labels from the field names.
const humanise = (name) => {
  const t = name.replace(/__+/g, " ").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const fields = (...names) => [
  {
    type: "fields",
    fieldInfos: names.map((n) => {
      const info = typeof n === "string" ? { fieldName: n } : n;
      return { label: humanise(info.fieldName), ...info };
    }),
  },
];

// WFD ecological status/potential — standard WFD class colours.
const WFD_STATUS = [
  ["HIGH", "High", [30, 110, 200]],
  ["GOOD", "Good", [40, 160, 70]],
  ["GEP", "Good ecological potential", [40, 160, 70]],
  ["MODERATE", "Moderate", [240, 200, 40]],
  ["MEP", "Moderate ecological potential", [240, 200, 40]],
  ["MEP (AWB)", "Moderate potential (artificial)", [240, 200, 40]],
  ["POOR", "Poor", [240, 130, 40]],
  ["PEP", "Poor ecological potential", [240, 130, 40]],
  ["BAD", "Bad", [210, 50, 50]],
  ["BEP", "Bad ecological potential", [210, 50, 50]],
];

export const LAYER_GROUPS = [
  {
    id: "live",
    title: "Live monitoring",
    visible: true,
    layers: [
      {
        id: "probes",
        title: "DAERA water-quality probes",
        url: `${PROBES_URL}/0`,
        outFields: ["*"],
        elevationInfo: { mode: "relative-to-ground" },
        renderer: {
          type: "unique-value",
          field: "Telemetered",
          uniqueValueInfos: [
            { value: "Y", label: "In-lough sonde (telemetered, incl. phycocyanin)", symbol: pin([57, 135, 229], 14, "kite") },
            { value: "N", label: "River probe (temperature, dissolved oxygen)", symbol: pin([25, 158, 112], 11) },
          ],
        },
        labelingInfo: [label("$feature.Location", 10)],
        popupTemplate: {
          title: "{Location} probe ({Probe_Ref_No})",
          content: fields("Probe_Type", "Probe_Make", "Probe_Model", "Metrics_Collected", "Telemetered", "Status", {
            fieldName: "Commissioned_Date",
          }),
        },
      },
      {
        id: "bga",
        title: "Blue-green algae confirmed reports",
        url: `${DAERA}/BGA_Confirmed_Locations_PublicView/FeatureServer/0`,
        outFields: ["*"],
        elevationInfo: { mode: "on-the-ground" },
        renderer: {
          type: "unique-value",
          valueExpression: `var y = Year($feature.DateLatestConfirmedReport);
            When(y >= Year(Now()), "this", y == Year(Now()) - 1, "last", "older")`,
          valueExpressionTitle: "Latest confirmed report",
          uniqueValueInfos: [
            { value: "this", label: "This year", symbol: flatIcon([235, 104, 52], 10, "triangle") },
            { value: "last", label: "Last year", symbol: flatIcon([237, 161, 0], 8, "triangle") },
            { value: "older", label: "Earlier", symbol: flatIcon([170, 170, 160], 7, "triangle") },
          ],
        },
        popupTemplate: {
          title: "Blue-green algae: {SiteName}",
          content: fields(
            { fieldName: "DateLatestConfirmedReport", label: "Latest confirmed report", format: { dateFormat: "day-short-month-year" } },
            "Catchment",
            "LocalManagementArea",
            "CouncilArea",
            "County",
          ),
        },
      },
      {
        id: "bathing",
        title: "Bathing water sampling sites",
        url: `${DAERA}/Bathing_Water_Monitoring_Points_Public_View_PRD/FeatureServer/0`,
        outFields: ["*"],
        visible: false,
        elevationInfo: { mode: "relative-to-ground" },
        renderer: { type: "simple", symbol: pin([232, 123, 164], 10, "square"), label: "Bathing water site" },
        popupTemplate: {
          title: "{Site_name} bathing water",
          content: fields("Type", "Status", "water_quality_indicator", "Sampling_datetime", "Bathing_Water_Operator", "Profile__URL"),
        },
      },
    ],
  },
  {
    id: "quality",
    title: "Water quality & status",
    visible: true,
    layers: [
      {
        id: "lnSampling",
        title: "Lough Neagh chemistry & phytoplankton sampling",
        url: `${DAERA}/LoughNeaghChemistryPhytoplanktonSamplingLocations_3/FeatureServer/0`,
        outFields: ["*"],
        elevationInfo: { mode: "relative-to-ground" },
        renderer: { type: "simple", symbol: pin([144, 133, 233], 10, "diamond"), label: "Monthly investigative monitoring site" },
        labelingInfo: [label("$feature.Name", 9, 300000)],
        popupTemplate: {
          title: "{Site_Name}",
          content: [
            ...fields("Site_Number", "Site_Type", "Sampling_Frequency"),
            {
              type: "text",
              text: '<a href="{ChemistryAlgalShoreData}" target="_blank" rel="noopener">Open DAERA chemistry, algal &amp; shoreline data dashboard ↗</a>',
            },
          ],
        },
      },
      {
        id: "wfdStatus",
        title: "WFD surface water body status (2018)",
        url: `${DAERA}/Surface_Water_Body_2018_Status/FeatureServer/0`,
        outFields: ["namespace", "localId", "F2018_statu", "spZoneType"],
        visible: false,
        opacity: 0.55,
        elevationInfo: { mode: "on-the-ground" },
        renderer: {
          type: "unique-value",
          field: "F2018_statu",
          defaultSymbol: fill([128, 128, 128, 0.5]),
          defaultLabel: "No data",
          uniqueValueInfos: WFD_STATUS.map(([value, lbl, c]) => ({ value, label: lbl, symbol: fill([...c, 0.75], [255, 255, 255, 0.4], 0.5) })),
        },
        popupTemplate: { title: "{namespace}", content: fields({ fieldName: "F2018_statu", label: "2018 classification" }, "localId", "spZoneType") },
      },
      {
        id: "wfdSites",
        title: "WFD river & lake monitoring sites",
        url: `${DAERA}/WFD_River_and_Lake_Monitoring_Sites/FeatureServer/0`,
        outFields: ["*"],
        visible: false,
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: flatIcon([195, 194, 183], 6), label: "Monitoring site" },
        popupTemplate: { title: "{monitori_1}", content: fields("monitoring", "catchment", "river_wate", "f2021_sites") },
      },
      {
        id: "phosphorus",
        title: "Water bodies failing for phosphorus",
        url: `${DAERA}/Areas_Failing_for_Phosphorus_Only/FeatureServer/0`,
        outFields: ["*"],
        visible: false,
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: fill([217, 89, 38, 0.35], [217, 89, 38, 0.9], 1.2), label: "Failing for phosphorus only" },
        popupTemplate: { title: "{NAME}", content: fields("SW_STATUS", "Failing_el", "LMA", "CSG") },
      },
    ],
  },
  {
    id: "pressures",
    title: "Catchment pressures",
    visible: false,
    layers: [
      {
        id: "wwtw",
        title: "NI Water wastewater treatment works",
        url: `${DAERA}/NIW_Waste_water_Treatment_Works_Asssets_May_2024/FeatureServer/30`,
        outFields: ["*"],
        visible: true,
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: flatIcon([217, 89, 38], 7, "square"), label: "WwTW discharge point" },
        popupTemplate: { title: "{Name}", content: fields("Receiving_Waterbody_Name", "Receiving_Waterbody_ID") },
      },
      {
        id: "algalIncidents",
        title: "Algal-bloom pollution incidents 2011–2024 (1 km grid)",
        url: `${DAERA}/Pollution_Incidents_2011_to_2024/FeatureServer/0`,
        definitionExpression: "catalgalbloom > 0",
        outFields: ["*"],
        visible: true,
        elevationInfo: { mode: "on-the-ground" },
        renderer: {
          type: "class-breaks",
          field: "catalgalbloom",
          classBreakInfos: [
            { minValue: 1, maxValue: 1, label: "1 incident", symbol: fill([236, 131, 90, 0.45], [236, 131, 90, 0.9]) },
            { minValue: 2, maxValue: 3, label: "2–3", symbol: fill([217, 89, 38, 0.6], [217, 89, 38, 1]) },
            { minValue: 4, maxValue: 1000, label: "4 or more", symbol: fill([208, 59, 59, 0.75], [208, 59, 59, 1]) },
          ],
        },
        popupTemplate: {
          title: "Pollution incidents, grid {gridsq}",
          content: fields(
            { fieldName: "catalgalbloom", label: "Algal bloom incidents" },
            { fieldName: "totals", label: "All incidents 2011–2024" },
            "farm",
            "domestic",
            "industry",
            { fieldName: "niw_ltd", label: "NI Water" },
          ),
        },
      },
    ],
  },
  {
    id: "designations",
    title: "Protected sites",
    visible: false,
    layers: [
      {
        id: "spa",
        title: "Lough Neagh & Lough Beg SPA / Ramsar",
        url: `${DAERA}/SPA/FeatureServer/0`,
        definitionExpression: "NAME LIKE '%Neagh%'",
        outFields: ["*"],
        visible: true,
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: fill([0, 0, 0, 0], [232, 123, 164, 1], 2), label: "Special Protection Area" },
        popupTemplate: { title: "{NAME}", content: fields("REFERENCE", "Status", "Area_Hectares", "CLASSIFIED", "Hyperlink") },
      },
      {
        id: "assi",
        title: "Areas of Special Scientific Interest",
        url: `${DAERA}/ASSI/FeatureServer/0`,
        outFields: ["*"],
        visible: false,
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: fill([144, 133, 233, 0.25], [144, 133, 233, 0.9]), label: "ASSI" },
        popupTemplate: { title: "{name}", content: fields("reference") },
      },
      {
        id: "sac",
        title: "Special Areas of Conservation",
        url: `${DAERA}/SAC/FeatureServer/0`,
        outFields: ["*"],
        visible: false,
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: fill([25, 158, 112, 0.25], [25, 158, 112, 0.9]), label: "SAC" },
        popupTemplate: { title: "{NAME}", content: fields("REFERENCE", "STATUS", "Area_Hectares", "Hyperlink") },
      },
    ],
  },
  {
    id: "hydro",
    title: "Lough & catchment",
    visible: true,
    layers: [
      {
        id: "hydroStations",
        title: "Lake hydrology stations",
        url: `${DAERA}/LakeHydrologyStations/FeatureServer/0`,
        outFields: ["*"],
        visible: false,
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: flatIcon([57, 135, 229], 7, "x"), label: "Lake hydrology station" },
        popupTemplate: { title: "{NAME}", content: fields("SURVEILLANCE", "OPERATIONAL") },
      },
      {
        id: "catchment",
        title: "Lough Neagh catchment (Local Management Areas)",
        url: `${DAERA}/LocalManagementAreas/FeatureServer/0`,
        definitionExpression: CATCHMENT_WHERE,
        popupEnabled: false,
        outFields: ["NAME", "CSG", "PRIORITY_YR"],
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: fill([0, 0, 0, 0], [255, 214, 120, 0.9], 1.5), label: "Local Management Area" },
        labelingInfo: [label("$feature.NAME", 11)],
        popupTemplate: { title: "{NAME} Local Management Area", content: fields({ fieldName: "CSG", label: "Catchment Stakeholder Group" }) },
      },
      {
        id: "loughOutline",
        title: "Lough Neagh WFD water body",
        url: `${DAERA}/Lake_Water_Bodies_2016/FeatureServer/0`,
        definitionExpression: LOUGH_WHERE,
        popupEnabled: false,
        outFields: ["*"],
        elevationInfo: { mode: "on-the-ground" },
        renderer: { type: "simple", symbol: fill([0, 0, 0, 0], [220, 245, 255, 0.85], 1.2), label: "Lough Neagh (UKGBNI3NB0032)" },
        popupTemplate: { title: "{namespace}", content: fields("localId", { fieldName: "Area_km2", label: "Area (km²)", format: { places: 1 } }) },
      },
      {
        id: "loughWater",
        title: "Lough surface (3D water)",
        url: `${DAERA}/Lake_Water_Bodies_2016/FeatureServer/0`,
        definitionExpression: LOUGH_WHERE,
        outFields: [],
        legendEnabled: false,
        popupEnabled: false,
        elevationInfo: { mode: "on-the-ground" },
        renderer: {
          type: "simple",
          symbol: {
            type: "polygon-3d",
            symbolLayers: [
              { type: "water", waveDirection: 240, color: "#3f5f52", waveStrength: "moderate", waterbodySize: "large" },
            ],
          },
        },
      },
    ],
  },
];

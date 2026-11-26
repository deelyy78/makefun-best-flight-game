// Sky Courier — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it
// to the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720, horizonY: 330 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Sortie length in seconds of flight time before the clock stops paying a time bonus. */
export const SORTIE = { parSeconds: 150, maxSeconds: 300 };

export const PLANE = {
  /** Knots. */
  cruiseSpeed: 145,
  maxSpeed: 210,
  stallSpeed: 58,
  /** Knots per second of throttle authority. */
  accel: 26,
  drag: 9,
  /** Radians per second of bank at full deflection. */
  rollRate: 1.9,
  maxBank: 1.05,
  /** Radians per second of pitch at full deflection. */
  pitchRate: 0.55,
  maxPitchUp: 0.38,
  maxPitchDown: -0.3,
  /** Climb in ft/s at full power, level flight. */
  climbRate: 26,
  /** Fuel: percent per second at full throttle. */
  fuelBurn: 0.55,
  /** Feet. */
  startAlt: 0,
};

export const RINGS = {
  radius: 26,
  points: 100,
  /** Extra points per consecutive ring without a miss. */
  comboStep: 25,
};

export const LANDING = {
  /** Knots: touch down slower than this on the runway. */
  maxSpeed: 95,
  /** ft/s of sink allowed at touchdown. */
  maxSink: 14,
  /** Degrees of heading error allowed. */
  maxHeadingError: 12,
  basePoints: 500,
};

/** Runway strips: [zStart, zEnd] along the valley, both centred on x = 0. */
export const RUNWAYS = [
  { z0: -480, z1: 140, name: 'RWY 09' },
  { z0: 4000, z1: 4900, name: 'RWY 27' },
];

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sky-courier.best';

export const PALETTE = {
  skyTop: '#274b7d',
  skyMid: '#7fa3c8',
  horizon: '#f7b267',
  sun: '#ffd98a',
  groundFar: '#6d8a4a',
  fieldA: '#5d8a3c',
  fieldB: '#6f9a44',
  fieldC: '#b59a4e',
  fieldD: '#7fae56',
  fieldE: '#4a7433',
  rock: '#8a7f72',
  snow: '#e9e9e9',
  river: '#2f6fb2',
  riverDeep: '#245a92',
  sand: '#cbb37a',
  runway: '#3c4148',
  runwayMark: '#e8e4d2',
  tree: '#2e5d2a',
  treeTrunk: '#5a4632',
  ringNext: '#ffc93c',
  ringLater: '#37c8e8',
  ringDone: '#7be07b',
  panel: '#161a21',
  panelEdge: '#2c3442',
  gaugeFace: '#0d1117',
  gaugeLit: '#7ee787',
  gaugeAmber: '#ffb454',
  gaugeRed: '#ff6b5e',
  text: '#eef1f5',
  muted: '#9aa5b5',
  planeBody: '#e8edf2',
  planeAccent: '#d84a35',
  planeTrim: '#2456a8',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

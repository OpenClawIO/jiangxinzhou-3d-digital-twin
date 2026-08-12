import { Body, Equator, Horizon, Illumination, MoonPhase, Observer, SearchRiseSet } from "astronomy-engine";

export const JIANGXINZHOU_OBSERVER = {
  longitude: 118.6982074,
  latitude: 32.0354297,
  elevationM: 8,
  timeZone: "Asia/Shanghai",
} as const;

export type CelestialPeriod = "night" | "dawn" | "day" | "dusk";
export type CelestialBodyState = {
  azimuthDeg: number;
  altitudeDeg: number;
  visible: boolean;
};

export type CelestialState = {
  timestamp: number;
  period: CelestialPeriod;
  daylight: number;
  twilight: number;
  night: number;
  horizonGlow: number;
  sun: CelestialBodyState;
  moon: CelestialBodyState & {
    illumination: number;
    phaseAngleDeg: number;
    phaseCycleDeg: number;
  };
};

export type CelestialEvents = {
  sunrise: number | null;
  sunset: number | null;
  moonrise: number | null;
  moonset: number | null;
  nextSunrise: number | null;
  nextSunset: number | null;
  nextMoonrise: number | null;
  nextMoonset: number | null;
};

const observer = new Observer(
  JIANGXINZHOU_OBSERVER.latitude,
  JIANGXINZHOU_OBSERVER.longitude,
  JIANGXINZHOU_OBSERVER.elevationM,
);

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(min: number, max: number, value: number) {
  const ratio = clamp01((value - min) / (max - min));
  return ratio * ratio * (3 - 2 * ratio);
}

function bodyState(body: Body, date: Date): CelestialBodyState {
  const equatorial = Equator(body, date, observer, true, true);
  const horizontal = Horizon(date, observer, equatorial.ra, equatorial.dec, "normal");
  return {
    azimuthDeg: horizontal.azimuth,
    altitudeDeg: horizontal.altitude,
    // The normal refraction model already lifts a body close to the horizon.
    // This apparent-altitude threshold matches the visible limb to within a few minutes.
    visible: horizontal.altitude > -0.3,
  };
}

function riseSetTimestamp(body: Body, direction: 1 | -1, start: Date, limitDays: number) {
  return SearchRiseSet(body, observer, direction, start, limitDays, JIANGXINZHOU_OBSERVER.elevationM)?.date.getTime() ?? null;
}

export function calculateCelestialEvents(input: Date | number): CelestialEvents {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) throw new TypeError("A valid date is required for celestial event calculations.");
  const localMidnight = new Date(shanghaiPreviewTimestamp(date, 0));

  return {
    sunrise: riseSetTimestamp(Body.Sun, 1, localMidnight, 1),
    sunset: riseSetTimestamp(Body.Sun, -1, localMidnight, 1),
    moonrise: riseSetTimestamp(Body.Moon, 1, localMidnight, 1),
    moonset: riseSetTimestamp(Body.Moon, -1, localMidnight, 1),
    nextSunrise: riseSetTimestamp(Body.Sun, 1, date, 2),
    nextSunset: riseSetTimestamp(Body.Sun, -1, date, 2),
    nextMoonrise: riseSetTimestamp(Body.Moon, 1, date, 2),
    nextMoonset: riseSetTimestamp(Body.Moon, -1, date, 2),
  };
}

export function calculateCelestialState(input: Date | number): CelestialState {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) throw new TypeError("A valid date is required for celestial calculations.");

  const sun = bodyState(Body.Sun, date);
  const moonPosition = bodyState(Body.Moon, date);
  const moonLight = Illumination(Body.Moon, date);
  const phaseCycleDeg = MoonPhase(date);
  const daylight = smoothstep(-5.5, 8, sun.altitudeDeg);
  const twilight = smoothstep(-14, -4, sun.altitudeDeg);
  const night = 1 - smoothstep(-13, -6, sun.altitudeDeg);
  const horizonGlow = clamp01(1 - Math.abs(sun.altitudeDeg + 1.5) / 10) * (1 - daylight * 0.58);
  const morning = sun.azimuthDeg < 180;
  const period: CelestialPeriod = sun.altitudeDeg >= -4
    ? "day"
    : sun.altitudeDeg <= -12
      ? "night"
      : morning ? "dawn" : "dusk";

  return {
    timestamp: date.getTime(),
    period,
    daylight,
    twilight,
    night,
    horizonGlow,
    sun,
    moon: {
      ...moonPosition,
      illumination: clamp01(moonLight.phase_fraction),
      phaseAngleDeg: moonLight.phase_angle,
      phaseCycleDeg,
    },
  };
}

export function celestialDirection(
  azimuthDeg: number,
  altitudeDeg: number,
  radius: number,
): [number, number, number] {
  const azimuth = azimuthDeg * Math.PI / 180;
  const altitude = altitudeDeg * Math.PI / 180;
  const horizontal = Math.cos(altitude) * radius;
  return [
    Math.sin(azimuth) * horizontal,
    Math.sin(altitude) * radius,
    -Math.cos(azimuth) * horizontal,
  ];
}

export function shanghaiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JIANGXINZHOU_OBSERVER.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function shanghaiPreviewTimestamp(reference: Date, minuteOfDay: number) {
  const parts = shanghaiDateParts(reference);
  const minutes = Math.min(1439, Math.max(0, Math.round(minuteOfDay)));
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return Date.UTC(parts.year, parts.month - 1, parts.day, hour - 8, minute, 0, 0);
}

export function formatShanghaiTime(timestamp: number, language: "zh" | "en") {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    timeZone: JIANGXINZHOU_OBSERVER.timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
}

export function formatShanghaiEventTime(timestamp: number | null, language: "zh" | "en") {
  if (timestamp === null) return "—";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
    timeZone: JIANGXINZHOU_OBSERVER.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
}

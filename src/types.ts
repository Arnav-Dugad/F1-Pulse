export type Driver = {
  driverId: string;
  givenName: string;
  familyName: string;
  code?: string;
  permanentNumber?: string;
  nationality: string;
  dateOfBirth: string;
  url: string;
};
export type Team = {
  constructorId: string;
  name: string;
  nationality: string;
  url: string;
};
export type Circuit = {
  circuitId: string;
  circuitName: string;
  url: string;
  Location: { lat: string; long: string; locality: string; country: string };
};
export type Result = {
  position: string;
  positionText: string;
  points: string;
  grid: string;
  laps: string;
  status: string;
  Driver: Driver;
  Constructor: Team;
  Time?: { time: string; millis: string };
  FastestLap?: {
    rank: string;
    lap: string;
    Time: { time: string };
    AverageSpeed: { speed: string };
  };
  Q1?: string;
  Q2?: string;
  Q3?: string;
};
export type Race = {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  url: string;
  Circuit: Circuit;
  Results?: Result[];
  QualifyingResults?: Result[];
  SprintResults?: Result[];
  FirstPractice?: { date: string; time: string };
  SecondPractice?: { date: string; time: string };
  ThirdPractice?: { date: string; time: string };
  Qualifying?: { date: string; time: string };
  Sprint?: { date: string; time: string };
  SprintQualifying?: { date: string; time: string };
};
export type Standing = {
  position: string;
  points: string;
  wins: string;
  Driver: Driver;
  Constructors: Team[];
};
export type TeamStanding = {
  position: string;
  points: string;
  wins: string;
  Constructor: Team;
};
export type Session = {
  session_key: number;
  meeting_key: number;
  session_name: string;
  date_start: string;
  date_end: string;
  country_name: string;
  circuit_short_name: string;
  location: string;
  year: number;
  gmt_offset: string;
};
export type ArchiveDriver = {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  headshot_url: string;
};
export type Lap = {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  date_start: string | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
};
export type CarSample = {
  date: string;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
  rpm: number;
  drs: number;
};
export type LocationSample = { date: string; x: number; y: number; z: number };
export type Envelope<T> = {
  data: T;
  meta: {
    source: string;
    url: string;
    fetchedAt: string;
    status: string;
    snapshot?: boolean;
  };
};

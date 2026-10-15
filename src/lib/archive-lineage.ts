/**
 * Curated constructor lineages: the same factory/entry passing between owners and names.
 * Each link cites the public record of the ownership or entry transfer. Spans use Jolpica
 * constructorIds plus a year window, because some ids are reused by unrelated teams (e.g. the
 * 1954–55 Mercedes works team, Renault 1977–85, Alfa Romeo 1950–51 / 1979–85, Aston Martin 1959–60).
 * The page only shows spans whose id actually appears in the race archive.
 */
export type LineageStep = {
  constructorId: string;
  from: number;
  to?: number;
  /** How this step came from the previous one (omitted for the first step). */
  source?: string;
};
export type Lineage = { id: string; name: string; base: string; note?: string; steps: LineageStep[] };

export const LINEAGES: Lineage[] = [
  {
    id: "enstone", name: "Enstone", base: "Enstone, Oxfordshire",
    steps: [
      { constructorId: "toleman", from: 1981, to: 1985 },
      { constructorId: "benetton", from: 1986, to: 2001, source: "The Benetton family bought Toleman Motorsport in 1985; it raced as Benetton Formula from 1986." },
      { constructorId: "renault", from: 2002, to: 2011, source: "Renault bought Benetton Formula in 2000 and raced it as Renault F1 Team from 2002." },
      { constructorId: "lotus_f1", from: 2012, to: 2015, source: "Genii Capital took full control and renamed the team Lotus F1 Team for 2012." },
      { constructorId: "renault", from: 2016, to: 2020, source: "Renault bought the team back from Genii Capital (completed December 2015) and returned as Renault for 2016." },
      { constructorId: "alpine", from: 2021, source: "Renamed Alpine F1 Team for 2021 after the Renault Group's Alpine brand." },
    ],
  },
  {
    id: "brackley", name: "Brackley", base: "Brackley, Northamptonshire",
    steps: [
      { constructorId: "tyrrell", from: 1970, to: 1998 },
      { constructorId: "bar", from: 1999, to: 2005, source: "British American Tobacco bought Tyrrell Racing in late 1997; the entry became British American Racing in 1999." },
      { constructorId: "honda", from: 2006, to: 2008, source: "Honda bought BAT's remaining stake in BAR in 2005 and raced as Honda Racing F1 Team from 2006." },
      { constructorId: "brawn", from: 2009, to: 2009, source: "Ross Brawn's management buyout of Honda Racing F1 in March 2009 created Brawn GP." },
      { constructorId: "mercedes", from: 2010, source: "Daimler and Aabar bought a 75.1% stake in Brawn GP in November 2009; it raced as Mercedes GP from 2010." },
    ],
  },
  {
    id: "milton-keynes", name: "Milton Keynes", base: "Milton Keynes, Buckinghamshire",
    steps: [
      { constructorId: "stewart", from: 1997, to: 1999 },
      { constructorId: "jaguar", from: 2000, to: 2004, source: "Ford bought Stewart Grand Prix in 1999 and rebranded it Jaguar Racing for 2000." },
      { constructorId: "red_bull", from: 2005, source: "Red Bull bought Jaguar Racing from Ford in November 2004." },
    ],
  },
  {
    id: "faenza", name: "Faenza", base: "Faenza, Italy",
    steps: [
      { constructorId: "minardi", from: 1985, to: 2005 },
      { constructorId: "toro_rosso", from: 2006, to: 2019, source: "Red Bull bought Minardi from Paul Stoddart in 2005; it became Scuderia Toro Rosso for 2006." },
      { constructorId: "alphatauri", from: 2020, to: 2023, source: "Renamed Scuderia AlphaTauri for 2020, after Red Bull's fashion brand." },
      { constructorId: "rb", from: 2024, source: "Renamed Visa Cash App RB for 2024, racing as Racing Bulls from 2025." },
    ],
  },
  {
    id: "silverstone", name: "Silverstone", base: "Silverstone, Northamptonshire",
    steps: [
      { constructorId: "jordan", from: 1991, to: 2005 },
      { constructorId: "mf1", from: 2006, to: 2006, source: "Midland Group bought Jordan Grand Prix in January 2005; it raced as MF1 Racing in 2006." },
      { constructorId: "spyker_mf1", from: 2006, to: 2006, source: "Spyker Cars bought MF1 Racing in September 2006 (Spyker MF1 for the final rounds)." },
      { constructorId: "spyker", from: 2007, to: 2007, source: "Raced as Spyker F1 Team in 2007." },
      { constructorId: "force_india", from: 2008, to: 2018, source: "Vijay Mallya and Michiel Mol bought Spyker F1 in October 2007; Force India from 2008." },
      { constructorId: "racing_point", from: 2018, to: 2020, source: "A Lawrence Stroll-led consortium bought the team's assets out of administration in August 2018; Racing Point from 2019." },
      { constructorId: "aston_martin", from: 2021, source: "Renamed Aston Martin for 2021 after Stroll's investment in Aston Martin Lagonda." },
    ],
  },
  {
    id: "hinwil", name: "Hinwil", base: "Hinwil, Switzerland",
    steps: [
      { constructorId: "sauber", from: 1993, to: 2005 },
      { constructorId: "bmw_sauber", from: 2006, to: 2009, source: "BMW bought a majority of Sauber in 2005; BMW Sauber from 2006." },
      { constructorId: "sauber", from: 2010, to: 2018, source: "Peter Sauber bought the team back from BMW in November 2009." },
      { constructorId: "alfa", from: 2019, to: 2023, source: "Alfa Romeo title partnership 2019–2023; the entry remained Sauber Motorsport." },
      { constructorId: "sauber", from: 2024, to: 2025, source: "Raced as Stake F1 Team Kick Sauber in 2024–2025." },
      { constructorId: "audi", from: 2026, source: "Audi completed its acquisition of the Sauber Group and races as Audi from 2026." },
    ],
  },
  {
    id: "arrows", name: "Arrows / Footwork", base: "Milton Keynes & Leafield",
    steps: [
      { constructorId: "arrows", from: 1978, to: 1990 },
      { constructorId: "footwork", from: 1991, to: 1996, source: "Footwork, Wataru Ohashi's logistics company, bought into Arrows; the team raced as Footwork 1991–1996." },
      { constructorId: "arrows", from: 1997, to: 2002, source: "Tom Walkinshaw took control in 1996 and restored the Arrows name for 1997." },
    ],
  },
  {
    id: "banbury", name: "Virgin / Marussia / Manor", base: "Banbury, Oxfordshire",
    steps: [
      { constructorId: "virgin", from: 2010, to: 2011 },
      { constructorId: "marussia", from: 2012, to: 2014, source: "Marussia Motors took over Virgin Racing; Marussia F1 Team from 2012." },
      { constructorId: "manor", from: 2015, to: 2016, source: "Rescued from administration for 2015 as Manor Marussia; Manor Racing in 2016." },
    ],
  },
  {
    id: "ligier-prost", name: "Ligier / Prost", base: "Magny-Cours, France",
    steps: [
      { constructorId: "ligier", from: 1976, to: 1996 },
      { constructorId: "prost", from: 1997, to: 2001, source: "Alain Prost bought Équipe Ligier in February 1997." },
    ],
  },
  {
    id: "caterham", name: "Lotus Racing / Caterham", base: "Hingham & Leafield",
    note: "Not related to the original Team Lotus or to Enstone's Lotus F1 Team.",
    steps: [
      { constructorId: "lotus_racing", from: 2010, to: 2011 },
      { constructorId: "caterham", from: 2012, to: 2014, source: "Tony Fernandes' team (Lotus Racing 2010, Team Lotus 2011) was renamed Caterham F1 Team for 2012 after the Lotus naming dispute." },
    ],
  },
  { id: "ferrari", name: "Ferrari", base: "Maranello, Italy", note: "One name since 1950.", steps: [{ constructorId: "ferrari", from: 1950 }] },
  { id: "mclaren", name: "McLaren", base: "Woking, Surrey", note: "Jolpica lists McLaren's 1966–70 cars under engine-specific ids (McLaren-Ford etc.); this line uses the main McLaren id.", steps: [{ constructorId: "mclaren", from: 1966 }] },
  { id: "williams", name: "Williams", base: "Grove, Oxfordshire", note: "One name since its first Jolpica season.", steps: [{ constructorId: "williams", from: 1975 }] },
  { id: "haas", name: "Haas", base: "Kannapolis & Banbury", note: "New entry in 2016.", steps: [{ constructorId: "haas", from: 2016 }] },
  { id: "cadillac", name: "Cadillac", base: "Fishers, Indiana & Silverstone", note: "New entry for 2026.", steps: [{ constructorId: "cadillac", from: 2026 }] },
];

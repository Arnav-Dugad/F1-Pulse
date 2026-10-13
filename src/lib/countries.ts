/** Nationality and country names (as published by Jolpica) → ISO 3166-1 alpha-2. */
export const nationalityCodes: Record<string, string> = {
  American: "us", "American-Italian": "us", Argentine: "ar", "Argentine-Italian": "ar", Australian: "au", Austrian: "at",
  Belgian: "be", Brazilian: "br", British: "gb", Canadian: "ca", Chilean: "cl", Chinese: "cn", Colombian: "co",
  Czech: "cz", Danish: "dk", Dutch: "nl", "East German": "de", Finnish: "fi", French: "fr", German: "de",
  Hong: "hk", Hungarian: "hu", Indian: "in", Indonesian: "id", Irish: "ie", Italian: "it", Japanese: "jp",
  Liechtensteiner: "li", Malaysian: "my", Mexican: "mx", Monegasque: "mc", "New Zealander": "nz", Polish: "pl",
  Portuguese: "pt", Rhodesian: "zw", Russian: "ru", "South African": "za", Spanish: "es", Swedish: "se",
  Swiss: "ch", Thai: "th", Uruguayan: "uy", Venezuelan: "ve", Emirati: "ae", Estonian: "ee", Moroccan: "ma",
};
export const countryCodes: Record<string, string> = {
  Argentina: "ar", Australia: "au", Austria: "at", Azerbaijan: "az", Bahrain: "bh", Belgium: "be", Brazil: "br",
  Canada: "ca", China: "cn", France: "fr", Germany: "de", "Great Britain": "gb", Hungary: "hu", India: "in",
  Italy: "it", Japan: "jp", Korea: "kr", "South Korea": "kr", Malaysia: "my", Mexico: "mx", Monaco: "mc",
  Morocco: "ma", Netherlands: "nl", Portugal: "pt", Qatar: "qa", Russia: "ru", "Saudi Arabia": "sa",
  Singapore: "sg", "South Africa": "za", Spain: "es", Sweden: "se", Switzerland: "ch", Turkey: "tr",
  UAE: "ae", "United Arab Emirates": "ae", UK: "gb", "United Kingdom": "gb", USA: "us", "United States": "us",
  Vietnam: "vn", Las_Vegas: "us",
};
export const nationalityFlag = (n?: string) => (n && nationalityCodes[n]) || "";
export const countryFlag = (c?: string) => (c && countryCodes[c]) || "";
export const flagCodes = [...new Set([...Object.values(nationalityCodes), ...Object.values(countryCodes)])].sort();

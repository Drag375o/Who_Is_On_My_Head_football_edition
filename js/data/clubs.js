/*
 * Reference tables used by the footballer database and the question deck.
 *
 * NATIONS:  code → [name, continent]
 * CONTINENTS: EU Europe · SA South America · AF Africa · NA North & Central America · AS Asia & Oceania
 * LEAGUES:  country code → how it reads in "Have I played club football in …?"
 * CLUBS:    code → [name, country code]. Only well-known clubs get a code: these are the
 *           clubs the "Have I played for …?" questions can ask about, so every footballer's
 *           row must list ALL of these clubs they played for (senior team, loans included).
 */
window.WOH = window.WOH || {};

WOH.CONTINENTS = {
  EU: 'Europe',
  SA: 'South America',
  AF: 'Africa',
  NA: 'North or Central America',
  AS: 'Asia or Oceania',
};

WOH.NATIONS = {
  ALG: ['Algeria', 'AF'], ARG: ['Argentina', 'SA'], AUS: ['Australia', 'AS'], AUT: ['Austria', 'EU'],
  BEL: ['Belgium', 'EU'], BRA: ['Brazil', 'SA'], BUL: ['Bulgaria', 'EU'], CAN: ['Canada', 'NA'],
  CHI: ['Chile', 'SA'], CIV: ['Ivory Coast', 'AF'], CMR: ['Cameroon', 'AF'], COL: ['Colombia', 'SA'],
  CRO: ['Croatia', 'EU'], CZE: ['Czech Republic', 'EU'], DEN: ['Denmark', 'EU'], ECU: ['Ecuador', 'SA'],
  EGY: ['Egypt', 'AF'], ENG: ['England', 'EU'], ESP: ['Spain', 'EU'], FIN: ['Finland', 'EU'],
  FRA: ['France', 'EU'], GAB: ['Gabon', 'AF'], GEO: ['Georgia', 'EU'], GER: ['Germany', 'EU'],
  GHA: ['Ghana', 'AF'], HUN: ['Hungary', 'EU'], IRL: ['Ireland', 'EU'], ITA: ['Italy', 'EU'],
  JPN: ['Japan', 'AS'], KOR: ['South Korea', 'AS'], LBR: ['Liberia', 'AF'], MAR: ['Morocco', 'AF'],
  MEX: ['Mexico', 'NA'], NED: ['Netherlands', 'EU'], NGA: ['Nigeria', 'AF'], NIR: ['Northern Ireland', 'EU'],
  NOR: ['Norway', 'EU'], POL: ['Poland', 'EU'], POR: ['Portugal', 'EU'], ROU: ['Romania', 'EU'],
  SCO: ['Scotland', 'EU'], SEN: ['Senegal', 'AF'], SRB: ['Serbia', 'EU'], SUI: ['Switzerland', 'EU'],
  SVN: ['Slovenia', 'EU'], SWE: ['Sweden', 'EU'], TRI: ['Trinidad and Tobago', 'NA'], TUR: ['Turkey', 'EU'],
  UKR: ['Ukraine', 'EU'], URS: ['the Soviet Union', 'EU'], URU: ['Uruguay', 'SA'], USA: ['the USA', 'NA'],
  WAL: ['Wales', 'EU'], ARM: ['Armenia', 'EU'], BIH: ['Bosnia and Herzegovina', 'EU'], GUI: ['Guinea', 'AF'],
  MLI: ['Mali', 'AF'], SVK: ['Slovakia', 'EU'], PAR: ['Paraguay', 'SA'], CRC: ['Costa Rica', 'NA'],
  GRE: ['Greece', 'EU'], ISL: ['Iceland', 'EU'], ISR: ['Israel', 'EU'], JAM: ['Jamaica', 'NA'],
  PER: ['Peru', 'SA'],
};

WOH.LEAGUES = {
  ENG: 'England', ESP: 'Spain', ITA: 'Italy', GER: 'Germany', FRA: 'France',
  NED: 'the Netherlands', POR: 'Portugal', SCO: 'Scotland', TUR: 'Turkey',
  USA: 'the USA or Canada', KSA: 'Saudi Arabia', BRA: 'Brazil', ARG: 'Argentina',
};

WOH.CLUBS = {
  // Spain
  RMA: ['Real Madrid', 'ESP'], BAR: ['Barcelona', 'ESP'], ATM: ['Atlético Madrid', 'ESP'],
  VAL: ['Valencia', 'ESP'], SEV: ['Sevilla', 'ESP'], VIL: ['Villarreal', 'ESP'], ATH: ['Athletic Club', 'ESP'],
  RSO: ['Real Sociedad', 'ESP'],
  // England
  MUN: ['Manchester United', 'ENG'], MCI: ['Manchester City', 'ENG'], LIV: ['Liverpool', 'ENG'],
  ARS: ['Arsenal', 'ENG'], CHE: ['Chelsea', 'ENG'], TOT: ['Tottenham', 'ENG'], NEW: ['Newcastle', 'ENG'],
  EVE: ['Everton', 'ENG'], WHU: ['West Ham', 'ENG'], AVL: ['Aston Villa', 'ENG'], LEI: ['Leicester City', 'ENG'],
  // Germany
  BAY: ['Bayern Munich', 'GER'], BVB: ['Borussia Dortmund', 'GER'], B04: ['Bayer Leverkusen', 'GER'],
  S04: ['Schalke 04', 'GER'], BMG: ["Borussia M'gladbach", 'GER'], HSV: ['Hamburger SV', 'GER'],
  RBL: ['RB Leipzig', 'GER'],
  // Italy
  JUV: ['Juventus', 'ITA'], MIL: ['AC Milan', 'ITA'], INT: ['Inter', 'ITA'], ROM: ['Roma', 'ITA'],
  LAZ: ['Lazio', 'ITA'], NAP: ['Napoli', 'ITA'], FIO: ['Fiorentina', 'ITA'], PAR: ['Parma', 'ITA'],
  // France
  PSG: ['Paris Saint-Germain', 'FRA'], OM: ['Marseille', 'FRA'], OL: ['Lyon', 'FRA'], ASM: ['Monaco', 'FRA'],
  // Netherlands, Portugal, Scotland, Turkey
  AJA: ['Ajax', 'NED'], PSV: ['PSV Eindhoven', 'NED'], FEY: ['Feyenoord', 'NED'],
  BEN: ['Benfica', 'POR'], FCP: ['Porto', 'POR'], SCP: ['Sporting CP', 'POR'],
  CEL: ['Celtic', 'SCO'], RAN: ['Rangers', 'SCO'],
  GAL: ['Galatasaray', 'TUR'], FEN: ['Fenerbahçe', 'TUR'],
  // South America
  BOC: ['Boca Juniors', 'ARG'], RIV: ['River Plate', 'ARG'],
  SAN: ['Santos', 'BRA'], FLA: ['Flamengo', 'BRA'], SAO: ['São Paulo', 'BRA'], COR: ['Corinthians', 'BRA'],
  PAL: ['Palmeiras', 'BRA'], BOT: ['Botafogo', 'BRA'],
  // North America & Saudi Arabia
  MIA: ['Inter Miami', 'USA'], LAG: ['LA Galaxy', 'USA'],
  NAS: ['Al Nassr', 'KSA'], HIL: ['Al Hilal', 'KSA'], ITT: ['Al Ittihad', 'KSA'],
};

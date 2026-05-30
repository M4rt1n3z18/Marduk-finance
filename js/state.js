// ══════════════ DATA ══════════════
const DEFAULT_CATS = ["Housing","Food","Transport","Healthcare","Entertainment","Shopping","Utilities","Other"];
const CAT_COLORS_PALETTE = ["#c9a84c","#4caf82","#4c8aaf","#e05c5c","#9b87f5","#e0965c","#5ccce0","#a1a1aa","#f0a050","#50c0f0","#c050f0","#f05050","#80c080","#c08040"];
let CATS = [...DEFAULT_CATS];
let CAT_COLORS = CATS.map((_, i) => CAT_COLORS_PALETTE[i % CAT_COLORS_PALETTE.length]);
const CLASS_COLORS = {"Stock":"#4c8aaf","ETF/Fund":"#4caf82","Crypto":"#9b87f5","Bond":"#c9a84c","Cash":"#a1a1aa"};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let state = {
  expenses: [], assets: [], liabilities: [],
  budgets: DEFAULT_CATS.map(c => ({ cat: c, limit: 0 })),
  nwHistory: [], salaries: [], extraIncomes: [], goals: [], categories: [...DEFAULT_CATS], payslips: [],
  portfolios: [], activePortfolioId: null,
  paycheckDay: null   // null = calendar month; 1–31 = expenses shift after this day
};

// ── Active portfolio helper ──────────────────────────────────────────────────
function ap() {
  if (!state.portfolios || !state.portfolios.length) return { holdings: [], transactions: [], portHistory: [] };
  return state.portfolios.find(p => p.id === state.activePortfolioId) || state.portfolios[0];
}

// Portfolio stats for all portfolios combined (used in overview / net worth)
function totalPortfolioStats() {
  const allH    = (state.portfolios || []).flatMap(p => p.holdings || []);
  // Sum cash across all portfolios — use cashEntries for accuracy if available
  const allCash = (state.portfolios || []).reduce((s, p) => {
    if (p.cashEntries && p.cashEntries.length) {
      return s + p.cashEntries.reduce((cs, e) => cs + (e.amount / (FX_RATES[e.currency] || 1)), 0);
    }
    return s + (p.cash || 0);
  }, 0);
  const holdVal = allH.reduce((s,h) => s + (h.currentPrice||h.buyPrice)*h.shares, 0);
  const cost    = allH.reduce((s,h) => s + h.buyPrice*h.shares, 0);
  const divs    = allH.reduce((s,h) => s + Number(h.dividends||0), 0);
  const gain    = holdVal - cost + divs;
  const val     = holdVal + allCash;
  return { val, holdVal, cost, divs, gain, gainPct: cost ? gain/cost*100 : 0, count: allH.length };
}

function save() {
  try {
    const json = JSON.stringify(state);
    if (window.electronAPI) {
      window.electronAPI.saveData(json); // async, fire and forget
    } else {
      localStorage.setItem('marduk_v1', json);
    }
  } catch(e) {}
}

// load() is called only from initApp() which is already inside unlockApp()
// We make initApp async to handle the Electron case
async function load() {
  try {
    if (window.electronAPI) {
      const d = await window.electronAPI.loadData();
      if (d) state = JSON.parse(d);
    } else {
      const d = localStorage.getItem('marduk_v1');
      if (d) state = JSON.parse(d);
    }
  } catch(e) {}
}

const TICKER_DB = [
  {t:"AAPL",n:"Apple Inc.",c:"Stock"},{t:"MSFT",n:"Microsoft Corp.",c:"Stock"},{t:"NVDA",n:"NVIDIA Corp.",c:"Stock"},
  {t:"AMZN",n:"Amazon.com Inc.",c:"Stock"},{t:"GOOGL",n:"Alphabet Inc. Class A",c:"Stock"},{t:"GOOG",n:"Alphabet Inc. Class C",c:"Stock"},
  {t:"META",n:"Meta Platforms",c:"Stock"},{t:"TSLA",n:"Tesla Inc.",c:"Stock"},{t:"BRK.B",n:"Berkshire Hathaway B",c:"Stock"},
  {t:"JPM",n:"JPMorgan Chase",c:"Stock"},{t:"V",n:"Visa Inc.",c:"Stock"},{t:"UNH",n:"UnitedHealth Group",c:"Stock"},
  {t:"XOM",n:"Exxon Mobil",c:"Stock"},{t:"LLY",n:"Eli Lilly",c:"Stock"},{t:"JNJ",n:"Johnson & Johnson",c:"Stock"},
  {t:"MA",n:"Mastercard",c:"Stock"},{t:"AVGO",n:"Broadcom Inc.",c:"Stock"},{t:"PG",n:"Procter & Gamble",c:"Stock"},
  {t:"HD",n:"Home Depot",c:"Stock"},{t:"CVX",n:"Chevron Corp.",c:"Stock"},{t:"MRK",n:"Merck & Co.",c:"Stock"},
  {t:"ABBV",n:"AbbVie Inc.",c:"Stock"},{t:"KO",n:"Coca-Cola Co.",c:"Stock"},{t:"PEP",n:"PepsiCo Inc.",c:"Stock"},
  {t:"COST",n:"Costco Wholesale",c:"Stock"},{t:"ADBE",n:"Adobe Inc.",c:"Stock"},{t:"WMT",n:"Walmart Inc.",c:"Stock"},
  {t:"MCD",n:"McDonald's Corp.",c:"Stock"},{t:"CRM",n:"Salesforce Inc.",c:"Stock"},{t:"BAC",n:"Bank of America",c:"Stock"},
  {t:"TMO",n:"Thermo Fisher Scientific",c:"Stock"},{t:"ACN",n:"Accenture",c:"Stock"},{t:"NFLX",n:"Netflix Inc.",c:"Stock"},
  {t:"AMD",n:"Advanced Micro Devices",c:"Stock"},{t:"ORCL",n:"Oracle Corp.",c:"Stock"},{t:"CSCO",n:"Cisco Systems",c:"Stock"},
  {t:"INTC",n:"Intel Corp.",c:"Stock"},{t:"QCOM",n:"Qualcomm",c:"Stock"},{t:"IBM",n:"IBM Corp.",c:"Stock"},
  {t:"GE",n:"GE Aerospace",c:"Stock"},{t:"CAT",n:"Caterpillar",c:"Stock"},{t:"GS",n:"Goldman Sachs",c:"Stock"},
  {t:"MS",n:"Morgan Stanley",c:"Stock"},{t:"BLK",n:"BlackRock",c:"Stock"},{t:"SPGI",n:"S&P Global",c:"Stock"},
  {t:"NOW",n:"ServiceNow",c:"Stock"},{t:"T",n:"AT&T Inc.",c:"Stock"},{t:"VZ",n:"Verizon Communications",c:"Stock"},
  {t:"DIS",n:"Walt Disney Co.",c:"Stock"},{t:"AMGN",n:"Amgen Inc.",c:"Stock"},{t:"PM",n:"Philip Morris",c:"Stock"},
  {t:"RTX",n:"RTX Corp.",c:"Stock"},{t:"BA",n:"Boeing Co.",c:"Stock"},{t:"HON",n:"Honeywell",c:"Stock"},
  {t:"DE",n:"Deere & Co.",c:"Stock"},{t:"NEE",n:"NextEra Energy",c:"Stock"},{t:"LIN",n:"Linde plc",c:"Stock"},
  {t:"PFE",n:"Pfizer Inc.",c:"Stock"},{t:"AXP",n:"American Express",c:"Stock"},{t:"UPS",n:"United Parcel Service",c:"Stock"},
  {t:"SBUX",n:"Starbucks Corp.",c:"Stock"},{t:"LOW",n:"Lowe\'s Companies",c:"Stock"},{t:"TXN",n:"Texas Instruments",c:"Stock"},
  {t:"INTU",n:"Intuit Inc.",c:"Stock"},{t:"ISRG",n:"Intuitive Surgical",c:"Stock"},{t:"MDLZ",n:"Mondelez International",c:"Stock"},
  {t:"C",n:"Citigroup",c:"Stock"},{t:"WFC",n:"Wells Fargo",c:"Stock"},{t:"USB",n:"US Bancorp",c:"Stock"},
  {t:"MMM",n:"3M Company",c:"Stock"},{t:"ADP",n:"ADP Inc.",c:"Stock"},{t:"GILD",n:"Gilead Sciences",c:"Stock"},
  {t:"REGN",n:"Regeneron Pharmaceuticals",c:"Stock"},{t:"ZTS",n:"Zoetis Inc.",c:"Stock"},{t:"MO",n:"Altria Group",c:"Stock"},
  {t:"SO",n:"Southern Company",c:"Stock"},{t:"ELV",n:"Elevance Health",c:"Stock"},{t:"CI",n:"Cigna Group",c:"Stock"},
  {t:"HCA",n:"HCA Healthcare",c:"Stock"},{t:"MCO",n:"Moody\'s Corp.",c:"Stock"},{t:"SCHW",n:"Charles Schwab",c:"Stock"},
  {t:"SYK",n:"Stryker Corp.",c:"Stock"},{t:"ADI",n:"Analog Devices",c:"Stock"},{t:"AMAT",n:"Applied Materials",c:"Stock"},
  {t:"KLAC",n:"KLA Corp.",c:"Stock"},{t:"LRCX",n:"Lam Research",c:"Stock"},{t:"MU",n:"Micron Technology",c:"Stock"},
  {t:"PANW",n:"Palo Alto Networks",c:"Stock"},{t:"CRWD",n:"CrowdStrike",c:"Stock"},{t:"SNOW",n:"Snowflake",c:"Stock"},
  {t:"UBER",n:"Uber Technologies",c:"Stock"},{t:"ABNB",n:"Airbnb",c:"Stock"},{t:"COIN",n:"Coinbase",c:"Stock"},
  {t:"PYPL",n:"PayPal Holdings",c:"Stock"},{t:"SQ",n:"Block Inc.",c:"Stock"},{t:"SPOT",n:"Spotify Technology",c:"Stock"},
  {t:"SHOP",n:"Shopify",c:"Stock"},{t:"TTD",n:"The Trade Desk",c:"Stock"},{t:"DDOG",n:"Datadog",c:"Stock"},
  {t:"ZS",n:"Zscaler",c:"Stock"},{t:"NET",n:"Cloudflare",c:"Stock"},{t:"PLTR",n:"Palantir Technologies",c:"Stock"},
  {t:"SPY",n:"SPDR S&P 500 ETF",c:"ETF/Fund"},{t:"VOO",n:"Vanguard S&P 500 ETF",c:"ETF/Fund"},{t:"QQQ",n:"Invesco QQQ (Nasdaq-100)",c:"ETF/Fund"},
  {t:"IWM",n:"iShares Russell 2000 ETF",c:"ETF/Fund"},{t:"VTI",n:"Vanguard Total Stock Market",c:"ETF/Fund"},{t:"ARKK",n:"ARK Innovation ETF",c:"ETF/Fund"},
  {t:"GLD",n:"SPDR Gold Shares",c:"ETF/Fund"},{t:"SLV",n:"iShares Silver Trust",c:"ETF/Fund"},{t:"TLT",n:"iShares 20+ Year Treasury",c:"ETF/Fund"},
  {t:"HYG",n:"iShares High Yield Corp Bond",c:"ETF/Fund"},{t:"EEM",n:"iShares MSCI Emerging Markets",c:"ETF/Fund"},
  {t:"VWO",n:"Vanguard FTSE Emerging Markets",c:"ETF/Fund"},{t:"EFA",n:"iShares MSCI EAFE ETF",c:"ETF/Fund"},
  {t:"VEA",n:"Vanguard FTSE Developed Markets",c:"ETF/Fund"},{t:"VNQ",n:"Vanguard Real Estate ETF",c:"ETF/Fund"},
  {t:"XLF",n:"Financial Select Sector SPDR",c:"ETF/Fund"},{t:"XLK",n:"Technology Select Sector SPDR",c:"ETF/Fund"},
  {t:"XLE",n:"Energy Select Sector SPDR",c:"ETF/Fund"},{t:"XLV",n:"Health Care Select Sector SPDR",c:"ETF/Fund"},
  {t:"IWDA",n:"iShares Core MSCI World (EUR)",c:"ETF/Fund"},{t:"CSPX",n:"iShares Core S&P 500 (EUR)",c:"ETF/Fund"},
  {t:"VWCE",n:"Vanguard FTSE All-World (EUR)",c:"ETF/Fund"},{t:"EQQQ",n:"Invesco Nasdaq-100 (EUR)",c:"ETF/Fund"},
  {t:"IEMA",n:"iShares Core MSCI EM IMI (EUR)",c:"ETF/Fund"},{t:"VUSA",n:"Vanguard S&P 500 (EUR)",c:"ETF/Fund"},
  {t:"XDWD",n:"Xtrackers MSCI World (EUR)",c:"ETF/Fund"},
  {t:"ASML",n:"ASML Holding",c:"Stock"},{t:"SAP",n:"SAP SE",c:"Stock"},{t:"NESN",n:"Nestlé SA",c:"Stock"},
  {t:"NOVN",n:"Novartis AG",c:"Stock"},{t:"ROG",n:"Roche Holding",c:"Stock"},{t:"MC.PA",n:"LVMH (Paris)",c:"Stock"},
  {t:"OR.PA",n:"L\'Oréal (Paris)",c:"Stock"},{t:"AIR.PA",n:"Airbus SE (Paris)",c:"Stock"},
  {t:"SIE.DE",n:"Siemens AG (Frankfurt)",c:"Stock"},{t:"ALV.DE",n:"Allianz SE (Frankfurt)",c:"Stock"},
  {t:"BAS.DE",n:"BASF SE (Frankfurt)",c:"Stock"},{t:"BAYN.DE",n:"Bayer AG (Frankfurt)",c:"Stock"},
  {t:"BMW.DE",n:"BMW AG (Frankfurt)",c:"Stock"},{t:"DBK.DE",n:"Deutsche Bank (Frankfurt)",c:"Stock"},
  {t:"DTE.DE",n:"Deutsche Telekom (Frankfurt)",c:"Stock"},{t:"MBG.DE",n:"Mercedes-Benz (Frankfurt)",c:"Stock"},
  {t:"VOW3.DE",n:"Volkswagen (Frankfurt)",c:"Stock"},{t:"ADS.DE",n:"Adidas AG (Frankfurt)",c:"Stock"},
  {t:"SAP.DE",n:"SAP SE (Frankfurt)",c:"Stock"},{t:"HSBA.L",n:"HSBC Holdings (London)",c:"Stock"},
  {t:"SHEL.L",n:"Shell plc (London)",c:"Stock"},{t:"BP.L",n:"BP plc (London)",c:"Stock"},
  {t:"AZN.L",n:"AstraZeneca (London)",c:"Stock"},{t:"GSK.L",n:"GSK plc (London)",c:"Stock"},
  {t:"RIO.L",n:"Rio Tinto (London)",c:"Stock"},{t:"ULVR.L",n:"Unilever (London)",c:"Stock"},
  {t:"VOD.L",n:"Vodafone Group (London)",c:"Stock"},{t:"LLOY.L",n:"Lloyds Banking Group (London)",c:"Stock"},
  {t:"BARC.L",n:"Barclays (London)",c:"Stock"},{t:"BNP.PA",n:"BNP Paribas (Paris)",c:"Stock"},
  {t:"SAN.PA",n:"Sanofi (Paris)",c:"Stock"},{t:"TTE.PA",n:"TotalEnergies (Paris)",c:"Stock"},
  {t:"STLAM.MI",n:"Stellantis (Milan)",c:"Stock"},{t:"ISP.MI",n:"Intesa Sanpaolo (Milan)",c:"Stock"},
  {t:"ENI.MI",n:"Eni SpA (Milan)",c:"Stock"},{t:"ENEL.MI",n:"Enel SpA (Milan)",c:"Stock"},
  {t:"ITX.MC",n:"Inditex/Zara (Madrid)",c:"Stock"},{t:"SAN.MC",n:"Banco Santander (Madrid)",c:"Stock"},
  {t:"IBE.MC",n:"Iberdrola (Madrid)",c:"Stock"},{t:"BBVA.MC",n:"BBVA (Madrid)",c:"Stock"},
  {t:"EDP.LS",n:"EDP (Lisbon)",c:"Stock"},{t:"GALP.LS",n:"Galp Energia (Lisbon)",c:"Stock"},
  {t:"BCP.LS",n:"Banco Comercial Português (Lisbon)",c:"Stock"},{t:"JMT.LS",n:"Jerónimo Martins (Lisbon)",c:"Stock"},
  {t:"SON.LS",n:"Sonae (Lisbon)",c:"Stock"},{t:"NOS.LS",n:"NOS SGPS (Lisbon)",c:"Stock"},
  {t:"BABA",n:"Alibaba Group",c:"Stock"},{t:"TCEHY",n:"Tencent Holdings (OTC)",c:"Stock"},
  {t:"JD",n:"JD.com",c:"Stock"},{t:"BIDU",n:"Baidu Inc.",c:"Stock"},{t:"PDD",n:"PDD Holdings (Temu)",c:"Stock"},
  {t:"NIO",n:"NIO Inc.",c:"Stock"},{t:"XPEV",n:"XPeng Inc.",c:"Stock"},{t:"LI",n:"Li Auto",c:"Stock"},
  {t:"KWEB",n:"KraneShares CSI China Internet ETF",c:"ETF/Fund"},{t:"FXI",n:"iShares China Large-Cap ETF",c:"ETF/Fund"},
  {t:"MCHI",n:"iShares MSCI China ETF",c:"ETF/Fund"},{t:"BILI",n:"Bilibili Inc.",c:"Stock"},
  {t:"NTES",n:"NetEase Inc.",c:"Stock"},{t:"EDU",n:"New Oriental Education",c:"Stock"},
  // ── Popular European ETFs (Xetra .DE) ──
  {t:"SXR8.DE",n:"iShares Core S&P 500 UCITS ETF (Acc)",c:"ETF/Fund"},
  {t:"EUNL.DE",n:"iShares Core MSCI World UCITS ETF (Acc)",c:"ETF/Fund"},
  {t:"EXS1.DE",n:"iShares Core DAX UCITS ETF",c:"ETF/Fund"},
  {t:"DBXD.DE",n:"Xtrackers DAX UCITS ETF",c:"ETF/Fund"},
  {t:"XDWT.DE",n:"Xtrackers MSCI World Swap UCITS ETF",c:"ETF/Fund"},
  {t:"XDWD.DE",n:"Xtrackers MSCI World UCITS ETF",c:"ETF/Fund"},
  {t:"VWCE.DE",n:"Vanguard FTSE All-World UCITS ETF (Acc)",c:"ETF/Fund"},
  {t:"VWRL.AS",n:"Vanguard FTSE All-World UCITS ETF (Dist)",c:"ETF/Fund"},
  {t:"IWDA.AS",n:"iShares Core MSCI World UCITS ETF",c:"ETF/Fund"},
  {t:"CSPX.AS",n:"iShares Core S&P 500 UCITS ETF",c:"ETF/Fund"},
  {t:"IUSA.AS",n:"iShares Core S&P 500 UCITS ETF (Dist)",c:"ETF/Fund"},
  {t:"CNDX.AS",n:"iShares Nasdaq-100 UCITS ETF",c:"ETF/Fund"},
  {t:"EQQQ.DE",n:"Invesco Nasdaq-100 UCITS ETF",c:"ETF/Fund"},
  {t:"EXXT.DE",n:"iShares Nasdaq-100 UCITS ETF (DE)",c:"ETF/Fund"},
  {t:"SPYD.DE",n:"SPDR S&P 500 UCITS ETF",c:"ETF/Fund"},
  {t:"SPPW.DE",n:"SPDR MSCI World UCITS ETF",c:"ETF/Fund"},
  {t:"SPYW.DE",n:"SPDR S&P Euro Dividend Aristocrats",c:"ETF/Fund"},
  {t:"MEUD.PA",n:"Amundi MSCI Europe UCITS ETF",c:"ETF/Fund"},
  {t:"AMEW.PA",n:"Amundi MSCI World UCITS ETF",c:"ETF/Fund"},
  {t:"LCUW.PA",n:"Amundi S&P 500 UCITS ETF (Acc)",c:"ETF/Fund"},
  {t:"IEMA.AS",n:"iShares Core MSCI EM IMI UCITS ETF",c:"ETF/Fund"},
  {t:"EMIM.AS",n:"iShares Core MSCI EM IMI UCITS ETF (Acc)",c:"ETF/Fund"},
  {t:"IS3N.DE",n:"iShares Core MSCI EM IMI UCITS ETF (DE)",c:"ETF/Fund"},
  {t:"XMME.DE",n:"Xtrackers MSCI Emerging Markets Swap",c:"ETF/Fund"},
  {t:"XEON.DE",n:"Xtrackers EUR Overnight Rate Swap ETF",c:"ETF/Fund"},
  {t:"EXW1.DE",n:"iShares Core MSCI World UCITS ETF (EUR)",c:"ETF/Fund"},
  {t:"EUNM.DE",n:"iShares Edge MSCI World Minimum Vol",c:"ETF/Fund"},
  {t:"SXRV.DE",n:"iShares Core MSCI EM IMI UCITS ETF",c:"ETF/Fund"},
  {t:"ZPRX.DE",n:"SPDR MSCI Europe Small Cap Value",c:"ETF/Fund"},
  {t:"IQQQ.DE",n:"iShares Nasdaq-100 UCITS ETF (DE)",c:"ETF/Fund"},
  {t:"EXH1.DE",n:"iShares eb.rexx Government Germany ETF",c:"ETF/Fund"},
  {t:"IBCI.AS",n:"iShares € Inflation Linked Govt Bond ETF",c:"ETF/Fund"},
  {t:"AGGH.AS",n:"iShares Core Global Aggregate Bond ETF",c:"ETF/Fund"},
  {t:"VGEA.AS",n:"Vanguard EUR Eurozone Government Bond ETF",c:"ETF/Fund"},
  // ── Popular bare-ticker ETFs (London/LSE & US listings, no exchange suffix after XTB strip) ──
  {t:"SWDA",n:"iShares Core MSCI World UCITS ETF",c:"ETF/Fund"},
  {t:"AGGU",n:"iShares Core Global Aggregate Bond UCITS ETF",c:"ETF/Fund"},
  {t:"VEUR",n:"Vanguard FTSE Developed Europe UCITS ETF",c:"ETF/Fund"},
  {t:"VHYL",n:"Vanguard FTSE All-World High Dividend Yield ETF",c:"ETF/Fund"},
  {t:"VFEM",n:"Vanguard FTSE Emerging Markets UCITS ETF",c:"ETF/Fund"},
  {t:"HMWO",n:"HSBC MSCI World UCITS ETF",c:"ETF/Fund"},
  {t:"VMID",n:"Vanguard FTSE 250 UCITS ETF",c:"ETF/Fund"},
  {t:"VUKE",n:"Vanguard FTSE 100 UCITS ETF",c:"ETF/Fund"},
  {t:"IGLN",n:"iShares Physical Gold ETC",c:"ETF/Fund"},
  {t:"SGLN",n:"iShares Physical Gold ETC (EUR Hdg)",c:"ETF/Fund"},
  {t:"PHGP",n:"Invesco Physical Gold ETC",c:"ETF/Fund"},
  {t:"PHAG",n:"Invesco Physical Silver ETC",c:"ETF/Fund"},
  {t:"IBGL",n:"iShares Global Govt Bond UCITS ETF",c:"ETF/Fund"},
  {t:"SAGG",n:"iShares Core Global Agg Bond (GBP Hdg)",c:"ETF/Fund"},
  {t:"IEAG",n:"iShares Core Euro Aggregate Bond ETF",c:"ETF/Fund"},
  {t:"EMIM",n:"iShares Core MSCI EM IMI UCITS ETF",c:"ETF/Fund"},
  {t:"SMEA",n:"iShares MSCI Europe Small Cap UCITS ETF",c:"ETF/Fund"},
  {t:"WQIE",n:"iShares MSCI World Quality Factor ETF",c:"ETF/Fund"},
  {t:"IQQQ",n:"iShares Nasdaq-100 UCITS ETF",c:"ETF/Fund"},
  {t:"CNDX",n:"iShares Nasdaq-100 UCITS ETF (Acc)",c:"ETF/Fund"},
  {t:"IUSA",n:"iShares Core S&P 500 UCITS ETF (Dist)",c:"ETF/Fund"},
  {t:"VGOV",n:"Vanguard UK Government Bond UCITS ETF",c:"ETF/Fund"},
  // ── Popular US ETFs not yet in DB ──
  {t:"VOO",n:"Vanguard S&P 500 ETF",c:"ETF/Fund"},
  {t:"QQQM",n:"Invesco Nasdaq-100 ETF (smaller)",c:"ETF/Fund"},
  {t:"SPLG",n:"SPDR Portfolio S&P 500 ETF",c:"ETF/Fund"},
  {t:"SPDW",n:"SPDR Portfolio Developed World ex-US ETF",c:"ETF/Fund"},
  {t:"SPEM",n:"SPDR Portfolio Emerging Markets ETF",c:"ETF/Fund"},
  {t:"SPYD",n:"SPDR Portfolio S&P 500 High Dividend ETF",c:"ETF/Fund"},
  {t:"SPAB",n:"SPDR Portfolio Aggregate Bond ETF",c:"ETF/Fund"},
  {t:"SPTL",n:"SPDR Portfolio Long Term Treasury ETF",c:"ETF/Fund"},
  {t:"SPPW",n:"SPDR MSCI World UCITS ETF",c:"ETF/Fund"},
  {t:"SCHD",n:"Schwab US Dividend Equity ETF",c:"ETF/Fund"},
  {t:"SCHB",n:"Schwab US Broad Market ETF",c:"ETF/Fund"},
  {t:"SCHF",n:"Schwab International Equity ETF",c:"ETF/Fund"},
  {t:"SCHE",n:"Schwab Emerging Markets Equity ETF",c:"ETF/Fund"},
  {t:"JEPI",n:"JPMorgan Equity Premium Income ETF",c:"ETF/Fund"},
  {t:"JEPQ",n:"JPMorgan Nasdaq Equity Premium Income ETF",c:"ETF/Fund"},
  {t:"GLDM",n:"SPDR Gold MiniShares",c:"ETF/Fund"},
  {t:"SGOL",n:"abrdn Physical Gold Shares ETF",c:"ETF/Fund"},
  {t:"OUNZ",n:"VanEck Merk Gold ETF",c:"ETF/Fund"},
  {t:"BNDX",n:"Vanguard Total International Bond ETF",c:"ETF/Fund"},
  {t:"BNDW",n:"Vanguard Total World Bond ETF",c:"ETF/Fund"},
  {t:"VIG",n:"Vanguard Dividend Appreciation ETF",c:"ETF/Fund"},
  {t:"VYM",n:"Vanguard High Dividend Yield ETF",c:"ETF/Fund"},
  {t:"VGT",n:"Vanguard Information Technology ETF",c:"ETF/Fund"},
  {t:"VHT",n:"Vanguard Health Care ETF",c:"ETF/Fund"},
  {t:"VFH",n:"Vanguard Financials ETF",c:"ETF/Fund"},
  {t:"VDE",n:"Vanguard Energy ETF",c:"ETF/Fund"},
  {t:"VPU",n:"Vanguard Utilities ETF",c:"ETF/Fund"},
  {t:"VDC",n:"Vanguard Consumer Staples ETF",c:"ETF/Fund"},
  {t:"VCR",n:"Vanguard Consumer Discretionary ETF",c:"ETF/Fund"},
  {t:"VIS",n:"Vanguard Industrials ETF",c:"ETF/Fund"},
  {t:"VAW",n:"Vanguard Materials ETF",c:"ETF/Fund"},
  {t:"VXUS",n:"Vanguard Total International Stock ETF",c:"ETF/Fund"},
  {t:"VEU",n:"Vanguard FTSE All-World ex-US ETF",c:"ETF/Fund"},
  {t:"VB",n:"Vanguard Small-Cap ETF",c:"ETF/Fund"},
  {t:"VO",n:"Vanguard Mid-Cap ETF",c:"ETF/Fund"},
  {t:"VV",n:"Vanguard Large-Cap ETF",c:"ETF/Fund"},
  {t:"VUG",n:"Vanguard Growth ETF",c:"ETF/Fund"},
  {t:"VTV",n:"Vanguard Value ETF",c:"ETF/Fund"},
  {t:"VSS",n:"Vanguard FTSE All-World ex-US Small-Cap ETF",c:"ETF/Fund"},
  {t:"VCIT",n:"Vanguard Intermediate-Term Corporate Bond ETF",c:"ETF/Fund"},
  {t:"VCLT",n:"Vanguard Long-Term Corporate Bond ETF",c:"ETF/Fund"},
  {t:"VCSH",n:"Vanguard Short-Term Corporate Bond ETF",c:"ETF/Fund"},
  {t:"VGIT",n:"Vanguard Intermediate-Term Treasury ETF",c:"ETF/Fund"},
  {t:"VGLT",n:"Vanguard Long-Term Treasury ETF",c:"ETF/Fund"},
  {t:"VTIP",n:"Vanguard Short-Term Inflation-Protected Securities ETF",c:"ETF/Fund"},
  {t:"VTEB",n:"Vanguard Tax-Exempt Bond ETF",c:"ETF/Fund"},
  {t:"IAGG",n:"iShares Core International Aggregate Bond ETF",c:"ETF/Fund"},
  {t:"IGSB",n:"iShares Short-Term Corporate Bond ETF",c:"ETF/Fund"},
  {t:"LQD",n:"iShares iBoxx $ Investment Grade Corporate Bond ETF",c:"ETF/Fund"},
  {t:"EMB",n:"iShares JP Morgan USD Emerging Markets Bond ETF",c:"ETF/Fund"},
  {t:"IEMG",n:"iShares Core MSCI Emerging Markets ETF",c:"ETF/Fund"},
  // ── Crypto ──
  {t:"BTC-USD",n:"Bitcoin",c:"Crypto"},{t:"ETH-USD",n:"Ethereum",c:"Crypto"},
  {t:"BNB-USD",n:"BNB (Binance Coin)",c:"Crypto"},{t:"SOL-USD",n:"Solana",c:"Crypto"},
  {t:"XRP-USD",n:"XRP (Ripple)",c:"Crypto"},{t:"ADA-USD",n:"Cardano",c:"Crypto"},
  {t:"AVAX-USD",n:"Avalanche",c:"Crypto"},{t:"DOT-USD",n:"Polkadot",c:"Crypto"},
  {t:"MATIC-USD",n:"Polygon",c:"Crypto"},{t:"LINK-USD",n:"Chainlink",c:"Crypto"},
  {t:"BTC",n:"Bitcoin",c:"Crypto"},{t:"ETH",n:"Ethereum",c:"Crypto"},{t:"BNB",n:"BNB (Binance Coin)",c:"Crypto"},
  {t:"SOL",n:"Solana",c:"Crypto"},{t:"XRP",n:"XRP (Ripple)",c:"Crypto"},{t:"ADA",n:"Cardano",c:"Crypto"},
  {t:"AVAX",n:"Avalanche",c:"Crypto"},{t:"DOT",n:"Polkadot",c:"Crypto"},{t:"MATIC",n:"Polygon",c:"Crypto"},{t:"LINK",n:"Chainlink",c:"Crypto"},
];

// ── Asset-class resolver ───────────────────────────────────────────────────────
// Used by the XTB importer and the one-time retroactive migration.
// Priority: TICKER_DB lookup → crypto patterns → ETF patterns → default 'Stock'.
function guessAssetClass(ticker) {
  // 1. TICKER_DB — exact match is fastest and most accurate
  const db = TICKER_DB.find(x => x.t === ticker);
  if (db) return db.c;

  // 1b. Exchange-suffix tolerance.
  //     XTB and other brokers sometimes store tickers with or without a trailing
  //     exchange code (e.g. "SXR8" vs "SXR8.DE", "IWDA" vs "IWDA.AS").
  //     If the exact lookup missed, we try:
  //       • ticker has suffix  → strip it, find any DB entry with the same bare code
  //       • ticker has no suffix → find any DB entry that starts with "TICKER."
  const dotIdx = ticker.lastIndexOf('.');
  if (dotIdx > 0) {
    // Has suffix (e.g. "SXR8.FR" → bare "SXR8") — find first DB entry sharing bare code
    const bare = ticker.slice(0, dotIdx);
    const dbBare = TICKER_DB.find(x => x.t === bare || x.t.startsWith(bare + '.'));
    if (dbBare) return dbBare.c;
  } else {
    // No suffix (e.g. "SXR8") — find first DB entry like "SXR8.DE"
    const dbSuffixed = TICKER_DB.find(x => x.t.startsWith(ticker + '.'));
    if (dbSuffixed) return dbSuffixed.c;
  }

  // 2. Crypto bare tickers (XTB sometimes strips the "-USD" suffix)
  if (/^(BTC|ETH|XRP|SOL|BNB|ADA|DOT|LINK|LTC|XLM|DOGE|AVAX|MATIC|SHIB|TRX|UNI|ATOM|ETC|ALGO|VET|HBAR|EOS|AAVE|MKR|COMP)$/i.test(ticker))
    return 'Crypto';

  // 3. ETF patterns — only unambiguous naming conventions to avoid false positives
  // Sector SPDR ETFs: XLK, XLF, XLE, XLV, XLI, XLP, XLU, XLY, XLC, XLRE
  if (/^XL[A-Z]$/.test(ticker)) return 'ETF/Fund';
  // Xtrackers 4-letter codes: XDWD, XMME, XGLE, XEON, XBZW … (XOM/XEL/XPO are stocks)
  if (/^X[A-Z]{3}[0-9]?$/.test(ticker) && !/^(XOM|XEL|XPO|XRX)$/.test(ticker)) return 'ETF/Fund';
  // Invesco EQQQ variants and Amundi 4-letter codes
  if (/^(EQQQ|LCUW|LCWD|LCWL|PAAS|PANX|PANU|PBEE|PBUS|PHEM)$/.test(ticker)) return 'ETF/Fund';
  // Miscellaneous well-known ETFs the DB might not cover
  const EXTRA = new Set([
    'SWDA','AGGU','SGLN','IGLN','PHGP','PHAG','VEUR','VFEM','VHYL','VWRL','VUKE',
    'HMWO','IBGL','SAGG','IEAG','EMIM','SMEA','WQIE','IQQQ','CNDX','IUSA',
    'QQQM','SPLG','SPDW','SPEM','SPYD','SPAB','SPTL','SPPW','GLDM','SGOL','OUNZ',
    'JEPI','JEPQ','SCHD','SCHB','SCHF','SCHE','BNDX','BNDW','IAGG','LQD','EMB','IEMG',
  ]);
  if (EXTRA.has(ticker)) return 'ETF/Fund';

  return 'Stock';
}

// Static sector map — used immediately on add; updated by Yahoo Finance fetch on price refresh
const SECTOR_DB = {
  // Technology
  'AAPL':'Technology','MSFT':'Technology','NVDA':'Technology','AMD':'Technology',
  'INTC':'Technology','QCOM':'Technology','AVGO':'Technology','TXN':'Technology',
  'AMAT':'Technology','KLAC':'Technology','LRCX':'Technology','MU':'Technology',
  'ADBE':'Technology','CRM':'Technology','ORCL':'Technology','NOW':'Technology',
  'PANW':'Technology','CRWD':'Technology','SNOW':'Technology','DDOG':'Technology',
  'ZS':'Technology','NET':'Technology','INTU':'Technology','IBM':'Technology',
  'CSCO':'Technology','PLTR':'Technology','TTD':'Technology','ASML':'Technology',
  'SAP':'Technology','SAP.DE':'Technology',
  // Communication Services
  'GOOGL':'Communication Services','GOOG':'Communication Services',
  'META':'Communication Services','NFLX':'Communication Services',
  'DIS':'Communication Services','T':'Communication Services',
  'VZ':'Communication Services','SPOT':'Communication Services',
  'NTES':'Communication Services','BILI':'Communication Services',
  'VOD.L':'Communication Services','DTE.DE':'Communication Services',
  'NOS.LS':'Communication Services',
  // Consumer Cyclical
  'AMZN':'Consumer Cyclical','TSLA':'Consumer Cyclical','MCD':'Consumer Cyclical',
  'SBUX':'Consumer Cyclical','HD':'Consumer Cyclical','LOW':'Consumer Cyclical',
  'SHOP':'Consumer Cyclical','UBER':'Consumer Cyclical','ABNB':'Consumer Cyclical',
  'NIO':'Consumer Cyclical','XPEV':'Consumer Cyclical','LI':'Consumer Cyclical',
  'BABA':'Consumer Cyclical','JD':'Consumer Cyclical','PDD':'Consumer Cyclical',
  'MC.PA':'Consumer Cyclical','STLAM.MI':'Consumer Cyclical',
  'BMW.DE':'Consumer Cyclical','MBG.DE':'Consumer Cyclical',
  'VOW3.DE':'Consumer Cyclical','ADS.DE':'Consumer Cyclical',
  'ITX.MC':'Consumer Cyclical','EDU':'Consumer Cyclical',
  // Financial Services
  'JPM':'Financial Services','BAC':'Financial Services','WFC':'Financial Services',
  'GS':'Financial Services','MS':'Financial Services','BLK':'Financial Services',
  'V':'Financial Services','MA':'Financial Services','AXP':'Financial Services',
  'PYPL':'Financial Services','SQ':'Financial Services','COIN':'Financial Services',
  'C':'Financial Services','USB':'Financial Services','SCHW':'Financial Services',
  'SPGI':'Financial Services','MCO':'Financial Services',
  'ALV.DE':'Financial Services','BNP.PA':'Financial Services',
  'DBK.DE':'Financial Services','BARC.L':'Financial Services',
  'LLOY.L':'Financial Services','BBVA.MC':'Financial Services',
  'SAN.MC':'Financial Services','BCP.LS':'Financial Services',
  'ISP.MI':'Financial Services',
  // Healthcare
  'JNJ':'Healthcare','PFE':'Healthcare','MRK':'Healthcare','ABBV':'Healthcare',
  'LLY':'Healthcare','AMGN':'Healthcare','GILD':'Healthcare','REGN':'Healthcare',
  'ZTS':'Healthcare','TMO':'Healthcare','SYK':'Healthcare','HCA':'Healthcare',
  'UNH':'Healthcare','ELV':'Healthcare','CI':'Healthcare','ISRG':'Healthcare',
  'AZN.L':'Healthcare','GSK.L':'Healthcare','NOVN':'Healthcare','ROG':'Healthcare',
  'BAYN.DE':'Healthcare','SAN.PA':'Healthcare',
  // Energy
  'XOM':'Energy','CVX':'Energy','TTE.PA':'Energy','BP.L':'Energy',
  'SHEL.L':'Energy','ENI.MI':'Energy','GALP.LS':'Energy',
  // Consumer Defensive
  'PG':'Consumer Defensive','KO':'Consumer Defensive','PEP':'Consumer Defensive',
  'PM':'Consumer Defensive','MO':'Consumer Defensive','MDLZ':'Consumer Defensive',
  'WMT':'Consumer Defensive','COST':'Consumer Defensive',
  'NESN':'Consumer Defensive','ULVR.L':'Consumer Defensive',
  'OR.PA':'Consumer Defensive','JMT.LS':'Consumer Defensive','SON.LS':'Consumer Defensive',
  // Industrials
  'GE':'Industrials','CAT':'Industrials','DE':'Industrials','BA':'Industrials',
  'RTX':'Industrials','UPS':'Industrials','HON':'Industrials','MMM':'Industrials',
  'ACN':'Industrials','SIE.DE':'Industrials','AIR.PA':'Industrials',
  // Basic Materials
  'LIN':'Basic Materials','BAS.DE':'Basic Materials','RIO.L':'Basic Materials',
  // Utilities
  'NEE':'Utilities','SO':'Utilities','ENEL.MI':'Utilities',
  'IBE.MC':'Utilities','EDP.LS':'Utilities','EDP':'Utilities',
  'REN.LS':'Utilities','EDP-R.LS':'Utilities',
  // Real Estate
  'VNQ':'Real Estate','O':'Real Estate','AMT':'Real Estate',
  // Communication Services (Chinese tech)
  'BIDU':'Communication Services',
  'TCOM':'Consumer Cyclical',
  // Storage & networking hardware
  'WDC':'Technology','SNDK':'Technology','STX':'Technology','NTAP':'Technology','PSTG':'Technology',
  'CIEN':'Technology','LITE':'Technology','VIAV':'Technology','INFN':'Technology','CALX':'Technology',
  'JNPR':'Technology','FFIV':'Technology','NTGR':'Technology','COMM':'Technology',
  // Semiconductors (additional)
  'MRVL':'Technology','ON':'Technology','SWKS':'Technology','MPWR':'Technology',
  'ENTG':'Technology','ACLS':'Technology','FORM':'Technology',
  'TER':'Technology','ONTO':'Technology','MKSI':'Technology','CRUS':'Technology',
  // Software & cloud (additional)
  'TEAM':'Technology','HUBS':'Technology','BILL':'Technology','MDB':'Technology',
  'ESTC':'Technology','PD':'Technology','GTLB':'Technology','CFLT':'Technology',
  'ZI':'Technology','SMAR':'Technology','APPN':'Technology','PCTY':'Technology',
  // Fintech (additional)
  'AFRM':'Financial Services','UPST':'Financial Services','LC':'Financial Services',
  // Healthcare (additional)
  'DXCM':'Healthcare','PODD':'Healthcare','INSP':'Healthcare','NVCR':'Healthcare',
  'RXRX':'Healthcare','ARRY':'Healthcare','FATE':'Healthcare',
  // Consumer (additional)
  'RIVN':'Consumer Cyclical','LCID':'Consumer Cyclical','FSR':'Consumer Cyclical',
  'PTON':'Consumer Cyclical','W':'Consumer Cyclical','ETSY':'Consumer Cyclical',
  'CHWY':'Consumer Defensive','FWRG':'Consumer Defensive',
  // Industrials (additional)
  'TDG':'Industrials','HWM':'Industrials','CARR':'Industrials','OTIS':'Industrials',
  'ROK':'Industrials','EMR':'Industrials','PH':'Industrials','ITW':'Industrials',
  // Broader tech / semiconductor
  'ARM':'Technology','SMCI':'Technology','WOLF':'Technology',
  // ETF special — keep as asset class
  'SXR8':'ETF / Index','SXR8.DE':'ETF / Index',
  'IWDA':'ETF / Index','VWCE':'ETF / Index','CSPX':'ETF / Index',
  'SPY':'ETF / Index','QQQ':'ETF / Index','IWM':'ETF / Index',
  'VTI':'ETF / Index','VEA':'ETF / Index','VWO':'ETF / Index',
  'GLD':'ETF / Index','AGG':'ETF / Index','BND':'ETF / Index',
  'EXS1.DE':'ETF / Index',
};


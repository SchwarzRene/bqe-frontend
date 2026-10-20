// Stack — S&P 500 universe: a bundled snapshot of the index members.
// Classic script: shares one global scope with the other files in js/, so the
// load order in index.html matters.
"use strict";

/* ============================================================
   1. Universe — a bundled snapshot of S&P 500 members.
   Edit this list freely; the app reads nothing else.
   ============================================================ */
const RAW = `
AAPL|Apple|Information Technology
MSFT|Microsoft|Information Technology
NVDA|NVIDIA|Information Technology
AVGO|Broadcom|Information Technology
ORCL|Oracle|Information Technology
CRM|Salesforce|Information Technology
AMD|Advanced Micro Devices|Information Technology
ADBE|Adobe|Information Technology
ACN|Accenture|Information Technology
CSCO|Cisco Systems|Information Technology
NOW|ServiceNow|Information Technology
INTU|Intuit|Information Technology
IBM|IBM|Information Technology
QCOM|Qualcomm|Information Technology
TXN|Texas Instruments|Information Technology
AMAT|Applied Materials|Information Technology
MU|Micron Technology|Information Technology
LRCX|Lam Research|Information Technology
KLAC|KLA|Information Technology
ADI|Analog Devices|Information Technology
INTC|Intel|Information Technology
PANW|Palo Alto Networks|Information Technology
SNPS|Synopsys|Information Technology
CDNS|Cadence Design Systems|Information Technology
ANET|Arista Networks|Information Technology
CRWD|CrowdStrike|Information Technology
PLTR|Palantir Technologies|Information Technology
MSI|Motorola Solutions|Information Technology
ROP|Roper Technologies|Information Technology
APH|Amphenol|Information Technology
NXPI|NXP Semiconductors|Information Technology
MCHP|Microchip Technology|Information Technology
FTNT|Fortinet|Information Technology
MPWR|Monolithic Power Systems|Information Technology
TEL|TE Connectivity|Information Technology
GLW|Corning|Information Technology
ON|ON Semiconductor|Information Technology
TER|Teradyne|Information Technology
KEYS|Keysight Technologies|Information Technology
ZBRA|Zebra Technologies|Information Technology
HPQ|HP|Information Technology
DELL|Dell Technologies|Information Technology
WDC|Western Digital|Information Technology
STX|Seagate Technology|Information Technology
SMCI|Super Micro Computer|Information Technology
CTSH|Cognizant Technology|Information Technology
IT|Gartner|Information Technology
FICO|Fair Isaac|Information Technology
AKAM|Akamai Technologies|Information Technology
GDDY|GoDaddy|Information Technology
GOOGL|Alphabet|Communication Services
META|Meta Platforms|Communication Services
NFLX|Netflix|Communication Services
DIS|Walt Disney|Communication Services
CMCSA|Comcast|Communication Services
TMUS|T-Mobile US|Communication Services
VZ|Verizon Communications|Communication Services
T|AT&T|Communication Services
CHTR|Charter Communications|Communication Services
EA|Electronic Arts|Communication Services
TTWO|Take-Two Interactive|Communication Services
WBD|Warner Bros. Discovery|Communication Services
OMC|Omnicom Group|Communication Services
IPG|Interpublic Group|Communication Services
LYV|Live Nation Entertainment|Communication Services
FOXA|Fox|Communication Services
NWSA|News Corp|Communication Services
MTCH|Match Group|Communication Services
AMZN|Amazon|Consumer Discretionary
TSLA|Tesla|Consumer Discretionary
HD|Home Depot|Consumer Discretionary
MCD|McDonald's|Consumer Discretionary
BKNG|Booking Holdings|Consumer Discretionary
LOW|Lowe's|Consumer Discretionary
NKE|Nike|Consumer Discretionary
SBUX|Starbucks|Consumer Discretionary
TJX|TJX Companies|Consumer Discretionary
ORLY|O'Reilly Automotive|Consumer Discretionary
AZO|AutoZone|Consumer Discretionary
CMG|Chipotle Mexican Grill|Consumer Discretionary
MAR|Marriott International|Consumer Discretionary
HLT|Hilton Worldwide|Consumer Discretionary
ABNB|Airbnb|Consumer Discretionary
GM|General Motors|Consumer Discretionary
F|Ford Motor|Consumer Discretionary
ROST|Ross Stores|Consumer Discretionary
YUM|Yum! Brands|Consumer Discretionary
DHI|D.R. Horton|Consumer Discretionary
LEN|Lennar|Consumer Discretionary
NVR|NVR|Consumer Discretionary
PHM|PulteGroup|Consumer Discretionary
EBAY|eBay|Consumer Discretionary
DPZ|Domino's Pizza|Consumer Discretionary
LVS|Las Vegas Sands|Consumer Discretionary
RCL|Royal Caribbean|Consumer Discretionary
CCL|Carnival|Consumer Discretionary
DRI|Darden Restaurants|Consumer Discretionary
ULTA|Ulta Beauty|Consumer Discretionary
BBY|Best Buy|Consumer Discretionary
APTV|Aptiv|Consumer Discretionary
LKQ|LKQ|Consumer Discretionary
WMT|Walmart|Consumer Staples
COST|Costco Wholesale|Consumer Staples
PG|Procter & Gamble|Consumer Staples
KO|Coca-Cola|Consumer Staples
PEP|PepsiCo|Consumer Staples
PM|Philip Morris International|Consumer Staples
MO|Altria Group|Consumer Staples
MDLZ|Mondelez International|Consumer Staples
CL|Colgate-Palmolive|Consumer Staples
KMB|Kimberly-Clark|Consumer Staples
GIS|General Mills|Consumer Staples
KHC|Kraft Heinz|Consumer Staples
STZ|Constellation Brands|Consumer Staples
SYY|Sysco|Consumer Staples
KR|Kroger|Consumer Staples
HSY|Hershey|Consumer Staples
K|Kellanova|Consumer Staples
CHD|Church & Dwight|Consumer Staples
MNST|Monster Beverage|Consumer Staples
KDP|Keurig Dr Pepper|Consumer Staples
TGT|Target|Consumer Staples
DG|Dollar General|Consumer Staples
DLTR|Dollar Tree|Consumer Staples
TSN|Tyson Foods|Consumer Staples
CAG|Conagra Brands|Consumer Staples
EL|Estee Lauder|Consumer Staples
ADM|Archer-Daniels-Midland|Consumer Staples
LLY|Eli Lilly|Health Care
UNH|UnitedHealth Group|Health Care
JNJ|Johnson & Johnson|Health Care
ABBV|AbbVie|Health Care
MRK|Merck|Health Care
TMO|Thermo Fisher Scientific|Health Care
ABT|Abbott Laboratories|Health Care
PFE|Pfizer|Health Care
DHR|Danaher|Health Care
AMGN|Amgen|Health Care
ISRG|Intuitive Surgical|Health Care
BMY|Bristol-Myers Squibb|Health Care
GILD|Gilead Sciences|Health Care
VRTX|Vertex Pharmaceuticals|Health Care
REGN|Regeneron Pharmaceuticals|Health Care
CVS|CVS Health|Health Care
MDT|Medtronic|Health Care
ELV|Elevance Health|Health Care
CI|Cigna Group|Health Care
SYK|Stryker|Health Care
BSX|Boston Scientific|Health Care
ZTS|Zoetis|Health Care
HCA|HCA Healthcare|Health Care
MCK|McKesson|Health Care
COR|Cencora|Health Care
BDX|Becton Dickinson|Health Care
EW|Edwards Lifesciences|Health Care
IQV|IQVIA Holdings|Health Care
A|Agilent Technologies|Health Care
IDXX|IDEXX Laboratories|Health Care
DXCM|DexCom|Health Care
MRNA|Moderna|Health Care
BIIB|Biogen|Health Care
CNC|Centene|Health Care
MOH|Molina Healthcare|Health Care
WST|West Pharmaceutical|Health Care
RMD|ResMed|Health Care
ZBH|Zimmer Biomet|Health Care
BAX|Baxter International|Health Care
HOLX|Hologic|Health Care
BRK.B|Berkshire Hathaway|Financials
JPM|JPMorgan Chase|Financials
V|Visa|Financials
MA|Mastercard|Financials
BAC|Bank of America|Financials
WFC|Wells Fargo|Financials
GS|Goldman Sachs|Financials
MS|Morgan Stanley|Financials
C|Citigroup|Financials
SCHW|Charles Schwab|Financials
BLK|BlackRock|Financials
SPGI|S&P Global|Financials
AXP|American Express|Financials
PGR|Progressive|Financials
CB|Chubb|Financials
MMC|Marsh & McLennan|Financials
AON|Aon|Financials
ICE|Intercontinental Exchange|Financials
CME|CME Group|Financials
MCO|Moody's|Financials
USB|U.S. Bancorp|Financials
PNC|PNC Financial Services|Financials
TFC|Truist Financial|Financials
COF|Capital One Financial|Financials
BK|Bank of New York Mellon|Financials
STT|State Street|Financials
AIG|American International Group|Financials
MET|MetLife|Financials
PRU|Prudential Financial|Financials
ALL|Allstate|Financials
TRV|Travelers|Financials
AFL|Aflac|Financials
DFS|Discover Financial Services|Financials
FI|Fiserv|Financials
FIS|Fidelity National Information|Financials
GPN|Global Payments|Financials
PYPL|PayPal Holdings|Financials
NDAQ|Nasdaq|Financials
AMP|Ameriprise Financial|Financials
HIG|Hartford Financial|Financials
WTW|Willis Towers Watson|Financials
GE|GE Aerospace|Industrials
CAT|Caterpillar|Industrials
RTX|RTX|Industrials
HON|Honeywell International|Industrials
UNP|Union Pacific|Industrials
BA|Boeing|Industrials
DE|Deere|Industrials
LMT|Lockheed Martin|Industrials
UPS|United Parcel Service|Industrials
ETN|Eaton|Industrials
NOC|Northrop Grumman|Industrials
GD|General Dynamics|Industrials
MMM|3M|Industrials
EMR|Emerson Electric|Industrials
ITW|Illinois Tool Works|Industrials
PH|Parker Hannifin|Industrials
CSX|CSX|Industrials
NSC|Norfolk Southern|Industrials
FDX|FedEx|Industrials
WM|Waste Management|Industrials
RSG|Republic Services|Industrials
CARR|Carrier Global|Industrials
JCI|Johnson Controls|Industrials
TT|Trane Technologies|Industrials
CMI|Cummins|Industrials
PCAR|PACCAR|Industrials
LHX|L3Harris Technologies|Industrials
TDG|TransDigm Group|Industrials
URI|United Rentals|Industrials
FAST|Fastenal|Industrials
GWW|W.W. Grainger|Industrials
ROK|Rockwell Automation|Industrials
DOV|Dover|Industrials
IR|Ingersoll Rand|Industrials
OTIS|Otis Worldwide|Industrials
PWR|Quanta Services|Industrials
AME|Ametek|Industrials
XYL|Xylem|Industrials
SWK|Stanley Black & Decker|Industrials
DAL|Delta Air Lines|Industrials
UAL|United Airlines|Industrials
LUV|Southwest Airlines|Industrials
ODFL|Old Dominion Freight Line|Industrials
EFX|Equifax|Industrials
VRSK|Verisk Analytics|Industrials
ADP|Automatic Data Processing|Industrials
PAYX|Paychex|Industrials
CTAS|Cintas|Industrials
XOM|Exxon Mobil|Energy
CVX|Chevron|Energy
COP|ConocoPhillips|Energy
EOG|EOG Resources|Energy
SLB|SLB|Energy
PSX|Phillips 66|Energy
MPC|Marathon Petroleum|Energy
VLO|Valero Energy|Energy
OXY|Occidental Petroleum|Energy
WMB|Williams|Energy
KMI|Kinder Morgan|Energy
OKE|ONEOK|Energy
HAL|Halliburton|Energy
BKR|Baker Hughes|Energy
DVN|Devon Energy|Energy
FANG|Diamondback Energy|Energy
HES|Hess|Energy
TRGP|Targa Resources|Energy
CTRA|Coterra Energy|Energy
EQT|EQT|Energy
NEE|NextEra Energy|Utilities
SO|Southern|Utilities
DUK|Duke Energy|Utilities
CEG|Constellation Energy|Utilities
D|Dominion Energy|Utilities
AEP|American Electric Power|Utilities
SRE|Sempra|Utilities
EXC|Exelon|Utilities
XEL|Xcel Energy|Utilities
ED|Consolidated Edison|Utilities
PEG|Public Service Enterprise|Utilities
VST|Vistra|Utilities
WEC|WEC Energy Group|Utilities
ES|Eversource Energy|Utilities
AWK|American Water Works|Utilities
DTE|DTE Energy|Utilities
PPL|PPL|Utilities
AEE|Ameren|Utilities
CMS|CMS Energy|Utilities
FE|FirstEnergy|Utilities
ETR|Entergy|Utilities
ATO|Atmos Energy|Utilities
NRG|NRG Energy|Utilities
LIN|Linde|Materials
SHW|Sherwin-Williams|Materials
APD|Air Products & Chemicals|Materials
ECL|Ecolab|Materials
FCX|Freeport-McMoRan|Materials
NEM|Newmont|Materials
DOW|Dow|Materials
DD|DuPont de Nemours|Materials
PPG|PPG Industries|Materials
NUE|Nucor|Materials
STLD|Steel Dynamics|Materials
VMC|Vulcan Materials|Materials
MLM|Martin Marietta Materials|Materials
IFF|International Flavors|Materials
LYB|LyondellBasell|Materials
ALB|Albemarle|Materials
CF|CF Industries|Materials
MOS|Mosaic|Materials
PKG|Packaging Corp of America|Materials
IP|International Paper|Materials
AMCR|Amcor|Materials
BALL|Ball|Materials
PLD|Prologis|Real Estate
AMT|American Tower|Real Estate
EQIX|Equinix|Real Estate
WELL|Welltower|Real Estate
CCI|Crown Castle|Real Estate
PSA|Public Storage|Real Estate
SPG|Simon Property Group|Real Estate
O|Realty Income|Real Estate
DLR|Digital Realty Trust|Real Estate
VICI|VICI Properties|Real Estate
AVB|AvalonBay Communities|Real Estate
EQR|Equity Residential|Real Estate
EXR|Extra Space Storage|Real Estate
IRM|Iron Mountain|Real Estate
MAA|Mid-America Apartment|Real Estate
ARE|Alexandria Real Estate|Real Estate
INVH|Invitation Homes|Real Estate
ESS|Essex Property Trust|Real Estate
KIM|Kimco Realty|Real Estate
UDR|UDR|Real Estate
HST|Host Hotels & Resorts|Real Estate
CPT|Camden Property Trust|Real Estate
BXP|BXP|Real Estate
REG|Regency Centers|Real Estate
`;

let UNIVERSE = RAW.trim().split("\n").map(l => {
  const p = l.split("|");
  return { sym: p[0], name: p[1], sector: p[2] };
});

// Hauptstädte durch die Geschichte. show: [vonJahr, bisJahr] = Sichtbarkeitszeitraum
// (wann diese Stadt Hauptstadt des genannten Staates war).
// wiki = deutscher Wikipedia-Artikel zur Stadt selbst.

const CAPITALS = [
  // ===== Antikes Ägypten & Nahost =====
  { lat: 29.84, lng: 31.25, name: "Memphis", state: "Altägyptisches Reich", show: [-3000, -1500], wiki: "Memphis (Ägypten)" },
  { lat: 25.70, lng: 32.64, name: "Theben", state: "Ägyptisches Neues Reich", show: [-1500, -700], wiki: "Theben (Ägypten)" },
  { lat: 32.54, lng: 44.42, name: "Babylon", state: "Babylonien", show: [-2000, -500], wiki: "Babylon" },
  { lat: 36.36, lng: 43.16, name: "Ninive", state: "Assyrisches Reich", show: [-1200, -600], wiki: "Ninive" },
  { lat: 29.93, lng: 52.89, name: "Persepolis", state: "Achämenidenreich (Persien)", show: [-500, -323], wiki: "Persepolis" },
  { lat: 37.98, lng: 23.73, name: "Athen", state: "Attischer Seebund / Griechenland", show: [-700, -323], wiki: "Athen" },
  { lat: 37.08, lng: 22.42, name: "Sparta", state: "Spartanischer Stadtstaat", show: [-700, -323], wiki: "Sparta" },
  { lat: 31.20, lng: 29.92, name: "Alexandria", state: "Ptolemäisches Ägypten", show: [-323, -30], wiki: "Alexandria" },

  // ===== Rom, Byzanz, frühes Mittelalter =====
  { lat: 41.89, lng: 12.48, name: "Rom", state: "Römisches Reich", show: [-500, 400], wiki: "Rom" },
  { lat: 41.01, lng: 28.98, name: "Konstantinopel", state: "Byzantinisches Reich", show: [330, 1453], wiki: "Konstantinopel" },
  { lat: 34.27, lng: 108.95, name: "Chang'an (Xi'an)", state: "Han- & Tang-Dynastie (China)", show: [-200, 900], wiki: "Xi’an" },
  { lat: 14.12, lng: 38.72, name: "Aksum", state: "Aksumitisches Reich", show: [100, 700], wiki: "Aksum" },
  { lat: 39.86, lng: -4.02, name: "Toledo", state: "Westgotenreich", show: [500, 750], wiki: "Toledo" },
  { lat: 50.78, lng: 6.08, name: "Aachen", state: "Frankenreich (Karl der Große)", show: [770, 900], wiki: "Aachen" },
  { lat: 50.45, lng: 30.52, name: "Kiew", state: "Kiewer Rus", show: [880, 1240], wiki: "Kiew" },
  { lat: 37.88, lng: -4.78, name: "Córdoba", state: "Kalifat von Córdoba", show: [750, 1030], wiki: "Córdoba" },
  { lat: 33.34, lng: 44.40, name: "Bagdad", state: "Abbasiden-Kalifat", show: [762, 1258], wiki: "Bagdad" },
  { lat: 30.04, lng: 31.24, name: "Kairo", state: "Fatimiden / Mamluken / Ägypten", show: [969, 2010], wiki: "Kairo" },

  // ===== Hoch- & Spätmittelalter =====
  { lat: 34.62, lng: 112.45, name: "Luoyang", state: "Östliche Han- & Wei-Dynastie (China)", show: [25, 500], wiki: "Luoyang" },
  { lat: 35.02, lng: 135.75, name: "Kyōto", state: "Japan (Heian-Zeit)", show: [794, 1868], wiki: "Kyōto" },
  { lat: 34.80, lng: 114.30, name: "Kaifeng", state: "Nördliche Song-Dynastie (China)", show: [960, 1127], wiki: "Kaifeng" },
  { lat: 30.27, lng: 120.15, name: "Hangzhou", state: "Südliche Song-Dynastie (China)", show: [1127, 1276], wiki: "Hangzhou" },
  { lat: 21.03, lng: 105.85, name: "Hanoi (Thăng Long)", state: "Đại Việt (Vietnam)", show: [1010, 1800], wiki: "Hanoi" },
  { lat: 16.77, lng: -3.01, name: "Timbuktu", state: "Malireich / Songhaireich", show: [1300, 1600], wiki: "Timbuktu" },
  { lat: -20.27, lng: 30.93, name: "Great Zimbabwe", state: "Simbabwe-Reich", show: [1100, 1450], wiki: "Great Zimbabwe" },
  { lat: -13.52, lng: -71.98, name: "Cusco", state: "Inkareich", show: [1200, 1533], wiki: "Cusco" },
  { lat: 19.43, lng: -99.13, name: "Tenochtitlán", state: "Aztekenreich", show: [1325, 1521], wiki: "Tenochtitlán" },
  { lat: 28.61, lng: 77.21, name: "Delhi", state: "Sultanat von Delhi / Mogulreich / Indien", show: [1206, 2010], wiki: "Delhi" },
  { lat: 37.57, lng: 126.98, name: "Hanseong (Seoul)", state: "Joseon-Dynastie (Korea)", show: [1394, 2010], wiki: "Seoul" },

  // ===== Frühe Neuzeit =====
  { lat: 32.06, lng: 118.78, name: "Nanjing", state: "Frühe Ming-Dynastie (China)", show: [1368, 1420], wiki: "Nanjing" },
  { lat: 39.90, lng: 116.40, name: "Peking", state: "Yuan-, Ming-, Qing-Dynastie / China", show: [1279, 2010], wiki: "Peking" },
  { lat: 27.18, lng: 78.02, name: "Agra", state: "Mogulreich (unter Akbar & Shah Jahan)", show: [1526, 1658], wiki: "Agra" },
  { lat: 32.65, lng: 51.67, name: "Isfahan", state: "Safawidenreich (Persien)", show: [1598, 1722], wiki: "Isfahan" },
  { lat: 40.42, lng: -3.70, name: "Madrid", state: "Spanien", show: [1561, 2010], wiki: "Madrid" },
  { lat: 38.72, lng: -9.14, name: "Lissabon", state: "Portugal", show: [1255, 2010], wiki: "Lissabon" },
  { lat: 51.51, lng: -0.13, name: "London", state: "England / Großbritannien", show: [900, 2010], wiki: "London" },
  { lat: 48.85, lng: 2.35, name: "Paris", state: "Frankreich", show: [900, 2010], wiki: "Paris" },
  { lat: 55.75, lng: 37.62, name: "Moskau", state: "Moskauer Reich / Russland", show: [1300, 1712], wiki: "Moskau" },
  { lat: 41.01, lng: 28.98, name: "Konstantinopel (Istanbul)", state: "Osmanisches Reich", show: [1453, 1922], wiki: "Istanbul" },
  { lat: 48.21, lng: 16.37, name: "Wien", state: "Habsburgermonarchie / Österreich", show: [1500, 2010], wiki: "Wien" },
  { lat: 35.68, lng: 139.65, name: "Edo (Tokio)", state: "Japan (Tokugawa-Shogunat)", show: [1603, 1868], wiki: "Tokio" },
  { lat: 13.75, lng: 100.50, name: "Bangkok", state: "Siam / Thailand", show: [1782, 2010], wiki: "Bangkok" },

  // ===== 18.–19. Jahrhundert =====
  { lat: 59.93, lng: 30.34, name: "Sankt Petersburg", state: "Russisches Kaiserreich", show: [1712, 1918], wiki: "Sankt Petersburg" },
  { lat: 39.95, lng: -75.16, name: "Philadelphia", state: "USA (provisorische Hauptstadt)", show: [1776, 1800], wiki: "Philadelphia" },
  { lat: 38.90, lng: -77.04, name: "Washington, D.C.", state: "Vereinigte Staaten", show: [1800, 2010], wiki: "Washington, D.C." },
  { lat: -22.91, lng: -43.17, name: "Rio de Janeiro", state: "Brasilien (Kaiserreich & frühe Republik)", show: [1763, 1960], wiki: "Rio de Janeiro" },
  { lat: 19.43, lng: -99.13, name: "Mexiko-Stadt", state: "Mexiko", show: [1821, 2010], wiki: "Mexiko-Stadt" },
  { lat: 52.52, lng: 13.40, name: "Berlin", state: "Preußen / Deutsches Reich / Deutschland", show: [1701, 2010], wiki: "Berlin" },
  { lat: 41.89, lng: 12.48, name: "Rom", state: "Königreich Italien / Italien", show: [1871, 2010], wiki: "Rom" },

  // ===== 20. Jahrhundert =====
  { lat: 55.75, lng: 37.62, name: "Moskau", state: "Sowjetunion / Russland", show: [1918, 2010], wiki: "Moskau" },
  { lat: 50.74, lng: 7.10, name: "Bonn", state: "Bundesrepublik Deutschland (West)", show: [1949, 1990], wiki: "Bonn" },
  { lat: -15.79, lng: -47.88, name: "Brasília", state: "Brasilien", show: [1960, 2010], wiki: "Brasília" },
  { lat: 39.90, lng: 32.85, name: "Ankara", state: "Türkei", show: [1923, 2010], wiki: "Ankara" },
  { lat: 28.61, lng: 77.21, name: "Neu-Delhi", state: "Britisch-Indien / Indien", show: [1911, 2010], wiki: "Neu-Delhi" },
  { lat: 37.98, lng: 23.73, name: "Athen", state: "Griechenland (modern)", show: [1834, 2010], wiki: "Athen" },
  { lat: 52.23, lng: 21.01, name: "Warschau", state: "Polen", show: [1596, 2010], wiki: "Warschau" },
  { lat: 59.33, lng: 18.07, name: "Stockholm", state: "Schweden", show: [1523, 2010], wiki: "Stockholm" },
  { lat: 55.68, lng: 12.57, name: "Kopenhagen", state: "Dänemark", show: [1400, 2010], wiki: "Kopenhagen" },
  { lat: 52.09, lng: 5.10, name: "Den Haag", state: "Niederlande (Regierungssitz)", show: [1580, 2010], wiki: "Den Haag" }
];

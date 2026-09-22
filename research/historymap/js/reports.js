// Kuratierte Länder-Berichte: match = Regex auf den (englischen) Feature-Namen,
// from/to = Jahresbereich, in dem der Bericht gilt. html = Berichtstext.
// wiki = deutsche Wikipedia-Artikel als weiterführende Links.
// Der erste passende Eintrag gewinnt → speziellere Einträge zuerst!

const REPORTS = [

  // ==================== FRANKREICH ====================
  {
    match: /^(kingdom of )?france$|french (empire|republic)/i, from: 1648, to: 1789,
    title: "Frankreich im Absolutismus",
    html: `
      <h3>👑 Regentschaft</h3>
      <p><b>Ludwig XIV.</b> (reg. 1643–1715, 72 Jahre – Rekord!) regiert nach dem Tod Kardinal Mazarins ab 1661 allein: kein erster Minister mehr, alle Fäden beim König. Sein Modell: der Adel wird nach Versailles gelockt und mit Hofritualen beschäftigt – wer nicht anwesend ist, existiert politisch nicht. Danach Ludwig XV. (1715–74, „Nach mir die Sintflut“) und der glücklose Ludwig XVI.</p>
      <h3>⚙️ Das System Absolutismus</h3>
      <p>Der König vereint alle Staatsgewalt, legitimiert durch Gottesgnadentum (Bischof Bossuet liefert die Theorie). Werkzeuge: stehendes Heer, königliche Beamte (Intendanten) statt Adelsverwaltung, <b>Merkantilismus</b> unter Colbert – Manufakturen, Zölle, Exportförderung, Kolonien. Kehrseite: Der Adel und Klerus bleiben steuerfrei, die Last trägt der Dritte Stand.</p>
      <h3>⚔️ Kriege &amp; Vorherrschaft</h3>
      <p>Frankreich ist die Hegemonialmacht Europas – und ruiniert sich durch Dauerkrieg: Devolutionskrieg (1667), Holländischer Krieg (1672–78), Pfälzischer Erbfolgekrieg (1688–97), Spanischer Erbfolgekrieg (1701–14). Fast ganz Europa koaliert gegen den Sonnenkönig. Im Siebenjährigen Krieg (1756–63) verliert Frankreich Kanada und Indien an England.</p>
      <h3>📉 Warum es endet</h3>
      <p>Staatsschulden (auch durch die Unterstützung der Amerikanischen Revolution!), Missernten, ein steuerlich privilegierter Adel, der Reformen blockiert – und die Ideen der Aufklärung, die die Legitimation des Systems zersetzen. 1789 muss Ludwig XVI. die Generalstände einberufen → Revolution.</p>`,
    wiki: ["Absolutismus", "Ludwig XIV.", "Schloss Versailles", "Merkantilismus", "Jean-Baptiste Colbert"]
  },
  {
    match: /^(kingdom of )?france$|french (empire|republic)/i, from: 1789, to: 1815,
    title: "Frankreich – Revolution und Napoleon",
    html: `
      <h3>🔥 Die Revolution (1789–1799)</h3>
      <p>14. Juli 1789: Sturm auf die Bastille. Es folgen: Erklärung der Menschen- und Bürgerrechte, Abschaffung des Feudalismus, Verfassung 1791. Die Radikalisierung führt 1792 zur Republik, 1793 zur Hinrichtung Ludwigs XVI. und zur <b>Terrorherrschaft</b> der Jakobiner unter Robespierre – bis dieser 1794 selbst unter der Guillotine endet (Thermidor).</p>
      <h3>🎭 Die Strömungen</h3>
      <p><b>Feuillants</b> (konstitutionelle Monarchie), <b>Girondisten</b> (gemäßigte Republik, Krieg nach außen), <b>Jakobiner/Montagnards</b> (radikale Republik, Terror als „Tugend“), <b>Sansculotten</b> (Pariser Volksbewegung). Die Sitzordnung der Nationalversammlung schenkt uns bis heute „links“ und „rechts“.</p>
      <h3>👑 Napoleon (1799–1815)</h3>
      <p>Der Korse steigt als Revolutionsgeneral auf (Italien, Ägypten), putscht sich 1799 an die Macht, krönt sich 1804 selbst zum Kaiser. Innen: Code Civil, Zentralstaat, Konkordat mit der Kirche. Außen: Austerlitz (1805), Zerschlagung Preußens (1806), Kontinentalsperre gegen England. Der Russlandfeldzug 1812 wird zur Katastrophe, Leipzig 1813 und Waterloo 1815 besiegeln das Ende – Verbannung nach St. Helena.</p>
      <h3>🌍 Was bleibt</h3>
      <p>Menschenrechte, Verfassungsstaat, Nation, Code Civil, das metrische System – die Revolution ist der Gründungsmoment der politischen Moderne, ihr Terror zugleich die erste Warnung vor ideologischer Gewalt.</p>`,
    wiki: ["Französische Revolution", "Napoleon Bonaparte", "Maximilien de Robespierre", "Code civil", "Erklärung der Menschen- und Bürgerrechte"]
  },
  {
    match: /^(kingdom of )?france$|french (empire|republic)/i, from: 1500, to: 1648,
    title: "Frankreich – Religionskriege und Aufstieg",
    html: `
      <h3>⚔️ Hugenottenkriege (1562–1598)</h3>
      <p>Acht Bürgerkriege zwischen Katholiken und Protestanten (Hugenotten). Tiefpunkt: die <b>Bartholomäusnacht</b> 1572 – tausende Hugenotten in Paris massakriert. Heinrich IV. („Paris ist eine Messe wert“ – er konvertiert) beendet das Blutvergießen mit dem <b>Edikt von Nantes</b> 1598: begrenzte Glaubensfreiheit.</p>
      <h3>👑 Der Weg zum Absolutismus</h3>
      <p>Kardinal <b>Richelieu</b> (ab 1624 leitender Minister Ludwigs XIII.) bricht die Macht der Hugenotten (La Rochelle 1628) und des Hochadels, führt Frankreich im Dreißigjährigen Krieg gegen die Habsburger – Staatsräson vor Konfession: das katholische Frankreich finanziert die protestantischen Schweden! Sein Nachfolger Mazarin übersteht den Adelsaufstand der Fronde (1648–53) – die Lehre für den jungen Ludwig XIV.: Nie wieder dem Adel trauen.</p>`,
    wiki: ["Hugenottenkriege", "Bartholomäusnacht", "Armand-Jean du Plessis de Richelieu", "Edikt von Nantes", "Fronde"]
  },
  {
    match: /^(kingdom of )?france$|french (empire|republic)/i, from: 1815, to: 1914,
    title: "Frankreich im langen 19. Jahrhundert",
    html: `
      <p>Kaum ein Land wechselt sein System so oft: Restauration der Bourbonen (1815), Julirevolution 1830 (Bürgerkönig Louis-Philippe), Revolution 1848 (Zweite Republik), Staatsstreich Louis Napoléons → <b>Zweites Kaiserreich</b> (1852–70, Haussmanns Umbau von Paris!), Niederlage gegen Preußen 1870/71, blutige Niederschlagung der <b>Pariser Kommune</b> (1871), dann die <b>Dritte Republik</b>.</p>
      <p>Trauma der Epoche: die Niederlage von 1871 und der Verlust Elsass-Lothringens – der Revanchegedanke prägt die Politik bis 1914. Die <b>Dreyfus-Affäre</b> (ab 1894) spaltet die Nation und zeigt den Antisemitismus der Zeit. Zugleich: zweitgrößtes Kolonialreich der Welt (Nordafrika, Indochina), Belle Époque, Impressionismus, Eiffelturm.</p>`,
    wiki: ["Pariser Kommune", "Dritte Französische Republik", "Dreyfus-Affäre", "Deutsch-Französischer Krieg"]
  },

  // ==================== HEILIGES RÖMISCHES REICH / DEUTSCHLAND ====================
  {
    match: /holy roman|hre/i, from: 1500, to: 1650,
    title: "Heiliges Römisches Reich – Reformation und Glaubenskrieg",
    html: `
      <h3>✝️ Die Reformation</h3>
      <p>1517: Luthers 95 Thesen. 1521 verweigert er in Worms den Widerruf („Hier stehe ich, ich kann nicht anders“) – Reichsacht, Versteck auf der Wartburg, Bibelübersetzung. Fürsten werden protestantisch (auch um Kirchengüter einzuziehen); der <b>Augsburger Religionsfriede</b> 1555 legalisiert die Spaltung: „Cuius regio, eius religio“ – der Fürst bestimmt den Glauben der Untertanen.</p>
      <h3>⚔️ Der Dreißigjährige Krieg (1618–1648)</h3>
      <p>Prager Fenstersturz 1618 → böhmischer Aufstand → europäischer Flächenbrand in vier Phasen (böhmisch-pfälzisch, dänisch, schwedisch, französisch). Söldnerheere (Wallenstein!) ernähren sich vom Land – Hunger, Pest, Massaker (Magdeburg 1631). Ein Drittel der Bevölkerung stirbt. Der <b>Westfälische Friede</b> 1648 macht die ~300 Reichsstände quasi souverän – das Reich wird zum losen Rahmen, Deutschland bleibt 200 Jahre zersplittert.</p>`,
    wiki: ["Martin Luther", "Reformation", "Dreißigjähriger Krieg", "Westfälischer Friede", "Wallenstein"]
  },
  {
    match: /holy roman|hre/i, from: 800, to: 1500,
    title: "Das Heilige Römische Reich",
    html: `
      <p>962 wird Otto der Große in Rom zum Kaiser gekrönt – das Reich versteht sich als Fortsetzung Roms und Schutzmacht der Christenheit. Anders als Frankreich oder England zentralisiert es nie: Der Kaiser wird von <b>Kurfürsten gewählt</b> (Goldene Bulle 1356), Herzöge, Bischöfe und Städte behaupten eigene Rechte.</p>
      <p>Prägend ist der Machtkampf mit dem Papsttum: <b>Investiturstreit</b> (Canossa 1077), Kampf der Staufer (Friedrich Barbarossa, Friedrich II. – das „Staunen der Welt“) mit den Päpsten und den lombardischen Städten. Nach dem Untergang der Staufer (1250) dominieren Habsburger, Luxemburger und Wittelsbacher. Voltaires Spott hatte einen Punkt: „weder heilig, noch römisch, noch ein Reich“ – aber es hielt 1000 Jahre (bis 1806).</p>`,
    wiki: ["Heiliges Römisches Reich", "Otto I. (HRR)", "Investiturstreit", "Friedrich I. (HRR)", "Goldene Bulle"]
  },
  {
    match: /germany|german (empire|reich)|deutschland/i, from: 1871, to: 1918,
    title: "Das Deutsche Kaiserreich (1871–1918)",
    html: `
      <p>Gegründet im Spiegelsaal von Versailles nach dem Sieg über Frankreich – „von oben“ durch Bismarck, nicht durch eine Revolution. Konstitutionelle Monarchie mit starkem Kaiser und Reichskanzler; der Reichstag wird immerhin nach allgemeinem Männerwahlrecht gewählt.</p>
      <p><b>Bismarcks Balancepolitik</b> (Deutschland als „saturierte“ Macht, Bündnissystem zur Isolierung Frankreichs) endet 1890 mit seiner Entlassung durch den jungen <b>Wilhelm II.</b> Dessen „Weltpolitik“ – Flottenbau, Kolonien, Säbelrasseln – treibt England an die Seite Frankreichs und Russlands. Innen: rasante Industrialisierung (Weltspitze in Chemie, Elektrik), Sozialistengesetze UND Sozialversicherung, Kulturkampf gegen die katholische Kirche.</p>
      <p>1914 stolpert das Reich in den Weltkrieg, den es mitverursacht; 1918 zerbricht es in Niederlage und Novemberrevolution.</p>`,
    wiki: ["Deutsches Kaiserreich", "Otto von Bismarck", "Wilhelm II. (Deutsches Reich)", "Novemberrevolution"]
  },
  {
    match: /germany|german reich|deutschland/i, from: 1918, to: 1945,
    title: "Weimarer Republik und NS-Diktatur",
    html: `
      <h3>🗳️ Weimar (1918–1933)</h3>
      <p>Deutschlands erste Demokratie startet mit Hypotheken: Niederlage, Versailler Vertrag („Diktatfrieden“), Dolchstoßlegende, Putschversuche von links und rechts, Hyperinflation 1923 (ein Brot: Milliarden Mark). Nach den „goldenen“ Jahren 1924–29 zerstört die Weltwirtschaftskrise (6 Mio. Arbeitslose) das Vertrauen; ab 1930 regieren Notverordnungen, NSDAP und KPD zerlegen das Parlament.</p>
      <h3>卐 NS-Diktatur (1933–1945)</h3>
      <p>30. Januar 1933: Hitler wird Kanzler – legal ernannt, dann Blitz-Gleichschaltung: Reichstagsbrandverordnung, Ermächtigungsgesetz, Verbot aller Parteien, KZ für Gegner. Ideologie: Rassismus, Antisemitismus, „Lebensraum im Osten“. Ab 1935 Nürnberger Gesetze, 1938 Novemberpogrome, im Krieg dann der <b>Holocaust</b>: systematischer Mord an sechs Millionen Juden Europas sowie an Sinti und Roma, Behinderten, slawischen Zivilisten. 1945: totale Niederlage, Besatzung, Teilung.</p>`,
    wiki: ["Weimarer Republik", "Zeit des Nationalsozialismus", "Holocaust", "Adolf Hitler", "Ermächtigungsgesetz"]
  },

  // ==================== ENGLAND / GROSSBRITANNIEN ====================
  {
    match: /^england|kingdom of england/i, from: 1500, to: 1707,
    title: "England – von den Tudors zur Parlamentsherrschaft",
    html: `
      <p><b>Heinrich VIII.</b> bricht wegen seiner Scheidung mit Rom (1534, Anglikanische Kirche – Kirche unter der Krone). Unter <b>Elisabeth I.</b> (1558–1603) goldenes Zeitalter: Sieg über die spanische Armada 1588, Shakespeare, Beginn der Kolonialexpansion.</p>
      <p>Das 17. Jahrhundert entscheidet die Machtfrage: Die Stuarts wollen absolutistisch regieren – das Parlament wehrt sich. <b>Bürgerkrieg</b> (1642–49), Hinrichtung Karls I. (!), Cromwells Republik, Restauration, und schließlich die <b>Glorious Revolution 1688</b>: Wilhelm von Oranien wird geholt, die <b>Bill of Rights 1689</b> bindet den König ans Parlament. Englands Sonderweg – Parlamentssouveränität statt Absolutismus – wird zum Fundament seines Aufstiegs: Kredit, Stabilität, Seemacht.</p>`,
    wiki: ["Heinrich VIII. (England)", "Elisabeth I.", "Englischer Bürgerkrieg", "Glorious Revolution", "Bill of Rights (England)"]
  },
  {
    match: /great britain|united kingdom|british empire|^britain$/i, from: 1707, to: 1914,
    title: "Großbritannien – Empire und Industrielle Revolution",
    html: `
      <h3>🏭 Werkstatt der Welt</h3>
      <p>Hier beginnt ~1770 die <b>Industrielle Revolution</b>: Dampfmaschine (Watt), mechanische Webstühle, Eisenbahn (1825), Fabrikstädte wie Manchester. Warum England? Kohle + Kolonien + Kapital + Patente + Parlament (Eigentumsschutz). Die soziale Kehrseite: Kinderarbeit, Slums – Stoff für Dickens und Marx.</p>
      <h3>🌍 Das Empire</h3>
      <p>Nach dem Sieg über Napoleon konkurrenzlos: <b>Pax Britannica</b>. Indien wird „Kronjuwel“ (ab 1858 direkte Kronherrschaft nach dem Sepoy-Aufstand), dazu Kanada, Australien, Südafrika, Ägypten... – am Ende ein Viertel der Landfläche und Bevölkerung der Erde. Instrumente: Royal Navy, Freihandel (wo es nützt – s. Opiumkriege gegen China), Telegraphenkabel, Kapitalexport über die City of London.</p>
      <h3>📉 Der schleichende Abstieg</h3>
      <p>Ab ~1890 überholen USA und Deutschland die britische Industrie. Zwei Weltkriege erschöpfen das Land finanziell; nach 1945 zerfällt das Empire binnen 20 Jahren – der Staffelstab der Weltmacht geht an die USA.</p>`,
    wiki: ["Britisches Weltreich", "Industrielle Revolution", "Viktorianisches Zeitalter", "Britisch-Indien"]
  },

  // ==================== SPANIEN ====================
  {
    match: /spain|spanish/i, from: 1492, to: 1700,
    title: "Spanien – Weltmacht des 16. Jahrhunderts",
    html: `
      <h3>🚀 Der Aufstieg</h3>
      <p>1492 ist Spaniens Schicksalsjahr: Granada fällt (Ende der Reconquista), Kolumbus segelt los, die Juden werden vertrieben. Cortés (Azteken 1521) und Pizarro (Inka 1533) erobern Amerika; die Silberflotten aus Potosí finanzieren die Weltmacht. Karl V. vereint Spanien, Amerika, die Niederlande, Österreich, halb Italien.</p>
      <h3>👑 Philipp II. und der Zenit</h3>
      <p>Vom Schreibtisch im Escorial regiert Philipp II. (1556–98) das erste „Reich, in dem die Sonne nie untergeht“. Er versteht sich als Schwert des Katholizismus: gegen Osmanen (Sieg bei Lepanto 1571), gegen England (Armada-Desaster 1588), gegen die aufständischen Niederlande (80 Jahre Krieg).</p>
      <h3>📉 Warum Spanien fällt</h3>
      <p>Lehrbuchfall imperialer Überdehnung: Kriege an allen Fronten, dreimal Staatsbankrott unter Philipp II. allein. Das Silber erzeugt Inflation statt Industrie – Spanien kauft, statt zu produzieren; Handel und Handwerk gelten dem Adel als unehrenhaft. Vertreibung der wirtschaftlich wichtigen Morisken 1609. 1648 ist die Niederlande verloren, 1659 der Vorrang an Frankreich abgetreten. Kulturell aber strahlt das „Siglo de Oro“: Cervantes' Don Quijote, Velázquez, El Greco.</p>`,
    wiki: ["Spanisches Kolonialreich", "Philipp II. (Spanien)", "Spanische Armada", "Siglo de Oro", "Hernán Cortés"]
  },

  // ==================== ROM ====================
  {
    match: /roman empire|^rome|román/i, from: -30, to: 285,
    title: "Das Römische Reich – die Kaiserzeit",
    html: `
      <p><b>Augustus</b> (27 v. Chr.–14 n. Chr.) beendet 100 Jahre Bürgerkrieg und tarnt seine Alleinherrschaft klug als „wiederhergestellte Republik“ (Princeps = „Erster Bürger“). Es folgen berüchtigte (Caligula, Nero) und große Kaiser – unter <b>Trajan</b> (98–117) die maximale Ausdehnung von Schottland bis zum Persischen Golf, unter den „Adoptivkaisern“ (Nerva bis Marc Aurel) das glücklichste Zeitalter des Reichs.</p>
      <p><b>Erfolgsgeheimnisse:</b> Legionen (Berufsarmee, Straßenbau!), großzügige Bürgerrechtsvergabe (212 an alle freien Reichsbewohner), Recht, Urbanisierung, religiöse Toleranz (solange man dem Kaiser opfert – daher die Christenverfolgungen). <b>Schwächen:</b> keine geregelte Nachfolge (Prätorianer und Legionen machen Kaiser), Wirtschaft auf Sklaverei und Eroberungsbeute gebaut, endlose Grenzen gegen Germanen und Perser.</p>`,
    wiki: ["Römisches Reich", "Augustus", "Pax Romana", "Trajan", "Römisches Recht"]
  },
  {
    match: /roman empire|^rome/i, from: 285, to: 480,
    title: "Rom – Spätantike und Untergang des Westens",
    html: `
      <p>Diokletian (ab 284) rettet das Reich durch Radikalreform: Viererherrschaft (Tetrarchie), Preisedikte, Verwaltungsteilung. <b>Konstantin</b> setzt zwei Weichen für die Weltgeschichte: Toleranzedikt für die Christen (313) und die Gründung Konstantinopels (330).</p>
      <p>Ab 375 löst der Hunneneinbruch die <b>Völkerwanderung</b> aus: 378 vernichten die Goten ein römisches Heer bei Adrianopel, 410 plündert Alarich Rom, die Vandalen nehmen die Kornkammer Nordafrika. Der Westen verliert Steuern → Armee → Kontrolle – eine Abwärtsspirale. 476 setzt der Germane Odoaker den Kind-Kaiser Romulus Augustulus ab; niemand hält es für ein Epochenereignis. Der Osten (Byzanz) lebt reich und stabil weiter – noch fast 1000 Jahre.</p>`,
    wiki: ["Untergang des Römischen Reiches", "Völkerwanderung", "Konstantin der Große", "Weströmisches Reich"]
  },
  {
    match: /roman republic/i, from: -510, to: -27,
    title: "Die Römische Republik",
    html: `
      <p>Nach der Vertreibung der Könige (~509 v. Chr.) entwickelt Rom eine ausgeklügelte Mischverfassung: zwei Konsuln (je 1 Jahr!), Senat, Volkstribunen mit Vetorecht – Machtbalance durch Ämterteilung, die spätere Verfassungsdenker (Montesquieu, US-Gründerväter) inspiriert.</p>
      <p>In den <b>Punischen Kriegen</b> (264–146 v. Chr.) ringt Rom Karthago nieder – Hannibal steht nach Cannae (216: Roms schwärzeste Stunde) vor den Toren, doch Roms Bündnissystem hält. Danach frisst sich Rom durch den Mittelmeerraum. Die Beute zerstört die Republik: Latifundien verdrängen die Bauernsoldaten, die Gracchen-Reformen scheitern blutig (133/121 v. Chr.), Feldherren wie Marius, Sulla, Pompeius und <b>Caesar</b> gebieten über Privatarmeen. Caesars Diktatur und Ermordung (44 v. Chr.) führen zum letzten Bürgerkrieg – Octavian/Augustus gewinnt alles.</p>`,
    wiki: ["Römische Republik", "Punische Kriege", "Hannibal", "Gaius Iulius Caesar", "Gracchische Reform"]
  },

  // ==================== BYZANZ ====================
  {
    match: /byzantine|eastern roman/i, from: 395, to: 1453,
    title: "Byzanz – das Ostreich",
    html: `
      <p>Das oströmische Reich nennt sich selbst schlicht „Römisches Reich“ – 1000 Jahre lang. Höhepunkte: <b>Justinian</b> (527–565) erobert Italien und Nordafrika zurück, baut die Hagia Sophia, kodifiziert das römische Recht (Corpus Iuris Civilis – Grundlage des europäischen Rechts). Nach den arabischen Eroberungen des 7. Jh. schrumpft Byzanz auf Kleinasien und den Balkan, bleibt aber Bollwerk Europas gegen die islamische Expansion und Lehrmeister der Slawen (Kyrill &amp; Method, Christianisierung Russlands 988).</p>
      <p>Der Anfang vom Ende kommt von „Freunden“: 1204 plündern <b>Kreuzfahrer</b> Konstantinopel – davon erholt sich das Reich nie. 1453 erobert Mehmed II. mit Riesenkanonen die Stadt; der letzte Kaiser fällt kämpfend. Byzantinische Gelehrte fliehen mit antiken Handschriften nach Italien und befeuern dort die Renaissance. Moskau erklärt sich zum „Dritten Rom“.</p>`,
    wiki: ["Byzantinisches Reich", "Justinian I.", "Hagia Sophia", "Fall Konstantinopels", "Vierter Kreuzzug"]
  },

  // ==================== OSMANEN ====================
  {
    match: /ottoman|osman/i, from: 1300, to: 1699,
    title: "Das Osmanische Reich – Aufstieg zur Weltmacht",
    html: `
      <p>Vom anatolischen Grenzfürstentum (um 1300) zur Weltmacht: 1453 erobert <b>Mehmed II.</b> Konstantinopel, unter <b>Süleyman dem Prächtigen</b> (1520–66) reicht das Reich von Ungarn (Mohács 1526) bis Jemen, von Algier bis Bagdad – 1529 steht es erstmals vor Wien.</p>
      <p><b>Erfolgsrezepte:</b> die Janitscharen (Elitetruppe aus der „Knabenlese“ christlicher Kinder), frühe Adaption der Artillerie, meritokratische Verwaltung (Großwesire oft Aufsteiger), das Millet-System (religiöse Minderheiten verwalten sich selbst – pragmatische Toleranz). Der Sultan ist zugleich Kalif, Schutzherr des Islam.</p>
      <p>Nach der gescheiterten <b>zweiten Wiener Belagerung 1683</b> dreht der Wind: Im Frieden von Karlowitz 1699 verliert das Reich erstmals großflächig Territorium (Ungarn an Österreich) – der lange Rückzug beginnt.</p>`,
    wiki: ["Osmanisches Reich", "Süleyman I.", "Mehmed II.", "Janitscharen", "Zweite Wiener Türkenbelagerung"]
  },
  {
    match: /ottoman|osman/i, from: 1699, to: 1923,
    title: "Osmanisches Reich – der „kranke Mann am Bosporus“",
    html: `
      <p>Das 18./19. Jahrhundert ist ein Rückzugsgefecht: Russland drängt ans Schwarze Meer, Ägypten wird faktisch unabhängig, Griechenland (1830), Serbien, Rumänien, Bulgarien lösen sich. Die Großmächte halten den „kranken Mann“ teils künstlich am Leben – keiner soll die Konkursmasse allein erben („Orientalische Frage“).</p>
      <p>Reformversuche (Tanzimat ab 1839, Verfassung 1876) kommen zu spät oder werden abgewürgt. Die Jungtürken putschen 1908; im Ersten Weltkrieg kämpft das Reich an deutscher Seite – in dieser Zeit verüben die Machthaber den <b>Völkermord an den Armeniern</b> (1915, bis zu 1,5 Mio. Tote). 1918 besiegt, wird das Reich aufgeteilt (Sykes-Picot; die heutigen Nahost-Grenzen!); Atatürk erkämpft die Türkei und schafft 1922/24 Sultanat und Kalifat ab.</p>`,
    wiki: ["Osmanisches Reich", "Orientalische Frage", "Völkermord an den Armeniern", "Mustafa Kemal Atatürk", "Tanzimat"]
  },

  // ==================== RUSSLAND / UDSSR ====================
  {
    match: /russia|muscovy|moscow/i, from: 1462, to: 1917,
    title: "Russland – vom Großfürstentum zum Zarenreich",
    html: `
      <p>Moskau wirft 1480 das „Tatarenjoch“ ab; Iwan IV. „der Schreckliche“ nimmt 1547 den Zarentitel (= Caesar) an – Terror gegen die Bojaren inklusive. In nur 100 Jahren erobern Kosaken Sibirien bis zum Pazifik.</p>
      <p><b>Peter der Große</b> (1682–1725) europäisiert mit der Axt: Bärte ab, Flotte her, Hauptstadt Sankt Petersburg aus dem Sumpf gestampft, Sieg über Schweden (Poltawa 1709) – Russland ist Großmacht. <b>Katharina die Große</b> (1762–96) holt die Krim und teilt Polen. 1812 verschlingt Russland Napoleons Große Armee.</p>
      <p><b>Das Dilemma:</b> Militärische Größe auf archaischer Basis – Leibeigenschaft (bis 1861!), Autokratie ohne Parlament, kaum Industrie. Die Niederlagen im Krimkrieg (1856) und gegen Japan (1905) entlarven die Rückständigkeit; Reformen kommen zu spät, Revolutionäre radikalisieren sich. Der Erste Weltkrieg gibt dem Zarenreich 1917 den Rest.</p>`,
    wiki: ["Russisches Kaiserreich", "Peter der Große", "Katharina II.", "Iwan IV. (Russland)", "Leibeigenschaft"]
  },
  {
    match: /soviet|ussr|udssr/i, from: 1917, to: 1991,
    title: "Die Sowjetunion",
    html: `
      <p>1917: Februarrevolution stürzt den Zaren, Lenins Bolschewiki putschen im Oktober. Nach blutigem Bürgerkrieg (Rot gegen Weiß, ~10 Mio. Tote) entsteht 1922 die UdSSR. <b>Stalin</b> (ab ~1927) erzwingt die Industrialisierung: Fünfjahrespläne, Zwangskollektivierung (Hungersnot 1932/33, <b>Holodomor</b> in der Ukraine: Millionen Tote), Großer Terror 1937/38, Gulag-Lagersystem.</p>
      <p>Der Sieg über Hitler (27 Mio. sowjetische Tote!) macht die UdSSR zur Supermacht mit Imperium in Osteuropa. Danach: Atommacht 1949, Sputnik 1957, Gagarin 1961 – aber die Planwirtschaft liefert Raketen, keine Konsumgüter. Chruschtschows Tauwetter, Breschnews Stagnation, Afghanistan-Krieg (1979–89) und Rüstungslast erschöpfen das System. <b>Gorbatschows</b> Glasnost &amp; Perestroika sollen retten, beschleunigen aber den Zerfall: 1989 fällt der Ostblock, 1991 die Union selbst.</p>`,
    wiki: ["Sowjetunion", "Josef Stalin", "Gulag", "Holodomor", "Michail Gorbatschow", "Perestroika"]
  },

  // ==================== PREUSSEN / ÖSTERREICH ====================
  {
    match: /prussia|preußen|brandenburg/i, from: 1640, to: 1871,
    title: "Preußen – der Aufstieg des Militärstaats",
    html: `
      <p>Wie wird ein armer, zersplitterter Kleinstaat Großmacht? Mit Disziplin und Heer: Der Große Kurfürst baut nach 1648 ein stehendes Heer, der „Soldatenkönig“ Friedrich Wilhelm I. macht das Militär zum Staatszweck („Preußen ist keine Land mit einer Armee, sondern eine Armee mit einem Land“). Nebenbei: Aufnahme der verfolgten Hugenotten – Wirtschaftsförderung durch Toleranz.</p>
      <p><b>Friedrich der Große</b> (1740–86) raubt Österreich Schlesien und übersteht im Siebenjährigen Krieg (1756–63) die Koalition dreier Großmächte – Preußen ist nun die fünfte europäische Macht. Er inszeniert sich als „erster Diener des Staates“: Folterverbot, Religionsfreiheit, Rechtsreform – aufgeklärter Absolutismus. Nach dem Zusammenbruch gegen Napoleon (1806) erneuern die Reformer Stein und Hardenberg den Staat (Bauernbefreiung, Städteordnung, Heeresreform) – die Grundlage für Preußens Führungsrolle bei der Reichsgründung 1871.</p>`,
    wiki: ["Preußen", "Friedrich II. (Preußen)", "Friedrich Wilhelm I. (Preußen)", "Preußische Reformen", "Siebenjähriger Krieg"]
  },
  {
    match: /austria|habsburg|österreich/i, from: 1526, to: 1918,
    title: "Österreich / Habsburgermonarchie",
    html: `
      <p>„Kriege mögen andere führen, du, glückliches Österreich, heirate!“ – durch Heiratspolitik erben die Habsburger Burgund, Spanien, Böhmen und Ungarn. Nach der Abwehr der Türken vor Wien (1529, 1683) erobern sie Ungarn und den Balkan – Österreich wird Großmacht des Donauraums und führende Macht im Heiligen Römischen Reich (fast durchgehend Kaiser bis 1806).</p>
      <p><b>Maria Theresia</b> (1740–80) und Joseph II. modernisieren (Schulpflicht 1774!, Abschaffung von Folter und Leibeigenschaft). Das 19. Jahrhundert wird zum Kampf gegen den Zeitgeist: Metternich unterdrückt Liberalismus und Nationalismus – doch das Vielvölkerreich (Deutsche, Ungarn, Tschechen, Polen, Kroaten, Italiener…) ist dem Nationalismus maximal ausgesetzt. 1867 Ausgleich mit Ungarn (k.u.k. Doppelmonarchie). Um 1900 ist Wien Weltlabor der Moderne (Freud, Klimt, Mahler, Wittgenstein) – 1914 zündet das Attentat von Sarajevo den Weltkrieg, 1918 zerfällt das Reich in Nationalstaaten.</p>`,
    wiki: ["Habsburgermonarchie", "Maria Theresia", "Joseph II.", "Österreich-Ungarn", "Klemens Wenzel Lothar von Metternich"]
  },

  // ==================== CHINA ====================
  {
    match: /han/i, from: -210, to: 220,
    title: "Han-China – das andere Weltreich",
    html: `
      <p>Die Han-Dynastie (206 v. Chr.–220 n. Chr.) formt Chinas Identität bis heute – die Mehrheitsethnie nennt sich „Han-Chinesen“. Der Staat ist Rom ebenbürtig: ~60 Mio. Einwohner, Beamtenapparat mit Prüfungssystem (Konfuzianismus als Staatslehre), Monopole auf Salz und Eisen, die <b>Seidenstraße</b> verbindet über Mittelsmänner sogar mit Rom.</p>
      <p>Erfindungen: Papier (~105 n. Chr.), Kompassvorläufer, Seismograph. Das Reich fällt an derselben Krankheit wie Rom: Hofintrigen (Eunuchen!), Großgrundbesitzer entziehen sich der Steuer, Bauernaufstände („Gelbe Turbane“ 184), Warlords zerreißen das Reich – es folgen 350 Jahre Teilung.</p>`,
    wiki: ["Han-Dynastie", "Seidenstraße", "Konfuzianismus"]
  },
  {
    match: /tang/i, from: 618, to: 907,
    title: "Tang-China – das goldene Zeitalter",
    html: `
      <p>Die Tang (618–907) machen China zur kosmopolitischsten Kultur der Welt: Die Hauptstadt Chang'an (heute Xi'an) hat ~1 Mio. Einwohner, Perser, Araber, Japaner studieren und handeln dort; Buddhismus, Islam, Christentum (Nestorianer) koexistieren. Kaiserin <b>Wu Zetian</b> regiert als einzige Frau der Geschichte Chinas selbst.</p>
      <p>Blüte der Dichtung (Li Bai, Du Fu – bis heute Schullektüre), Erfindung des Holztafeldrucks. Die Niederlage am Talas gegen die Araber (751) und der An-Lushan-Aufstand (755–763, einer der blutigsten Kriege der Weltgeschichte) leiten den Niedergang ein.</p>`,
    wiki: ["Tang-Dynastie", "Wu Zetian", "Li Bai", "Chang’an"]
  },
  {
    match: /ming/i, from: 1368, to: 1644,
    title: "Ming-China",
    html: `
      <p>1368 vertreiben die Ming die Mongolen. Unter Kaiser Yongle segelt Admiral <b>Zheng He</b> (1405–1433) mit Riesenflotten (Schiffe weit größer als Kolumbus'!) bis Ostafrika – dann bricht China die Expeditionen ab und wendet sich nach innen: Die Große Mauer wird ausgebaut, der Seehandel beschränkt. Eine der großen „Was-wäre-wenn“-Fragen der Geschichte: Hätte China die Weltmeere beherrschen können?</p>
      <p>Glanzleistungen: Verbotene Stadt, Porzellan (Exportschlager bis Europa), 100+ Mio. Einwohner. Das Ende: Steuerkrise, Hungersnöte (Kleine Eiszeit!), Bauernrebellen nehmen Peking 1644 – die Mandschu nutzen das Chaos und gründen die Qing-Dynastie.</p>`,
    wiki: ["Ming-Dynastie", "Zheng He", "Verbotene Stadt", "Chinesische Mauer"]
  },
  {
    match: /qing|china/i, from: 1644, to: 1912,
    title: "Qing-China – Größe und Demütigung",
    html: `
      <p>Die Mandschu-Dynastie Qing bringt China im 18. Jh. auf den Gipfel: größte Ausdehnung (Tibet, Xinjiang, Mongolei), ~⅓ der Weltbevölkerung und der Weltwirtschaft. Kaiser Qianlong beschied einer britischen Gesandtschaft 1793 noch, China brauche nichts aus dem Westen.</p>
      <p>Dann das „<b>Jahrhundert der Demütigung</b>“: England erzwingt in den <b>Opiumkriegen</b> (1839–42, 1856–60) Drogenhandel und Vertragshäfen, Hongkong wird abgetreten; „ungleiche Verträge“ mit allen Mächten folgen. Der <b>Taiping-Aufstand</b> (1850–64) kostet ~20 Mio. Menschen das Leben – der blutigste Bürgerkrieg der Geschichte. Reformversuche scheitern an der Hofpartei um Kaiserinwitwe Cixi; nach dem Boxeraufstand (1900) ist der Staat faktisch bankrott. 1911/12 stürzt die Revolution die Monarchie nach über 2000 Jahren Kaiserreich.</p>`,
    wiki: ["Qing-Dynastie", "Erster Opiumkrieg", "Taiping-Aufstand", "Boxeraufstand", "Cixi"]
  },
  {
    match: /china/i, from: 1912, to: 2030,
    title: "China im 20./21. Jahrhundert",
    html: `
      <p>Nach dem Kaiserreich: Warlord-Chaos, Bürgerkrieg zwischen Nationalisten (Chiang Kai-shek) und Kommunisten (Mao), ab 1937 japanische Invasion (Nanking-Massaker). 1949 siegt Mao: Volksrepublik. Seine Kampagnen werden zu Katastrophen: „<b>Großer Sprung nach vorn</b>“ (1958–62, größte Hungersnot der Geschichte, 15–45 Mio. Tote), <b>Kulturrevolution</b> (1966–76, Terror der Roten Garden gegen die eigene Kultur).</p>
      <p>Nach Maos Tod wendet <b>Deng Xiaoping</b> ab 1978 das Blatt: „Reform und Öffnung“ – Sonderwirtschaftszonen, Markt unter Parteikontrolle („Egal ob die Katze schwarz oder weiß ist, Hauptsache sie fängt Mäuse“). Das Ergebnis ist das größte Wirtschaftswunder der Geschichte: ~800 Mio. Menschen aus der Armut, Weltfabrik, seit ~2010 zweitgrößte Volkswirtschaft. Politisch bleibt die KP unangefochten (Tian'anmen 1989). Unter Xi Jinping (ab 2012) tritt China offen als Rivale der USA auf.</p>`,
    wiki: ["Volksrepublik China", "Mao Zedong", "Kulturrevolution", "Deng Xiaoping", "Tian’anmen-Massaker"]
  },

  // ==================== MONGOLEN ====================
  {
    match: /mongol|yuan|golden horde|ilkhan|chagatai/i, from: 1200, to: 1500,
    title: "Das Mongolenreich",
    html: `
      <p><b>Dschingis Khan</b> (Temüdschin) eint 1206 die verfeindeten Steppenstämme und schafft eine Kriegsmaschine ohnegleichen: Jeder Reiter mit mehreren Pferden (bis 100 km/Tag), Kompositbogen, dezimale Heeresgliederung, Aufstieg nach Leistung statt Herkunft, Nachrichtennetz (Jam-Stafetten). Städte, die sich ergeben, werden geschont; die widerstehen, vernichtet – der Ruf reitet voraus.</p>
      <p>Binnen 70 Jahren fällt alles von Korea bis Ungarn: Nordchina, Choresmien, Russland (1240 Kiew), 1258 <b>Bagdad</b> (Ende des Kalifats), 1279 ganz China (Kublai Khan, Yuan-Dynastie). Grenzen des Reichs: Ägyptens Mamluken (Ain Dschalut 1260), Japans „Götterwinde“ (Kamikaze-Taifune 1274/81), und vor allem die eigene Größe – nach 1260 zerfällt es in vier Khanate. Unter der <b>Pax Mongolica</b> reist Marco Polo sicher nach China; mit den Karawanen reist um 1347 auch die Pest nach Westen.</p>`,
    wiki: ["Mongolisches Reich", "Dschingis Khan", "Kublai Khan", "Goldene Horde", "Pax Mongolica"]
  },

  // ==================== KALIFATE / ISLAMISCHE WELT ====================
  {
    match: /umayyad|caliphate|rashidun/i, from: 630, to: 750,
    title: "Die frühen Kalifate – Explosion des Islam",
    html: `
      <p>Nach Mohammeds Tod 632 führen die „rechtgeleiteten Kalifen“ (Abu Bakr, Umar, Uthman, Ali) die junge Gemeinschaft – und erobern in atemberaubendem Tempo: 636 Syrien (Jarmuk), 642 Ägypten, 651 ganz Persien. Die erschöpften Großmächte Byzanz und Persien können den hochmotivierten, beweglichen arabischen Heeren wenig entgegensetzen; die Bevölkerung empfängt die neuen Herren oft als Erleichterung (niedrigere Steuern, Religionsfreiheit gegen Sondersteuer).</p>
      <p>Im Streit um Alis Nachfolge (Ermordung 661) spaltet sich die Gemeinde in <b>Sunniten und Schiiten</b> – bis heute folgenreich. Die Umayyaden (661–750, Hauptstadt Damaskus) dehnen das Reich bis Spanien (711) und zum Indus aus – das größte Reich, das die Welt bis dahin gesehen hat.</p>`,
    wiki: ["Islamische Expansion", "Kalifat", "Umayyaden", "Schiiten", "Sunniten"]
  },
  {
    match: /abbasid/i, from: 750, to: 1258,
    title: "Das Abbasiden-Kalifat – Blütezeit des Islam",
    html: `
      <p>750 stürzen die Abbasiden die Umayyaden und gründen <b>Bagdad</b> (762) – bald die größte Stadt der Welt (~500.000+ Einwohner). Unter Harun ar-Raschid (786–809, der Kalif aus „1001 Nacht“) und al-Ma'mun blüht das „<b>Goldene Zeitalter des Islam</b>“: Im „Haus der Weisheit“ wird griechisches, persisches und indisches Wissen übersetzt und weiterentwickelt – Algebra (al-Chwarizmi), Medizin (ar-Razi, später Ibn Sina/Avicenna – sein „Kanon“ ist 600 Jahre Lehrbuch, auch in Europa), Optik (Ibn al-Haytham: Experimentalmethode!), Astronomie.</p>
      <p>Politisch zerfällt das Reich ab ~900 (Spanien, Ägypten, Persien lösen sich; türkische Militärsklaven übernehmen die reale Macht), der Kalif bleibt als geistliches Oberhaupt. 1258 zerstören die Mongolen Bagdad – das Ende einer Ära.</p>`,
    wiki: ["Abbasiden-Kalifat", "Haus der Weisheit", "Blütezeit des Islam", "Harun ar-Raschid", "Avicenna"]
  },
  {
    match: /al-andalus|andalus|córdoba|cordoba|granada/i, from: 711, to: 1492,
    title: "Al-Andalus – das islamische Spanien",
    html: `
      <p>711 setzen muslimische Heere über die Straße von Gibraltar; in wenigen Jahren fällt fast die ganze iberische Halbinsel. <b>Córdoba</b> wird unter den Umayyaden (ab 756, ab 929 eigenes Kalifat) zur glänzendsten Stadt Westeuropas: hunderttausende Einwohner, Straßenbeleuchtung, riesige Bibliotheken, die Mezquita. Juden, Christen und Muslime leben in – nicht konfliktfreier, aber produktiver – Koexistenz („Convivencia“); hier wirken Averroes und Maimonides.</p>
      <p>Nach dem Zerfall des Kalifats (1031) in Kleinreiche gewinnt die christliche <b>Reconquista</b> Raum: Toledo 1085, Las Navas de Tolosa 1212, Córdoba 1236, Sevilla 1248 – übrig bleibt Granada mit der Alhambra, bis es 1492 an Kastilien-Aragón fällt. Danach: Zwangskonversionen und Vertreibung von Juden (1492) und Muslimen.</p>`,
    wiki: ["Al-Andalus", "Kalifat von Córdoba", "Reconquista", "Alhambra", "Averroes"]
  },

  // ==================== USA ====================
  {
    match: /united states|usa|thirteen colonies/i, from: 1776, to: 1900,
    title: "USA – Gründung und Aufstieg",
    html: `
      <p>1776: „Wir halten diese Wahrheiten für selbstverständlich, dass alle Menschen gleich geschaffen sind…“ – die Unabhängigkeitserklärung übersetzt Locke in Politik. Mit französischer Hilfe wird der Krieg gegen England gewonnen (Yorktown 1781); die <b>Verfassung von 1787</b> setzt Montesquieus Gewaltenteilung um – die älteste geltende Verfassung der Welt.</p>
      <p>Das 19. Jh.: Expansion nach Westen („Manifest Destiny“ – für die indigene Bevölkerung Vertreibung und Tod, etwa der „Trail of Tears“), Louisiana-Kauf 1803, Krieg gegen Mexiko. Der Grundwiderspruch – Freiheitsrhetorik und Sklaverei – explodiert im <b>Bürgerkrieg</b> (1861–65): Lincoln, Gettysburg, ~700.000 Tote, 13. Zusatzartikel schafft die Sklaverei ab (die Diskriminierung geht als „Jim Crow“ weiter). Danach industrialisiert das Land rasant – um 1890 ist es bereits die größte Volkswirtschaft der Welt, Einwanderer strömen zu Millionen.</p>`,
    wiki: ["Amerikanische Unabhängigkeitserklärung", "Verfassung der Vereinigten Staaten", "Sezessionskrieg", "Abraham Lincoln", "Manifest Destiny"]
  },
  {
    match: /united states|usa/i, from: 1900, to: 2030,
    title: "USA – die Weltmacht des 20. Jahrhunderts",
    html: `
      <p>Zweimal entscheiden die USA Weltkriege (1917, 1941–45) und ziehen sich danach nicht mehr zurück: Marshallplan, NATO, Bretton-Woods-System, Dollar als Weltwährung. Der Kalte Krieg wird mit Wettrüsten, Stellvertreterkriegen (Korea, Vietnam – das große Trauma) und Soft Power (Hollywood, Jazz, Jeans) geführt – und 1989/91 gewonnen.</p>
      <p>Innen: „Roaring Twenties“, Weltwirtschaftskrise und Roosevelts New Deal, die <b>Bürgerrechtsbewegung</b> (Rosa Parks, Martin Luther King) beendet die legale Rassentrennung 1964/65. Nach dem „unipolaren Moment“ der 90er: 9/11 und die Kriege in Afghanistan/Irak, Finanzkrise 2008, wachsende innere Polarisierung und die Rivalität mit China prägen die Gegenwart.</p>`,
    wiki: ["Geschichte der Vereinigten Staaten", "New Deal", "Bürgerrechtsbewegung", "Kalter Krieg", "Marshallplan"]
  },

  // ==================== WEITERE ====================
  {
    match: /dutch|netherlands|united provinces/i, from: 1568, to: 1795,
    title: "Die Niederlande – das Goldene Zeitalter",
    html: `
      <p>Ein kleines Land im Aufstand gegen die Weltmacht Spanien (ab 1568, Wilhelm von Oranien) wird zur ersten modernen Wirtschaftsmacht: 1602 gründet sich die <b>VOC</b> (Ostindien-Kompanie) – die erste Aktiengesellschaft der Welt, dazu die Amsterdamer Börse und Wechselbank. Die Handelsflotte ist zeitweise größer als die aller anderen Länder zusammen; das Gewürzmonopol (Indonesien), Kapstadt, Nieuw Amsterdam (New York!) markieren ein Welthandelsnetz.</p>
      <p>Das „<b>Goldene Zeitalter</b>“ glänzt auch geistig: relative Toleranz zieht Verfolgte an (Spinoza, Descartes lebt hier), Rembrandt und Vermeer malen das Bürgertum statt Könige. Der Niedergang kommt durch drei Seekriege gegen England und die schiere Größe Frankreichs – am Ende des 17. Jh. übernimmt London die Rolle Amsterdams.</p>`,
    wiki: ["Goldenes Zeitalter (Niederlande)", "Niederländische Ostindien-Kompanie", "Achtzigjähriger Krieg", "Rembrandt van Rijn"]
  },
  {
    match: /portugal|portuguese/i, from: 1415, to: 1700,
    title: "Portugal – der erste Global Player",
    html: `
      <p>Das kleine Portugal startet das Zeitalter der Entdeckungen: Heinrich der Seefahrer treibt ab 1415 die Erkundung der afrikanischen Küste voran (Karavelle, Astrolabium), 1488 umrundet Dias das Kap, 1498 erreicht <b>Vasco da Gama</b> Indien – der Seeweg bricht das venezianisch-arabische Gewürzmonopol. Mit dem Vertrag von Tordesillas (1494) teilen sich Portugal und Spanien die außereuropäische Welt (!).</p>
      <p>Es folgt ein Stützpunkt-Imperium von Brasilien über Goa und Malakka bis Macau – Handel statt Flächenkolonisation. Portugal begründet leider auch den transatlantischen <b>Sklavenhandel</b>. Der Niedergang: 1580–1640 in Personalunion mit Spanien gefangen, verliert es Stützpunkte an die Niederländer; das Erdbeben von Lissabon 1755 (das Voltaire am guten Gott zweifeln lässt) symbolisiert das Ende der Größe.</p>`,
    wiki: ["Portugiesische Kolonialgeschichte", "Vasco da Gama", "Heinrich der Seefahrer", "Vertrag von Tordesillas"]
  },
  {
    match: /sweden|swedish/i, from: 1611, to: 1721,
    title: "Schweden – Großmacht des Nordens",
    html: `
      <p>Das arme, dünn besiedelte Schweden wird für ein Jahrhundert Großmacht – durch Heeresreform (nationale Wehrpflicht statt Söldner), Kupfer- und Eisenexporte und geniale Feldherren: <b>Gustav II. Adolf</b> greift 1630 in den Dreißigjährigen Krieg ein, siegt bei Breitenfeld, fällt bei Lützen (1632) – im Westfälischen Frieden kassiert Schweden Vorpommern und macht die Ostsee fast zum Binnenmeer.</p>
      <p>Das Ende kommt mit <b>Karl XII.</b>: Der Soldatenkönig kämpft im Großen Nordischen Krieg (1700–21) gegen Dänemark, Polen und Russland gleichzeitig – nach Anfangssiegen (Narva 1700) endet der Marsch auf Moskau 1709 bei <b>Poltawa</b> in der Katastrophe. Russland übernimmt die Ostseeherrschaft; Schweden zieht sich dauerhaft aus der Großmachtpolitik zurück – und fährt damit bis heute gut.</p>`,
    wiki: ["Schwedisches Reich", "Gustav II. Adolf", "Karl XII.", "Großer Nordischer Krieg"]
  },
  {
    match: /poland|lithuania|rzeczpospolita/i, from: 1386, to: 1795,
    title: "Polen-Litauen – Größe und Untergang einer Adelsrepublik",
    html: `
      <p>Durch die Union mit Litauen (1386/1569) entsteht der größte Staat Europas – und der ungewöhnlichste: eine <b>Adelsrepublik</b> mit gewähltem König, Parlament (Sejm) und früher religiöser Toleranz (Konföderation von Warschau 1573, während anderswo Glaubenskriege toben). 1683 rettet König Jan Sobieski Wien vor den Osmanen.</p>
      <p>Die Stärke wird zur Schwäche: Das <b>Liberum Veto</b> (jeder einzelne Abgeordnete kann jeden Beschluss kippen!) lähmt den Staat; Nachbarn kaufen sich Abgeordnete und halten Polen gezielt schwach. Als die Reformer 1791 die erste moderne Verfassung Europas beschließen, ist es zu spät: Russland, Preußen und Österreich <b>teilen Polen 1772, 1793 und 1795</b> vollständig auf – 123 Jahre verschwindet der Staat von der Karte, die Nation überlebt in Sprache und Kultur.</p>`,
    wiki: ["Polen-Litauen", "Teilungen Polens", "Liberum Veto", "Verfassung vom 3. Mai 1791", "Johann III. Sobieski"]
  },
  {
    match: /japan/i, from: 1600, to: 1945,
    title: "Japan – Abschottung und Blitz-Modernisierung",
    html: `
      <p>Nach der Einigung des Landes errichten die <b>Tokugawa-Shogune</b> (ab 1603) eine einzigartige Ordnung: 250 Jahre Frieden durch Abschottung (Sakoku) – Ausländer raus, Christentum verboten, nur ein holländischer Handelsposten bleibt. Die Samurai werden von Kriegern zu Beamten, Städte und Kultur blühen (Kabuki, Haiku, Holzschnitte).</p>
      <p>1853 erzwingen die „Schwarzen Schiffe“ des US-Commodore Perry die Öffnung. Japans Antwort ist einzigartig: Statt Kolonie zu werden, modernisiert es sich selbst radikal – <b>Meiji-Restauration</b> 1868: Verfassung nach preußischem Muster, Industrie, Wehrpflicht, Schulpflicht, alles in einer Generation. 1895 schlägt es China, <b>1905 Russland</b> – die erste Niederlage einer europäischen Großmacht gegen eine asiatische Macht elektrisiert die kolonisierte Welt. Der Weg führt weiter in Militarismus und Expansion (Korea, Mandschurei, China 1937, Pearl Harbor 1941) – bis zur Katastrophe von Hiroshima und Nagasaki 1945.</p>`,
    wiki: ["Tokugawa-Shōgunat", "Meiji-Restauration", "Russisch-Japanischer Krieg", "Pazifikkrieg"]
  },
  {
    match: /mughal|mogul/i, from: 1526, to: 1857,
    title: "Das Mogulreich in Indien",
    html: `
      <p>Babur, ein Nachfahre Timurs und Dschingis Khans, erobert 1526 Delhi. Sein Enkel <b>Akbar der Große</b> (1556–1605) regiert genial: Er heiratet Hindu-Prinzessinnen, schafft die Sondersteuer für Nicht-Muslime ab, holt Hindus in die Verwaltung, diskutiert mit Gelehrten aller Religionen – Herrschaft durch Integration im mehrheitlich hinduistischen Land. Unter seinen Nachfolgern entstehen Taj Mahal (Shah Jahan) und ~25 % der Weltwirtschaftsleistung – Indien ist das reichste Land der Erde.</p>
      <p><b>Aurangzeb</b> (1658–1707) dehnt das Reich maximal aus, kehrt aber zur strengen Islampolitik zurück – Aufstände (Marathen, Sikhs) zerrütten das Reich. In das Machtvakuum stößt die britische <b>East India Company</b>: ab Plassey 1757 erobert eine Handelsfirma (!) den Subkontinent. Nach dem großen Aufstand von 1857 wird der letzte Mogul abgesetzt – Indien wird britische Kronkolonie.</p>`,
    wiki: ["Mogulreich", "Akbar (Großmogul)", "Taj Mahal", "Britische Ostindien-Kompanie", "Indischer Aufstand von 1857"]
  },
  {
    match: /maurya|gupta/i, from: -330, to: 600,
    title: "Indiens klassische Reiche",
    html: `
      <p>Das <b>Maurya-Reich</b> (ab ~320 v. Chr.) eint erstmals fast ganz Indien. Kaiser <b>Ashoka</b> (~268–232 v. Chr.) durchläuft nach dem blutigen Kalinga-Feldzug eine der bemerkenswertesten Wandlungen der Geschichte: Er bereut öffentlich, wendet sich dem Buddhismus zu und regiert fortan nach dem Prinzip der Gewaltlosigkeit – seine in Fels gemeißelten Edikte predigen Toleranz und Fürsorge. Er macht den Buddhismus zur Weltreligion (Mission bis Sri Lanka und Zentralasien).</p>
      <p>Das <b>Gupta-Reich</b> (~320–550 n. Chr.) gilt als Indiens goldenes Zeitalter: Die Mathematiker erfinden das <b>Dezimalsystem mit der Null</b> (über die Araber kommt es als „arabische Ziffern“ zu uns – kaum eine Erfindung war folgenreicher), Aryabhata berechnet Pi und die Erdrotation, Kalidasa dichtet Klassiker des Sanskrit.</p>`,
    wiki: ["Maurya-Reich", "Ashoka", "Gupta-Reich", "Indische Ziffern"]
  },
  {
    match: /persia|persian|achaemenid|safavid|sassanid|sasanian|parthia/i, from: -560, to: 651,
    title: "Persien – die erste Supermacht",
    html: `
      <p>Kyros der Große schafft ab 550 v. Chr. das <b>Achämenidenreich</b> – das erste Weltreich: von Ägypten bis zum Indus, verbunden durch Königsstraßen (2.700 km, Kuriere in einer Woche – „weder Schnee noch Regen…“ stammt von Herodots Beschreibung), Satrapien-Verwaltung, Toleranz (Kyros lässt die Juden aus Babylon heimkehren – die Bibel nennt ihn „Gesalbten“). Persepolis zeigt die Pracht. 330 v. Chr. erobert Alexander alles.</p>
      <p>Danach bleiben die <b>Parther</b> und <b>Sassaniden</b> (224–651 n. Chr.) 700 Jahre Roms ebenbürtige Rivalen im Osten – mehrere römische Kaiser fallen oder geraten in Gefangenschaft. Der Erschöpfungskrieg gegen Byzanz (602–628) öffnet den Arabern das Tor: 651 fällt das Reich, Persien wird islamisch – behält aber Sprache und Identität (und prägt die islamische Kultur tiefgreifend mit).</p>`,
    wiki: ["Achämenidenreich", "Kyros II.", "Sassanidenreich", "Persepolis", "Zoroastrismus"]
  },
  {
    match: /inca|inka/i, from: 1200, to: 1572,
    title: "Das Inkareich",
    html: `
      <p>Tawantinsuyu („Reich der vier Teile“) ist um 1500 das größte Reich Amerikas: 4.000 km entlang der Anden, ~10 Mio. Einwohner – regiert <b>ohne Schrift, Rad und Eisen</b>: Verwaltung über Knotenschnüre (Quipu), 40.000 km Straßennetz mit Laufboten, Terrassenfeldbau, Vorratswirtschaft (jeder arbeitet für den Staat, der Staat sorgt für alle – eine Art Planwirtschaft). Machu Picchu zeugt von der Baukunst.</p>
      <p>1532 landet <b>Pizarro</b> mit 168 Mann – und stürzt das Millionenreich: Pocken (vorausgeeilt, töteten schon den Herrscher), ein Bürgerkrieg zwischen den Erben, Stahlwaffen, Pferde und skrupellose Geiselnahme des Inka Atahualpa (Lösegeld: ein Raum voll Gold – dann Hinrichtung). Bis 1572 hält ein Restreich in den Bergen aus; das Silber von Potosí fließt fortan nach Spanien – gefördert von Zwangsarbeitern.</p>`,
    wiki: ["Inka", "Francisco Pizarro", "Machu Picchu", "Atahualpa"]
  },
  {
    match: /aztec|mexica|azteken/i, from: 1300, to: 1521,
    title: "Das Aztekenreich",
    html: `
      <p>Die Mexica gründen 1325 <b>Tenochtitlán</b> auf einer Insel im Texcoco-See – 1519 mit ~200.000 Einwohnern größer als jede europäische Stadt, mit Kanälen, schwimmenden Gärten (Chinampas), riesigen Tempelpyramiden. Das Reich ist ein Tribut-Imperium: unterworfene Städte liefern Waren – und Menschen für die Opferrituale (die Götter brauchen Blut, damit die Sonne aufgeht – so die Weltsicht).</p>
      <p>1519 landet <b>Cortés</b> mit ~500 Mann. Sein Erfolgsrezept: Allianzen mit tributpflichtigen Feinden der Azteken (v. a. Tlaxcala – die Eroberung ist auch ein indigener Aufstand), Pocken (töten ~40 % der Bevölkerung), Stahl, Pferde, Schiffe auf dem See. 1521 fällt Tenochtitlán nach brutaler Belagerung; auf den Trümmern entsteht Mexiko-Stadt.</p>`,
    wiki: ["Azteken", "Tenochtitlán", "Hernán Cortés", "Spanische Eroberung Mexikos"]
  },
  {
    match: /egypt|ägypten/i, from: -3000, to: -330,
    title: "Das Alte Ägypten",
    html: `
      <p>3000 Jahre Hochkultur am Nil – länger als von Christi Geburt bis heute. Der Fluss macht's möglich: Die jährliche Flut düngt die Felder, der Staat organisiert Bewässerung und Vorratshaltung; der <b>Pharao</b> ist Gott auf Erden und Garant der kosmischen Ordnung (Maat). Altes Reich: die Pyramiden (Gizeh ~2560 v. Chr. – 4500 Jahre alt!). Mittleres und Neues Reich: Expansion bis Syrien, Ramses II., Tutanchamun, Echnatons kurzes Experiment eines Ein-Gott-Glaubens.</p>
      <p>Die Besessenheit vom Jenseits (Mumifizierung, Totenbuch) schenkt uns das meiste Wissen – Gräber überdauern, Städte nicht. Ab ~1000 v. Chr. wird Ägypten Spielball fremder Mächte (Nubier, Assyrer, Perser), bis Alexander es 332 v. Chr. kampflos übernimmt.</p>`,
    wiki: ["Altes Ägypten", "Pharao", "Pyramiden von Gizeh", "Ramses II.", "Maat (ägyptische Mythologie)"]
  },
  {
    match: /macedon/i, from: -360, to: -140,
    title: "Makedonien und Alexander der Große",
    html: `
      <p>Philipp II. macht den belächelten Randstaat zur Militärmacht (Phalanx mit 6-Meter-Lanzen, Berufsarmee) und unterwirft Griechenland (Chaironeia 338 v. Chr.). Sein Sohn <b>Alexander</b> (20 Jahre alt beim Amtsantritt, Schüler des Aristoteles) führt den geplanten Persienfeldzug aus – und übertrifft alle Vorstellungen: Issos, Gaugamela, Ägypten (Gründung Alexandrias), Persepolis, bis nach Indien – <b>in elf Jahren unbesiegt zum größten Reich der bisherigen Geschichte</b>. 323 v. Chr. stirbt er in Babylon, 32-jährig.</p>
      <p>Sein Reich zerfällt sofort unter den Diadochen („Nachfolgern“) – doch seine eigentliche Eroberung bleibt: der <b>Hellenismus</b>. Griechische Sprache, Städte und Kultur prägen den Orient 300 Jahre; ohne sie kein Neues Testament auf Griechisch, keine Bibliothek von Alexandria.</p>`,
    wiki: ["Alexander der Große", "Makedonien (antikes Königreich)", "Hellenismus", "Diadochen"]
  },
  {
    match: /greece|greek|athens|sparta/i, from: -800, to: -330,
    title: "Das antike Griechenland",
    html: `
      <p>Kein Reich, sondern ~1000 zerstrittene Stadtstaaten (Poleis) mit gemeinsamer Sprache, Göttern und Spielen (Olympia ab 776 v. Chr.). Gerade die Konkurrenz treibt die Innovation: <b>Athen</b> erfindet die Demokratie (Kleisthenes 508 v. Chr.: Volksversammlung, Losverfahren für Ämter!), <b>Sparta</b> perfektioniert den Kasernenstaat.</p>
      <p>Der Abwehrsieg gegen die persische Supermacht (Marathon 490, Salamis 480 v. Chr.) verleiht Flügel: Unter Perikles baut Athen den Parthenon, Aischylos/Sophokles/Euripides erfinden das Drama, Herodot/Thukydides die Geschichtsschreibung, Sokrates stellt auf dem Marktplatz die Fragen, an denen die Philosophie bis heute kaut. Der <b>Peloponnesische Krieg</b> (431–404) zwischen Athen und Sparta ruiniert alle – Thukydides' Analyse der Machtpolitik liest man an Militärakademien bis heute. 338 v. Chr. beendet Makedonien die Freiheit der Poleis.</p>`,
    wiki: ["Antikes Griechenland", "Attische Demokratie", "Perikles", "Peloponnesischer Krieg", "Sokrates"]
  },
  {
    match: /carthage|karthago/i, from: -814, to: -146,
    title: "Karthago",
    html: `
      <p>Die phönizische Kolonie (gegr. ~814 v. Chr., heute Tunis) wird zur reichsten Handelsmacht des westlichen Mittelmeers: Seehandelsmonopole, Silberminen in Spanien, Erkundungsfahrten bis Westafrika und Britannien. Regiert wird sie als Oligarchie der Kaufmannsfamilien – Aristoteles lobt die Verfassung.</p>
      <p>Der Zusammenstoß mit Rom wird zum Weltkrieg der Antike: Drei <b>Punische Kriege</b> (264–146 v. Chr.). <b>Hannibals</b> Alpenüberquerung mit Kriegselefanten und der Vernichtungssieg von Cannae (216 v. Chr.) bringen Rom an den Rand – doch Karthago lässt seinen Feldherrn ohne Nachschub, Rom gewinnt durch Zähigkeit und Bündnistreue der Italiker. 146 v. Chr. vollstreckt Rom Catos Mantra „Carthago delenda est“: Die Stadt wird ausradiert, der Boden der Legende nach mit Salz bestreut.</p>`,
    wiki: ["Karthago", "Punische Kriege", "Hannibal", "Schlacht von Cannae"]
  },
  {
    match: /mali|songhai/i, from: 1200, to: 1600,
    title: "Mali und Songhai – Goldreiche Westafrikas",
    html: `
      <p>Wer war der reichste Mensch der Geschichte? Viele Historiker sagen: <b>Mansa Musa</b>, Herrscher von Mali. Seine Pilgerfahrt nach Mekka 1324 mit tonnenweise Gold ließ den Goldpreis in Kairo jahrelang abstürzen. Malis Reichtum: Kontrolle des Transsahara-Handels – Gold und Sklaven nach Norden, Salz nach Süden.</p>
      <p><b>Timbuktu</b> wird Handels- UND Bildungszentrum: Die Universität von Sankóre und private Bibliotheken sammeln zehntausende Handschriften (viele bis heute erhalten) – Jura, Astronomie, Medizin. Das Nachfolgereich <b>Songhai</b> (15./16. Jh.) wird noch größer, fällt aber 1591 einer marokkanischen Invasion mit Feuerwaffen zum Opfer. Die Reiche widerlegen den kolonialen Mythos eines „geschichtslosen“ Afrika.</p>`,
    wiki: ["Malireich", "Mansa Musa", "Timbuktu", "Songhaireich"]
  },
  {
    match: /frank|carolingian/i, from: 480, to: 900,
    title: "Das Frankenreich",
    html: `
      <p><b>Chlodwig</b> (ab 481) eint die fränkischen Stämme und trifft die Jahrtausendentscheidung: Er lässt sich <b>katholisch</b> taufen (nicht arianisch wie andere Germanenkönige) – die Allianz von Franken und römischer Kirche prägt Europa. 732 stoppt Hausmeier Karl Martell die Araber bei Tours; sein Enkel <b>Karl der Große</b> (768–814) schafft das größte Reich des Westens seit Rom: Sachsen (brutal missioniert), Langobarden, Bayern – und am Weihnachtstag 800 die <b>Kaiserkrönung in Rom</b>.</p>
      <p>Karl regiert über Pfalzen (Aachen!), Grafen und Königsboten, fördert Bildung (Hofschule, karolingische Minuskel – Vorfahrin unserer Kleinbuchstaben). Nach ihm zerfällt das Reich: Der <b>Vertrag von Verdun 843</b> teilt es unter drei Enkeln – aus dem Westteil wird Frankreich, aus dem Ostteil Deutschland. Beide Länder feiern Karl als Gründervater („Vater Europas“).</p>`,
    wiki: ["Fränkisches Reich", "Karl der Große", "Chlodwig I.", "Vertrag von Verdun", "Karolingische Renaissance"]
  },
  {
    match: /viking|norse|norway|denmark|danelaw/i, from: 790, to: 1100,
    title: "Die Wikingerzeit",
    html: `
      <p>793 überfallen Nordmänner das Kloster Lindisfarne – der Schock hallt durch Europa. 300 Jahre lang sind die Wikinger Schrecken und Motor zugleich: Ihre Langschiffe (seetüchtig UND flussgängig – bis Paris und Sevilla!) machen sie unberechenbar. Aber sie sind mehr als Räuber: <b>Händler</b> (Netz von Grönland bis Bagdad, Silberhandel über Russland), <b>Entdecker</b> (Island, Grönland, um 1000 Amerika – Leif Eriksson, 500 Jahre vor Kolumbus) und <b>Staatsgründer</b>: die Normandie (911), das Danelag in England, die Kiewer Rus – Rurik und seine Waräger geben Russland den Namen.</p>
      <p>Das Ende der Wikingerzeit ist ihre Integration: Christianisierung, feste Königreiche (Dänemark, Norwegen, Schweden). Letzter Akt 1066: Der Norweger Harald Hardrada fällt in England – drei Wochen bevor der Normanne (!) Wilhelm bei Hastings siegt.</p>`,
    wiki: ["Wikinger", "Wikingerzeit", "Leif Eriksson", "Kiewer Rus", "Normannen"]
  },
  {
    match: /israel|judah|judea/i, from: -1050, to: 140,
    title: "Israel und Juda – kleine Reiche, große Wirkung",
    html: `
      <p>Politisch sind Israel und Juda Kleinstaaten zwischen den Großmächten – ihre welthistorische Bedeutung ist religiös: Hier entsteht der <b>Monotheismus</b>, der Glaube an den einen Gott, aus dem Judentum, Christentum und Islam hervorgehen – heute mehr als die Hälfte der Menschheit.</p>
      <p>Stationen: Königtum unter David und Salomo (~1000 v. Chr., erster Tempel), Teilung, Untergang Israels an Assyrien (722 v. Chr.), Zerstörung Jerusalems durch Babylon (587 v. Chr.) – im <b>Exil</b> formt sich die hebräische Bibel und ein revolutionäres Konzept: Gott ist an keinen Ort gebunden, Religion lebt in Schrift und Gemeinschaft. Nach Rückkehr (unter Kyros) und zweitem Tempel folgen griechische und römische Herrschaft; die Aufstände gegen Rom (70 n. Chr. Tempelzerstörung, 135 Bar Kochba) führen in die fast 2000-jährige <b>Diaspora</b>. Aus einer jüdischen Sekte wird derweil das Christentum.</p>`,
    wiki: ["Geschichte Israels (Altertum)", "Babylonisches Exil", "Jüdischer Krieg", "Monotheismus"]
  },
  {
    match: /venice|venezia|genoa/i, from: 1000, to: 1797,
    title: "Venedig – Seerepublik und Handelsimperium",
    html: `
      <p>Auf Pfählen in einer Lagune gebaut, ohne Land, ohne Rohstoffe – und jahrhundertelang die reichste Stadt Europas. Venedigs Kapital: Lage und Organisation. Es beherrscht den Handel zwischen Orient und Okzident (Gewürze, Seide), das Arsenal ist die erste „Fabrik“ Europas (ein Kriegsschiff pro Tag!), Doppelte Buchführung und Staatsanleihen werden hier Alltag.</p>
      <p>Die Verfassung fasziniert: gewählter Doge auf Lebenszeit, aber durch Räte streng kontrolliert – Stabilität ohne Dynastie, 1100 Jahre lang. Skrupellos auch: 1204 lenkt Venedig den Vierten Kreuzzug auf das christliche (!) Konstantinopel um und plündert es. Der Niedergang kommt mit der Verlagerung des Welthandels auf den Atlantik (nach 1500) und den Osmanenkriegen; 1797 löst Napoleon die Republik beiläufig auf.</p>`,
    wiki: ["Republik Venedig", "Doge", "Vierter Kreuzzug", "Markusdom"]
  },
  {
    match: /kievan|kiev|rus/i, from: 860, to: 1250,
    title: "Die Kiewer Rus",
    html: `
      <p>Wikingische Händler-Krieger (Waräger) gründen entlang der Flusswege von der Ostsee zum Schwarzen Meer ein Reich – der legendäre Rurik gibt Russland den Namen. Kiew kontrolliert den lukrativen Handel nach Byzanz (Pelze, Wachs, Sklaven gegen Seide und Silber).</p>
      <p>988 trifft Großfürst <b>Wladimir</b> die Jahrtausendentscheidung: Er nimmt das <b>orthodoxe Christentum</b> aus Byzanz an (der Legende nach, weil seine Gesandten von der Hagia Sophia überwältigt waren) – damit orientiert sich Osteuropa nach Konstantinopel statt Rom: kyrillische Schrift, Ikonen, Zwiebeltürme. Unter Jaroslaw dem Weisen (11. Jh.) ist Kiew eine der größten Städte Europas. Erbteilungen zersplittern das Reich; 1240 zerstören die Mongolen Kiew – die Zukunft gehört dem nördlichen Moskau, das unter dem „Tatarenjoch“ groß wird. Um das Erbe der Rus streiten sich Russland und die Ukraine bis heute.</p>`,
    wiki: ["Kiewer Rus", "Wladimir I.", "Waräger", "Jaroslaw der Weise"]
  },
  {
    match: /seljuk|seldschuk/i, from: 1040, to: 1310,
    title: "Die Seldschuken",
    html: `
      <p>Turkstämme aus Zentralasien nehmen den sunnitischen Islam an und übernehmen im 11. Jh. die reale Macht im Kalifat – der Kalif segnet, der seldschukische Sultan herrscht. 1071 schlagen sie bei <b>Manzikert</b> Byzanz vernichtend: Anatolien wird türkisch – die Geburtsstunde der heutigen Türkei und zugleich der Auslöser der Kreuzzüge (der byzantinische Hilferuf an den Papst).</p>
      <p>Unter dem genialen Wesir <b>Nizam al-Mulk</b> entstehen die Madrasa-Hochschulen; der Dichter und Mathematiker Omar Chayyam wirkt am Hof. Wie viele Steppenreiche zerfällt auch dieses durch Erbteilung; das anatolische Sultanat der Rum-Seldschuken lebt weiter, bis die Mongolen kommen – in den Trümmern steigt um 1300 ein kleines Grenzfürstentum auf: die Osmanen.</p>`,
    wiki: ["Seldschuken", "Schlacht bei Manzikert", "Nizam al-Mulk", "Sultanat der Rum-Seldschuken"]
  },
  {
    match: /crusader|jerusalem|antioch|tripoli|edessa|outremer/i, from: 1099, to: 1291,
    title: "Die Kreuzfahrerstaaten",
    html: `
      <p>Nach der Eroberung Jerusalems 1099 entstehen vier „Outremer“-Staaten („Übersee“): das Königreich Jerusalem, Antiochia, Tripolis und Edessa – katholische Inseln in der islamischen Welt, gehalten von Ritterorden (<b>Templer, Johanniter, Deutscher Orden</b>) und gewaltigen Burgen wie dem Krak des Chevaliers.</p>
      <p>Der Fall Edessas (1144) löst den Zweiten Kreuzzug aus; 1187 vernichtet <b>Saladin</b> das Kreuzfahrerheer bei Hattin und nimmt Jerusalem – bemerkenswert unblutig, ganz anders als 1099. Der Dritte Kreuzzug (Richard Löwenherz gegen Saladin) wird zum ritterlichen Duell ohne Entscheidung. Danach verkommt die Idee: Der Vierte Kreuzzug plündert 1204 das christliche Konstantinopel. 1291 fällt Akkon, der letzte Stützpunkt. Bleibende Wirkung: Handel (Venedig, Genua), Wissenstransfer – und ein bis heute nachwirkendes Trauma im Verhältnis von Orient und Okzident.</p>`,
    wiki: ["Kreuzfahrerstaaten", "Königreich Jerusalem", "Saladin", "Schlacht bei Hattin", "Templerorden"]
  },
  {
    match: /mamluk|mameluk/i, from: 1250, to: 1517,
    title: "Das Mamluken-Sultanat",
    html: `
      <p>Die kurioseste Herrschaftsform des Mittelalters: <b>Militärsklaven regieren ein Reich</b>. Mamluken – als Kinder gekaufte Turk- und Tscherkessensklaven, zu Elitekriegern ausgebildet – stürzen 1250 ihre ägyptischen Herren. Der Thron ist nicht erblich: Wer aufsteigen will, muss selbst als Sklave gedient haben.</p>
      <p>Ihre Sternstunde: <b>Ain Dschalut 1260</b> – die erste echte Niederlage der Mongolen, Ägypten und Syrien bleiben verschont. 1291 werfen sie mit Akkon die letzten Kreuzfahrer ins Meer. Kairo wird zur größten Stadt des Islam, Zentrum von Handel (Gewürzmonopol!) und Gelehrsamkeit. Das Ende kommt 1516/17: Die Osmanen siegen mit Feuerwaffen, die die stolzen Reiterkrieger verachtet hatten – eine Lektion über verpasste Militärrevolutionen.</p>`,
    wiki: ["Mamluken", "Schlacht bei ʿAin Dschālūt", "Kairo", "Baibars I."]
  },
  {
    match: /safavid|safawid/i, from: 1501, to: 1736,
    title: "Das Safawidenreich – Persiens Wiedergeburt",
    html: `
      <p>1501 macht Schah Ismail I. den <b>schiitischen Islam zur Staatsreligion</b> Persiens – die folgenreichste Konfessionsentscheidung der islamischen Geschichte: Bis heute ist der Iran das schiitische Zentrum der Welt, im Dauergegensatz zu den sunnitischen Nachbarn (damals: Erzfeind Osmanen, Kriege über 200 Jahre).</p>
      <p>Unter <b>Abbas dem Großen</b> (1588–1629) blüht das Reich: Die neue Hauptstadt <b>Isfahan</b> („Isfahan ist die halbe Welt“) glänzt mit dem Königsplatz, Seidenhandel mit Europa, Armeereform mit Feuerwaffen. Das Reich verbindet persische Kultur, schiitischen Glauben und turkstämmiges Militär – die Grundlage des modernen Iran. Nach schwachen Nachfolgern erobern 1722 afghanische Rebellen Isfahan; der Eroberer Nadir Schah beendet die Dynastie endgültig.</p>`,
    wiki: ["Safawiden", "Abbas I. (Schah)", "Isfahan", "Schiiten"]
  },
  {
    match: /florence|tuscany|milan|papal|naples|savoy|sicily|^italy/i, from: 1400, to: 1559,
    title: "Italien – die Renaissance",
    html: `
      <p>Italien ist kein Staat, sondern ein Konzert rivalisierender Mächte: Mailand, Venedig, <b>Florenz</b>, der Kirchenstaat, Neapel. Genau diese Konkurrenz – plus der Reichtum aus Handel und Bankwesen – zündet die <b>Renaissance</b>: Die <b>Medici</b> (Bankiers, dann Herren von Florenz) finanzieren Brunelleschis Dom-Kuppel, Botticelli, Michelangelo; Päpste bauen den Petersdom (dessen Ablassfinanzierung Luther provoziert!); <b>Leonardo da Vinci</b> wechselt zwischen den Höfen.</p>
      <p>Die „Wiedergeburt“ der Antike verändert das Denken: Der Mensch als Maß, Perspektive in der Malerei, Philologie statt blinder Autorität, <b>Machiavelli</b> analysiert Macht schonungslos. Politisch endet die Herrlichkeit im Desaster: Ab 1494 wird Italien zum Schlachtfeld der Großmächte (Italienische Kriege) – 1527 plündern kaiserliche Söldner sogar Rom („Sacco di Roma“). Kulturell aber erobert Italien Europa.</p>`,
    wiki: ["Renaissance", "Medici", "Leonardo da Vinci", "Michelangelo", "Sacco di Roma"]
  },
  {
    match: /^italy|sardinia|piedmont/i, from: 1815, to: 1946,
    title: "Italien – Einigung, Weltkrieg, Faschismus",
    html: `
      <p>Das <b>Risorgimento</b> („Wiedererstehung“) eint das zersplitterte Italien: Cavour, der Realpolitiker Piemonts, nutzt Diplomatie und Kriege; <b>Garibaldi</b>, der Volksheld, erobert mit 1000 Rothemden Sizilien und Neapel – 1861 Königreich Italien, 1870 fällt Rom. Doch „Italien ist gemacht, nun müssen wir Italiener machen“: Nord-Süd-Gefälle und Massenauswanderung bleiben.</p>
      <p>Der Erste Weltkrieg bringt trotz Sieg nur „verstümmelten Frieden“ – die Enttäuschung nutzt <b>Mussolini</b>: 1922 „Marsch auf Rom“, der König kapituliert, es entsteht die erste <b>faschistische Diktatur</b> – Vorbild für Hitler. Abenteuer in Äthiopien (1935, mit Giftgas), Achse mit Berlin, desaströser Kriegseintritt 1940. 1943 stürzt der eigene Große Rat den „Duce“; 1946 stimmen die Italiener für die Republik.</p>`,
    wiki: ["Risorgimento", "Giuseppe Garibaldi", "Benito Mussolini", "Italienischer Faschismus"]
  },
  {
    match: /khmer|angkor/i, from: 800, to: 1450,
    title: "Das Khmer-Reich von Angkor",
    html: `
      <p>Das mächtigste Reich Südostasiens beherrscht vom 9. bis 15. Jh. das heutige Kambodscha, Thailand, Laos. Sein Geheimnis: <b>Wasserbau</b> – riesige Stauseen (Barays) und Kanäle zähmen den Monsun und erlauben mehrere Reisernten. Angkor ist mit geschätzt bis zu einer Million Einwohnern die größte Stadt der vorindustriellen Welt.</p>
      <p><b>Angkor Wat</b> (12. Jh.), erst Vishnu-Tempel, dann buddhistisch, ist das größte religiöse Bauwerk der Erde – der Übergang vom Hinduismus zum Buddhismus prägt die Region bis heute. Der Niedergang: Dürren und Fluten (Klimaschwankungen!), Kriege mit Siam – 1431 plündern die Thai Angkor, der Dschungel übernimmt die Stadt, bis sie im 19. Jh. „wiederentdeckt“ wird.</p>`,
    wiki: ["Angkor", "Angkor Wat", "Khmer-Reich"]
  },
  {
    match: /aksum|axum|ethiopia|abyssinia|äthiopien/i, from: 100, to: 1974,
    title: "Aksum und Äthiopien",
    html: `
      <p>Das Reich von <b>Aksum</b> (1.–7. Jh.) ist eine Weltmacht des Altertums: Es kontrolliert den Rotmeer-Handel zwischen Rom und Indien, prägt eigene Goldmünzen und errichtet monolithische Riesenstelen. Um 330 wird es – noch vor Rom! – <b>christlich</b>: Äthiopien ist damit eines der ältesten christlichen Länder der Welt, mit eigener Kirche, eigener Schrift (Ge'ez) und der Legende der Bundeslade in Aksum.</p>
      <p>Vom Islam umschlossen, überdauert das christliche Hochlandreich isoliert („vergessene Festung“). Im 19. Jh. gelingt das Seltene: <b>Äthiopien bleibt unabhängig</b> – 1896 schlägt Kaiser Menelik II. bei <b>Adwa</b> die italienische Kolonialarmee, der einzige dauerhafte Sieg eines afrikanischen Staates über eine europäische Kolonialmacht. Haile Selassie, der letzte Kaiser (bis 1974), wird zur Weltfigur (und zur Messiasgestalt der Rastafari).</p>`,
    wiki: ["Aksumitisches Reich", "Äthiopisch-Orthodoxe Tewahedo-Kirche", "Schlacht von Adua", "Haile Selassie"]
  },
  {
    match: /korea|joseon|choson|goryeo/i, from: 900, to: 1910,
    title: "Korea – Goryeo und Joseon",
    html: `
      <p>Goryeo (918–1392, daher „Korea“) übersteht sogar die Mongolen als Vasall mit Eigenleben und druckt im 13. Jh. den buddhistischen Kanon von 80.000 Holztafeln. Die <b>Joseon-Dynastie</b> (1392–1910, eine der langlebigsten der Weltgeschichte) macht den Konfuzianismus zur Staatslehre – Beamtenprüfungen, Ahnenkult, strenge Ständeordnung.</p>
      <p>Glanzstück: König <b>Sejong der Große</b> erfindet 1443 mit Gelehrten das Alphabet <b>Hangul</b> – wissenschaftlich konstruiert, damit „ein kluger Mann es an einem Morgen lernt“. Die Invasionen Japans (1592–98, abgewehrt u. a. durch Admiral Yi Sun-sins „Schildkrötenschiffe“) und der Mandschu verwüsten das Land; Korea schottet sich ab („Einsiedlerkönigreich“), bis Japan es 1876 öffnet und 1910 brutal annektiert – die Wurzel der bis heute gespaltenen Halbinsel.</p>`,
    wiki: ["Joseon-Dynastie", "Sejong", "Hangul", "Imjin-Krieg", "Yi Sun-sin"]
  },
  {
    match: /british raj|british india|^india/i, from: 1757, to: 1947,
    title: "Britisch-Indien – das „Kronjuwel“",
    html: `
      <p>Erst erobert eine Aktiengesellschaft einen Subkontinent: Die <b>East India Company</b> siegt 1757 bei Plassey und regiert 100 Jahre mit eigener Armee – Steuern statt Handel werden das Geschäft. Nach dem großen Aufstand von 1857 (ausgelöst u. a. durch mit Tierfett gefettete Patronen – ein Symbol tieferer Wut) übernimmt die Krone direkt: das <b>British Raj</b>, Victoria wird „Kaiserin von Indien“.</p>
      <p>Bilanz mit zwei Gesichtern: Eisenbahnen, Verwaltung, englische Sprache – aber auch Deindustrialisierung (Indiens Weltmarktanteil stürzt ab), wiederkehrende Hungersnöte mit Millionen Toten und das Massaker von Amritsar (1919). <b>Gandhi</b> verwandelt den Widerstand in eine Massenbewegung neuen Typs: <b>gewaltfreier ziviler Ungehorsam</b> – Salzmarsch 1930, „Quit India“ 1942. 1947 kommt die Freiheit, aber mit der <b>Teilung</b> in Indien und Pakistan: bis zu eine Million Tote, 15 Millionen Vertriebene.</p>`,
    wiki: ["Britisch-Indien", "Britische Ostindien-Kompanie", "Mohandas Karamchand Gandhi", "Teilung Indiens", "Massaker von Amritsar"]
  },
  {
    match: /^india/i, from: 1947, to: 2030,
    title: "Indien seit der Unabhängigkeit",
    html: `
      <p>Das unwahrscheinlichste Demokratie-Experiment der Welt: Hunderte Sprachen, alle Religionen, Massenarmut – und doch seit 1947 (fast) ununterbrochen Wahlen. Nehru setzt auf säkularen Staat, Planwirtschaft und Blockfreiheit; die Verfassung ächtet die Diskriminierung der „Unberührbaren“ (ihr Autor Ambedkar stammt selbst aus dieser Gruppe).</p>
      <p>Konflikte: drei Kriege mit Pakistan (v. a. um <b>Kaschmir</b>), 1962 Grenzkrieg mit China, 1974/98 Atommacht. Ab 1991 Wirtschaftsliberalisierung – IT-Boom („Silicon Valley“ Bangalore), wachsende Mittelschicht; seit ~2023 das <b>bevölkerungsreichste Land der Erde</b>. Unter Modi (ab 2014) wächst die Wirtschaft – und die Spannung zwischen säkularer Gründungsidee und Hindu-Nationalismus.</p>`,
    wiki: ["Indien", "Jawaharlal Nehru", "Kaschmir-Konflikt", "Bhimrao Ramji Ambedkar"]
  },
  {
    match: /israel/i, from: 1948, to: 2030,
    title: "Israel und der Nahostkonflikt",
    html: `
      <p>Aus dem Zionismus des 19. Jh. (Herzl: „Der Judenstaat“, 1896 – Antwort auf den europäischen Antisemitismus) und dem Schock des Holocaust entsteht 1948 der Staat Israel. Der UN-Teilungsplan wird von der arabischen Seite abgelehnt; im ersten Krieg 1948/49 behauptet sich Israel – für die Palästinenser die „Nakba“ (Katastrophe): ~700.000 Geflüchtete.</p>
      <p>Es folgen die Kriege 1956, <b>1967</b> (Sechstagekrieg: Israel erobert Westjordanland, Gaza, Golan, Sinai – die Besatzungsfrage prägt seither alles) und 1973. Frieden gelingt mit Ägypten (1979, Camp David) und Jordanien (1994); der Oslo-Prozess mit den Palästinensern (1993) bleibt unvollendet – Siedlungsbau, Intifadas und Terror zermürben ihn. Der Konflikt bleibt einer der ungelösten Knoten der Weltpolitik.</p>`,
    wiki: ["Israel", "Nahostkonflikt", "Sechstagekrieg", "UN-Teilungsplan für Palästina", "Oslo-Friedensprozess"]
  },
  {
    match: /yugoslavia|jugoslawien|serbia/i, from: 1918, to: 2006,
    title: "Jugoslawien – Traum und Zerfall",
    html: `
      <p>1918 aus den Trümmern Österreich-Ungarns geboren: ein Staat der Südslawen – Serben, Kroaten, Slowenen, Bosniaken, Montenegriner, Mazedonier, dazu Albaner im Kosovo. Im Zweiten Weltkrieg zerfleischt von Besatzung UND Bürgerkrieg (kroatische Ustascha, serbische Tschetniks, Titos Partisanen).</p>
      <p><b>Tito</b>, der Partisanenführer, hält das Land danach mit eigenwilligem Kurs zusammen: Bruch mit Stalin 1948, „Selbstverwaltungssozialismus“, Führung der Blockfreien – und harter Hand. Nach seinem Tod (1980) füllen Nationalisten (v. a. Milošević) das Vakuum: Ab 1991 zerfällt der Staat in <b>Kriegen</b>, die Europa beschämen – Belagerung Sarajevos, „ethnische Säuberungen“, der Völkermord von <b>Srebrenica</b> 1995 (8.000 Ermordete), 1999 NATO-Intervention im Kosovo. Heute: sieben Nachfolgestaaten, die Wunden nur teils verheilt.</p>`,
    wiki: ["Jugoslawien", "Josip Broz Tito", "Jugoslawienkriege", "Massaker von Srebrenica"]
  },
  {
    match: /spain|spanish/i, from: 1898, to: 1980,
    title: "Spanien – Bürgerkrieg und Franco-Diktatur",
    html: `
      <p>1898 verliert Spanien gegen die USA die letzten Kolonien (Kuba, Philippinen) – das „Desaster“ stürzt das Land in Dauerkrise: Monarchie, Diktatur, 1931 Republik. Deren Reformen (Landverteilung, Säkularisierung) spalten das Land unversöhnlich.</p>
      <p>1936 putscht das Militär unter <b>Franco</b> – der <b>Spanische Bürgerkrieg</b> (1936–39) wird zur Generalprobe des Weltkriegs: Hitler und Mussolini helfen Franco (die Legion Condor bombardiert <b>Guernica</b> – Picassos Bild macht es unsterblich), Stalin der Republik, Freiwillige aus aller Welt kämpfen in den Internationalen Brigaden. ~500.000 Tote, danach 36 Jahre Diktatur. Nach Francos Tod 1975 gelingt das Gegenmodell: die <b>Transición</b> – ausgehandelter Übergang zur Demokratie, König Juan Carlos stoppt 1981 den letzten Putschversuch.</p>`,
    wiki: ["Spanischer Bürgerkrieg", "Francisco Franco", "Guernica (Bild)", "Transition in Spanien"]
  },
  {
    match: /vietnam|indochina|annam|tonkin/i, from: 1850, to: 2010,
    title: "Vietnam – ein Jahrhundert Krieg um Unabhängigkeit",
    html: `
      <p>Frankreich erobert Indochina ab 1858 (Kautschuk, Reis, „Mission civilisatrice“). Der Widerstand findet in <b>Ho Chi Minh</b> seinen Kopf: Kommunist und Nationalist zugleich. 1954 vernichten die Viet Minh die Franzosen bei <b>Dien Bien Phu</b> – die Genfer Konferenz teilt das Land am 17. Breitengrad.</p>
      <p>Dann eskaliert der Kalte Krieg: Die USA fürchten den „Dominoeffekt“ und steigern sich ab 1965 in einen Massenkrieg – mehr Bombentonnage als im ganzen Zweiten Weltkrieg, Napalm, Agent Orange; die <b>Tet-Offensive</b> 1968 bricht Amerikas Willen an der Heimatfront. 1973 ziehen die USA ab, 1975 fällt Saigon. Bilanz: ~3 Mio. tote Vietnamesen, 58.000 tote Amerikaner. Das vereinte, kommunistische Vietnam öffnet ab 1986 („Đổi mới“) die Wirtschaft – heute boomt es, ausgerechnet mit den USA als Partner.</p>`,
    wiki: ["Vietnamkrieg", "Ho Chi Minh", "Schlacht von Điện Biên Phủ", "Tet-Offensive", "Französisch-Indochina"]
  },
  {
    match: /gran colombia|mexico|argentina|chile|^peru|bolivia|^colombia|venezuela|brazil/i, from: 1808, to: 1900,
    title: "Lateinamerikas Unabhängigkeit",
    html: `
      <p>Als Napoleon 1808 Spanien besetzt, bricht die koloniale Legitimität zusammen – die Kreolen (in Amerika geborene Spanier) nutzen die Stunde. <b>Simón Bolívar</b> („El Libertador“) befreit den Norden (Venezuela, Kolumbien, Ecuador, Bolivien), <b>San Martín</b> den Süden (Argentinien, Chile, Peru); 1824 fällt bei Ayacucho die letzte spanische Armee. Brasilien geht den Sonderweg: Der portugiesische Kronprinz erklärt es 1822 selbst unabhängig – Kaiserreich statt Republik, bis 1889.</p>
      <p>Bolívars Traum eines vereinten Lateinamerika scheitert („Amerika ist unregierbar; wer der Revolution dient, pflügt das Meer“) – stattdessen Caudillos, Grenzkriege und wirtschaftliche Abhängigkeit von neuen Herren: erst Großbritannien, dann USA (Monroe-Doktrin 1823: „Amerika den Amerikanern“). Die soziale Ordnung der Kolonialzeit – Großgrundbesitz, krasse Ungleichheit – überlebt die Unabhängigkeit weitgehend.</p>`,
    wiki: ["Südamerikanische Unabhängigkeitskriege", "Simón Bolívar", "José de San Martín", "Monroe-Doktrin"]
  }
];

// Deutsche Anzeigenamen für häufige (englische) Feature-Namen
const NAME_DE = {
  "France": "Frankreich", "Kingdom of France": "Königreich Frankreich",
  "Holy Roman Empire": "Heiliges Römisches Reich", "Germany": "Deutschland",
  "German Empire": "Deutsches Reich", "Prussia": "Preußen", "Brandenburg": "Brandenburg",
  "Austria": "Österreich", "Austria-Hungary": "Österreich-Ungarn", "Habsburg": "Habsburg",
  "Spain": "Spanien", "Portugal": "Portugal", "England": "England",
  "Great Britain": "Großbritannien", "United Kingdom": "Vereinigtes Königreich",
  "Scotland": "Schottland", "Ireland": "Irland", "Italy": "Italien",
  "Roman Empire": "Römisches Reich", "Roman Republic": "Römische Republik",
  "Western Roman Empire": "Weströmisches Reich", "Eastern Roman Empire": "Oströmisches Reich",
  "Byzantine Empire": "Byzantinisches Reich", "Byzantium": "Byzanz",
  "Ottoman Empire": "Osmanisches Reich", "Russia": "Russland",
  "Russian Empire": "Russisches Kaiserreich", "Soviet Union": "Sowjetunion", "USSR": "UdSSR",
  "Sweden": "Schweden", "Norway": "Norwegen", "Denmark": "Dänemark",
  "Poland": "Polen", "Poland-Lithuania": "Polen-Litauen", "Lithuania": "Litauen",
  "Hungary": "Ungarn", "Bohemia": "Böhmen", "Netherlands": "Niederlande",
  "Dutch Republic": "Republik der Niederlande", "Switzerland": "Schweiz",
  "Greece": "Griechenland", "Athens": "Athen", "Sparta": "Sparta", "Macedon": "Makedonien",
  "Macedonia": "Makedonien", "Egypt": "Ägypten", "Persia": "Persien",
  "Achaemenid Empire": "Achämenidenreich", "Parthia": "Partherreich",
  "Sassanid Empire": "Sassanidenreich", "Safavid Empire": "Safawidenreich",
  "Carthage": "Karthago", "Phoenicia": "Phönizien", "Israel": "Israel", "Judah": "Juda",
  "Assyria": "Assyrien", "Babylonia": "Babylonien", "Babylon": "Babylon",
  "Hittite Empire": "Hethiterreich", "China": "China", "Han Empire": "Han-Reich",
  "Tang Empire": "Tang-Reich", "Song Empire": "Song-Reich", "Ming Empire": "Ming-Reich",
  "Qing Empire": "Qing-Reich", "Mongol Empire": "Mongolenreich",
  "Golden Horde": "Goldene Horde", "Japan": "Japan", "Korea": "Korea",
  "India": "Indien", "Maurya Empire": "Maurya-Reich", "Gupta Empire": "Gupta-Reich",
  "Mughal Empire": "Mogulreich", "Delhi Sultanate": "Sultanat von Delhi",
  "Umayyad Caliphate": "Umayyaden-Kalifat", "Abbasid Caliphate": "Abbasiden-Kalifat",
  "Caliphate": "Kalifat", "Al-Andalus": "Al-Andalus", "Granada": "Granada",
  "Morocco": "Marokko", "Mali": "Mali-Reich", "Songhai": "Songhai-Reich",
  "Ethiopia": "Äthiopien", "Aztec Empire": "Aztekenreich", "Inca Empire": "Inkareich",
  "United States": "Vereinigte Staaten", "United States of America": "Vereinigte Staaten",
  "British Raj": "Britisch-Indien", "Austria Hungary": "Österreich-Ungarn",
  "French Indochina": "Französisch-Indochina", "Cape Colony": "Kapkolonie",
  "Ceylon": "Ceylon (Sri Lanka)", "Arabia": "Arabien", "Persia": "Persien",
  "Mexico": "Mexiko", "Brazil": "Brasilien", "Canada": "Kanada",
  "Frankish Kingdom": "Frankenreich", "Francia": "Frankenreich",
  "Carolingian Empire": "Karolingerreich", "Kievan Rus": "Kiewer Rus",
  "Muscovy": "Moskauer Reich", "Venice": "Venedig", "Genoa": "Genua",
  "Papal States": "Kirchenstaat", "Naples": "Neapel", "Sicily": "Sizilien",
  "Bulgaria": "Bulgarien", "Serbia": "Serbien", "Romania": "Rumänien",
  "Croatia": "Kroatien", "Bosnia": "Bosnien", "Albania": "Albanien",
  "Finland": "Finnland", "Estonia": "Estland", "Latvia": "Lettland",
  "Ukraine": "Ukraine", "Belarus": "Belarus", "Turkey": "Türkei",
  "Syria": "Syrien", "Iraq": "Irak", "Iran": "Iran", "Saudi Arabia": "Saudi-Arabien",
  "South Africa": "Südafrika", "Australia": "Australien", "New Zealand": "Neuseeland",
  "Indonesia": "Indonesien", "Philippines": "Philippinen", "Vietnam": "Vietnam",
  "Thailand": "Thailand", "Cambodia": "Kambodscha", "Mongolia": "Mongolei",
  "Kazakhstan": "Kasachstan", "Uzbekistan": "Usbekistan", "Afghanistan": "Afghanistan",
  "Pakistan": "Pakistan", "Bangladesh": "Bangladesch", "Myanmar": "Myanmar",
  "Argentina": "Argentinien", "Chile": "Chile", "Peru": "Peru", "Colombia": "Kolumbien",
  "Venezuela": "Venezuela", "Bolivia": "Bolivien", "Cuba": "Kuba",
  "Czechoslovakia": "Tschechoslowakei", "Yugoslavia": "Jugoslawien",
  "East Germany": "DDR", "West Germany": "Bundesrepublik Deutschland (West)",
  "Tibet": "Tibet", "Xiongnu": "Xiongnu", "Huns": "Hunnen",
  "Visigothic Kingdom": "Westgotenreich", "Ostrogothic Kingdom": "Ostgotenreich",
  "Vandal Kingdom": "Vandalenreich", "Lombard Kingdom": "Langobardenreich",
  "Timurid Empire": "Timuridenreich", "Seljuk Empire": "Seldschukenreich",
  "Crusader States": "Kreuzfahrerstaaten", "Teutonic Order": "Deutscher Orden",
  "Mamluk Sultanate": "Mamluken-Sultanat", "Nubia": "Nubien", "Kush": "Kusch",
  "Axum": "Aksum", "Ghana": "Ghana-Reich", "Benin": "Benin", "Kongo": "Kongo-Reich",
  "Zulu": "Zulu-Reich", "Siam": "Siam", "Khmer Empire": "Khmer-Reich",
  "Srivijaya": "Srivijaya", "Majapahit": "Majapahit", "Maya": "Maya",
  "Toltec": "Tolteken", "Olmec": "Olmeken"
};

// Wikipedia-Titel (de) für Feature-Namen, wenn die Übersetzung nicht schon passt
const WIKI_DE = {
  "Holy Roman Empire": "Heiliges Römisches Reich",
  "Eastern Roman Empire": "Byzantinisches Reich",
  "Golden Horde": "Goldene Horde",
  "Kievan Rus": "Kiewer Rus",
  "Muscovy": "Großfürstentum Moskau",
  "Dutch Republic": "Republik der Sieben Vereinigten Provinzen",
  "Poland-Lithuania": "Polen-Litauen",
  "Papal States": "Kirchenstaat",
  "Frankish Kingdom": "Fränkisches Reich",
  "Francia": "Fränkisches Reich",
  "Carolingian Empire": "Fränkisches Reich",
  "Han Empire": "Han-Dynastie",
  "Tang Empire": "Tang-Dynastie",
  "Song Empire": "Song-Dynastie",
  "Ming Empire": "Ming-Dynastie",
  "Qing Empire": "Qing-Dynastie",
  "Delhi Sultanate": "Sultanat von Delhi",
  "Timurid Empire": "Timuriden",
  "Seljuk Empire": "Seldschuken",
  "Mamluk Sultanate": "Mamluken",
  "Teutonic Order": "Deutscher Orden",
  "Aztec Empire": "Azteken",
  "Inca Empire": "Inka",
  "Maurya Empire": "Maurya-Reich",
  "Gupta Empire": "Gupta-Reich",
  "Mughal Empire": "Mogulreich",
  "Umayyad Caliphate": "Umayyaden",
  "Abbasid Caliphate": "Abbasiden-Kalifat",
  "Sassanid Empire": "Sassanidenreich",
  "Achaemenid Empire": "Achämenidenreich",
  "Visigothic Kingdom": "Westgotenreich",
  "Ostrogothic Kingdom": "Ostgotenreich",
  "Vandal Kingdom": "Vandalen",
  "Lombard Kingdom": "Langobarden",
  "Khmer Empire": "Angkor",
  "Xiongnu": "Xiongnu",
  "Huns": "Hunnen"
};

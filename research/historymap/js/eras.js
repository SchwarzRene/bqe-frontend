// Kuratierte Epochen-Inhalte. Jahre: negativ = v. Chr.
// Jede Epoche: from/to, title, hegemon (Wer dominiert? Warum? Warum endet es?),
// text (Überblick), denken (Ideen/Weltbilder), konflikte, schlaglichter (Region → Hinweis).

const ERAS = [
  {
    from: -3000, to: -1200,
    title: "Frühe Hochkulturen – Bronzezeit",
    hegemon: "<strong>Ägypten und Mesopotamien</strong> sind die ersten Großmächte der Geschichte. Ihre Macht beruht auf Flusslandwirtschaft (Nil, Euphrat/Tigris), Schrift, Verwaltung und Bronze. Um 1200 v. Chr. kollabiert das ganze System im sog. „Bronzezeit-Kollaps“ – Seevölker, Dürren und der Zusammenbruch der Handelsnetze reißen fast alle Reiche mit.",
    text: "<p>An den großen Flüssen entstehen die ersten Staaten der Menschheit: Sumer erfindet um 3200 v. Chr. die Keilschrift, Ägypten eint sich unter den Pharaonen, im Industal blüht die Harappa-Kultur, in China entsteht die Shang-Dynastie. Königtum und Religion sind untrennbar – der Herrscher ist Gott oder Mittler der Götter.</p><p>Handel verbindet die Reiche: Zinn und Kupfer für Bronze müssen über weite Strecken beschafft werden. Diese Vernetzung macht die Welt reich – und verwundbar.</p>",
    denken: "Mythisches Weltbild: Naturereignisse sind Götterhandeln. Erste Rechtscodizes (<b>Codex Hammurapi</b>, ~1750 v. Chr.: „Auge um Auge“) verschriftlichen Ordnung. In Ägypten zentrale Idee der <b>Maat</b> – kosmische Gerechtigkeit, die der Pharao garantiert. Schrift dient zuerst Verwaltung und Kult, nicht Literatur; mit dem <b>Gilgamesch-Epos</b> entsteht dennoch die erste große Dichtung der Menschheit.",
    konflikte: [
      "<b>Schlacht von Kadesch</b> (~1274 v. Chr.): Ägypten gegen Hethiter – endet im ersten schriftlich überlieferten Friedensvertrag der Geschichte.",
      "Ständige Kämpfe der mesopotamischen Stadtstaaten (Ur, Lagasch, Umma); Sargon von Akkad schafft ~2300 v. Chr. das erste Großreich.",
      "<b>Bronzezeit-Kollaps</b> (~1200 v. Chr.): Seevölker-Invasionen, Hungersnöte – Untergang der Hethiter, Mykenes und vieler Städte."
    ],
    schlaglichter: [
      "<b>Ägypten:</b> Pyramiden von Gizeh (~2560 v. Chr.), Pharaonen als Gottkönige.",
      "<b>Mesopotamien (Irak):</b> Erfindung von Schrift, Rad, Stadt – die „Wiege der Zivilisation“.",
      "<b>Indus (Pakistan):</b> Planstädte mit Kanalisation – Schrift bis heute nicht entziffert.",
      "<b>China:</b> Shang-Dynastie, Orakelknochen – Beginn der chinesischen Schrift."
    ]
  },
  {
    from: -1200, to: -550,
    title: "Eisenzeit – Assyrien, Phönizier und das archaische Griechenland",
    hegemon: "<strong>Assyrien</strong> ist die erste militärische Supermacht: Belagerungstechnik, stehendes Heer, Massendeportationen als Herrschaftsinstrument. Seine Brutalität wird ihm zum Verhängnis – 612 v. Chr. verbündet sich die halbe bekannte Welt und zerstört Ninive. Danach teilen Babylon, Meder, Lyder und Ägypten kurz die Macht, bis Persien alle schluckt.",
    text: "<p>Eisen ersetzt Bronze – Waffen und Werkzeuge werden billig und massenhaft verfügbar, was Macht breiter verteilt. Die Phönizier erfinden das <b>Alphabet</b> und besiedeln das Mittelmeer (Karthago, 814 v. Chr.), die Griechen übernehmen es und gründen hunderte Kolonien von Spanien bis zum Schwarzen Meer.</p><p>In Israel/Juda entsteht mit dem Monotheismus eine religiöse Revolution; das Babylonische Exil (587 v. Chr.) prägt das Judentum bis heute.</p>",
    denken: "Die „<b>Achsenzeit</b>“ beginnt: Fast gleichzeitig treten weltweit Denker auf, die das mythische Weltbild hinterfragen – die hebräischen <b>Propheten</b>, in Indien die <b>Upanischaden</b> und bald Buddha, in China Konfuzius, in Griechenland die ersten <b>Naturphilosophen</b> (Thales: „Alles ist Wasser“ – erstmals Welterklärung ohne Götter). In Griechenland entsteht die <b>Polis</b>, die Bürgergemeinde – Keimzelle der Politik im Wortsinn.",
    konflikte: [
      "Assyrische Eroberungskriege: Zerstörung Israels (722 v. Chr.), Unterwerfung Babylons und Ägyptens.",
      "<b>Fall Ninives</b> 612 v. Chr. durch Babylonier und Meder.",
      "Nebukadnezar II. zerstört Jerusalem (587 v. Chr.) – Babylonisches Exil der Juden."
    ],
    schlaglichter: [
      "<b>Assyrien:</b> Terror als System – und die erste große Bibliothek (Assurbanipal in Ninive).",
      "<b>Griechenland:</b> Erste Olympische Spiele 776 v. Chr., Homer, Beginn der Polis-Welt.",
      "<b>Phönizien/Karthago:</b> Seehandelsimperium, Alphabet – Grundlage fast aller heutigen Schriften.",
      "<b>China:</b> Zhou-Dynastie – Idee des „Mandats des Himmels“: Herrschaft ist an gutes Regieren geknüpft."
    ]
  },
  {
    from: -550, to: -323,
    title: "Das Perserreich und das klassische Griechenland",
    hegemon: "<strong>Persien (Achämeniden)</strong> ist das erste echte Weltreich – von Ägypten bis Indien, ~40 % der Weltbevölkerung. Es herrscht erstaunlich tolerant: lokale Religionen und Gesetze bleiben, Reichsstraßen und einheitliche Münzen verbinden alles. Es scheitert erst an den Griechen (490/480 v. Chr.), dann an einem Einzigen: Alexander von Makedonien erobert es 334–330 v. Chr. komplett.",
    text: "<p>Kyros der Große schafft in nur 30 Jahren das größte Reich der bisherigen Geschichte. Die kleinen, zerstrittenen griechischen Stadtstaaten wehren die persischen Invasionen ab (Marathon 490, Salamis 480 v. Chr.) – ein Wendepunkt: Athen steigt zur See- und Kulturmacht auf.</p><p>Es folgt das „Goldene Zeitalter“ Athens: Demokratie unter Perikles, Parthenon, Tragödie, Geschichtsschreibung, Philosophie. Der Bruderkrieg zwischen Athen und Sparta (Peloponnesischer Krieg, 431–404 v. Chr.) ruiniert beide – und macht den Weg frei für Makedonien.</p>",
    denken: "Explosion des Denkens: In Athen erfinden <b>Sokrates, Platon und Aristoteles</b> die systematische Philosophie – Was ist Gerechtigkeit? Was ist Wissen? Die attische <b>Demokratie</b> (alle männlichen Bürger stimmen ab) ist ein radikales Experiment. <b>Herodot</b> begründet die Geschichtsschreibung, <b>Hippokrates</b> die rationale Medizin. Gleichzeitig lehren <b>Buddha</b> in Indien und <b>Konfuzius</b> in China – Mitgefühl bzw. soziale Harmonie als Leitideen. In Persien prägt <b>Zarathustras</b> Lehre vom Kampf zwischen Gut und Böse spätere Religionen.",
    konflikte: [
      "<b>Perserkriege</b> (490–479 v. Chr.): Marathon, Thermopylen, Salamis – Griechenland behauptet sich.",
      "<b>Peloponnesischer Krieg</b> (431–404 v. Chr.): Athen gegen Sparta – Sparta siegt, Griechenland ist erschöpft.",
      "<b>Alexanderzug</b> (334–323 v. Chr.): Makedonien erobert Persien bis nach Indien."
    ],
    schlaglichter: [
      "<b>Persien:</b> Reichsstraßen, Toleranzpolitik, Persepolis – Modell für alle späteren Imperien.",
      "<b>Griechenland:</b> Athen – Demokratie, Philosophie, Theater in einer einzigen Stadt.",
      "<b>Indien:</b> Buddha (~500 v. Chr.) lehrt den Weg aus dem Leiden.",
      "<b>China:</b> Konfuzius und die „Zeit der Streitenden Reiche“ – Chaos gebiert Philosophie."
    ]
  },
  {
    from: -323, to: -30,
    title: "Hellenismus und der Aufstieg Roms",
    hegemon: "Nach Alexanders Tod (323 v. Chr.) teilen seine Generäle das Reich: <strong>Ptolemäer</strong> (Ägypten), <strong>Seleukiden</strong> (Vorderasien), <strong>Antigoniden</strong> (Makedonien). Griechische Kultur dominiert von Marseille bis Afghanistan. Doch im Westen wächst <strong>Rom</strong>: Es besiegt Karthago in drei Punischen Kriegen und schluckt bis 30 v. Chr. alle hellenistischen Reiche – zuletzt Kleopatras Ägypten.",
    text: "<p>Der Hellenismus ist die erste „Globalisierung“: Griechisch wird Weltsprache, Alexandria mit seiner Bibliothek das Wissenschaftszentrum der Welt (Euklid, Archimedes, Eratosthenes – er berechnet den Erdumfang!).</p><p>Rom, eine Bauernrepublik mit einzigartigem Bündnissystem, ringt Karthago nieder – Hannibals Alpenüberquerung (218 v. Chr.) nützt nichts. Doch die Eroberungen zerreißen die Republik innerlich: Landlose Veteranen, übermächtige Feldherren (Marius, Sulla, Caesar, Pompeius) und Bürgerkriege enden mit Caesars Diktatur, seiner Ermordung (44 v. Chr.) und dem Sieg seines Erben Octavian.</p>",
    denken: "Der Einzelne tritt hervor: <b>Stoa</b> (Gelassenheit durch Vernunft, Pflichterfüllung) und <b>Epikureismus</b> (Glück durch Freiheit von Furcht) bieten Lebenshilfe in einer unübersichtlich gewordenen Welt – die Stoa wird später die Leitphilosophie der römischen Elite. In Indien macht Kaiser <b>Ashoka</b> nach blutigen Eroberungen den Buddhismus zur Friedensethik seines Reichs. In China eint Qin Shihuangdi 221 v. Chr. das Reich mit dem <b>Legalismus</b> – Herrschaft durch strikte Gesetze und Strafen; die Han-Dynastie mildert das mit Konfuzianismus.",
    konflikte: [
      "<b>Punische Kriege</b> (264–146 v. Chr.): Rom vernichtet Karthago – „Carthago delenda est“.",
      "Roms Eroberung Griechenlands (146 v. Chr.) und Kleinasiens.",
      "<b>Römische Bürgerkriege</b>: Caesar gegen Pompeius, Octavian gegen Antonius & Kleopatra (Actium 31 v. Chr.)."
    ],
    schlaglichter: [
      "<b>Ägypten:</b> Alexandria – Bibliothek, Leuchtturm, Kleopatra als letzte Pharaonin.",
      "<b>Rom:</b> Von der Republik zur Alleinherrschaft – ein Lehrstück über Machtbalance.",
      "<b>Indien:</b> Maurya-Reich unter Ashoka – erster buddhistischer Großstaat.",
      "<b>China:</b> Reichseinigung 221 v. Chr., Große Mauer, Terrakotta-Armee."
    ]
  },
  {
    from: -30, to: 180,
    title: "Pax Romana und Han-China – zwei Weltreiche",
    hegemon: "<strong>Rom</strong> und <strong>Han-China</strong> beherrschen je ein Viertel der Menschheit und wissen kaum voneinander – verbunden nur durch die Seidenstraße. Roms Macht ruht auf Legionen, Straßen, Recht und der Integrationskraft des Bürgerrechts. Der Frieden trägt ~200 Jahre; ab 180 n. Chr. beginnen Soldatenkaiser-Chaos in Rom und Zerfall in China fast gleichzeitig.",
    text: "<p>Augustus verwandelt die zerrüttete Republik in ein stabiles Kaiserreich – die <b>Pax Romana</b>. Städte blühen von Britannien bis Syrien, 80.000 km Straßen, Aquädukte, Recht („Römisches Recht“ wirkt bis in unser BGB). Unter Trajan (117 n. Chr.) ist das Reich am größten.</p><p>In Judäa entsteht aus der Predigt Jesu von Nazareth das Christentum – zunächst verfolgte Randsekte, in 300 Jahren zur Reichsreligion. Han-China erfindet derweil Papier und führt Beamtenprüfungen ein – Herrschaft der Gebildeten statt des Geburtsadels.</p>",
    denken: "Roms Elite denkt stoisch: <b>Seneca</b>, <b>Epiktet</b> (ein Ex-Sklave!) und Kaiser <b>Marc Aurel</b> („Selbstbetrachtungen“) fragen, wie man in jeder Lage anständig lebt. Das <b>Christentum</b> revolutioniert leise die Werte: Ein Gott, der sich den Schwachen zuwendet – Nächstenliebe statt Ruhm und Ehre. In China wird der <b>Konfuzianismus</b> Staatsdoktrin: Der Herrscher regiert durch moralisches Vorbild, Beamte werden nach Bildung ausgewählt – das modernste Verwaltungsdenken der Antike.",
    konflikte: [
      "Eroberung Britanniens (43 n. Chr.), Dakerkriege Trajans (101–106).",
      "<b>Jüdische Kriege</b>: Zerstörung des Tempels 70 n. Chr., Bar-Kochba-Aufstand 132–135 – Beginn der jüdischen Diaspora.",
      "<b>Varusschlacht</b> 9 n. Chr.: Germanen stoppen Roms Expansion über den Rhein."
    ],
    schlaglichter: [
      "<b>Rom:</b> Kolosseum, Pompeji (79 n. Chr.), Rechtssystem – Fundament Europas.",
      "<b>China:</b> Han-Dynastie – Papier, Seidenstraße, Beamtenstaat.",
      "<b>Judäa:</b> Entstehung des Christentums – die folgenreichste Bewegung der Epoche.",
      "<b>Parther (Persien):</b> Roms ewiger Rivale im Osten – nie besiegt."
    ]
  },
  {
    from: 180, to: 476,
    title: "Krise, Christianisierung und Völkerwanderung",
    hegemon: "<strong>Rom</strong> bleibt formal Hegemon, taumelt aber: Im 3. Jahrhundert regieren in 50 Jahren über 20 Soldatenkaiser. Diokletian und Konstantin retten das Reich durch Teilung und Neuordnung – doch 395 zerfällt es endgültig in Ost und West. Das reiche <strong>Ostrom (Byzanz)</strong> übersteht die Stürme; das Westreich wird von germanischen Völkern übernommen – 476 setzt Odoaker den letzten Kaiser ab.",
    text: "<p>Warum fiel Rom? Nicht ein Grund, sondern viele: Dauerkrieg an zwei Fronten (Germanen, Perser), Inflation, Seuchen, Bürgerkriege, Steuerlast – und schließlich die Hunnen, die ab 375 die Völkerwanderung auslösen. Goten, Vandalen, Franken drängen ins Reich; 410 plündert Alarich Rom selbst.</p><p>Parallel die stille Revolution: Konstantin erlaubt 313 das Christentum, 380 wird es Staatsreligion. Die Kirche übernimmt Strukturen des Reichs – und überlebt es. In China zerfällt zeitgleich die Han-Dynastie (220); auch dort folgen Jahrhunderte der Teilung.</p>",
    denken: "<b>Augustinus</b> („Gottesstaat“, um 420) deutet Roms Fall: Kein irdisches Reich ist ewig, nur das Gottesreich zählt – das prägt 1000 Jahre christliches Denken. Das <b>Mönchtum</b> entsteht (Wüstenväter, Benedikt) und wird zum Wissensspeicher Europas. Der <b>Neuplatonismus</b> (Plotin) verschmilzt griechische Philosophie mit Mystik. In Indien blüht unter den <b>Gupta</b> die klassische Kultur: Null und Dezimalsystem werden erfunden – eine der folgenreichsten Ideen überhaupt.",
    konflikte: [
      "<b>Reichskrise des 3. Jahrhunderts</b>: Soldatenkaiser, Perser- und Germaneneinfälle.",
      "<b>Völkerwanderung</b> ab 375: Hunnen, Goten (Schlacht von Adrianopel 378), Vandalen.",
      "<b>Attila</b> wird 451 auf den Katalaunischen Feldern gestoppt; 476 Ende Westroms."
    ],
    schlaglichter: [
      "<b>Rom/Westrom:</b> Zerfall eines Weltreichs – in Zeitlupe über 200 Jahre.",
      "<b>Byzanz:</b> Konstantinopel (gegr. 330) – das „neue Rom“ überlebt 1000 Jahre länger.",
      "<b>Indien:</b> Gupta-Reich – „goldenes Zeitalter“: Mathematik, Astronomie, Sanskrit-Dichtung.",
      "<b>Germanische Reiche:</b> Franken, Goten, Vandalen – die Erben des Westens."
    ]
  },
  {
    from: 476, to: 750,
    title: "Frühmittelalter – Byzanz, Islam und die neuen Reiche",
    hegemon: "<strong>Byzanz</strong> ist zunächst die unbestrittene Macht (Justinian erobert Italien und Nordafrika zurück), doch ab 634 verändert der <strong>Islam</strong> alles: In nur 100 Jahren erobern die Araber ein Reich von Spanien bis Indien – schneller als je ein Reich zuvor. Byzanz verliert zwei Drittel seines Gebiets, Persien verschwindet ganz. Das <strong>Kalifat der Umayyaden</strong> ist um 750 die größte Macht der Welt.",
    text: "<p>Im zerfallenen Westeuropa sichern Klöster und die Kirche das antike Erbe; die Franken steigen unter den Merowingern zur stärksten Germanenmacht auf. 622 beginnt mit Mohammeds Auswanderung nach Medina (Hidschra) die islamische Zeitrechnung – seine Nachfolger, die Kalifen, einen Arabien und stoßen in das Machtvakuum der erschöpften Großreiche Byzanz und Persien.</p><p>732 stoppt Karl Martell bei Tours die arabische Expansion nach Westeuropa; 717/18 scheitern die Araber an Konstantinopels Mauern (und dem „Griechischen Feuer“). Die Welt des Mittelmeers ist nun dreigeteilt: lateinischer Westen, griechischer Osten, islamischer Süden.</p>",
    denken: "Der <b>Islam</b> bringt radikalen Monotheismus, ein umfassendes Rechts- und Gesellschaftssystem (Scharia, Umma) und enormen Bildungshunger – der Koran heiligt das Streben nach Wissen. Im Westen formt <b>Papst Gregor der Große</b> die mittelalterliche Kirche; das Denken wird klösterlich: Bewahren statt Neues schaffen. In China eint die <b>Tang-Dynastie</b> (ab 618) das Reich zur damals kosmopolitischsten Kultur der Welt – Chang'an ist mit ~1 Mio. Einwohnern die größte Stadt der Erde.",
    konflikte: [
      "Justinians Rückeroberungskriege (533–554) verwüsten Italien.",
      "Letzter großer Krieg der Antike: Byzanz gegen Persien (602–628) – beide erschöpft, der Islam profitiert.",
      "<b>Arabische Expansion</b> 634–750: Syrien, Ägypten, Persien, Spanien fallen; 732 Schlacht von Tours."
    ],
    schlaglichter: [
      "<b>Byzanz:</b> Hagia Sophia (537), Justinians Rechtskodex – Grundlage des europäischen Rechts.",
      "<b>Kalifat:</b> Die schnellste Reichsbildung der Weltgeschichte.",
      "<b>Frankenreich:</b> Aufstieg der Karolinger – Karl Martell, Pippin.",
      "<b>China:</b> Tang-Dynastie – Weltoffenheit, Buddhismus-Blüte, Dichtung."
    ]
  },
  {
    from: 750, to: 1000,
    title: "Karl der Große, Wikinger und die Blüte des Islam",
    hegemon: "Kulturell und wirtschaftlich dominiert das <strong>Abbasiden-Kalifat</strong> in Bagdad – Zentrum von Wissenschaft und Handel von Marokko bis Zentralasien. Politisch zerfällt es aber ab ~900 in Teilreiche. Im Westen schafft <strong>Karl der Große</strong> (Kaiserkrönung 800) kurz eine neue Ordnungsmacht; sein Reich zerfällt jedoch unter den Enkeln (Teilung von Verdun 843) – daraus entstehen Frankreich und Deutschland.",
    text: "<p>Karl der Große eint fast das ganze lateinische Europa, fördert Bildung („karolingische Renaissance“ – unsere Kleinbuchstaben stammen daher) und erneuert das Kaisertum. Nach dem Zerfall seines Reichs plündern <b>Wikinger</b> (aus dem Norden), <b>Ungarn</b> (aus dem Osten) und <b>Sarazenen</b> (aus dem Süden) Europa – aus der Not entsteht das Lehnswesen: Schutz gegen Treue, die Grundlage des Feudalismus.</p><p>962 wird Otto der Große Kaiser – Geburt des Heiligen Römischen Reichs. Die Wikinger gründen nebenbei Staaten: die Normandie, Russland (Kiewer Rus), entdecken Island, Grönland, Amerika (~1000).</p>",
    denken: "Bagdads „<b>Haus der Weisheit</b>“ übersetzt und erweitert das griechische Wissen: <b>al-Chwarizmi</b> begründet die Algebra (sein Name wird zu „Algorithmus“), Medizin und Astronomie blühen – arabische Ziffern (aus Indien) beginnen ihren Siegeszug. Europa denkt in Klöstern weiter: Wissen bewahren, Land kultivieren. 988 nimmt die Kiewer Rus das <b>orthodoxe Christentum</b> an – die religiöse Landkarte Osteuropas bis heute. Um 1000 erwartet Europa teils das Weltende – und baut trotzdem, oder gerade deshalb, Kirchen wie besessen.",
    konflikte: [
      "Karls Sachsenkriege (772–804): Zwangschristianisierung der Sachsen.",
      "<b>Wikingerzeit</b> ab 793 (Lindisfarne): Überfälle von Irland bis Konstantinopel.",
      "955 Lechfeldschlacht: Otto I. besiegt die Ungarn – danach werden sie sesshaft und christlich."
    ],
    schlaglichter: [
      "<b>Frankenreich:</b> Kaiserkrönung 800 – der Westen hat wieder einen Kaiser.",
      "<b>Abbasiden:</b> Bagdad, Haus der Weisheit – Weltzentrum der Wissenschaft.",
      "<b>Skandinavien:</b> Wikinger als Räuber, Händler und Staatsgründer.",
      "<b>Kiewer Rus:</b> Geburt Russlands aus Wikinger-Handelsposten."
    ]
  },
  {
    from: 1000, to: 1200,
    title: "Hochmittelalter – Kreuzzüge, Kaiser und Papst",
    hegemon: "Kein einzelner Hegemon: <strong>Das Heilige Römische Reich</strong> beansprucht den Vorrang in Europa, ringt aber mit dem <strong>Papsttum</strong> um die Oberhoheit (Investiturstreit – Heinrich IV. im Büßerhemd in Canossa 1077). Im Mittelmeer dominieren aufstrebende Seerepubliken (Venedig, Genua). Das <strong>Song-China</strong> ist derweil wirtschaftlich die mit Abstand fortschrittlichste Macht der Welt.",
    text: "<p>Europa erwacht: Bevölkerung verdoppelt sich, Wälder werden gerodet, Städte gegründet, die ersten Universitäten entstehen (Bologna 1088, Paris, Oxford). 1066 erobern die Normannen England (Schlacht von Hastings). 1054 spaltet sich die Christenheit in katholisch und orthodox.</p><p>1095 ruft Papst Urban II. zum Kreuzzug: 1099 erobern die Kreuzfahrer Jerusalem (mit furchtbarem Massaker). Fast 200 Jahre kämpfen Kreuzfahrerstaaten und muslimische Herrscher – 1187 erobert Saladin Jerusalem zurück. Nebenwirkung der Kreuzzüge: Handel und Wissenstransfer aus dem Orient beflügeln Europa.</p>",
    denken: "Die <b>Scholastik</b> entsteht an den neuen Universitäten: Glauben mit Vernunft begründen (Anselm, Abaelard). Über Spanien und Sizilien strömt <b>Aristoteles</b> in arabischer Übersetzung zurück nach Europa – eine intellektuelle Revolution. <b>Averroes</b> (Córdoba) und <b>Maimonides</b> denken an der Spitze ihrer Zeit. Das Rittertum entwickelt ein Ideal: <b>höfische Kultur</b>, Minnesang, Ehre. In China erfindet man Buchdruck, Papiergeld und das Staatsexamen perfektioniert die Beamtenauslese.",
    konflikte: [
      "<b>Investiturstreit</b> (1076–1122): Kaiser gegen Papst – wer setzt Bischöfe ein?",
      "<b>Erster Kreuzzug</b> 1096–1099: Eroberung Jerusalems; 1187 Rückeroberung durch Saladin.",
      "Normannische Eroberung Englands 1066; Reconquista in Spanien gewinnt Fahrt (Toledo 1085)."
    ],
    schlaglichter: [
      "<b>Heiliges Römisches Reich:</b> Canossa 1077 – Machtkampf Kaiser vs. Papst.",
      "<b>England:</b> 1066 und die Folgen – Feudalstaat nach normannischem Muster.",
      "<b>Al-Andalus (Spanien):</b> Córdoba – Ort der Gelehrsamkeit dreier Religionen.",
      "<b>Song-China:</b> Buchdruck, Kompass, Schießpulver – die drei Welterfindungen."
    ]
  },
  {
    from: 1200, to: 1300,
    title: "Der Mongolensturm",
    hegemon: "<strong>Das Mongolenreich</strong> wird das größte zusammenhängende Landreich der Geschichte – von Korea bis Ungarn. Dschingis Khan eint 1206 die Steppenvölker; Geschwindigkeit, Disziplin und psychologische Kriegsführung (Terror gegen Widerstand, Gnade bei Unterwerfung) machen die Reiterarmeen unbesiegbar. Nach 1260 zerfällt das Reich in vier Khanate – zu groß, um von einem Punkt regiert zu werden.",
    text: "<p>Die Mongolen zerstören Bagdad 1258 (Ende des Abbasiden-Kalifats, geschätzt hunderttausende Tote), unterwerfen China (Kublai Khan gründet die Yuan-Dynastie), Russland („Tatarenjoch“ bis 1480) und Persien. Europa entkommt knapp: 1241 siegen die Mongolen bei Liegnitz, ziehen aber wegen des Todes des Großkhans ab.</p><p>Die Kehrseite des Schreckens: die <b>Pax Mongolica</b>. Die Seidenstraße ist so sicher wie nie, Marco Polo reist nach China, Ideen und Waren fließen – und später leider auch die Pest. In Europa wächst derweil die Macht der Städte (Hanse) und 1215 zwingt der englische Adel König Johann die <b>Magna Carta</b> ab – Keimzelle der Idee, dass auch der König unter dem Gesetz steht.</p>",
    denken: "<b>Thomas von Aquin</b> versöhnt Aristoteles mit dem Christentum („Summa theologiae“) – der Gipfel der Scholastik: Vernunft und Glaube als Partner. <b>Franziskus von Assisi</b> lebt radikale Armut und Naturliebe – Gegenmodell zur reichen Amtskirche. Die Mongolen selbst sind religiös erstaunlich tolerant – am Hof des Großkhans disputieren Christen, Muslime und Buddhisten. Im Sudan-Gürtel blüht das Goldreich <b>Mali</b> heran; in Indien etabliert sich das Sultanat von Delhi.",
    konflikte: [
      "<b>Mongolische Eroberungen</b> 1206–1279: China, Persien, Russland, Osteuropa.",
      "Zerstörung Bagdads 1258 – Schock für die islamische Welt.",
      "1212 Las Navas de Tolosa: Wende der Reconquista in Spanien; 1204 plündern Kreuzfahrer Konstantinopel (!)."
    ],
    schlaglichter: [
      "<b>Mongolenreich:</b> Vom Steppenvolk zur Weltmacht in einer Generation.",
      "<b>England:</b> Magna Carta 1215 – der lange Weg zur Rechtsstaatlichkeit beginnt.",
      "<b>Ägypten (Mamluken):</b> 1260 Ain Dschalut – die erste echte Niederlage der Mongolen.",
      "<b>Mali:</b> Goldhandel über die Sahara – Timbuktu wird Handels- und Bildungszentrum."
    ]
  },
  {
    from: 1300, to: 1453,
    title: "Spätmittelalter – Pest, Krieg und Krise",
    hegemon: "Eine Zeit ohne klaren Hegemon – eher der große Zusammenbruch: Der <strong>Schwarze Tod</strong> (1347–1352) tötet ein Drittel Europas. Frankreich und England zerfleischen sich im <strong>Hundertjährigen Krieg</strong>. Im Osten steigt eine neue Macht unaufhaltsam auf: die <strong>Osmanen</strong>, die 1453 Konstantinopel erobern – das Ende Ostroms nach 1000 Jahren.",
    text: "<p>Die Pest verändert alles: Arbeitskräfte werden knapp, Löhne steigen, das Feudalsystem erodiert, Bauernaufstände erschüttern England und Frankreich, Judenpogrome suchen Sündenböcke. Die Kirche stürzt in die Krise: zeitweise zwei, dann drei Päpste gleichzeitig (Abendländisches Schisma).</p><p>Im Hundertjährigen Krieg (1337–1453) demütigen englische Langbogenschützen die französische Ritterschaft (Crécy, Azincourt) – bis <b>Jeanne d'Arc</b> 1429 die Wende bringt. Am Ende gewinnt Frankreich und beide Länder haben sich zu Nationalstaaten entwickelt. 1453 schießen osmanische Riesenkanonen Konstantinopels Mauern sturmreif – Symbol: Die Kanone beendet das Zeitalter der Burgen und Ritter.</p>",
    denken: "Krisenzeit gebiert neues Denken: <b>Wilhelm von Ockham</b> trennt Glauben und Wissen („Ockhams Rasiermesser“), <b>Marsilius von Padua</b> denkt Herrschaft erstmals vom Volk her. In Italien beginnt mit <b>Petrarca</b> der <b>Humanismus</b>: der Mensch und die Antike statt Jenseitsfixierung – Vorbote der Renaissance. <b>Dante</b> schreibt die „Göttliche Komödie“ auf Italienisch statt Latein. Mystiker wie <b>Meister Eckhart</b> suchen Gott im Inneren. Ibn Chaldun (Tunis) begründet mit seiner Zyklen-Theorie der Reiche quasi die Soziologie.",
    konflikte: [
      "<b>Hundertjähriger Krieg</b> (1337–1453): England gegen Frankreich – Crécy, Azincourt, Jeanne d'Arc.",
      "<b>Schwarzer Tod</b> 1347–1352: ~25 Mio. Tote in Europa.",
      "Osmanische Expansion: Amselfeld 1389, Nikopolis 1396, <b>Fall Konstantinopels 1453</b>.",
      "Timur (Tamerlan) verwüstet um 1400 Persien, Indien, Syrien."
    ],
    schlaglichter: [
      "<b>Frankreich:</b> Jeanne d'Arc – vom Bauernmädchen zur Nationalheiligen.",
      "<b>Byzanz:</b> Der lange Todeskampf des letzten Rests von Rom.",
      "<b>Osmanisches Reich:</b> Vom Grenzfürstentum zur Weltmacht.",
      "<b>Italien:</b> Florenz – Banken (Medici!), Wolle, und die ersten Humanisten.",
      "<b>China:</b> 1368 vertreibt die Ming-Dynastie die Mongolen."
    ]
  },
  {
    from: 1453, to: 1550,
    title: "Renaissance, Entdeckungen und Reformation",
    hegemon: "<strong>Spanien</strong> schießt zur Weltmacht empor: 1492 fällt Granada (Ende der Reconquista) und Kolumbus erreicht Amerika; Cortés und Pizarro erobern Azteken- und Inkareich – amerikanisches Silber finanziert die spanische Vormacht. Durch Heiratspolitik vereint <strong>Karl V.</strong> (Habsburg) ab 1519 Spanien, die Niederlande, Österreich und Amerika – „das Reich, in dem die Sonne nie untergeht“. Sein Gegenspieler: das <strong>Osmanische Reich</strong> Süleymans des Prächtigen, das 1529 vor Wien steht.",
    text: "<p>Drei Revolutionen gleichzeitig: <b>Renaissance</b> – Kunst und Wissenschaft explodieren in Italien (Leonardo, Michelangelo, Raffael). <b>Entdeckungen</b> – Portugal umsegelt Afrika (Vasco da Gama 1498 in Indien), Spanien stößt nach Amerika vor, Magellans Flotte umrundet 1519–22 erstmals die Erde. Die Welt wird eins – für die indigenen Völker Amerikas eine Katastrophe: Eroberung, Zwangsarbeit und vor allem eingeschleppte Seuchen töten bis zu 90 % von ihnen.</p><p><b>Reformation</b> – 1517 veröffentlicht Martin Luther seine 95 Thesen gegen den Ablasshandel. Dank Buchdruck (Gutenberg ~1450 – das Internet seiner Zeit) verbreiten sich seine Schriften rasend. Die Christenheit spaltet sich; Fürsten nutzen die neue Lehre auch machtpolitisch gegen Kaiser und Papst.</p>",
    denken: "Der Mensch rückt ins Zentrum: <b>Humanismus</b> (Erasmus von Rotterdam), Künstler werden Individuen statt anonyme Handwerker. <b>Machiavelli</b> („Der Fürst“, 1513) beschreibt Macht erstmals ohne Moral – schockierend ehrlich. <b>Kopernikus</b> (1543): Die Erde kreist um die Sonne – der Mensch verliert den Platz im Weltmittelpunkt. Luthers Kernideen: Gnade statt Werke, <b>die Bibel für alle</b> (seine Übersetzung formt die deutsche Sprache), das Gewissen des Einzelnen gegen Papst und Kaiser – gewaltiger Individualisierungsschub.",
    konflikte: [
      "Italienische Kriege (1494–1559): Frankreich gegen Habsburg um Italien.",
      "Eroberung Mexikos (1519–21) und Perus (1532–33).",
      "Osmanen: Mohács 1526 (Ungarn fällt), <b>Belagerung Wiens 1529</b>.",
      "Deutscher Bauernkrieg 1525 – blutig niedergeschlagen, auch mit Luthers Billigung."
    ],
    schlaglichter: [
      "<b>Spanien:</b> Weltreich aus Silber – Aufstieg mit eingebautem Verfallsdatum.",
      "<b>Heiliges Römisches Reich:</b> Luther in Worms 1521: „Hier stehe ich…“",
      "<b>Italien:</b> Renaissance-Stadtstaaten – Kunst als Machtdemonstration.",
      "<b>Portugal:</b> Gewürzimperium von Brasilien bis Macau.",
      "<b>Azteken/Inka:</b> Untergang zweier Hochkulturen."
    ]
  },
  {
    from: 1550, to: 1648,
    title: "Konfessionszeitalter und Dreißigjähriger Krieg",
    hegemon: "<strong>Spanien</strong> unter Philipp II. ist die Supermacht – doch sie überdehnt sich: Krieg gegen die aufständischen Niederlande (80 Jahre!), gegen England (Armada-Katastrophe 1588), gegen Frankreich und die Osmanen gleichzeitig. Trotz Amerikas Silber geht Spanien mehrfach bankrott. Die Zukunft gehört den flexiblen Handelsmächten: den <strong>Niederlanden</strong> (erste Aktiengesellschaft, Börse) und <strong>England</strong>.",
    text: "<p>Europa zerreißt sich am Glauben: Hugenottenkriege in Frankreich (Bartholomäusnacht 1572), niederländischer Aufstand, und schließlich die Urkatastrophe: der <b>Dreißigjährige Krieg</b> (1618–1648). Was als böhmischer Ständeaufstand beginnt (Prager Fenstersturz), wird zum europäischen Machtkrieg auf deutschem Boden – Schweden, Frankreich, Spanien, Kaiser, alle mischen mit. Ganze Landstriche veröden; Deutschland verliert etwa ein Drittel seiner Bevölkerung.</p><p>Der <b>Westfälische Friede 1648</b> ist ein Epochenwerk: Er etabliert die Souveränität der Staaten und das Prinzip des Mächtegleichgewichts – Grundlage des modernen Staatensystems bis heute. Der Kaiser ist fortan nur noch Ehrenvorsitzender, Frankreich und Schweden sind die Gewinner.</p>",
    denken: "Aus dem Konfessions-Chaos wächst neues Denken: <b>Jean Bodin</b> begründet die Souveränitätslehre – der Staat über den Konfessionen. Die <b>wissenschaftliche Revolution</b> beginnt: <b>Galilei</b> (Fernrohr, Fallgesetze – 1633 vor der Inquisition), <b>Kepler</b> (Planetengesetze), <b>Francis Bacon</b> (Wissen durch Experiment statt Autorität), <b>Descartes</b> („Ich denke, also bin ich“ – radikaler Neuanfang des Denkens beim zweifelnden Ich). <b>Hugo Grotius</b> erfindet das Völkerrecht. Parallel: Hexenverfolgungen auf dem Höhepunkt – Fortschritt und Wahn existieren gleichzeitig.",
    konflikte: [
      "<b>Achtzigjähriger Krieg</b> (1568–1648): Niederlande erkämpfen Unabhängigkeit von Spanien.",
      "<b>Spanische Armada</b> 1588: Englands Aufstieg zur Seemacht beginnt.",
      "<b>Dreißigjähriger Krieg</b> (1618–1648): Magdeburgs Zerstörung 1631, Gustav Adolf, Wallenstein.",
      "Lepanto 1571: Seesieg der christlichen Liga über die Osmanen."
    ],
    schlaglichter: [
      "<b>Spanien:</b> Siglo de Oro – kulturelle Blüte (Cervantes, El Greco) trotz politischen Abstiegs.",
      "<b>Niederlande:</b> Weltهandel, Rembrandt, Toleranz – die erste „bürgerliche“ Großmacht.",
      "<b>England:</b> Elisabeth I., Shakespeare, Seefahrer-Piraten wie Drake.",
      "<b>Heiliges Römisches Reich:</b> Schlachtfeld Europas 1618–48.",
      "<b>Schweden:</b> Überraschungs-Großmacht des Nordens."
    ]
  },
  {
    from: 1648, to: 1715,
    title: "Das Zeitalter Ludwigs XIV. – Absolutismus",
    hegemon: "<strong>Frankreich</strong> ist der unbestrittene Hegemon Europas: bevölkerungsreichstes Land des Westens, stärkste Armee, kulturelles Vorbild (Versailles, französische Sprache und Mode überall). <strong>Ludwig XIV.</strong>, der „Sonnenkönig“ (reg. 1643–1715), verkörpert den Absolutismus: „L'État, c'est moi.“ Seine ständigen Kriege einen aber ganz Europa gegen ihn – am Ende ist Frankreich erschöpft und hoch verschuldet; England steigt als See- und Finanzmacht auf.",
    text: "<p>Der Absolutismus ist die Antwort auf das Chaos der Religionskriege: Alle Macht beim König – Gesetzgebung, Heer, Steuern. Der Adel wird in Versailles domestiziert: Wer mitspielen will, muss am Hof dienen statt zu rebellieren. Minister Colbert perfektioniert den <b>Merkantilismus</b>: Exportieren, Importe verhindern, Manufakturen fördern – Wirtschaft als Machtinstrument. 1685 widerruft Ludwig das Toleranzedikt von Nantes; hunderttausende Hugenotten fliehen (viele nach Preußen – Frankreichs Verlust, anderer Gewinn).</p><p>Das Gegenmodell entsteht in <b>England</b>: Nach Bürgerkrieg und Hinrichtung des Königs (1649!) setzt die <b>Glorious Revolution 1688</b> durch, dass das Parlament über dem König steht – konstitutionelle Monarchie. Zwei Modelle stehen sich nun gegenüber: absolutistisches Frankreich, parlamentarisches England. Im Osten schlägt 1683 die Türkenbelagerung Wiens fehl – die Osmanen weichen fortan zurück; Österreich und das junge <b>Russland Peters des Großen</b> steigen auf.</p>",
    denken: "<b>Thomas Hobbes</b> („Leviathan“, 1651) rechtfertigt den starken Staat: Ohne ihn herrsche der „Krieg aller gegen alle“. <b>John Locke</b> (1689) kontert: Regierungen beruhen auf einem <b>Gesellschaftsvertrag</b> zum Schutz von Leben, Freiheit, Eigentum – wird der gebrochen, ist Widerstand legitim. Das ist die Blaupause der amerikanischen Revolution. <b>Newton</b> („Principia“, 1687) erklärt Himmel und Erde mit einer einzigen Formel – das Universum als berechenbares Uhrwerk. <b>Spinoza</b> denkt Gott und Natur als eins und fordert Meinungsfreiheit. Der Rationalismus glaubt: Vernunft kann alles durchdringen – die Aufklärung steht vor der Tür.",
    konflikte: [
      "Ludwigs Expansionskriege: Devolutionskrieg, Holländischer Krieg, Pfälzischer Erbfolgekrieg (Verwüstung Heidelbergs).",
      "<b>Spanischer Erbfolgekrieg</b> (1701–1714): Halb Europa gegen Frankreich – Frankreichs Vormacht wird eingehegt.",
      "<b>Wien 1683</b>: Entsatz durch Jan Sobieski – Wende gegen die Osmanen.",
      "<b>Großer Nordischer Krieg</b> (1700–1721): Russland bricht Schwedens Ostseemacht (Poltawa 1709)."
    ],
    schlaglichter: [
      "<b>Frankreich:</b> Versailles – Bühne der absoluten Macht. Klicke Frankreich für Details zum Absolutismus!",
      "<b>England:</b> Glorious Revolution 1688 – das Parlament siegt über die Krone.",
      "<b>Russland:</b> Peter der Große modernisiert mit Gewalt – Sankt Petersburg als „Fenster nach Europa“.",
      "<b>Brandenburg-Preußen:</b> Vom Kleinstaat zur Militärmacht – der Große Kurfürst.",
      "<b>Osmanisches Reich:</b> Nach 1683 beginnt der lange Rückzug."
    ]
  },
  {
    from: 1715, to: 1789,
    title: "Aufklärung und Mächtegleichgewicht",
    hegemon: "Kein Alleinherrscher mehr – Europa spielt bewusst <strong>Gleichgewicht der Mächte</strong>: Frankreich, England, Österreich, Russland und das aufstrebende Preußen (die „Pentarchie“). Den globalen Machtkampf gewinnt <strong>Großbritannien</strong>: Im Siebenjährigen Krieg (1756–63) – dem eigentlichen „ersten Weltkrieg“ – nimmt es Frankreich Kanada und Indien ab und wird die führende See- und Kolonialmacht.",
    text: "<p>Die Ideen der <b>Aufklärung</b> erfassen Europa: Vernunft, Kritik, Fortschritt. Voltaire spottet über Kirche und Willkür, die große <b>Encyclopédie</b> sammelt alles Wissen der Zeit, Salons und Kaffeehäuser werden Debattenorte – eine „Öffentlichkeit“ entsteht. Manche Monarchen reagieren mit „<b>aufgeklärtem Absolutismus</b>“: Friedrich der Große (Preußen) und Joseph II. (Österreich) schaffen Folter ab, tolerieren Religionen, fördern Schulen – „Alles für das Volk, nichts durch das Volk“.</p><p>1776 wird es ernst: Die amerikanischen Kolonien erklären ihre <b>Unabhängigkeit</b> – erstmals wird ein Staat explizit auf Aufklärungsideen gegründet („Alle Menschen sind gleich geschaffen…“). Frankreich hilft den Amerikanern gegen England – und ruiniert damit seine Finanzen vollends. Die Bühne für 1789 ist bereitet. In England beginnt derweil leise die <b>Industrielle Revolution</b>: Dampfmaschine (Watt 1769), Spinnmaschinen, Fabriken.</p>",
    denken: "„<b>Habe Mut, dich deines eigenen Verstandes zu bedienen!</b>“ (Kant, 1784). <b>Montesquieu</b> fordert Gewaltenteilung, <b>Rousseau</b> Volkssouveränität („Der Mensch ist frei geboren, und überall liegt er in Ketten“), <b>Voltaire</b> Toleranz und Meinungsfreiheit, <b>Beccaria</b> das Ende von Folter und Todesstrafe, <b>Adam Smith</b> (1776) den freien Markt. Diese Bücher sind das Betriebssystem der modernen Demokratien. Grenzen der Epoche: Sklaverei blüht im Atlantikhandel wie nie – die Widersprüche zwischen Ideal und Praxis werden zum Sprengstoff.",
    konflikte: [
      "Österreichischer Erbfolgekrieg (1740–48): Friedrich II. raubt Österreich Schlesien.",
      "<b>Siebenjähriger Krieg</b> (1756–63): Weltkrieg um Kolonien – Großbritannien triumphiert, Preußen überlebt.",
      "<b>Amerikanischer Unabhängigkeitskrieg</b> (1775–83): Geburt der USA.",
      "Teilungen Polens (ab 1772): Preußen, Russland, Österreich löschen einen Staat von der Karte."
    ],
    schlaglichter: [
      "<b>Frankreich:</b> Geistiges Zentrum der Aufklärung – und Pulverfass wachsender Krisen.",
      "<b>Preußen:</b> Friedrich der Große – Philosoph auf dem Thron, Feldherr im Krieg.",
      "<b>Großbritannien:</b> Empire + beginnende Industrialisierung = kommende Weltmacht.",
      "<b>USA:</b> Das Experiment einer Republik der Aufklärung.",
      "<b>Polen-Litauen:</b> Untergang durch Nachbarn – Warnung vor Schwäche im Mächtekonzert."
    ]
  },
  {
    from: 1789, to: 1815,
    title: "Französische Revolution und Napoleon",
    hegemon: "<strong>Frankreich</strong> dominiert erneut – erst als revolutionäre Volksnation, dann unter <strong>Napoleon</strong>, der bis 1812 fast ganz Kontinentaleuropa kontrolliert. Unbesiegbar bleibt nur <strong>Großbritannien</strong> (Seeherrschaft nach Trafalgar 1805, Finanzkraft). Der Russlandfeldzug 1812 bricht Napoleon; 1815 stellt der Wiener Kongress das Gleichgewicht wieder her – doch die Ideen der Revolution sind nicht mehr einzufangen.",
    text: "<p>1789: Staatsbankrott zwingt Ludwig XVI., die Generalstände einzuberufen. Der Dritte Stand erklärt sich zur Nationalversammlung, am 14. Juli fällt die Bastille. Die <b>Erklärung der Menschen- und Bürgerrechte</b> proklamiert Freiheit und Gleichheit; Feudalismus und Adelsprivilegien werden abgeschafft. Die Revolution radikalisiert sich: 1792 Republik, 1793 Hinrichtung des Königs, dann die <b>Terrorherrschaft</b> Robespierres (~17.000 Guillotinierte) – die Revolution frisst ihre Kinder.</p><p>Aus dem Chaos steigt der General <b>Napoleon Bonaparte</b> auf: 1799 Staatsstreich, 1804 Kaiserkrönung (er krönt sich selbst). Er exportiert mit seinen Armeen die Moderne: <b>Code Civil</b> (Gleichheit vor dem Gesetz, überall kopiert), Ende des Heiligen Römischen Reichs 1806, Neuordnung Deutschlands. Doch der Widerstand wächst – Spanien (Guerilla), Russland (1812: von 600.000 Mann kehren kaum 100.000 zurück), Völkerschlacht bei Leipzig 1813, Waterloo 1815.</p>",
    denken: "„<b>Freiheit, Gleichheit, Brüderlichkeit</b>“ – die Revolution macht aus Untertanen <b>Bürger</b> und erfindet die moderne Politik: links und rechts (Sitzordnung der Nationalversammlung!), Verfassung, Nation, Volkssouveränität. Der <b>Nationalismus</b> entsteht doppelt: als Befreiungsidee in Frankreich, als Widerstandsidee dagegen in Deutschland und Spanien. <b>Olympe de Gouges</b> fordert Frauenrechte (und wird guillotiniert), in <b>Haiti</b> erkämpfen versklavte Menschen 1791–1804 die einzige erfolgreiche Sklavenrevolution der Geschichte. Die <b>Romantik</b> antwortet auf die Vernunftkälte: Gefühl, Natur, Geschichte, Volksgeist.",
    konflikte: [
      "<b>Revolutionskriege</b> ab 1792: Europa gegen das revolutionäre Frankreich.",
      "<b>Napoleonische Kriege</b>: Austerlitz 1805, Jena 1806, Russland 1812, Leipzig 1813, <b>Waterloo 1815</b>.",
      "<b>Haitianische Revolution</b> 1791–1804: Erster unabhängiger Staat Schwarzer Menschen.",
      "Trafalgar 1805: Nelson sichert Britanniens Seeherrschaft für 100 Jahre."
    ],
    schlaglichter: [
      "<b>Frankreich:</b> Von der Bastille über den Terror zum Kaiserreich – klicke für die ganze Geschichte!",
      "<b>Haiti:</b> Toussaint Louverture – die vergessene Revolution.",
      "<b>Preußen/Deutschland:</b> Zusammenbruch 1806, dann Reformen (Stein, Hardenberg) und Befreiungskriege.",
      "<b>Großbritannien:</b> Der unsinkbare Gegner – Geld, Flotte, Koalitionen.",
      "<b>Spanien:</b> Guerillakrieg – und die Kolonien Lateinamerikas nutzen die Chance zur Unabhängigkeit."
    ]
  },
  {
    from: 1815, to: 1871,
    title: "Restauration, Revolutionen und Nationalstaaten",
    hegemon: "<strong>Großbritannien</strong> erlebt seine „Pax Britannica“: Werkstatt der Welt (Industrialisierung!), größte Flotte, London als Finanzzentrum, Empire von Kanada bis Indien. Auf dem Kontinent sichert das <strong>Konzert der Mächte</strong> (Metternichs System) die alte Ordnung – bis Nationalismus und Liberalismus sie sprengen: 1848 Revolutionen überall, 1871 stehen mit Italien und dem Deutschen Reich zwei neue Nationalstaaten auf der Karte.",
    text: "<p>Der Wiener Kongress 1815 restauriert Monarchien und Grenzen – doch unter der Oberfläche gärt es: Liberale fordern Verfassungen, Nationalisten eigene Staaten, und die <b>Industrialisierung</b> schafft eine neue Klasse, das Proletariat, mit neuem Elend (Kinderarbeit, 16-Stunden-Tage, Slums). 1848 explodiert Europa: Revolutionen in Paris, Wien, Berlin, Mailand – die deutsche Nationalversammlung in der Frankfurter Paulskirche scheitert jedoch; die Fürsten gewinnen wieder Oberwasser.</p><p>Was der Idealismus nicht schafft, erreicht die Realpolitik: <b>Cavour</b> eint Italien (1861), <b>Bismarck</b> schmiedet mit „Eisen und Blut“ – drei Kriege gegen Dänemark, Österreich, Frankreich – das Deutsche Reich (Kaiserproklamation in Versailles 1871!). In den USA klärt der <b>Bürgerkrieg</b> (1861–65, ~700.000 Tote) die Zukunft: Union und Ende der Sklaverei. Russland schafft 1861 die Leibeigenschaft ab, Japan öffnet sich 1868 (Meiji-Restauration) und modernisiert im Eiltempo.</p>",
    denken: "Das Jahrhundert der <b>-ismen</b>: <b>Liberalismus</b> (Freiheit, Verfassung, Markt), <b>Nationalismus</b> (jedem Volk sein Staat), <b>Konservatismus</b> (Ordnung, Tradition, Thron und Altar) – und als Antwort auf die soziale Frage der <b>Sozialismus</b>: Marx und Engels veröffentlichen 1848 das Kommunistische Manifest („Proletarier aller Länder, vereinigt euch!“). <b>Darwin</b> (1859) erschüttert das Weltbild: Der Mensch ist Teil der Evolution. Realismus in der Literatur, Fortschrittsglaube überall – Eisenbahn, Telegraph und Fotografie schrumpfen die Welt.",
    konflikte: [
      "<b>Revolutionen 1848/49</b> in halb Europa – fast überall niedergeschlagen.",
      "<b>Krimkrieg</b> (1853–56): Russland gegen England, Frankreich, Osmanen – das Konzert zerbricht.",
      "<b>Amerikanischer Bürgerkrieg</b> (1861–65).",
      "Deutsche Einigungskriege: 1864 Dänemark, 1866 Königgrätz, <b>1870/71 gegen Frankreich</b>.",
      "Opiumkriege (1839–42, 1856–60): Europa erzwingt Chinas Öffnung – Beginn von Chinas „Jahrhundert der Demütigung“."
    ],
    schlaglichter: [
      "<b>Großbritannien:</b> Viktorianisches Zeitalter – Weltmacht auf Kohle und Dampf gebaut.",
      "<b>Deutschland:</b> Vom Flickenteppich zum Kaiserreich – Bismarcks Meisterstück mit Folgen.",
      "<b>USA:</b> Bürgerkrieg, Sklavenbefreiung, Eroberung des Westens.",
      "<b>China:</b> Opiumkriege und Taiping-Aufstand (~20 Mio. Tote!) – der Riese wankt.",
      "<b>Japan:</b> Meiji-Restauration – das Lehrbuchbeispiel gelungener Modernisierung."
    ]
  },
  {
    from: 1871, to: 1914,
    title: "Imperialismus – Europa teilt die Welt",
    hegemon: "<strong>Großbritannien</strong> bleibt die Nummer 1 (ein Viertel der Erde ist britisch!), doch <strong>Deutschland</strong> überholt es industriell und fordert „einen Platz an der Sonne“. Die Hochrüstung (Flottenwettrüsten!) und starre Bündnisblöcke – Deutschland/Österreich gegen Frankreich/Russland/England – machen Europa zum Pulverfass. Die USA sind still und leise bereits die größte Volkswirtschaft der Welt geworden.",
    text: "<p>In nur 20 Jahren teilen die Europäer fast ganz <b>Afrika</b> unter sich auf („Wettlauf um Afrika“, Berliner Konferenz 1884/85 – Grenzen mit dem Lineal). Motive: Rohstoffe, Märkte, Prestige, Sendungsbewusstsein („Bürde des weißen Mannes“) – mit Maximengewehr gegen Speere. Die Gräuel sind enorm: Kongo Leopolds II. (Millionen Tote), Völkermord an Herero und Nama durch deutsche Truppen (1904–08).</p><p>Gleichzeitig: <b>zweite industrielle Revolution</b> – Elektrizität, Chemie, Auto, Telefon. Großstädte explodieren, Massenpresse, Massenparteien, erste Sozialversicherungen (Bismarck). Es ist die „Belle Époque“: Fortschrittsoptimismus, Weltausstellungen, Eiffelturm (1889) – und darunter Nervosität, Nationalismus, Sozialdarwinismus. 1905 schockt Japan die Welt: Es besiegt Russland – erstmals schlägt eine asiatische Macht eine europäische Großmacht.</p>",
    denken: "Widersprüchliches Zeitalter: <b>Fortschrittsglaube</b> (Wissenschaft wird Religion: Pasteur, Koch, Röntgen) neben <b>Sozialdarwinismus</b> und Rassismus als Pseudo-Wissenschaft zur Rechtfertigung des Imperialismus. <b>Nietzsche</b> verkündet den „Tod Gottes“ und die Umwertung aller Werte, <b>Freud</b> entdeckt das Unbewusste – der Mensch ist „nicht Herr im eigenen Haus“. Die <b>Arbeiterbewegung</b> wird Massenmacht, die <b>Frauenbewegung</b> fordert das Wahlrecht (Suffragetten). Einstein 1905: Relativitätstheorie. Die Kunst zersplittert in Avantgarden – Expressionismus, Kubismus: Vorahnung des Kommenden.",
    konflikte: [
      "Kolonialkriege überall: Burenkrieg (1899–1902), Boxeraufstand in China (1900), Herero-Aufstand (1904).",
      "<b>Russisch-Japanischer Krieg</b> 1904/05 – Japans Aufstieg, Russlands Revolution von 1905.",
      "Balkankriege 1912/13 – das „Pulverfass Europas“ glimmt bereits.",
      "Wettrüsten und Julikrise 1914: Attentat von Sarajevo (28. Juni 1914)."
    ],
    schlaglichter: [
      "<b>Deutschland:</b> Wirtschaftswunder, Wissenschaftsweltmacht – und außenpolitische Selbstisolation nach Bismarcks Entlassung 1890.",
      "<b>Großbritannien:</b> Empire auf dem Zenit – „the sun never sets“.",
      "<b>Afrika:</b> Koloniale Aufteilung – die Grenzen von heute entstehen am Reißbrett.",
      "<b>Japan:</b> Vom Schüler zum Rivalen in einer Generation.",
      "<b>Österreich-Ungarn & Balkan:</b> Vielvölkerreich im Nationalismus-Stress."
    ]
  },
  {
    from: 1914, to: 1945,
    title: "Die Weltkriege – Europas Selbstzerstörung",
    hegemon: "Europa zerstört seine eigene Vorherrschaft. Nach 1918 ist <strong>Großbritannien</strong> nur noch dem Schein nach führend; tatsächlich sind die <strong>USA</strong> längst die stärkste Wirtschafts- und Finanzmacht – sie ziehen sich aber isolationistisch zurück. Dieses Machtvakuum, Weltwirtschaftskrise und die Rachegefühle der Verlierer ermöglichen den Aufstieg der Diktatoren. 1945 liegt Europa in Trümmern; USA und Sowjetunion bleiben als Supermächte übrig.",
    text: "<p>Der <b>Erste Weltkrieg</b> (1914–18) wird zur Urkatastrophe: Materialschlachten (Verdun, Somme – je ~1 Mio. Opfer für Kilometer Geländegewinn), Giftgas, ~17 Mio. Tote. Vier Kaiserreiche stürzen (Deutschland, Österreich-Ungarn, Russland, Osmanen). In Russland putschen 1917 Lenins Bolschewiki – der Kommunismus wird Staat. Der Versailler Vertrag demütigt Deutschland, ohne es dauerhaft zu schwächen – „ein Waffenstillstand für zwanzig Jahre“ (Foch).</p><p>Die <b>Weltwirtschaftskrise</b> ab 1929 (Schwarzer Donnerstag) stürzt die Welt ins Elend und radikalisiert die Politik: 1933 wird <b>Hitler</b> Kanzler, errichtet in Monaten die Diktatur und steuert auf Krieg zu. Der <b>Zweite Weltkrieg</b> (1939–45) wird mit ~60–70 Mio. Toten der blutigste Konflikt der Geschichte. Im <b>Holocaust</b> ermorden die Nationalsozialisten sechs Millionen Juden – der Zivilisationsbruch schlechthin. Wendepunkte: Stalingrad (1942/43), D-Day (1944); im August 1945 zwingen zwei Atombomben Japan zur Kapitulation – die Menschheit kann sich nun selbst auslöschen.</p>",
    denken: "Der Fortschrittsglaube stirbt in den Schützengräben. <b>Totalitäre Ideologien</b> versprechen Erlösung: Kommunismus (klassenlose Gesellschaft – Preis: Terror, Gulag, Hungersnöte), Faschismus/Nationalsozialismus (Volk, Führer, Rasse – Preis: Krieg und Völkermord). Demokratien wirken schwach und entschlusslos (Appeasement). Kulturell: „Goldene Zwanziger“ (Jazz, Bauhaus, Kino), Existenzphilosophie (Heidegger, später Sartre), Quantenphysik zerlegt die Gewissheiten. Nach 1945: „Nie wieder“ – Vereinte Nationen, Menschenrechtserklärung (1948), Nürnberger Prozesse begründen das Völkerstrafrecht.",
    konflikte: [
      "<b>Erster Weltkrieg</b> 1914–18: Verdun, Somme, U-Boot-Krieg; 1917 Kriegseintritt der USA.",
      "Russischer Bürgerkrieg (1917–22), Stalins Terror und Zwangskollektivierung (Holodomor).",
      "Spanischer Bürgerkrieg (1936–39) – Generalprobe des Weltkriegs; Japan überfällt China 1937 (Nanking-Massaker).",
      "<b>Zweiter Weltkrieg</b> 1939–45: Blitzkrieg, Stalingrad, Holocaust, D-Day, Hiroshima."
    ],
    schlaglichter: [
      "<b>Deutschland:</b> Weimarer Republik – Demokratie ohne Demokraten? Dann die NS-Diktatur.",
      "<b>Sowjetunion:</b> Revolution, Stalinismus, Großer Vaterländischer Krieg.",
      "<b>USA:</b> Vom Isolationismus zur Supermacht – New Deal, Kriegswirtschaft, Atombombe.",
      "<b>Japan:</b> Militarismus und Expansion – von Mandschurei bis Pearl Harbor.",
      "<b>Osmanisches Reich/Türkei:</b> Völkermord an den Armeniern 1915; Atatürks radikale Republikgründung."
    ]
  },
  {
    from: 1945, to: 1991,
    title: "Der Kalte Krieg – eine geteilte Welt",
    hegemon: "Zwei Supermächte, zwei Systeme: <strong>USA</strong> (Kapitalismus, Demokratie, NATO) gegen <strong>Sowjetunion</strong> (Kommunismus, Planwirtschaft, Warschauer Pakt). Direkter Krieg ist wegen der Atomwaffen unmöglich („Gleichgewicht des Schreckens“) – gekämpft wird in Stellvertreterkriegen, im Wettrüsten und im Wettlauf ins All. Die UdSSR verliert am Ende ökonomisch: Die Planwirtschaft kann Rüstung UND Wohlstand nicht gleichzeitig stemmen; 1989 fällt die Mauer, 1991 zerfällt die Sowjetunion.",
    text: "<p>Europa wird geteilt („Eiserner Vorhang“), Deutschland gleich doppelt – die Mauer (1961) wird zum Symbol. Krisen am Rande des Abgrunds: Berlin-Blockade (1948), Kuba-Krise (1962 – die Welt schrammt am Atomkrieg vorbei), Korea- und Vietnamkrieg, sowjetische Invasionen in Ungarn (1956), der Tschechoslowakei (1968) und Afghanistan (1979).</p><p>Parallel die vielleicht größte Umwälzung: die <b>Dekolonisierung</b>. Indien wird 1947 frei (Gandhis gewaltfreier Widerstand!), bis ~1975 entstehen aus den Kolonialreichen über 80 neue Staaten – oft mit blutigen Geburtswehen (Teilung Indiens, Algerienkrieg, Kongo). Westeuropa erlebt derweil das „Wirtschaftswunder“ und beginnt die Integration (EWG 1957 → EU). China wird 1949 kommunistisch; Maos Experimente („Großer Sprung“, Kulturrevolution) kosten zig Millionen Leben, bevor Deng Xiaoping ab 1978 die Marktöffnung wagt. 1969: Mondlandung – Höhepunkt des Systemwettstreits.</p>",
    denken: "Angst und Aufbruch: <b>Existenzialismus</b> (Sartre, Camus – der Mensch ist zur Freiheit verurteilt), Anti-Atom- und Friedensbewegung, ab den 60ern die große Kulturrevolte: <b>Bürgerrechtsbewegung</b> (Martin Luther King: „I have a dream“, 1963), Studentenproteste 1968, zweite Welle des <b>Feminismus</b>, Beginn der <b>Umweltbewegung</b> (1972 „Grenzen des Wachstums“). Konsumgesellschaft, Fernsehen und Popkultur (Beatles!) verändern den Alltag radikaler als jede Ideologie. Am Ende siegt kein Denker, sondern die Attraktivität von Wohlstand und Freiheit – und Gorbatschows Einsicht, dass das sowjetische System nicht reformierbar ist (Glasnost, Perestroika).",
    konflikte: [
      "<b>Koreakrieg</b> (1950–53), <b>Vietnamkrieg</b> (~1955–75) – die heißen Kriege des Kalten Kriegs.",
      "<b>Kuba-Krise</b> 1962: 13 Tage am Rand des Atomkriegs.",
      "Nahostkonflikt: Israels Gründung 1948, Sechstagekrieg 1967, Jom-Kippur-Krieg 1973.",
      "Afghanistan 1979–89: das „Vietnam der Sowjets“.",
      "1989: Friedliche Revolutionen in Osteuropa – Fall der Berliner Mauer am 9. November."
    ],
    schlaglichter: [
      "<b>USA:</b> Führungsmacht des Westens – Marshallplan, Mondlandung, aber auch Vietnam-Trauma.",
      "<b>Sowjetunion:</b> Supermacht mit Systemfehler – Sputnik-Triumph, Gulag, Stagnation, Zerfall.",
      "<b>Deutschland:</b> Geteilt an der Frontlinie – Wirtschaftswunder West, SED-Staat Ost, Wiedervereinigung 1990.",
      "<b>China:</b> Mao bis Deng – vom Hungerland zum kommenden Giganten.",
      "<b>Indien & Afrika:</b> Dekolonisierung – Aufbruch und Bürden der neuen Staaten."
    ]
  },
  {
    from: 1991, to: 2030,
    title: "Globalisierung und neue Rivalitäten",
    hegemon: "Nach 1991 sind die <strong>USA</strong> konkurrenzlose Supermacht („unipolarer Moment“). Doch der Aufstieg <strong>Chinas</strong> – seit 2001 in der Welthandelsorganisation, bald zweitgrößte Volkswirtschaft – und Russlands Revisionismus beenden diese Phase: Die Welt wird wieder multipolar, mit Systemwettbewerb zwischen Demokratien und autoritären Staaten.",
    text: "<p>Die 90er beginnen hoffnungsvoll: Demokratisierungswellen, europäische Einigung (EU 1993, Euro 2002), Internet für alle, Ende der Apartheid in Südafrika (Mandela 1994). Doch auch: Jugoslawienkriege mit Völkermord in Srebrenica (1995), Genozid in Ruanda (1994 – ~800.000 Tote in 100 Tagen).</p><p>Der 11. September 2001 markiert die Wende: „Krieg gegen den Terror“, Afghanistan- und Irakkrieg binden die USA zwei Jahrzehnte. Die Finanzkrise 2008 erschüttert das Vertrauen in den westlichen Kapitalismus. Smartphone (2007) und soziale Medien revolutionieren Kommunikation – mit Licht- und Schattenseiten. Der Klimawandel wird zur erkannten Menschheitsfrage (Kyoto 1997, Paris 2015).</p>",
    denken: "Fukuyamas These vom „<b>Ende der Geschichte</b>“ (liberale Demokratie als Endpunkt) tritt gegen Huntingtons „<b>Kampf der Kulturen</b>“ an – die Realität widerlegt beide Vereinfachungen. <b>Globalisierung</b> wird Leitbegriff: Weltweite Lieferketten, Migration, Kulturmischung – und Gegenbewegungen: Populismus, Identitätspolitik, religiöser Fundamentalismus. Das <b>Internet</b> demokratisiert Wissen (Wikipedia!) und fragmentiert zugleich die Öffentlichkeit. Neu im Werkzeugkasten der Menschheit: Gentechnik, erneuerbare Energien, künstliche Intelligenz.",
    konflikte: [
      "Jugoslawienkriege (1991–99), Genozid in Ruanda (1994).",
      "<b>11. September 2001</b>; Kriege in Afghanistan (2001–2021) und Irak (2003).",
      "Arabischer Frühling ab 2010/11 – Hoffnung und Ernüchterung (Syrienkrieg).",
      "Russlands Kriege: Tschetschenien, Georgien 2008, Ukraine ab 2014/2022."
    ],
    schlaglichter: [
      "<b>USA:</b> Hypermacht mit Ermüdungserscheinungen.",
      "<b>China:</b> Werkbank → Technologiemacht → Herausforderer.",
      "<b>Europäische Union:</b> Einigungsprojekt zwischen Erweiterung und Krisen.",
      "<b>Russland:</b> Vom Reformchaos der 90er zum autoritären Revisionismus.",
      "<b>Südafrika:</b> Mandela und das Ende der Apartheid – Versöhnung als Politik."
    ]
  }
];

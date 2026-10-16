/**
 * The clean issue taxonomy, independent of any export's drop-downs, and the
 * multilingual keyword rules that map free text onto it. Rules run before any
 * model: a hit is explainable and free; a miss is handed to the LLM stage.
 */

export const CATEGORIES = [
  "hvac", "plumbing", "electrical", "locks_doors", "noise", "housekeeping", "pest",
  "facilities", "elevator", "it_network", "it_tv", "fnb_service", "furniture", "safety",
  "appliance", "service", "request", "preventive",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type TopicDef = {
  category: Category;
  /** Facility code when the topic is inherently about one place. */
  defaultLocation?: string;
  /** Rules: each entry scores when every regex in `all` matches. */
  rules: { all: RegExp[]; weight?: number }[];
};

import { unicodeWordRegex } from "./regex";

const r = (s: string) => unicodeWordRegex(s, "iu");

// Shared fragments
const AC = r("\\b(a/?c|ac|air ?con(ditioning|ditioner)?|aircon|klima(anlage|tisé)?|climatisation|clim|aria condizionata|condizionatore|κλιματισ\\w*|klimatistiko|кондиционер\\w*|מזגן|fan ?coil|split unit)\\b");
const NEG = r("\\b(not|no|never|doesn'?t|don'?t|isn'?t|won'?t|stopped|nicht|kein\\w*|funktioniert nicht|kaputt|ne (fonctionne|marche)|pas|non (funziona|va)|rotto|δεν|den|oxi|χαλασμ\\w*|xalasm\\w*|δούλεψ\\w*|не (работа\\w*|охлажд\\w*)|сломан\\w*|לא (עובד|מקרר)|שבור)\\b");
const GREEK_NOT_WORKING = "δεν (δουλεύ\\w*|δούλεψ\\w*|ανοίγ\\w*|άνοιξ\\w*|λειτουργ\\w*|λειτούργ\\w*|κρυών\\w*|κρύων\\w*|ψύχ\\w*|ανάβ\\w*|άναψ\\w*|τραβά\\w*|κλείν\\w*|πιάν\\w*|έχει σήμα)";
const UNIT = r("\\b(appareil|gerät|unit|device|apparecchio|μηχάνημα|συσκευή|mixanima|прибор|устройств\\w*|יחידה|מכשיר)\\b");
const DRIP = r("\\b(drip\\w*|leak\\w*|dropping water|water (on the floor|coming out)|condensate|tropf\\w*|undicht|goutte\\w*|fuite|gocciol\\w*|perde acqua|στάζ\\w*|τρέχει νερό|διαρρο\\w*|συμπυκνωμ\\w*|stazei|diarroi|капа\\w*|теч\\w*|מטפטף|דולף|נוזל)\\b");
const SLIDING = r("\\b(sliding|συρόμεν\\w*|syromeni|schiebetür\\w*|baie vitrée|scorrevole)\\b");
const WATER = r("\\b(water|wasser|eau|acqua|νερ[όο]|nero|вод[аыу]|מים)\\b");
const HOT_WATER = r("\\b(hot water|warm water|hw|h/w|warme(?:s|n|m)? wasser|warmwasser|eau chaude|acqua calda|ζεστό νερό|ζεστο νερο|ζεστ\\w* νερ\\w*|zesto nero|горяч\\w* вод\\w*|מים חמים)\\b");
const COLD = r("\\b(cold|cool|lukewarm|kalt|lauwarm|froid\\w*|tiède|fredd\\w*|tiepid\\w*|κρύ\\w*|χλιαρ\\w*|kryo|xliaro|холодн\\w*|тёпл\\w*|קר|קרה|קרים|קרות|פושר\\w*)\\b");

/** Praise, used to skip sentences that only say nice things. */
const PRAISE = r("\\b(great|excellent|wonderful|amazing|perfect|lovely|delicious|superb|fantastic|best|loved|enjoyed|highlight|spotless|impeccable|gorgeous|stunning|toll\\w*|wunderbar|hervorragend|ausgezeichnet|beste\\w*|perfekt|lecker|super|genossen|geliebt|begeistert|blitzsauber|excellent\\w*|merveilleu\\w*|parfait\\w*|délicieu\\w*|superbe|meilleur\\w*|adoré|magnifique|ottim\\w*|eccellent\\w*|meraviglios\\w*|perfett\\w*|buonissim\\w*|miglior\\w*|fantastic\\w*|stupend\\w*|υπέροχ\\w*|εξαιρετικ\\w*|τέλει\\w*|καταπληκτικ\\w*|νόστιμ\\w*|καλύτερ\\w*|απόλαυσ\\w*|λάτρεψ\\w*|μαγικ\\w*|отличн\\w*|прекрасн\\w*|замечательн\\w*|вкусн\\w*|лучш\\w*|идеальн\\w*|обожа\\w*|понравил\\w*|מצוין\\w*|נהדר\\w*|מושלם\\w*|טעים\\w*|נפלא\\w*|אהב\\w*|מרהיב\\w*)\\b");
/** Turns of phrase that introduce a complaint inside a positive text. */
const COMPLAINT_CUE = r("\\b(but|however|unfortunately|although|except|sadly|shame|only (problem|issue|complaint|downside)|aber|leider|allerdings|jedoch|schade|mais|malheureusement|sauf|dommage|però|purtroppo|tranne|peccato|αλλά|όμως|δυστυχώς|εκτός|κρίμα|но|однако|к сожалению|жаль|אבל|אך|לצערנו|חבל)\\b");
const SENTENCE_SPLIT = /[.!?;\n]+/u;
const BALCONY = r("\\b(balcony|terrace|balkon|terrasse|balcon|balcone|terrazz\\w*|μπαλκόν\\w*|βεράντ\\w*|balkoni|mpalkoni|veranta|балкон\\w*|террас\\w*|מרפסת)\\b");
const DOOR = r("\\b(door|tür|porte|porta|πόρτ\\w*|porta|двер\\w*|דלת)\\b");
const POOL = r("\\b(pool|piscine|piscina|schwimmbad|πισίν\\w*|pisina|бассейн\\w*|בריכ\\w*)\\b");
const BATHROOM = r("\\b(bathroom|bath|shower|bad|dusche|salle de bain|douche|bagno|doccia|μπάνι\\w*|ντους|mpanio|ntous|ванн\\w*|душ\\w*|אמבטי\\w*|מקלחת)\\b");

export const TOPICS: Record<string, TopicDef> = {
  ac_not_cooling: { category: "hvac", rules: [
    { all: [AC, r(`\\b(not (cool|cold|work)\\w*|warm air|hot air|blowing warm|room (is )?hot|stuffy|heiß|nicht kühl\\w*|funktioniert nicht|ne refroidit|souffle chaud|non (raffredda|funziona)|aria calda|${GREEK_NOT_WORKING}|ζέστη|den (kryonei|douleuei|leitourgei)|vgazei zesto|zesto aera|barely work\\w*|hardly work\\w*|weak|не (охлажд\\w*|работа\\w*)|дует тёплым|לא (מקרר|עובד)|חם)\\b`)] },
    { all: [AC, NEG], weight: 0.5 },
  ] },
  ac_noisy: { category: "hvac", rules: [
    { all: [AC, r("\\b(noisy|noise|rattl\\w*|loud|hum\\w*|buzz\\w*|laut|rattert|klacker\\w*|klapper\\w*|brumm\\w*|vibrier\\w*|bruyant\\w*|bruit|rumoros\\w*|rumore|vibra\\w*|θόρυβ\\w*|θορυβ\\w*|τρίζ\\w*|thoryv\\w*|шум\\w*|гуд\\w*|רועש|רעש)\\b")] },
    { all: [UNIT, r("\\b(rattl\\w*|klacker\\w*|klapper\\w*|vibrat\\w*|vibrier\\w*|brumm\\w*|hum\\w*|rumore|vibra\\w*|τρίζ\\w*|δον\\w*|θόρυβ\\w*)\\b")] },
  ] },
  ac_dripping: { category: "hvac", rules: [{ all: [AC, DRIP] }, { all: [UNIT, DRIP], weight: 1.5 }] },
  no_hot_water: { category: "plumbing", rules: [
    { all: [HOT_WATER] },
    { all: [r("\\b(cold shower|kalte dusche|douche froide|doccia fredda|κρύο ντους|kryo ntous|холодный душ|מקלחת קרה|only cold water|nur kaltes wasser|que de l'eau froide|solo acqua fredda|μόνο κρύο νερό)\\b")] },
    { all: [BATHROOM, COLD, WATER], weight: 0.8 },
  ] },
  low_pressure: { category: "plumbing", rules: [
    { all: [r("\\b(pressure|druck|pression|pressione|πίεση|piesi|напор\\w*|давлен\\w*|לחץ)\\b"), r("\\b(water|low|weak|drop\\w*|nothing|wasser|niedrig|schwach|eau|faible|acqua|bassa|debole|νερ\\w*|χαμηλ\\w*|λίγ\\w*|nero|xamili|ligi|liges|вод\\w*|слаб\\w*|מים|חלש)\\b")] },
    { all: [r("\\b(weak|trickle|dribbl\\w*|schwach\\w*|faible|debole|αδύναμ\\w*|σιγά|λίγο νερό|слаб\\w*|חלש\\w*)\\b"), r("\\b(shower|dusche|douche|doccia|ντους|ntous|душ\\w*|מקלחת)\\b")] },
  ] },
  drain_blocked: { category: "plumbing", rules: [
    { all: [r("\\b(drain\\w*|abfluss|évacuation|siphon|scarico|σιφ\\w*|αποχέτ\\w*|apoxet\\w*|sifoni|сток\\w*|слив\\w*|ניקוז)\\b"), r("\\b(block\\w*|clog\\w*|slow\\w*|standing|not drain\\w*|verstopft|langsam|bouch\\w*|lent\\w*|intasat\\w*|otturat\\w*|lento|βουλωμ\\w*|αργ\\w*|voulwm\\w*|засор\\w*|медленн\\w*|не уходит|стоит|סתום|חסום|לאט)\\b")] },
    { all: [r("\\b(shower|dusche|douche|doccia|ντους|ntous|душ\\w*|מקלחת)\\b"), r("\\b(not draining|doesn'?t drain|standing water|fills up|läuft nicht ab|ne s'évacue pas|non scarica|δεν (φεύγει|αδειάζει|τραβά\\w*)|γεμίζει|den fevgei|не сливается|לא מתנקז)\\b")] },
  ] },
  toilet_flush: { category: "plumbing", rules: [{ all: [r("\\b(toilet|wc|loo|toilette|klo|spülung|toilettes|chasse d'eau|gabinetto|sciacquone|τουαλέτ\\w*|καζανάκ\\w*|kazanaki|toualeta|унитаз\\w*|туалет\\w*|смыв\\w*|אסל\\w*|שירותים|ניאגרה)\\b"), r(`\\b(flush\\w*|running|keeps running|won'?t stop|blocked|spült nicht|spülung|läuft|kaputt|tire pas|coule|non scarica|scorre|${GREEK_NOT_WORKING}|δεν σταματ\\w*|τρέχει|den (trava|stamata|douleuei)|не смывает|течёт|לא עובד|לא שוטף|נוזל)\\b`)] }] },
  ceiling_leak: { category: "plumbing", rules: [{ all: [r("\\b(ceiling|decke|plafond|soffitto|ταβάν\\w*|οροφή|tavani|потол\\w*|תקר\\w*)\\b"), r("\\b(drip\\w*|leak\\w*|water|stain|wet|damp|tropf\\w*|nass|fleck|fuite|goutte|tache|humide|perdita|gocciol\\w*|macchia|στάζ\\w*|νερ\\w*|λεκέ\\w*|υγρασ\\w*|stazei|nero|протек\\w*|капа\\w*|пятн\\w*|דליפ\\w*|מים|כתם|רטוב)\\b")] }] },
  sewage_smell: { category: "plumbing", rules: [
    { all: [r("\\b(sewage|sewer|drains? smell|smell\\w* (from|of) (the )?drain\\w*|abwasser|kanal(isation)?|égout\\w*|fogna\\w*|υπόνομ\\w*|βόθρ\\w*|αποχέτευσ\\w*|ypónomos|канализац\\w*|ביוב)\\b")] },
    { all: [r("\\b(smell\\w*|stink\\w*|stench|odou?r|geruch|stinkt|riecht|odeur|pue|puzza|odore|cattivo odore|μυρίζ\\w*|μυρωδι\\w*|βρωμ\\w*|myriz\\w*|vromaei|запах\\w*|вон\\w*|ריח|מסריח)\\b"), BATHROOM] },
  ] },
  lights_flicker: { category: "electrical", rules: [{ all: [r("\\b(light\\w*|lamp\\w*|licht\\w*|lampe\\w*|lumière\\w*|luce|luci|φως|φώτα|λάμπ\\w*|fws|fota|lampa|свет\\w*|лампа|אור\\w*|מנור\\w*)\\b"), r(`\\b(flicker\\w*|blink\\w*|spark\\w*|flackern?|flackert|funke\\w*|clignot\\w*|étincelle\\w*|lampeggi\\w*|sfarfall\\w*|scintill\\w*|τρεμοπαίζ\\w*|αναβοσβήν\\w*|σπινθήρ\\w*|tremopaizei|мига\\w*|искр\\w*|מהבהב\\w*|not working|don'?t work|kaputt|ne marche|non funziona|${GREEK_NOT_WORKING}|den anavei)\\b`)] }] },
  light_bulb: { category: "electrical", rules: [
    { all: [r("\\b(bulb\\w*|light ?bulb|birne|glühbirne|ampoule|lampadin\\w*|λαμπάκι|лампочк\\w*|נור\\w*)\\b")] },
    { all: [r("\\b(lamp\\w*|light\\w*|licht\\w*|lampe\\w*|lumière\\w*|luce|luci|φως|φώτα|λάμπ\\w*|fws|fota|lampa|свет\\w*|лампа|אור\\w*|מנור\\w*)\\b"), r("\\b(burn\\w*|blown|out|dead|gone|replace\\w*|change\\w*|durchgebrannt|kaputt|wechsel\\w*|grillé\\w*|changer|bruciat\\w*|cambiar\\w*|καμέν\\w*|καεί|κάηκε|αλλαγ\\w*|αντικατ\\w*|kameni|kaei|allagi|перегорел\\w*|замен\\w*|שרופ\\w*|להחליף)\\b")] },
  ] },
  safe_stuck: { category: "electrical", rules: [{ all: [r("\\b(safe|tresor|safe box|coffre(-fort)?|cassaforte|χρηματοκιβώτ\\w*|xrimatokivwtio|сейф\\w*|כספת)\\b")] }] },
  tv_broken: { category: "it_tv", rules: [
    { all: [r("\\b(tv|television|telly|fernseher|télé(vision)?|televisione|televisore|τηλεόρασ\\w*|tileorasi|телевизор\\w*|טלוויזי\\w*|set[- ]top box|channels?|kanäle|chaînes|canali|κανάλι\\w*|канал\\w*|ערוצ\\w*)\\b"), r(`\\b(not work\\w*|doesn'?t|won'?t|funktioniert nicht|ne (marche|fonctionne) pas|non funziona|${GREEK_NOT_WORKING}|den (douleuei|anoigei)|не работа\\w*|לא עובד\\w*|reboot\\w*|restart\\w*)\\b`)] },
    { all: [r("\\b(tv|television|telly|fernseher|télé(vision)?|televisione|televisore|τηλεόρασ\\w*|tileorasi|телевизор\\w*|טלוויזי\\w*|set[- ]top box|channels?|kanäle|chaînes|canali|κανάλι\\w*|канал\\w*|ערוצ\\w*)\\b"), r("\\b(no signal|no picture|black screen|freez\\w*|switches (itself )?off|turns (itself )?off|goes off|kein (signal|bild)|schaltet sich (ab|aus)|pas de signal|s'éteint|nessun segnale|si spegne|χωρίς σήμα|σβήνει|xwris sima|xoris sima|svinei|нет сигнала|выключается|אין קליטה|נכבה)\\b")], weight: 1.5 },
  ] },
  remote: { category: "it_tv", rules: [{ all: [r("\\b(remote( control)?|fernbedienung|télécommande|telecomando|τηλεχειριστήρ\\w*|τηλεκοντρόλ|tilexeiristirio|tilekontrol|пульт\\w*|שלט)\\b")], weight: 1.5 }] },
  keycard_fails: { category: "locks_doors", rules: [
    { all: [r("\\b(key ?cards?|keycard\\w*|room (key|card)s?|cards?|door lock|lock|schlüsselkarte\\w*|zimmerkarte\\w*|karte\\w*|carte\\w* (magnétique|de la chambre|clé)|tessera|chiave|κάρτ\\w*|κλειδαρι\\w*|karta|kartes|kleidaria|ключ-?карт\\w*|карт\\w*|замок|כרטיס\\w*|מפתח\\w*|מנעול)\\b"), r(`\\b(not work\\w*|fail\\w*|stopped|locked out|deactivat\\w*|won'?t open|doesn'?t open|red light|blink\\w*|flash\\w*|funktionier\\w*( jeden tag)? nicht|nicht mehr|geht nicht|ausgesperrt|ne (marche|fonctionne) pas|n'ouvre pas|non funziona|non apre|${GREEK_NOT_WORKING}|απενεργοπ\\w*|αναβοσβήν\\w*|κόκκινο|έξω|den (douleuei|anoigei|pianei)|anavosvinei|kokkino|не (работа\\w*|открыва\\w*)|לא (עובד|פותח)|ננעל\\w*)\\b`)] },
    { all: [r("\\b(lock(ed)? out|ausgesperrt|enfermés dehors|chiusi fuori|κλειδωμέν\\w* έξω|μείναμε έξω|заперт\\w* снаружи|ננעל\\w* בחוץ)\\b")] },
  ] },
  balcony_door_lock: { category: "locks_doors", rules: [
    { all: [BALCONY, DOOR, r("\\b(lock\\w*|latch|close\\w*|shut|handle|broken|stuck|stiff|jammed|schließ\\w*|schloss|griff|kaputt|klemmt|ferm\\w*|verrou\\w*|poignée|cassé\\w*|chiud\\w*|serratur\\w*|maniglia|rott\\w*|κλειδ\\w*|κλείν\\w*|χερούλ\\w*|σπασμ\\w*|σκληρ\\w*|κολλά\\w*|kleidwnei|kleinei|kleidaria|закр\\w*|замок|ручк\\w*|נועל\\w*|נסגר\\w*|ידית|שבור\\w*)\\b")] },
    { all: [SLIDING, r("\\b(lock\\w*|stiff|jammed|stuck|hard|klemmt|schwergängig|schloss|dur\\w*|coinc\\w*|verrou\\w*|dur[ao]|bloccat\\w*|serratur\\w*|κλειδαρι\\w*|σκληρ\\w*|κολλά\\w*|χαλασμ\\w*|kleidaria|skliri|замок|туго|מנעול|תקוע\\w*)\\b")] },
  ] },
  noise_music: { category: "noise", defaultLocation: "BEACHBAR", rules: [{ all: [r("\\b(music|musik|musique|musica|μουσικ\\w*|mousiki|музык\\w*|מוזיק\\w*|dj|bass|party|πάρτι)\\b"), r("\\b(loud|noise|noisy|too|until|late|night|midnight|sleep|laut|lärm|bis|nacht|schlafen|fort|bruit|tard|nuit|dormir|alta|rumore|tardi|notte|dormire|δυνατ\\w*|θόρυβ\\w*|μέχρι|νύχτα|βράδυ|ύπνο|dynata|thoryvos|громк\\w*|шум\\w*|ночь\\w*|спать|רועש\\w*|רעש|לילה|לישון)\\b")] }] },
  noise_neighbors: { category: "noise", rules: [{ all: [r("\\b(neighbou?r\\w*|next door|nebenzimmer|nachbar\\w*|voisin\\w*|vicin\\w*|διπλαν\\w*|γείτον\\w*|diplano|сосед\\w*|שכנ\\w*|חדר ליד)\\b")] }] },
  noise_equipment: { category: "noise", rules: [{ all: [r("\\b(hum\\w*|buzz\\w*|machine\\w*|motor|fan|vibrat\\w*|mechanical|brumm\\w*|summ\\w*|maschine|motor|vibrier\\w*|ronron\\w*|moteur|vibration|ronzio|macchinar\\w*|motore|vibrazion\\w*|βουητ\\w*|μηχαν\\w*|μοτέρ|δον\\w*|vouito|гул\\w*|жужж\\w*|мотор|вибрац\\w*|זמזום|רעש מכונ\\w*|מנוע)\\b"), r("\\b(night|roof|outside|all night|sleep|nacht|dach|draußen|schlafen|nuit|toit|dehors|dormir|notte|tetto|fuori|dormire|νύχτα|βράδυ|ταράτσ\\w*|έξω|ύπνο|nyxta|ночь\\w*|крыш\\w*|спать|לילה|גג|לישון)\\b")] }] },
  room_not_cleaned: { category: "housekeeping", rules: [
    { all: [r("\\b(not (been )?cleaned|not serviced|wasn'?t cleaned|never cleaned|no housekeeping|unmade|skipped|nicht (gereinigt|gemacht|geputzt)|pas (été )?(nettoyé\\w*|fait\\w*)|non (è stata )?(pulita|rifatta)|δεν (καθαρίστ\\w*|έγινε|στρώθ\\w*)|ακαθάριστ\\w*|den katharistike|не (убра\\w*|убира\\w*)|לא (נוק\\w*|סודר\\w*)|dirty|schmutzig|sale|sporc\\w*|βρώμικ\\w*|vromiko|грязн\\w*|מלוכלך\\w*)\\b"), r("\\b(room|zimmer|chambre|camera|δωμάτι\\w*|domatio|dwmatio|комнат\\w*|номер\\w*|חדר|bed|bett|lit|letto|κρεβάτ\\w*|кроват\\w*|מיט\\w*|sheets|bettwäsche|draps|lenzuol\\w*|σεντόν\\w*|простын\\w*|סדינ\\w*|bins?|floor|boden)\\b")] },
    { all: [r("\\b(housekeeping|maid|cleaning (staff|lady)|zimmermädchen|reinigung|femme de (chambre|ménage)|ménage|cameriera|pulizie|καμαριέρ\\w*|καθαρίστρι\\w*|kamariera|горничн\\w*|уборк\\w*|חדרנ\\w*|ניקיון)\\b"), r("\\b(did ?n'?t|never|skip\\w*|forgot|missed|not come|nicht|vergessen|pas venu\\w*|oublié|non (è|sono) (venut\\w*|passat\\w*)|dimenticat\\w*|δεν (ήρθ\\w*|πέρασ\\w*|έκαν\\w*)|ξέχασ\\w*|den irthe|не (пришл\\w*|убра\\w*)|забыл\\w*|לא (הגיע\\w*|ניק\\w*)|שכח\\w*)\\b")] },
  ] },
  towels_missing: { category: "housekeeping", rules: [{ all: [r("\\b(towel\\w*|\\w*handtuch|\\w*handtüch\\w*|serviette\\w*|asciugaman\\w*|πετσέτ\\w*|petset\\w*|полотенц\\w*|מגבת|מגבות)\\b"), r("\\b(no|not|missing|none|dirty|not (changed|replaced)|wet|kein\\w*|fehl\\w*|nicht (gewechselt|ersetzt)|schmutzig|pas|manqu\\w*|sales|niente|senza|manca\\w*|non (cambiat\\w*|sostituit\\w*)|sporch\\w*|δεν|χωρίς|λείπ\\w*|βρώμικ\\w*|den|xwris|нет|не (поменял\\w*|замен\\w*)|грязн\\w*|אין|לא (הוחלפ\\w*|החליפ\\w*)|מלוכלכ\\w*)\\b")] }] },
  mosquitoes: { category: "pest", rules: [{ all: [r("\\b(mosquito\\w*|mozzie\\w*|mücke\\w*|moskito\\w*|moustique\\w*|zanzar\\w*|κουνούπ\\w*|kounoup\\w*|комар\\w*|יתוש\\w*|bitten|bites|stiche|gestochen|piqûre\\w*|piqué\\w*|puntur\\w*|τσιμπ\\w*|tsimp\\w*|укус\\w*|עקיצ\\w*|insects?|bugs?|ants?|cockroach\\w*|insekten|kakerlake\\w*|ameisen|cafard\\w*|fourmi\\w*|scarafagg\\w*|formich\\w*|κατσαρίδ\\w*|μυρμήγκ\\w*|έντομ\\w*|таракан\\w*|муравь\\w*|насеком\\w*|ג'וק\\w*|נמל\\w*|חרק\\w*|pest control|ψεκασμ\\w*|psekasmos|spray\\w*)\\b")] }] },
  pool_cold: { category: "facilities", defaultLocation: "POOL-INFINITY", rules: [{ all: [POOL, r("\\b(cold|freezing|not heated|unheated|icy|chilly|kalt|eiskalt|nicht beheizt|froid\\w*|glacé\\w*|pas chauffé\\w*|fredd\\w*|gelid\\w*|non riscaldat\\w*|κρύ\\w*|παγωμέν\\w*|δεν (είναι )?θερμαιν\\w*|krya|pagwmeni|холодн\\w*|ледян\\w*|не (подогрева\\w*|нагрет\\w*)|קר|קרה|קרים|קרות|לא מחומ\\w*)\\b")] }] },
  sunbeds: { category: "facilities", defaultLocation: "POOL-MAIN", rules: [{ all: [r("\\b(sun ?beds?|sun ?loungers?|loungers?|deck ?chairs?|liege\\w*|sonnenliege\\w*|transats?|chaises? longues?|lettin\\w*|sdraio|ξαπλώστρ\\w*|xaplwstr\\w*|лежак\\w*|шезлонг\\w*|מיטות שיזוף|כיסאות נוח)\\b")] }] },
  pool_cloudy: { category: "facilities", defaultLocation: "POOL-MAIN", rules: [{ all: [POOL, r("\\b(cloudy|milky|murky|green|dirty|trüb\\w*|milchig|grün|schmutzig|trouble|laiteu\\w*|verte|sale|torbid\\w*|lattiginos\\w*|verde|sporc\\w*|θολ\\w*|πράσιν\\w*|βρώμικ\\w*|tholi|мутн\\w*|зелён\\w*|грязн\\w*|עכור\\w*|ירוק\\w*|מלוכלכ\\w*)\\b")] }] },
  elevator_stuck: { category: "elevator", rules: [{ all: [r("\\b(lifts?|elevators?|aufzug|aufzüge|fahrstuhl|ascenseur\\w*|ascensor\\w*|ασανσέρ|ανελκυστήρ\\w*|asanser|лифт\\w*|מעלית\\w*)\\b")] }] },
  wifi_weak: { category: "it_network", rules: [{ all: [r("\\b(wi-?fi|wlan|internet|ίντερνετ|ιντερνετ|интернет\\w*|вай-?фай|אינטרנט|ווייפיי|connection|verbindung|connexion|connessione|σύνδεσ\\w*|соединен\\w*|חיבור|signal|signal|segnale|σήμα)\\b")] }] },
  hammam_cold: { category: "facilities", defaultLocation: "SPA", rules: [{ all: [r("\\b(hammam|hamam|steam( room| bath)?|dampfbad|dampf|bain de vapeur|vapeur|bagno turco|vapore|χαμάμ|ατμόλουτρ\\w*|ατμ\\w*|xamam|хаммам|хамам|парн\\w*|пар|חמאם|אדים)\\b"), r("\\b(cold|not (hot|working|heated)|no steam|broken|out of order|kalt|kein dampf|funktioniert nicht|froid\\w*|pas de vapeur|en panne|fredd\\w*|senza vapore|non funziona|guasto|κρύ\\w*|χωρίς ατμό|δεν (δουλεύ\\w*|ζεσταίν\\w*)|χαλασμ\\w*|kryo|den douleuei|холодн\\w*|нет пара|не работа\\w*|קר|אין אדים|לא עובד\\w*)\\b")] }] },
  spa_changing_smell: { category: "facilities", defaultLocation: "SPA", rules: [
    { all: [r("\\b(changing room\\w*|locker room\\w*|umkleide\\w*|vestiaire\\w*|spogliatoi\\w*|αποδυτήρι\\w*|apodytiria|раздевалк\\w*|מלתח\\w*)\\b"), r("\\b(smell\\w*|damp|musty|mould\\w*|mold\\w*|wet|humid\\w*|geruch|feucht|muffig|schimmel|odeur|humide|moisi|puzza|odore|umid\\w*|muffa|μυρίζ\\w*|μυρωδι\\w*|υγρασ\\w*|μούχλ\\w*|myrizei|ygrasia|запах\\w*|сыр\\w*|плесен\\w*|ריח|לח\\w*|עובש)\\b")] },
    { all: [r("\\b(spa|σπα|спа)\\b"), r("\\b(smell\\w*|damp|musty|mould\\w*|mold\\w*|geruch|feucht|muffig|schimmel|odeur|humide|moisi|puzza|umid\\w*|muffa|μυρίζ\\w*|μυρωδι\\w*|υγρασ\\w*|μούχλ\\w*|запах\\w*|сыр\\w*|плесен\\w*|ריח|לח\\w*|עובש)\\b")] },
  ] },
  gym_treadmill: { category: "facilities", defaultLocation: "GYM", rules: [{ all: [r("\\b(treadmill\\w*|running machine|laufband|tapis (de course|roulant)|tapis|διάδρομ\\w*|diadromos|беговая дорожка|беговой|הליכון|gym equipment|fitness (equipment|machine\\w*)|geräte|appareils? de fitness|attrezz\\w*|όργαν\\w* γυμναστ\\w*|тренажер\\w*|מכשיר\\w*)\\b")] }] },
  breakfast_slow: { category: "fnb_service", defaultLocation: "REST-ORIZONTAS", rules: [{ all: [r("\\b(breakfast|buffet|frühstück|petit[- ]déjeuner|colazione|πρωιν\\w*|μπουφέ|prwino|завтрак\\w*|ארוחת בוקר|orizontas)\\b"), r("\\b(wait\\w*|queue\\w*|slow|long|understaffed|not enough (staff|tables)|no (tables?|plates|cups|coffee)|empty|ran out|chaos|warten|schlange|langsam|lange|personal|keine? (tische?|teller|kaffee)|leer|attente|attendu|queue|lent\\w*|long\\w*|manque|pas de (table|café|assiettes)|vide|attesa|aspettat\\w*|coda|lent\\w*|lung\\w*|poco personale|senza (tavol\\w*|caffè)|vuot\\w*|περιμέν\\w*|ουρ\\w*|αργ\\w*|λίγο προσωπικό|δεν (υπήρχ\\w*|είχε)|άδει\\w*|perimename|oura|arga|ждал\\w*|очеред\\w*|медленн\\w*|долго|не хватал\\w*|пусто|המתנ\\w*|חיכי\\w*|תור|איטי|לא היה|ריק)\\b")] }] },
  food_cold: { category: "fnb_service", defaultLocation: "REST-AMMOS", rules: [{ all: [r("\\b(food|meal\\w*|dish\\w*|lunch|dinner|essen|gericht\\w*|mittag\\w*|abend\\w*|plat\\w*|repas|déjeuner|dîner|cibo|piatt\\w*|pranzo|cena|φαγητ\\w*|πιάτ\\w*|μεσημεριαν\\w*|βραδιν\\w*|fagito|piato|еда|блюд\\w*|обед\\w*|ужин\\w*|אוכל|מנ\\w*|ארוחת (צהריים|ערב)|taverna|ammos|ταβέρν\\w*)\\b"), r("\\b(cold|lukewarm|arrived cold|kalt|lauwarm|froid\\w*|tiède\\w*|fredd\\w*|tiepid\\w*|κρύ\\w*|χλιαρ\\w*|kryo|xliaro|холодн\\w*|остывш\\w*|קר|קרה|קרים|קרות|פושר\\w*)\\b")] }] },
  bar_warm_drinks: { category: "fnb_service", defaultLocation: "BEACHBAR", rules: [
    { all: [r("\\b(drinks?|beers?|cocktails?|wine|soft drinks?|getränk\\w*|bier|cocktail\\w*|wein|boisson\\w*|bière\\w*|vin|bevand\\w*|birr\\w*|vino|ποτ[όά]|μπύρ\\w*|κρασ\\w*|poto|mpyra|напит\\w*|пиво|вино|משק\\w*|בירה|יין)\\b"), r("\\b(warm|not cold|lukewarm|no ice|without ice|ran out of ice|warm\\w*|nicht kalt|kein eis|ohne eis|chaud\\w*|tiède\\w*|pas (froid|de glace|de glaçons)|sans glace|cald\\w*|tiepid\\w*|senza ghiaccio|niente ghiaccio|ζεστ\\w*|χλιαρ\\w*|χωρίς πάγο|δεν (είχε|υπήρχε) πάγ\\w*|zesto|xwris pago|тёпл\\w*|без льда|нет льда|חמ\\w*|פושר\\w*|בלי קרח|אין קרח)\\b")] },
    { all: [r("\\b(ice machine|ice maker|no ice at|παγομηχαν\\w*|eismaschine|machine à glaçons|macchina del ghiaccio)\\b")] },
  ] },
  restaurant_hot: { category: "hvac", defaultLocation: "REST-ELIA", rules: [{ all: [r("\\b(restaurant|dining room|elia|speisesaal|restaurant|salle|ristorante|sala|εστιατόρι\\w*|ελιά|estiatorio|ресторан\\w*|מסעד\\w*)\\b"), r("\\b(hot|stifling|sweltering|no (a/?c|ac|air ?con)|a/?c (not|off|broken)|heiß|stickig|keine klima\\w*|chaud|étouffant|pas de clim\\w*|cald\\w*|afos\\w*|senza aria condizionata|ζέστη|αποπνικτικ\\w*|χωρίς κλιματ\\w*|zesti|жарко|душно|без кондиционер\\w*|חם|מחניק|בלי מזגן)\\b")] }] },
  bed_uncomfortable: { category: "furniture", rules: [
    { all: [r("\\b(allagi|αλλαγ\\w*|change|replace\\w*|wechsel\\w*|changer|cambiar\\w*)\\b"), r("\\b(strwm\\w*|στρώμ\\w*|mattress\\w*|matratze\\w*|matelas|materass\\w*|матрас\\w*|מזרן)\\b")] },
    { all: [r("\\b(bed\\w*|mattress\\w*|bett\\w*|matratze\\w*|lit|matelas|lett\\w*|materass\\w*|κρεβάτ\\w*|στρώμα\\w*|krevati|strwma|кроват\\w*|матрас\\w*|מיט\\w*|מזרן\\w*)\\b"), r("\\b(uncomfortable|hard|too soft|sag\\w*|lumpy|spring\\w*|back (pain|ache)|hurt|worn|old|unbequem|hart|zu weich|durchgelegen|rücken\\w*|alt|inconfortable|dur\\w*|trop mou|affaissé\\w*|dos|vieux|scomod\\w*|dur\\w*|troppo morbid\\w*|affossat\\w*|schiena|vecchi\\w*|άβολ\\w*|σκληρ\\w*|μαλακ\\w*|βουλιαγμ\\w*|πλάτη|παλι\\w*|avolo|skliro|неудобн\\w*|жёстк\\w*|мягк\\w*|продавлен\\w*|спин\\w*|стар\\w*|לא נוח\\w*|קשה|רך מדי|שקוע\\w*|גב|ישן\\w*)\\b")] },
  ] },
  railing_loose: { category: "safety", rules: [{ all: [r("\\b(railing\\w*|handrail\\w*|banister\\w*|balustrade\\w*|geländer|rambarde|garde-corps|ringhier\\w*|parapett\\w*|κάγκελ\\w*|κιγκλίδωμ\\w*|kagkela|перил\\w*|ограждени\\w*|מעקה)\\b")] }] },
  minibar_warm: { category: "appliance", rules: [{ all: [r("\\b(mini-?bar|fridge|refrigerator|kühlschrank|minibar|frigo|réfrigérateur|frigorifer\\w*|ψυγεί\\w*|μίνι ?μπαρ|psygeio|холодильник\\w*|мини-?бар\\w*|מקרר|מיני-?בר)\\b"), r(`\\b(warm|not (cold|cool|working)|doesn'?t cool|broken|noisy|kalt|warm|kühlt nicht|wird nicht kalt|funktioniert nicht|chaud|ne refroidit pas|ne marche pas|cald\\w*|non (raffredda|funziona)|non (diventa|è|fa) fredd\\w*|ζεστ\\w*|${GREEK_NOT_WORKING}|δεν παγών\\w*|zesto|den (kryonei|psyxei)|тёпл\\w*|не (холод\\w*|работа\\w*)|חם|לא (מקרר|עובד))\\b`)] }] },
  shower_door: { category: "furniture", rules: [{ all: [r("\\b(shower (door|screen|glass|cubicle|panel)|duschtür|duschwand|duschkabine|porte de douche|paroi de douche|cabine de douche|box doccia|porta della doccia|πόρτα (του )?ντους|καμπίνα ντους|τζάμι ντους|porta ntous|дверь душа|душевая (кабина|дверь)|דלת (ה)?מקלחת|מקלחון)\\b")] }] },
  jacuzzi_broken: { category: "facilities", rules: [{ all: [r("\\b(jacuzzi|whirlpool|hot ?tub|τζακούζι|τζακουζι|tzakouzi|джакузи|ג'קוזי)\\b")] }] },
  hairdryer: { category: "appliance", rules: [{ all: [r("\\b(hair ?dryer|hairdrier|blow ?dryer|föhn|fön|haartrockner|sèche-cheveux|seche-cheveux|phon|asciugacapelli|πιστολάκι|σεσουάρ|pistolaki|фен\\w*|מייבש שיער|פן)\\b")] }] },
  kettle: { category: "appliance", rules: [{ all: [r("\\b(kettle|wasserkocher|bouilloire|bollitore|βραστήρ\\w*|vrastiras|чайник\\w*|קומקום)\\b")] }] },
  curtain: { category: "furniture", rules: [{ all: [r("\\b(curtain\\w*|drapes?|blinds?|vorhang\\w*|vorhänge|rollo|rideau\\w*|store\\w*|tend\\w*|κουρτίν\\w*|κουρτινόξυλ\\w*|στόρι\\w*|kourtina|штор\\w*|карниз\\w*|жалюзи|וילון|וילונות|תריס\\w*)\\b")] }] },
  door_squeak: { category: "furniture", rules: [{ all: [DOOR, r("\\b(squeak\\w*|creak\\w*|sticks?|sticking|doesn'?t close|won'?t close|hard to close|hinge\\w*|oil|wd-?40|quietsch\\w*|knarr\\w*|klemmt|schließt nicht|scharnier\\w*|grince|coince|ferme mal|charnière\\w*|cigol\\w*|non si chiude|incastr\\w*|cerniera|τρίζ\\w*|κολλά\\w*|δεν κλείν\\w*|μεντεσέ\\w*|λάδ\\w*|trizei|kollaei|den kleinei|menteses|ladi|скрип\\w*|заеда\\w*|не закрыва\\w*|петл\\w*|חורק\\w*|נתקע\\w*|לא נסגר\\w*|ציר\\w*)\\b")] }] },
  shower_head: { category: "plumbing", rules: [{ all: [r("\\b(shower ?head|shower hose|duschkopf|duschbrause|pommeau|flexible de douche|soffione|doccino|τηλέφωνο (του )?ντους|κεφαλή ντους|tilefwno ntous|лейка|душевая лейка|ראש מקלחת)\\b")] }] },
  bathroom_fan: { category: "electrical", rules: [
    { all: [r("\\b(extractor( fan)?|exhaust fan|εξαερισμ\\w*|εξαεριστήρ\\w*|exaerism\\w*|abzug|vmc|вытяжк\\w*)\\b")] },
    { all: [r("\\b(ventilation|fan|lüfter|lüftung|ventilateur|aspiratore|ventola|ανεμιστήρ\\w*|вентиляц\\w*|מאוורר|אוורור)\\b"), BATHROOM] },
  ] },
  balcony_furniture: { category: "furniture", rules: [{ all: [BALCONY, r("\\b(chair\\w*|table\\w*|furniture|lounger\\w*|stuhl|stühle|tisch\\w*|möbel|chaise\\w*|table\\w*|meubles?|sedi\\w*|tavol\\w*|mobili|καρέκλ\\w*|τραπέζ\\w*|έπιπλ\\w*|karekla|trapezi|стул\\w*|стол\\w*|мебел\\w*|כיסא\\w*|שולחן|ריהוט)\\b")] }] },
  iron: { category: "appliance", rules: [{ all: [r("\\b(iron|ironing board|bügeleisen|bügelbrett|fer à repasser|planche à repasser|ferro da stiro|asse da stiro|σίδερο|σιδερώστρ\\w*|sidero|утюг\\w*|гладильн\\w*|מגהץ|קרש גיהוץ)\\b")] }] },
  late_luggage: { category: "service", rules: [{ all: [r("\\b(luggage|suitcase\\w*|bags?|gepäck|koffer|bagage\\w*|valise\\w*|bagagli|valigi\\w*|αποσκευ\\w*|βαλίτσ\\w*|aposkeves|valitsa|багаж\\w*|чемодан\\w*|מזווד\\w*|כבודה)\\b"), r("\\b(late|took|waited|wait\\w*|hour\\w*|still (not|in)|not (delivered|arrived|brought)|lost|spät|gedauert|gewartet|stunde\\w*|nicht (gebracht|angekommen)|verloren|tard|attendu|heure\\w*|pas (livré|arrivé|monté)|perdu|tardi|aspettat\\w*|or[ae]|non (arrivat\\w*|portat\\w*)|pers\\w*|αργ\\w*|περιμέν\\w*|ώρ\\w*|δεν (ήρθ\\w*|έφερ\\w*)|χάθηκ\\w*|arga|perimename|поздн\\w*|ждал\\w*|час\\w*|не (принес\\w*|доставил\\w*)|потерял\\w*|מאוחר|חיכי\\w*|שע\\w*|לא (הגיע\\w*|הביא\\w*)|אבד\\w*)\\b")] }] },
  slow_checkin: { category: "service", defaultLocation: "LOBBY", rules: [{ all: [r("\\b(check[- ]?in|arrival|reception|front desk|anreise|rezeption|arrivée|réception|accettazione|arrivo|ρεσεψιόν|άφιξ\\w*|υποδοχ\\w*|resepsion|регистрац\\w*|заезд\\w*|стойк\\w*|צ'ק-?אין|קבלה|הגעה)\\b"), r("\\b(wait\\w*|queue\\w*|slow|long|hour\\w*|minutes|room (not|wasn'?t) ready|warten|schlange|langsam|lange|stunde\\w*|minuten|zimmer (nicht|noch nicht) fertig|attente|attendu|queue|lent\\w*|long\\w*|heure\\w*|minutes|chambre pas prête|attesa|aspettat\\w*|coda|lent\\w*|lung\\w*|or[ae]|minuti|camera non pronta|περιμέν\\w*|ουρ\\w*|αργ\\w*|ώρ\\w*|λεπτ\\w*|δωμάτιο δεν ήταν έτοιμο|ждал\\w*|очеред\\w*|медленн\\w*|долго|час\\w*|минут|номер не был готов|המתנ\\w*|חיכי\\w*|תור|איטי|שע\\w*|דקות|החדר לא היה מוכן)\\b")] }] },
  noisy_cleaning: { category: "housekeeping", rules: [{ all: [r("\\b(cleaning|housekeeping|vacuum\\w*|hoover\\w*|trolley|reinigung|staubsauger|wagen|ménage|aspirateur|chariot|pulizie|aspirapolvere|carrello|καθαρισμ\\w*|καθαρίστρι\\w*|σκούπ\\w*|καρότσ\\w*|katharismos|skoupa|уборк\\w*|пылесос\\w*|тележк\\w*|ניקיון|שואב אבק|עגל\\w*)\\b"), r("\\b(early|noise|noisy|loud|woke|wake|7|8|morning|corridor|früh|laut|lärm|geweckt|morgens|flur|tôt|bruit|bruyant|réveillé|matin|couloir|presto|rumore|rumoros\\w*|svegliat\\w*|mattina|corridoio|νωρίς|θόρυβ\\w*|ξύπνησ\\w*|πρωί|διάδρομ\\w*|nwris|thoryvos|рано|шум\\w*|разбудил\\w*|утр\\w*|коридор\\w*|מוקדם|רעש|העיר\\w*|בוקר|מסדרון)\\b")] }] },
  request_pillows: { category: "request", rules: [{ all: [r("\\b(pillow\\w*|cushion\\w*|kissen|kopfkissen|oreiller\\w*|coussin\\w*|cuscin\\w*|μαξιλάρ\\w*|maxilari|подушк\\w*|כרית|כריות|blanket\\w*|decke\\w*|couverture\\w*|copert\\w*|κουβέρτ\\w*|kouverta|одеял\\w*|שמיכ\\w*)\\b")] }] },
  request_cot: { category: "request", rules: [{ all: [r("\\b(cot|crib|baby ?bed|travel cot|kinderbett|babybett|lit (bébé|d'enfant)|cull\\w*|lettino|παιδικό κρεβάτ\\w*|κούνια|βρεφικ\\w*|kounia|детск\\w* кроват\\w*|кроватк\\w*|עריסה|מיטת תינוק|high ?chair|hochstuhl|chaise haute|seggiolone|καρεκλάκι|стульчик|כיסא תינוק)\\b")] }] },
  lost_item: { category: "request", rules: [{ all: [r("\\b(lost|left (my|our|a|the)|forgot(ten)?|missing (my|our)|found|verloren|liegen ?gelassen|vergessen|gefunden|perdu|oublié|laissé|trouvé|pers[oa]|dimenticat\\w*|lasciat\\w*|trovat\\w*|έχασ\\w*|χάσ\\w*|χάθηκ\\w*|ξέχασ\\w*|ξεχάσ\\w*|άφησ\\w*|αφήσ\\w*|βρέθηκ\\w*|exasa|xexasa|xexasame|потерял\\w*|забыл\\w*|оставил\\w*|нашл\\w*|איבד\\w*|שכח\\w*|השאר\\w*|נמצא\\w*)\\b"), r("\\b(sunglasses|glasses|charger|phone|watch|ring|wallet|passport|earring\\w*|toy|sonnenbrille|brille|ladegerät|handy|uhr|ring|geldbörse|reisepass|ohrring\\w*|spielzeug|lunettes|chargeur|téléphone|montre|bague|portefeuille|passeport|boucle\\w*|jouet|occhiali|caricabatterie|telefono|orologio|anello|portafoglio|passaporto|orecchin\\w*|giocattolo|γυαλιά|φορτιστ\\w*|κινητό|ρολόι|δαχτυλίδ\\w*|πορτοφόλ\\w*|διαβατήρι\\w*|σκουλαρίκ\\w*|παιχνίδ\\w*|gyalia|fortisti|kinito|очки|зарядк\\w*|телефон|часы|кольцо|кошел[её]к|паспорт|серьг\\w*|игрушк\\w*|משקפי\\w*|מטען|טלפון|שעון|טבעת|ארנק|דרכון|עגיל\\w*|צעצוע)\\b")] }] },
  late_checkout: { category: "request", rules: [{ all: [r("\\b(late check[- ]?out|late departure|check[- ]?out (later|at \\d)|spät(er|es) (auschecken|check-?out)|späte abreise|départ tardif|check-?out tardif|check-?out tardivo|partenza tardiva|αργό check[- ]?out|late check[- ]?out|αργ\\w* αναχώρησ\\w*|поздн\\w* (выезд|выписк\\w*)|צ'ק-?אאוט מאוחר|עזיבה מאוחרת)\\b")] }] },
  preventive: { category: "preventive", rules: [{ all: [r("^\\s*pm\\b|\\b(pm:|preventive|preventative|legionella|flush(ing)?|inspection|service visit|annual|yearly|quarterly|monthly|weekly|routine|maintenance round|fogging|coil wash|descal\\w*|filter (change|clean\\w*)|lights? test|emergency light\\w*|fire (alarm|extinguisher)\\w*|generator test|irrigation|timers?|pool chemistry|chlorine check|deep clean\\w*|touch-?up|repaint\\w*|rotation|lift co\\.?|by (lift|pool|pest) co|cushions repair|pest control round|προληπτ\\w*|ετήσι\\w* έλεγχ\\w*|έλεγχος ρουτίνας|μηνιαί\\w*|εβδομαδιαί\\w*|wartung|inspektion|entretien préventif|contrôle|manutenzione preventiva|ispezione)\\b")], weight: 2 }] },
};

export type ClassifyHints = {
  /** Ticketing drop-down value, e.g. "HVAC". */
  woCategory?: string | null;
  /** Front-desk department drop-down, e.g. "Housekeeping". */
  fdDepartment?: string | null;
};

export type Classification = {
  category: Category | null;
  topic: string | null;
  confidence: number;
  method: "rules" | "dropdown" | "none";
  evidence: { topics: Record<string, number>; dropdown?: Category | null };
};

/** Export drop-downs mapped to the clean taxonomy (null = too vague). */
export const WO_CATEGORY_MAP: Record<string, Category | null> = {
  hvac: "hvac",
  plumbing: "plumbing",
  electrical: "electrical",
  "carpentry & furniture": "furniture",
  housekeeping: "housekeeping",
  "it / tv": "it_tv",
  "pool & spa": "facilities",
  "kitchen equipment": "fnb_service",
  lift: "elevator",
  "grounds & pest": "pest",
  safety: "safety",
  other: null,
};

export const FD_DEPARTMENT_MAP: Record<string, Category | null> = {
  housekeeping: "housekeeping",
  "f&b": "fnb_service",
  it: "it_tv",
  spa: "facilities",
  maintenance: null,
  "front office": null,
  security: null,
  "guest relations": null,
};

/**
 * Guest text mixes praise and complaints ("Breakfast was superb. The shower
 * never drained."). Sentences that only praise are skipped, so "breakfast"
 * in a compliment does not become a breakfast complaint. Staff notes and
 * single-sentence texts are scored whole, so a fault described over two
 * clauses still matches.
 */
function scoringUnits(text: string): string[] {
  const sentences = text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1 || !PRAISE.test(text)) return [text];
  const kept = sentences.filter((s) => !(PRAISE.test(s) && !NEG.test(s) && !COMPLAINT_CUE.test(s)));
  return kept.length ? kept : [];
}

export function classifyText(text: string | null | undefined, hints: ClassifyHints = {}): Classification {
  const t = (text ?? "").trim();
  const scores: Record<string, number> = {};
  if (t) {
    const units = scoringUnits(t);
    for (const [topic, def] of Object.entries(TOPICS)) {
      let score = 0;
      for (const rule of def.rules) {
        if (units.some((u) => rule.all.every((re) => re.test(u)))) score += rule.weight ?? 1;
      }
      if (score > 0) scores[topic] = score;
    }
  }
  const dropdown = dropdownCategory(hints);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length) {
    const top = ranked[0][1];
    const tied = ranked.filter(([, s]) => s === top).map(([k]) => k);
    // Break ties with the drop-down, else take the first (deterministic order).
    let topic = tied[0];
    if (tied.length > 1 && dropdown) {
      const agree = tied.find((k) => TOPICS[k].category === dropdown);
      if (agree) topic = agree;
    }
    const category = TOPICS[topic].category;
    const confidence = Math.min(0.9, 0.55 + 0.15 * top + (dropdown === category ? 0.1 : 0) - (tied.length > 1 ? 0.1 : 0));
    return { category, topic, confidence, method: "rules", evidence: { topics: scores, dropdown } };
  }
  if (dropdown) {
    return { category: dropdown, topic: null, confidence: 0.4, method: "dropdown", evidence: { topics: scores, dropdown } };
  }
  return { category: null, topic: null, confidence: 0, method: "none", evidence: { topics: scores, dropdown } };
}

export function dropdownCategory(hints: ClassifyHints): Category | null {
  const wo = hints.woCategory?.trim().toLowerCase();
  if (wo && wo in WO_CATEGORY_MAP) return WO_CATEGORY_MAP[wo];
  const fd = hints.fdDepartment?.trim().toLowerCase();
  if (fd && fd in FD_DEPARTMENT_MAP) return FD_DEPARTMENT_MAP[fd];
  return null;
}

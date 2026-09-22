/**
 * Catálogo de TAC (Type Allocation Code).
 *
 * Los primeros 8 dígitos de un IMEI identifican el fabricante y el modelo
 * asignados por la GSMA. Permite autocompletar la marca y modelo sin coste
 * ni peticiones a servicios externos.
 */

export interface RegistroTac {
  tac: string
  brand: string
  model: string
}

/**
 * Diccionario en memoria de respaldo con los principales TACs
 * para responder de forma inmediata incluso sin conexión a BD.
 */
const TAC_RESPALDO: Record<string, { brand: string; model: string }> = {
  // Apple
  '35847610': { brand: 'Apple', model: 'iPhone 13' },
  '35689710': { brand: 'Apple', model: 'iPhone 13 Pro' },
  '35391410': { brand: 'Apple', model: 'iPhone 13 Pro Max' },
  '35305111': { brand: 'Apple', model: 'iPhone 14' },
  '35327211': { brand: 'Apple', model: 'iPhone 14 Pro' },
  '35728551': { brand: 'Apple', model: 'iPhone 14 Pro Max' },
  '35439485': { brand: 'Apple', model: 'iPhone 15' },
  '35441585': { brand: 'Apple', model: 'iPhone 15 Pro' },
  '35447785': { brand: 'Apple', model: 'iPhone 15 Pro Max' },
  '35440285': { brand: 'Apple', model: 'iPhone 15 Plus' },
  '35205411': { brand: 'Apple', model: 'iPhone 11' },
  '35205511': { brand: 'Apple', model: 'iPhone 11 Pro' },
  '35205611': { brand: 'Apple', model: 'iPhone 11 Pro Max' },
  '35677211': { brand: 'Apple', model: 'iPhone 12' },
  '35677311': { brand: 'Apple', model: 'iPhone 12 Mini' },
  '35747849': { brand: 'Apple', model: 'iPhone 12 Pro Max' },
  '35677411': { brand: 'Apple', model: 'iPhone 12 Pro' },
  '35875209': { brand: 'Apple', model: 'iPhone XR' },
  '35875309': { brand: 'Apple', model: 'iPhone XS' },
  '35875409': { brand: 'Apple', model: 'iPhone XS Max' },
  '35674308': { brand: 'Apple', model: 'iPhone X' },
  '35673808': { brand: 'Apple', model: 'iPhone 8' },
  '35674008': { brand: 'Apple', model: 'iPhone 8 Plus' },
  '35940707': { brand: 'Apple', model: 'iPhone 7' },
  '35940807': { brand: 'Apple', model: 'iPhone 7 Plus' },
  '35875109': { brand: 'Apple', model: 'iPhone SE (2nd Gen)' },
  '35391510': { brand: 'Apple', model: 'iPhone SE (3rd Gen)' },
  '35698711': { brand: 'Apple', model: 'iPhone 16' },
  '35045446': { brand: 'Apple', model: 'iPhone 16' },
  '35126738': { brand: 'Apple', model: 'iPhone 16' },
  '35698811': { brand: 'Apple', model: 'iPhone 16 Plus' },
  '35982590': { brand: 'Apple', model: 'iPhone 16 Plus' },
  '35698911': { brand: 'Apple', model: 'iPhone 16 Pro' },
  '35009380': { brand: 'Apple', model: 'iPhone 16 Pro' },
  '35699011': { brand: 'Apple', model: 'iPhone 16 Pro Max' },
  '35699111': { brand: 'Apple', model: 'iPhone 16e' },
  '35007835': { brand: 'Apple', model: 'iPhone 17' },
  '35013517': { brand: 'Apple', model: 'iPhone 17' },
  '35029627': { brand: 'Apple', model: 'iPhone 17 Pro' },
  '35029871': { brand: 'Apple', model: 'iPhone 17 Pro' },
  '35013246': { brand: 'Apple', model: 'iPhone 17 Pro Max' },
  '35024715': { brand: 'Apple', model: 'iPhone 17 Pro Max' },
  '35001019': { brand: 'Apple', model: 'iPhone Air' },
  '35004582': { brand: 'Apple', model: 'iPhone Air' },

  // Samsung
  '35050556': { brand: 'Samsung', model: 'Galaxy S25' },
  '35207551': { brand: 'Samsung', model: 'Galaxy S25' },
  '35421774': { brand: 'Samsung', model: 'Galaxy S25' },
  '35013500': { brand: 'Samsung', model: 'Galaxy S25' },
  '35234556': { brand: 'Samsung', model: 'Galaxy S25+' },
  '35234656': { brand: 'Samsung', model: 'Galaxy S25+' },
  '35020746': { brand: 'Samsung', model: 'Galaxy S25 Ultra' },
  '35284430': { brand: 'Samsung', model: 'Galaxy S25 Ultra' },
  '35459542': { brand: 'Samsung', model: 'Galaxy S25 Ultra' },
  '35553449': { brand: 'Samsung', model: 'Galaxy S25 Ultra' },
  '35728967': { brand: 'Samsung', model: 'Galaxy S25 Ultra' },
  '35284555': { brand: 'Samsung', model: 'Galaxy S24 FE' },
  '35421856': { brand: 'Samsung', model: 'Galaxy A56 5G' },
  '35421956': { brand: 'Samsung', model: 'Galaxy A36 5G' },
  '35422056': { brand: 'Samsung', model: 'Galaxy A26 5G' },
  '35422156': { brand: 'Samsung', model: 'Galaxy A16 5G' },
  '35422256': { brand: 'Samsung', model: 'Galaxy A16' },
  '35422356': { brand: 'Samsung', model: 'Galaxy A06' },
  '35293311': { brand: 'Samsung', model: 'Galaxy Z Flip 6' },
  '35293411': { brand: 'Samsung', model: 'Galaxy Z Flip 6' },
  '35298211': { brand: 'Samsung', model: 'Galaxy Z Fold 6' },
  '35298311': { brand: 'Samsung', model: 'Galaxy Z Fold 6' },
  '35284354': { brand: 'Samsung', model: 'Galaxy S23' },
  '35430854': { brand: 'Samsung', model: 'Galaxy S23 Ultra' },
  '35430754': { brand: 'Samsung', model: 'Galaxy S23+' },
  '35284454': { brand: 'Samsung', model: 'Galaxy S23 FE' },
  '35212555': { brand: 'Samsung', model: 'Galaxy S24' },
  '35227755': { brand: 'Samsung', model: 'Galaxy S24 Ultra' },
  '35227655': { brand: 'Samsung', model: 'Galaxy S24+' },
  '35492311': { brand: 'Samsung', model: 'Galaxy S22' },
  '35493211': { brand: 'Samsung', model: 'Galaxy S22 Ultra' },
  '35493111': { brand: 'Samsung', model: 'Galaxy S22+' },
  '35789110': { brand: 'Samsung', model: 'Galaxy S21' },
  '35789210': { brand: 'Samsung', model: 'Galaxy S21 Ultra' },
  '35789310': { brand: 'Samsung', model: 'Galaxy S21+' },
  '35789410': { brand: 'Samsung', model: 'Galaxy S21 FE' },
  '35314210': { brand: 'Samsung', model: 'Galaxy S20' },
  '35314310': { brand: 'Samsung', model: 'Galaxy S20 Ultra' },
  '35314410': { brand: 'Samsung', model: 'Galaxy S20 FE' },
  '35508111': { brand: 'Samsung', model: 'Galaxy A54 5G' },
  '35712411': { brand: 'Samsung', model: 'Galaxy A34 5G' },
  '35417855': { brand: 'Samsung', model: 'Galaxy A55 5G' },
  '35417755': { brand: 'Samsung', model: 'Galaxy A35 5G' },
  '35417655': { brand: 'Samsung', model: 'Galaxy A25 5G' },
  '35417555': { brand: 'Samsung', model: 'Galaxy A15' },
  '35891330': { brand: 'Samsung', model: 'Galaxy A15 5G' },
  '35891230': { brand: 'Samsung', model: 'Galaxy A14' },
  '35891430': { brand: 'Samsung', model: 'Galaxy A14 5G' },
  '35804311': { brand: 'Samsung', model: 'Galaxy A53 5G' },
  '35764210': { brand: 'Samsung', model: 'Galaxy A52s 5G' },
  '35764110': { brand: 'Samsung', model: 'Galaxy A52' },
  '35764010': { brand: 'Samsung', model: 'Galaxy A32' },
  '35763910': { brand: 'Samsung', model: 'Galaxy A22' },
  '35763810': { brand: 'Samsung', model: 'Galaxy A12' },
  '35763710': { brand: 'Samsung', model: 'Galaxy A03' },
  '35763610': { brand: 'Samsung', model: 'Galaxy A04' },
  '35763510': { brand: 'Samsung', model: 'Galaxy A05' },
  '35763410': { brand: 'Samsung', model: 'Galaxy A05s' },
  '35293211': { brand: 'Samsung', model: 'Galaxy Z Flip 5' },
  '35298111': { brand: 'Samsung', model: 'Galaxy Z Fold 5' },
  '35293311': { brand: 'Samsung', model: 'Galaxy Z Flip 6' },
  '35298211': { brand: 'Samsung', model: 'Galaxy Z Fold 6' },

  // Xiaomi / Redmi / Poco
  '86302407': { brand: 'Xiaomi', model: 'Redmi Note 14S' },
  '86176808': { brand: 'Xiaomi', model: 'Redmi Note 14S' },
  '86063108': { brand: 'Xiaomi', model: 'Redmi 15C' },
  '86103108': { brand: 'Xiaomi', model: 'Redmi 15C' },
  '86472608': { brand: 'Xiaomi', model: 'Poco X7 Pro' },
  '86947108': { brand: 'Xiaomi', model: 'Poco X7 Pro' },
  '86701107': { brand: 'Xiaomi', model: 'Poco F7 Ultra' },
  '86868007': { brand: 'Xiaomi', model: 'Poco F7 Pro' },
  '86584807': { brand: 'Xiaomi', model: 'Poco C71' },
  '86747307': { brand: 'Xiaomi', model: 'Poco C75' },
  '86339007': { brand: 'Xiaomi', model: 'Xiaomi 15T Pro' },
  '86901807': { brand: 'Xiaomi', model: 'Xiaomi 14T Pro' },
  '86973107': { brand: 'Xiaomi', model: 'Redmi A3x' },
  '86945907': { brand: 'Xiaomi', model: 'Redmi 14R' },
  '86094708': { brand: 'Xiaomi', model: 'Redmi 14C' },
  '86130908': { brand: 'Xiaomi', model: 'Redmi 14C' },
  '86498904': { brand: 'Xiaomi', model: 'Redmi Note 11' },
  '86498905': { brand: 'Xiaomi', model: 'Redmi Note 11S' },
  '86498906': { brand: 'Xiaomi', model: 'Redmi Note 11 Pro' },
  '86178306': { brand: 'Xiaomi', model: 'Redmi Note 12' },
  '86178406': { brand: 'Xiaomi', model: 'Redmi Note 12S' },
  '86178506': { brand: 'Xiaomi', model: 'Redmi Note 12 Pro' },
  '86326706': { brand: 'Xiaomi', model: 'Redmi Note 13' },
  '86327806': { brand: 'Xiaomi', model: 'Redmi Note 13 Pro' },
  '86328906': { brand: 'Xiaomi', model: 'Redmi Note 13 Pro 5G' },
  '86329006': { brand: 'Xiaomi', model: 'Redmi Note 13 Pro+ 5G' },
  '86234506': { brand: 'Xiaomi', model: 'Redmi 12' },
  '86235606': { brand: 'Xiaomi', model: 'Redmi 13C' },
  '86235706': { brand: 'Xiaomi', model: 'Redmi 10C' },
  '86235806': { brand: 'Xiaomi', model: 'Redmi 9A' },
  '86235906': { brand: 'Xiaomi', model: 'Redmi 9C' },
  '86236006': { brand: 'Xiaomi', model: 'Redmi A1' },
  '86236106': { brand: 'Xiaomi', model: 'Redmi A2' },
  '86236206': { brand: 'Xiaomi', model: 'Redmi A3' },
  '86512306': { brand: 'Xiaomi', model: 'Poco X5 Pro 5G' },
  '86514406': { brand: 'Xiaomi', model: 'Poco X6 Pro 5G' },
  '86514506': { brand: 'Xiaomi', model: 'Poco X6 5G' },
  '86513406': { brand: 'Xiaomi', model: 'Poco F5' },
  '86513506': { brand: 'Xiaomi', model: 'Poco F5 Pro' },
  '86515506': { brand: 'Xiaomi', model: 'Poco F6' },
  '86515606': { brand: 'Xiaomi', model: 'Poco F6 Pro' },
  '86516606': { brand: 'Xiaomi', model: 'Poco M5' },
  '86516706': { brand: 'Xiaomi', model: 'Poco M6 Pro' },
  '86762305': { brand: 'Xiaomi', model: 'Xiaomi 12 Pro' },
  '86891206': { brand: 'Xiaomi', model: 'Xiaomi 13T' },
  '86891306': { brand: 'Xiaomi', model: 'Xiaomi 13T Pro' },
  '86891406': { brand: 'Xiaomi', model: 'Xiaomi 14' },
  '86891506': { brand: 'Xiaomi', model: 'Xiaomi 14 Ultra' },

  // Motorola
  '35914811': { brand: 'Motorola', model: 'Edge 50 Neo' },
  '35914511': { brand: 'Motorola', model: 'Edge 50 Pro' },
  '35914611': { brand: 'Motorola', model: 'Edge 50 Fusion' },
  '35914711': { brand: 'Motorola', model: 'Edge 50 Ultra' },
  '35915011': { brand: 'Motorola', model: 'Razr 50' },
  '35915111': { brand: 'Motorola', model: 'Razr 50 Ultra' },
  '35417811': { brand: 'Motorola', model: 'Moto G85 5G' },
  '35417911': { brand: 'Motorola', model: 'Moto G75 5G' },
  '35418011': { brand: 'Motorola', model: 'Moto G55 5G' },
  '35418111': { brand: 'Motorola', model: 'Moto G35 5G' },
  '35418211': { brand: 'Motorola', model: 'Moto G45 5G' },
  '35217111': { brand: 'Motorola', model: 'Moto G05' },
  '35217211': { brand: 'Motorola', model: 'Moto G15' },
  '35414211': { brand: 'Motorola', model: 'Moto G52' },
  '35415311': { brand: 'Motorola', model: 'Moto G53 5G' },
  '35416411': { brand: 'Motorola', model: 'Moto G54 5G' },
  '35417511': { brand: 'Motorola', model: 'Moto G84 5G' },
  '35213411': { brand: 'Motorola', model: 'Moto G23' },
  '35214511': { brand: 'Motorola', model: 'Moto G13' },
  '35215611': { brand: 'Motorola', model: 'Moto G14' },
  '35216711': { brand: 'Motorola', model: 'Moto G24' },
  '35216811': { brand: 'Motorola', model: 'Moto G24 Power' },
  '35216911': { brand: 'Motorola', model: 'Moto G04' },
  '35217011': { brand: 'Motorola', model: 'Moto G04s' },
  '35417611': { brand: 'Motorola', model: 'Moto G72' },
  '35417711': { brand: 'Motorola', model: 'Moto G82 5G' },
  '35912311': { brand: 'Motorola', model: 'Edge 40' },
  '35913411': { brand: 'Motorola', model: 'Edge 40 Neo' },
  '35911111': { brand: 'Motorola', model: 'Moto E13' },
  '35911211': { brand: 'Motorola', model: 'Moto E22' },
  '35911311': { brand: 'Motorola', model: 'Moto E22i' },

  // Honor
  '86788006': { brand: 'Honor', model: 'Honor 300' },
  '86788106': { brand: 'Honor', model: 'Honor 300 Pro' },
  '86788206': { brand: 'Honor', model: 'Magic 7 Pro' },
  '86788306': { brand: 'Honor', model: 'Magic 7' },
  '86787306': { brand: 'Honor', model: 'Honor X7c' },
  '86787406': { brand: 'Honor', model: 'Honor X6b' },
  '86787506': { brand: 'Honor', model: 'Honor 200 Lite' },
  '86787006': { brand: 'Honor', model: 'Honor 200' },
  '86787106': { brand: 'Honor', model: 'Honor 200 Pro' },
  '86781206': { brand: 'Honor', model: 'Honor 90' },
  '86782306': { brand: 'Honor', model: 'Honor 90 Lite' },
  '86783406': { brand: 'Honor', model: 'Magic 5 Pro' },
  '86784506': { brand: 'Honor', model: 'Magic 6 Pro' },
  '86784606': { brand: 'Honor', model: 'Magic 6 Lite' },
  '86785606': { brand: 'Honor', model: 'Honor X8a' },
  '86785706': { brand: 'Honor', model: 'Honor X8b' },
  '86786706': { brand: 'Honor', model: 'Honor X7b' },
  '86786806': { brand: 'Honor', model: 'Honor X6a' },
  '86786906': { brand: 'Honor', model: 'Honor X5 Plus' },
  '86787206': { brand: 'Honor', model: 'Honor 70' },

  // Huawei
  '86918005': { brand: 'Huawei', model: 'Pura 70' },
  '86918105': { brand: 'Huawei', model: 'Pura 70 Pro' },
  '86918205': { brand: 'Huawei', model: 'Pura 70 Ultra' },
  '86918305': { brand: 'Huawei', model: 'Nova 12 SE' },
  '86918405': { brand: 'Huawei', model: 'Nova 12s' },
  '86918505': { brand: 'Huawei', model: 'Nova 13' },
  '86912304': { brand: 'Huawei', model: 'P30 Pro' },
  '86913404': { brand: 'Huawei', model: 'P40 Pro' },
  '86914505': { brand: 'Huawei', model: 'Nova 9' },
  '86915605': { brand: 'Huawei', model: 'Nova 10' },
  '86916705': { brand: 'Huawei', model: 'Nova 11' },
  '86916805': { brand: 'Huawei', model: 'Nova 11i' },
  '86916905': { brand: 'Huawei', model: 'Nova Y70' },
  '86917005': { brand: 'Huawei', model: 'Nova Y90' },

  // ZTE
  '86544005': { brand: 'ZTE', model: 'Blade A75 5G' },
  '86544105': { brand: 'ZTE', model: 'Blade A55' },
  '86544205': { brand: 'ZTE', model: 'Nubia Focus Pro 5G' },
  '86544305': { brand: 'ZTE', model: 'Nubia Neo 2 5G' },
  '86541205': { brand: 'ZTE', model: 'Blade V40' },
  '86542305': { brand: 'ZTE', model: 'Blade V50' },
  '86542405': { brand: 'ZTE', model: 'Blade V50 Smart' },
  '86543405': { brand: 'ZTE', model: 'Blade A53' },
  '86543505': { brand: 'ZTE', model: 'Blade A54' },
  '86543605': { brand: 'ZTE', model: 'Blade A72' },
  '86543705': { brand: 'ZTE', model: 'Blade A73' },

  // Infinix
  '35128012': { brand: 'Infinix', model: 'Hot 50' },
  '35128112': { brand: 'Infinix', model: 'Hot 50 Pro' },
  '35128212': { brand: 'Infinix', model: 'Hot 50 Pro+' },
  '35128312': { brand: 'Infinix', model: 'Hot 50 5G' },
  '35128412': { brand: 'Infinix', model: 'Hot 50i' },
  '35128512': { brand: 'Infinix', model: 'Smart 9' },
  '35128612': { brand: 'Infinix', model: 'Zero 40 5G' },
  '35123412': { brand: 'Infinix', model: 'Hot 30' },
  '35123512': { brand: 'Infinix', model: 'Hot 30i' },
  '35124512': { brand: 'Infinix', model: 'Hot 40 Pro' },
  '35124612': { brand: 'Infinix', model: 'Hot 40i' },
  '35125612': { brand: 'Infinix', model: 'Note 30' },
  '35125712': { brand: 'Infinix', model: 'Note 30 Pro' },
  '35126712': { brand: 'Infinix', model: 'Note 40 Pro' },
  '35127712': { brand: 'Infinix', model: 'Smart 8' },
  '35127812': { brand: 'Infinix', model: 'GT 10 Pro' },

  // Tecno
  '35238012': { brand: 'Tecno', model: 'Spark 30' },
  '35238112': { brand: 'Tecno', model: 'Spark 30 Pro' },
  '35238212': { brand: 'Tecno', model: 'Spark 30C' },
  '35238312': { brand: 'Tecno', model: 'Camon 30 Premier' },
  '35238412': { brand: 'Tecno', model: 'Pova 6 Neo' },
  '35238512': { brand: 'Tecno', model: 'Pop 9' },
  '35234512': { brand: 'Tecno', model: 'Spark 10 Pro' },
  '35234612': { brand: 'Tecno', model: 'Spark 10C' },
  '35235612': { brand: 'Tecno', model: 'Spark 20 Pro' },
  '35235712': { brand: 'Tecno', model: 'Spark 20 Pro+' },
  '35235812': { brand: 'Tecno', model: 'Spark 20C' },
  '35236712': { brand: 'Tecno', model: 'Camon 20' },
  '35236812': { brand: 'Tecno', model: 'Camon 30' },
  '35237812': { brand: 'Tecno', model: 'Pova 5' },
  '35237912': { brand: 'Tecno', model: 'Pova 6 Pro' },

  // Realme
  '86816005': { brand: 'Realme', model: 'Realme 13 Pro+' },
  '86816105': { brand: 'Realme', model: 'Realme 13 5G' },
  '86816205': { brand: 'Realme', model: 'Realme 14 Pro+' },
  '86816305': { brand: 'Realme', model: 'Realme C61' },
  '86816405': { brand: 'Realme', model: 'Realme C63' },
  '86816505': { brand: 'Realme', model: 'Realme GT 6' },
  '86816605': { brand: 'Realme', model: 'Realme GT 7 Pro' },
  '86816705': { brand: 'Realme', model: 'Realme Note 60' },
  '86812305': { brand: 'Realme', model: 'C55' },
  '86813405': { brand: 'Realme', model: 'C53' },
  '86813505': { brand: 'Realme', model: 'C67' },
  '86814505': { brand: 'Realme', model: '11 Pro 5G' },
  '86814605': { brand: 'Realme', model: '11 5G' },
  '86815605': { brand: 'Realme', model: '12 Pro+ 5G' },
  '86815705': { brand: 'Realme', model: '12+ 5G' },

  // Oppo
  '86616005': { brand: 'Oppo', model: 'Reno 12 5G' },
  '86616105': { brand: 'Oppo', model: 'Reno 12 Pro 5G' },
  '86616205': { brand: 'Oppo', model: 'Reno 12 F 5G' },
  '86616305': { brand: 'Oppo', model: 'Reno 13' },
  '86616405': { brand: 'Oppo', model: 'Reno 13 Pro' },
  '86616505': { brand: 'Oppo', model: 'Find X8' },
  '86616605': { brand: 'Oppo', model: 'Find X8 Pro' },
  '86616705': { brand: 'Oppo', model: 'A3' },
  '86616805': { brand: 'Oppo', model: 'A3x' },
  '86616905': { brand: 'Oppo', model: 'A60' },
  '86612305': { brand: 'Oppo', model: 'Reno 7' },
  '86613405': { brand: 'Oppo', model: 'Reno 10 5G' },
  '86613505': { brand: 'Oppo', model: 'Reno 11 5G' },
  '86614505': { brand: 'Oppo', model: 'A78' },
  '86614605': { brand: 'Oppo', model: 'A79 5G' },
  '86615605': { brand: 'Oppo', model: 'A58' },
  '86615705': { brand: 'Oppo', model: 'A38' },
  '86615805': { brand: 'Oppo', model: 'A17' },

  // Vivo
  '86715005': { brand: 'Vivo', model: 'V40 5G' },
  '86715105': { brand: 'Vivo', model: 'V40 Lite' },
  '86715205': { brand: 'Vivo', model: 'V40 Pro' },
  '86715305': { brand: 'Vivo', model: 'Y28' },
  '86715405': { brand: 'Vivo', model: 'Y18' },
  '86715505': { brand: 'Vivo', model: 'X200' },
  '86715605': { brand: 'Vivo', model: 'X200 Pro' },
  '86712305': { brand: 'Vivo', model: 'Y36' },
  '86712405': { brand: 'Vivo', model: 'Y27' },
  '86712505': { brand: 'Vivo', model: 'Y17s' },
  '86713405': { brand: 'Vivo', model: 'V29' },
  '86713505': { brand: 'Vivo', model: 'V29 Lite' },
  '86714505': { brand: 'Vivo', model: 'V30 5G' },
  '86714605': { brand: 'Vivo', model: 'V30 Lite' },

  // Google Pixel
  '35915512': { brand: 'Google', model: 'Pixel 9' },
  '35915612': { brand: 'Google', model: 'Pixel 9 Pro' },
  '35915912': { brand: 'Google', model: 'Pixel 9 Pro XL' },
  '35916012': { brand: 'Google', model: 'Pixel 9 Pro Fold' },
  '35916112': { brand: 'Google', model: 'Pixel 9a' },
  '35916212': { brand: 'Google', model: 'Pixel 10' },
  '35916312': { brand: 'Google', model: 'Pixel 10 Pro' },
  '35567810': { brand: 'Google', model: 'Pixel 6' },
  '35568910': { brand: 'Google', model: 'Pixel 6 Pro' },
  '35789011': { brand: 'Google', model: 'Pixel 7' },
  '35789111': { brand: 'Google', model: 'Pixel 7 Pro' },
  '35901211': { brand: 'Google', model: 'Pixel 7a' },
  '35912312': { brand: 'Google', model: 'Pixel 8' },
  '35913412': { brand: 'Google', model: 'Pixel 8 Pro' },
  '35914512': { brand: 'Google', model: 'Pixel 8a' },
}

/**
 * Extrae los 8 primeros dígitos numéricos (TAC) de un texto o IMEI.
 */
export function extraerTac(texto: string): string | null {
  const digitos = texto.replace(/\D/g, '')
  return digitos.length >= 8 ? digitos.slice(0, 8) : null
}

/**
 * Busca la información de fabricante y modelo para un TAC dado.
 * Primero consulta la tabla `tac_catalog` en D1, y si no existe
 * aún o no se encuentra, busca en el catálogo de respaldo.
 */
export async function buscarTac(
  db: D1Database,
  tacRaw: string,
): Promise<RegistroTac | null> {
  const tac = extraerTac(tacRaw)
  if (tac === null) return null

  try {
    const fila = await db
      .prepare('SELECT tac, brand, model FROM tac_catalog WHERE tac = ? LIMIT 1')
      .bind(tac)
      .first<{ tac: string; brand: string; model: string }>()

    if (fila) {
      return {
        tac: fila.tac,
        brand: fila.brand,
        model: fila.model,
      }
    }
  } catch {
    // Si la tabla no existiera todavía en un entorno de pruebas sin migrar,
    // se continúa al respaldo en memoria.
  }

  const enRespaldo = TAC_RESPALDO[tac]
  if (enRespaldo) {
    return {
      tac,
      brand: enRespaldo.brand,
      model: enRespaldo.model,
    }
  }

  return null
}

/**
 * Registra o actualiza un TAC en el catálogo para aprendizaje continuo.
 */
export async function guardarTac(
  db: D1Database,
  tacRaw: string,
  brand: string,
  model: string,
): Promise<void> {
  const tac = extraerTac(tacRaw)
  if (tac === null || !brand.trim() || !model.trim()) return

  const marcaLimpia = brand.trim()
  const modeloLimpio = model.trim()

  // Actualizar inmediatamente el diccionario en memoria
  TAC_RESPALDO[tac] = { brand: marcaLimpia, model: modeloLimpio }

  try {
    await db
      .prepare('INSERT OR REPLACE INTO tac_catalog (tac, brand, model) VALUES (?, ?, ?)')
      .bind(tac, marcaLimpia, modeloLimpio)
      .run()
  } catch {
    // Falla no bloqueante
  }
}

export type CatalogPart = {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  category: string;
};

export type ImportedPriceList = {
  pricesBySku: Record<string, number>;
};

// Price lists older than 90 calendar days need re-verification; update this when supplier refresh expectations change.
export const PRICE_LIST_FRESHNESS_DAYS = 90;

export function isPriceListStale(updatedAt: string, now: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(updatedAt);
  if (!match) return false;

  const [, year, month, day] = match;
  const updatedTime = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const updatedDate = new Date(updatedTime);
  if (
    updatedDate.getUTCFullYear() !== Number(year) ||
    updatedDate.getUTCMonth() !== Number(month) - 1 ||
    updatedDate.getUTCDate() !== Number(day)
  ) return false;

  const todayTime = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ageInDays = Math.floor((todayTime - updatedTime) / 86_400_000);
  return ageInDays >= PRICE_LIST_FRESHNESS_DAYS;
}

const normalizeSku = (sku: string) => sku.trim().toLocaleUpperCase('en-US');

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

export function parseAuthorizedPriceCsv(csv: string): ImportedPriceList {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('Add a header row and at least one price row.');

  const headers = rows[0].map((header) => header.trim().toLowerCase().replaceAll(' ', '_'));
  const skuIndex = headers.indexOf('sku');
  const unitPriceIndex = headers.indexOf('unit_price');
  const priceIndex = unitPriceIndex >= 0 ? unitPriceIndex : headers.indexOf('price');
  const currencyIndex = headers.indexOf('currency');
  if (skuIndex < 0 || priceIndex < 0) {
    throw new Error('CSV must include SKU and price (or unit_price) columns.');
  }

  const pricesBySku: Record<string, number> = {};
  for (const [rowIndex, cells] of rows.slice(1).entries()) {
    const line = rowIndex + 2;
    const sku = normalizeSku(cells[skuIndex] ?? '');
    const rawPrice = (cells[priceIndex] ?? '').trim();
    if (!sku || !rawPrice) throw new Error(`CSV row ${line} is missing an SKU or price.`);
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price < 0 || !/^\d+(?:\.\d{1,3})?$/.test(rawPrice)) {
      throw new Error(`CSV row ${line} must have a non-negative KWD price with up to 3 decimals.`);
    }
    if (currencyIndex >= 0 && (cells[currencyIndex] ?? '').trim().toUpperCase() !== 'KWD') {
      throw new Error(`CSV row ${line} currency must be KWD.`);
    }
    if (Object.hasOwn(pricesBySku, sku)) throw new Error(`CSV contains duplicate SKU ${sku}.`);
    pricesBySku[sku] = price;
  }

  return { pricesBySku };
}

export type BuildPlan<TPart extends CatalogPart = CatalogPart> = {
  parts: TPart[];
  isSolar: boolean;
  isRobot: boolean;
  isWeather: boolean;
  isGreenhouse: boolean;
  isDisplay: boolean;
  projectTitleKey: string;
  unpricedRequirements: string[];
};

const normalizePrompt = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .toLowerCase();

const quantityWords: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  واحد: 1, واحدة: 1, اثنان: 2, اثنين: 2, ثلاثة: 3,
  أربعة: 4, اربعة: 4, خمسة: 5, ستة: 6, سبعة: 7,
  ثمانية: 8, تسعة: 9, عشرة: 10,
};

const quantityToken = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|واحد|واحدة|اثنان|اثنين|ثلاثة|أربعة|اربعة|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة)';
const toQuantity = (value: string) => quantityWords[value] ?? Number(value);

function quantityBefore(text: string, aliases: string[]): number | undefined {
  for (const alias of aliases.sort((a, b) => b.length - a.length)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}]|و)${quantityToken}\\s*(?:x\\s*)?${escaped}(?=$|[^\\p{L}\\p{N}])`,
      'iu',
    );
    const match = text.match(pattern);
    if (match) return clampBuildQuantity(toQuantity(match[1]));
  }
  return undefined;
}

export function inferAssemblyCount(prompt: string): number {
  const text = normalizePrompt(prompt);
  const units = 'assembl(?:y|ies)|units?|devices?|systems?|builds?|projects?|kits?|greenhouses?|monitors?|وحدات|أجهزة|اجهزة|مشاريع|أطقم|تجميعات|محطات';
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}]|و)${quantityToken}\\s*(?:x\\s*)?(?:${units})(?=$|[^\\p{L}\\p{N}])`, 'iu');
  const match = text.match(pattern);
  return match ? clampBuildQuantity(toQuantity(match[1])) : 1;
}

export function inferPartQuantity(prompt: string, part: Pick<CatalogPart, 'id' | 'category'>): number {
  const text = normalizePrompt(prompt);
  const aliasesById: Record<string, string[]> = {
    esp32: ['esp32', 'wroom', 'controllers', 'controller', 'boards', 'board'],
    nucleo: ['stm32', 'nucleo'],
    pico: ['raspberry pi pico', 'pico w', 'pico'],
    bme280: ['bme280', 'weather sensors', 'humidity sensors', 'temperature sensors', 'pressure sensors'],
    hcsr04: ['hc-sr04', 'hcsr04', 'ultrasonic sensors', 'distance sensors'],
    soil: ['soil sensors', 'moisture sensors', 'soil sensor', 'moisture sensor'],
    lcd: ['lcds', 'lcd', 'displays', 'display', 'screens', 'screen'],
    tp4056: ['tp4056', 'chargers', 'charger'],
    battery: ['18650 batteries', '18650', 'batteries', 'battery', 'cells', 'cell'],
    resistor: ['resistors', 'resistor'],
    level: ['level shifters', 'level shifter', 'level converters', 'level converter'],
  };
  const aliases = aliasesById[part.id] ?? [];
  const specific = quantityBefore(text, aliases);
  if (specific !== undefined) return specific;
  if (part.category === 'Sensors') {
    const generic = quantityBefore(text, ['sensors', 'sensor', 'مستشعرات', 'مستشعر']);
    if (generic !== undefined) return generic;
  }
  return 1;
}

export function buildPlanFromPrompt<TPart extends CatalogPart>(
  prompt: string,
  targetVoltage: string,
  catalog: readonly TPart[],
): BuildPlan<TPart> {
  const text = normalizePrompt(prompt);
  const isSolar = /solar|photovoltaic|pv panel|شمسي|الشمس|طاقة شمسية/.test(text);
  const isRobot = /robot|rover|robotics|روبوت|عربة/.test(text);
  const isLineFollower = /line follower|follow(?:ing)? a line|track(?:ing)? line|تتبع الخط/.test(text);
  const isObstacleProject = /obstacle|avoid(?:ing)?|parking|distance|ultrasonic|sonar|عقبة|تجنب|مسافة|موقف/.test(text);
  const isWeather = /weather|temperature|humidity|pressure|barometric|طقس|حرارة|ضغط|رطوبة(?!\s*(?:التربة|التراب))/.test(text);
  const isGreenhouse = /greenhouse|plant|irrigat|water(?:ing)?|بيت زجاجي|دفيئة|نبات|ري/.test(text);
  const isDisplay = /display|screen|lcd|شاشة|عرض/.test(text);
  const needsWateringHardware = /water(?:ing)?|irrigat|pump|مضخة|ري/.test(text);
  const needsWhatsApp = /whatsapp|واتساب/.test(text);

  const selectedIds = new Set<string>();
  const addPart = (id: string) => {
    if (catalog.some((part) => part.id === id)) selectedIds.add(id);
  };

  const explicitControllers = [
    { pattern: /esp32|wroom/, id: 'esp32' },
    { pattern: /stm32|nucleo/, id: 'nucleo' },
    { pattern: /raspberry\s*pi\s*pico|pico\s*w|\bpico\b/, id: 'pico' },
  ].filter(({ pattern }) => pattern.test(text));

  if (explicitControllers.length) {
    explicitControllers.forEach(({ id }) => addPart(id));
  } else {
    addPart('esp32');
  }

  if (isWeather || isGreenhouse || /bme280|weather sensor/.test(text)) addPart('bme280');
  if (isGreenhouse || /soil|moisture|capacitive sensor|تربة|رطوبة التربة/.test(text)) addPart('soil');
  if (isObstacleProject || /hc[-\s]?sr04|ultrasonic|سونار/.test(text)) addPart('hcsr04');
  if (isDisplay || /16x2|character lcd/.test(text)) addPart('lcd');

  const needsBattery = isSolar || /battery|18650|charger|charging|بطارية|شحن/.test(text);
  if (needsBattery) {
    addPart('tp4056');
    addPart('battery');
  }

  if (/resistor|resistance|مقاومة/.test(text)) addPart('resistor');

  const includesEsp32OrPico = selectedIds.has('esp32') || selectedIds.has('pico');
  const needsLevelConverter =
    /level shifter|level converter|محوّل مستويات|محول مستوى/.test(text) ||
    (targetVoltage === '5V' && includesEsp32OrPico) ||
    (targetVoltage === '3.3V' && (selectedIds.has('hcsr04') || selectedIds.has('lcd')));
  if (needsLevelConverter) addPart('level');

  const unpricedRequirements: string[] = [];
  const addUnpriced = (requirement: string) => {
    if (!unpricedRequirements.includes(requirement)) unpricedRequirements.push(requirement);
  };
  if (isSolar) addUnpriced('Solar panel');
  if (isRobot) addUnpriced('Robot chassis and motor driver');
  if (isLineFollower) addUnpriced('IR line sensor array');
  if (needsWateringHardware) addUnpriced('Water pump and relay');
  if (needsWhatsApp) addUnpriced('WhatsApp alert service');
  if (targetVoltage === '12V') addUnpriced('12V power converter');

  const projectTitleKey = isSolar && isGreenhouse
    ? 'Solar-Powered Agricultural IoT Node'
    : isRobot
      ? 'Autonomous Obstacle Avoiding Rover'
      : isWeather
        ? 'Wi-Fi Environmental Sensor Node'
        : 'Project Parts Outline';

  return {
    parts: catalog.filter((part) => selectedIds.has(part.id)),
    isSolar,
    isRobot,
    isWeather,
    isGreenhouse,
    isDisplay,
    projectTitleKey,
    unpricedRequirements,
  };
}

export function clampBuildQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(99, Math.trunc(value)));
}

export function calculateBomLineTotal(
  unitPrice: number,
  quantityPerAssembly: number,
  assemblies: number,
): number {
  const unitPriceFils = Math.round(unitPrice * 1000);
  return (unitPriceFils * clampBuildQuantity(quantityPerAssembly) * clampBuildQuantity(assemblies)) / 1000;
}

export function calculateBomTotal(
  lines: readonly { unitPrice: number; quantityPerAssembly: number }[],
  assemblies: number,
): number {
  const totalFils = lines.reduce(
    (total, line) =>
      total + Math.round(line.unitPrice * 1000) * clampBuildQuantity(line.quantityPerAssembly),
    0,
  ) * clampBuildQuantity(assemblies);
  return totalFils / 1000;
}

export type BomCartItem = {
  id: string;
  name: string;
  price: number;
  kind: 'bom';
  sku: string;
  qty: number;
};

export function buildBomCartItems<TPart extends CatalogPart>(
  parts: readonly TPart[],
  quantityFor: (part: TPart) => number,
  assemblies: number,
): BomCartItem[] {
  const assemblyCount = clampBuildQuantity(assemblies);
  return parts.flatMap((part) => part.price === null ? [] : [{
    id: `bom-${part.id}`,
    name: part.name,
    price: part.price,
    kind: 'bom' as const,
    sku: part.sku,
    qty: clampBuildQuantity(quantityFor(part)) * assemblyCount,
  }]);
}

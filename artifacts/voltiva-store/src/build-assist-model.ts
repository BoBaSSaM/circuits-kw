export type CatalogPart = {
  id: string;
  name: string;
  sku: string;
  price: number;
  category: string;
};

export type BuildPlan = {
  parts: CatalogPart[];
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

export function buildPlanFromPrompt(
  prompt: string,
  targetVoltage: string,
  catalog: readonly CatalogPart[],
): BuildPlan {
  const text = normalizePrompt(prompt);
  const isSolar = /solar|photovoltaic|pv panel|شمسي|الشمس|طاقة شمسية/.test(text);
  const isRobot = /robot|rover|robotics|روبوت|عربة/.test(text);
  const isLineFollower = /line follower|follow(?:ing)? a line|track(?:ing)? line|تتبع الخط/.test(text);
  const isObstacleProject = /obstacle|avoid(?:ing)?|parking|distance|ultrasonic|sonar|عقبة|تجنب|مسافة|موقف/.test(text);
  const isWeather = /weather|temperature|humidity|pressure|barometric|طقس|حرارة|رطوبة|ضغط/.test(text);
  const isGreenhouse = /greenhouse|soil|moisture|plant|irrigat|water(?:ing)?|بيت زجاجي|دفيئة|تربة|نبات|ري/.test(text);
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
    (targetVoltage === '3.3V' && selectedIds.has('hcsr04'));
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

import { MongoClient } from "mongodb";

const uri = (process.env.MONGODB_URI || process.env.MONGODB_URL)
  ?.trim()
  .replace(/^\s*MONGODB_(?:URI|URL)\s*=\s*/i, "")
  .replace(/^(['"])(.*)\1$/, "$2")
  .trim();
if (!uri || !/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
  throw new Error("MONGODB_URI (or MONGODB_URL) must be a MongoDB URI starting with mongodb:// or mongodb+srv://.");
}

const databaseName = "circuits_kw";
const seedSource = "circuits-kw-demo";
const client = new MongoClient(uri, { authSource: "admin" });

const products = [
  { id: "esp32", name: "ESP32-WROOM-32D", sku: "ESP32-WRM-32D", category: "Microcontrollers", price: 2.85, stock: 142, package: "DIP-38", description: "Dual-core 240MHz MCU with integrated RF and PCB antenna.", voltage: "2.7V–3.6V (3.3V nom.)", interface: "SPI · I²C · UART · PWM", icon: "cpu" },
  { id: "nucleo", name: "STM32 Nucleo-F401RE", sku: "NUCLEO-F401RE", category: "Microcontrollers", price: 6.2, stock: 28, package: "Nucleo-64", description: "Cortex-M4 board with ST-LINK and 512KB flash.", voltage: "3.3V / 5V Vin", interface: "USB · UART · SPI", icon: "board" },
  { id: "bme280", name: "BME280 Sensor Module", sku: "SNS-BME280-I2C", category: "Sensors", price: 1.95, stock: 65, package: "LGA-8 breakout", description: "Measures temperature, humidity and air pressure.", voltage: "1.8V–3.6V", interface: "I²C · SPI", icon: "sensor" },
  { id: "hcsr04", name: "HC-SR04 Ultrasonic Sensor", sku: "SNS-HCSR04-5V", category: "Sensors", price: 0.85, stock: 210, package: "Through-hole", description: "Ultrasonic sensor for distance and obstacle detection.", voltage: "5V DC", interface: "GPIO · trigger", icon: "sensor" },
  { id: "pico", name: "Raspberry Pi Pico W", sku: "RPI-PICOW-2024", category: "Microcontrollers", price: 2.1, stock: 0, package: "DIP-40", description: "Dual-core RP2040 board with Wi-Fi and 2MB flash.", voltage: "1.8V–5.5V VSYS", interface: "PIO · SPI · I²C", icon: "board" },
  { id: "lcd", name: "16x2 I2C Character LCD", sku: "DIS-LCD-1602I2C", category: "Displays", price: 1.45, stock: 54, package: "1602 module", description: "16×2 character LCD with I²C backpack.", voltage: "5V DC", interface: "I²C address 0x27", icon: "display" },
  { id: "level", name: "Logic Level Converter 4-Ch", sku: "MOD-LLC-4CH-BI", category: "ICs & Logic Translators", price: 0.65, stock: 320, package: "4-channel board", description: "Bidirectional logic shifting for 3.3V and 5V systems.", voltage: "Up to 5V DC", interface: "I²C · SPI · UART", icon: "power" },
  { id: "resistor", name: "Metal Film Resistors Kit", sku: "PAS-RES-KIT-600", category: "Passives", price: 2.5, stock: 75, package: "600 pieces", description: "600-piece resistor kit with 1% tolerance.", voltage: "250mW · 0.25W", interface: "E12 series", icon: "parts" },
  { id: "soil", name: "Capacitive Soil Moisture Sensor v1.2", sku: "SNS-SOIL-CAP-12", category: "Sensors", price: 1.2, stock: 48, package: "Analog module", description: "Corrosion-resistant probe with 3.3V analog output.", voltage: "3.3V analog", interface: "ADC output", icon: "sensor" },
  { id: "tp4056", name: "TP4056 1A Li-Ion Solar Battery Charger", sku: "PWR-TP4056-C", category: "Power & Battery", price: 0.75, stock: 92, package: "USB-C module", description: "USB-C Li-ion charger with DW01A protection.", voltage: "4.2V charge", interface: "USB-C · Li-ion", icon: "power" },
  { id: "battery", name: "18650 3000mAh Battery Cell with Holder", sku: "BAT-18650-3000", category: "Power & Battery", price: 2.2, stock: 39, package: "18650 + holder", description: "3000mAh 18650 cell with holder and clip leads.", voltage: "3.7V nominal", interface: "Li-ion · holder", icon: "power" },
];

const kits = [
  { id: "weather-kit", code: "CKW-KIT-0101", title: "IoT Weather Station Kit", category: "IoT & Smart Home", level: "Intermediate", domain: "iot", duration: "1.5–2 hrs", price: 12.5, description: "Measure pressure, temperature and humidity; stream over Wi-Fi to MQTT or Home Assistant.", parts: ["ESP32 NodeMCU", "BME280 Sensor", "0.96\" I2C OLED", "Breadboard + Jumpers"], itemCountLabel: "6 Items", manualNotes: "PDF Manual & GitHub Arduino IDE Sketch", icon: "weather" },
  { id: "rover-kit", code: "CKW-KIT-0205", title: "Autonomous Obstacle Avoiding Robot", category: "Robotics", level: "Beginner", domain: "robotics", duration: "3–4 hrs", price: 18.75, description: "Build a two-wheel rover with PWM speed control and ultrasonic obstacle detection.", parts: ["2WD Smart Chassis", "Arduino Uno R3", "L298N Dual Bridge", "HC-SR04 Sonar", "4xAA Carrier"], itemCountLabel: "9 Items", manualNotes: "Color Wire Chart + Ultrasonic Sweep Code", icon: "robot" },
  { id: "energy-kit", code: "CKW-KIT-0312", title: "Smart Home Power & Energy Meter", category: "IoT & Automation", level: "Intermediate", domain: "iot", duration: "2–3 hrs", price: 14.2, description: "Non-invasive AC current sensing for an example ESPHome or MQTT dashboard.", parts: ["SCT-013 CT Clamp", "ESP32 Dual-Core", "Burden Resistor Mod", "3.3V Voltage Bias"], itemCountLabel: "7 Items", manualNotes: "ESPHome YAML config + Calibration Guide", icon: "energy" },
  { id: "university-kit", code: "CKW-KIT-KU-EE1", title: "KU Electrical Eng Starter Lab Kit", category: "University Labs", level: "All levels", domain: "university", duration: "Semester-long", price: 24.5, description: "Core parts for standard KU and AUK electrical engineering lab projects.", parts: ["Auto DMM Multimeter", "830-Pt Breadboard", "Dual 3.3/5V Rail", "LM358 & 741 Op-Amps", "BJT & MOSFET Assort."], itemCountLabel: "320+ Parts", manualNotes: "12 Standard Experiment Worksheets", icon: "lab" },
  { id: "plant-kit", code: "CKW-KIT-0408", title: "Plant Soil Telemetry & Auto-Watering", category: "Automation", level: "Beginner", domain: "automation", duration: "1–1.5 hrs", price: 8.9, description: "Soil sensing and relay control for an indoor garden watering example.", parts: ["Capacitive Moisture V1.2", "5V Submersible Pump", "1-Ch Opto Relay", "Arduino Nano (Type-C)"], itemCountLabel: "5 Items", manualNotes: "Auto Calibration Firmware + Tubing Fixture", icon: "plant" },
  { id: "fpga-kit", code: "CKW-KIT-0550", title: "FPGA & Digital Logic Bundle", category: "Digital Logic", level: "Advanced", domain: "university", duration: "6+ hrs", price: 32, description: "Explore Verilog and VHDL with an FPGA, displays, switches and logic gates.", parts: ["FPGA Eval Board", "4x 7-Segment Modules", "8-Bit DIP Switch Array", "74HC00/08/32 ICs", "USB-JTAG Blaster"], itemCountLabel: "14 Items", manualNotes: "Verilog Starter Templates + Quartus Lab Manual", icon: "logic" },
];

try {
  await client.connect();
  const db = client.db(databaseName);
  const productCollection = db.collection("products");
  const kitCollection = db.collection("project_kits");

  await productCollection.createIndex({ sku: 1 }, { unique: true });
  await kitCollection.createIndex({ code: 1 }, { unique: true });

  const createdAt = new Date();
  await productCollection.bulkWrite(
    products.map((product) => {
      const document = {
        ...product,
        _id: product.id,
        currency: "KWD",
        isDemo: true,
        seedSource,
        createdAt,
      };
      return {
        updateOne: {
          filter: { _id: product.id },
          update: { $setOnInsert: document },
          upsert: true,
        },
      };
    }),
    { ordered: true },
  );
  await kitCollection.bulkWrite(
    kits.map((kit) => {
      const document = {
        ...kit,
        _id: kit.id,
        currency: "KWD",
        isDemo: true,
        seedSource,
        createdAt,
      };
      return {
        updateOne: {
          filter: { _id: kit.id },
          update: { $setOnInsert: document },
          upsert: true,
        },
      };
    }),
    { ordered: true },
  );

  const [productCount, kitCount] = await Promise.all([
    productCollection.countDocuments({ seedSource }),
    kitCollection.countDocuments({ seedSource }),
  ]);
  console.info(`MongoDB database "${databaseName}": ${productCount} demo products, ${kitCount} demo project kits.`);
} finally {
  await client.close();
}

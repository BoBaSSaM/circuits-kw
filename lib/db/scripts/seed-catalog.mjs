import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed the development database.");
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const products = [
  ["esp32", "ESP32-WROOM-32D", "ESP32-WRM-32D", "Microcontrollers", "2.850", 142, "DIP-38", "Dual-core 240MHz MCU with integrated RF and PCB antenna.", "2.7V–3.6V (3.3V nom.)", "SPI · I²C · UART · PWM", "cpu"],
  ["nucleo", "STM32 Nucleo-F401RE", "NUCLEO-F401RE", "Microcontrollers", "6.200", 28, "Nucleo-64", "Cortex-M4 board with ST-LINK and 512KB flash.", "3.3V / 5V Vin", "USB · UART · SPI", "board"],
  ["bme280", "BME280 Sensor Module", "SNS-BME280-I2C", "Sensors", "1.950", 65, "LGA-8 breakout", "Measures temperature, humidity and air pressure.", "1.8V–3.6V", "I²C · SPI", "sensor"],
  ["hcsr04", "HC-SR04 Ultrasonic Sensor", "SNS-HCSR04-5V", "Sensors", "0.850", 210, "Through-hole", "Ultrasonic sensor for distance and obstacle detection.", "5V DC", "GPIO · trigger", "sensor"],
  ["pico", "Raspberry Pi Pico W", "RPI-PICOW-2024", "Microcontrollers", "2.100", 0, "DIP-40", "Dual-core RP2040 board with Wi-Fi and 2MB flash.", "1.8V–5.5V VSYS", "PIO · SPI · I²C", "board"],
  ["lcd", "16x2 I2C Character LCD", "DIS-LCD-1602I2C", "Displays", "1.450", 54, "1602 module", "16×2 character LCD with I²C backpack.", "5V DC", "I²C address 0x27", "display"],
  ["level", "Logic Level Converter 4-Ch", "MOD-LLC-4CH-BI", "ICs & Logic Translators", "0.650", 320, "4-channel board", "Bidirectional logic shifting for 3.3V and 5V systems.", "Up to 5V DC", "I²C · SPI · UART", "power"],
  ["resistor", "Metal Film Resistors Kit", "PAS-RES-KIT-600", "Passives", "2.500", 75, "600 pieces", "600-piece resistor kit with 1% tolerance.", "250mW · 0.25W", "E12 series", "parts"],
  ["soil", "Capacitive Soil Moisture Sensor v1.2", "SNS-SOIL-CAP-12", "Sensors", "1.200", 48, "Analog module", "Corrosion-resistant probe with 3.3V analog output.", "3.3V analog", "ADC output", "sensor"],
  ["tp4056", "TP4056 1A Li-Ion Solar Battery Charger", "PWR-TP4056-C", "Power & Battery", "0.750", 92, "USB-C module", "USB-C Li-ion charger with DW01A protection.", "4.2V charge", "USB-C · Li-ion", "power"],
  ["battery", "18650 3000mAh Battery Cell with Holder", "BAT-18650-3000", "Power & Battery", "2.200", 39, "18650 + holder", "3000mAh 18650 cell with holder and clip leads.", "3.7V nominal", "Li-ion · holder", "power"],
];

const kits = [
  ["weather-kit", "CKW-KIT-0101", "IoT Weather Station Kit", "IoT & Smart Home", "Intermediate", "iot", "1.5–2 hrs", "12.500", "Measure pressure, temperature and humidity; stream over Wi-Fi to MQTT or Home Assistant.", ["ESP32 NodeMCU", "BME280 Sensor", "0.96\" I2C OLED", "Breadboard + Jumpers"], "6 Items", "PDF Manual & GitHub Arduino IDE Sketch", "weather"],
  ["rover-kit", "CKW-KIT-0205", "Autonomous Obstacle Avoiding Robot", "Robotics", "Beginner", "robotics", "3–4 hrs", "18.750", "Build a two-wheel rover with PWM speed control and ultrasonic obstacle detection.", ["2WD Smart Chassis", "Arduino Uno R3", "L298N Dual Bridge", "HC-SR04 Sonar", "4xAA Carrier"], "9 Items", "Color Wire Chart + Ultrasonic Sweep Code", "robot"],
  ["energy-kit", "CKW-KIT-0312", "Smart Home Power & Energy Meter", "IoT & Automation", "Intermediate", "iot", "2–3 hrs", "14.200", "Non-invasive AC current sensing for an example ESPHome or MQTT dashboard.", ["SCT-013 CT Clamp", "ESP32 Dual-Core", "Burden Resistor Mod", "3.3V Voltage Bias"], "7 Items", "ESPHome YAML config + Calibration Guide", "energy"],
  ["university-kit", "CKW-KIT-KU-EE1", "KU Electrical Eng Starter Lab Kit", "University Labs", "All levels", "university", "Semester-long", "24.500", "Core parts for standard KU and AUK electrical engineering lab projects.", ["Auto DMM Multimeter", "830-Pt Breadboard", "Dual 3.3/5V Rail", "LM358 & 741 Op-Amps", "BJT & MOSFET Assort."], "320+ Parts", "12 Standard Experiment Worksheets", "lab"],
  ["plant-kit", "CKW-KIT-0408", "Plant Soil Telemetry & Auto-Watering", "Automation", "Beginner", "automation", "1–1.5 hrs", "8.900", "Soil sensing and relay control for an indoor garden watering example.", ["Capacitive Moisture V1.2", "5V Submersible Pump", "1-Ch Opto Relay", "Arduino Nano (Type-C)"], "5 Items", "Auto Calibration Firmware + Tubing Fixture", "plant"],
  ["fpga-kit", "CKW-KIT-0550", "FPGA & Digital Logic Bundle", "Digital Logic", "Advanced", "university", "6+ hrs", "32.000", "Explore Verilog and VHDL with an FPGA, displays, switches and logic gates.", ["FPGA Eval Board", "4x 7-Segment Modules", "8-Bit DIP Switch Array", "74HC00/08/32 ICs", "USB-JTAG Blaster"], "14 Items", "Verilog Starter Templates + Quartus Lab Manual", "logic"],
];

const productInsert = `
  INSERT INTO catalog_products
    (id, name, sku, category, price, stock, package, description, voltage, interface, icon, is_demo, seed_source)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'circuits-kw-demo')
  ON CONFLICT (id) DO NOTHING
`;

const kitInsert = `
  INSERT INTO project_kits
    (id, code, title, category, level, domain, duration, price, description, parts, item_count_label, manual_notes, icon, is_demo, seed_source)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, 'circuits-kw-demo')
  ON CONFLICT (id) DO NOTHING
`;

const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const product of products) await client.query(productInsert, product);
  for (const kit of kits) await client.query(kitInsert, kit);
  await client.query("COMMIT");
  console.info(`Seeded ${products.length} demo products and ${kits.length} demo project kits.`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}

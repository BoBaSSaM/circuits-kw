import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { LanguageProvider, t, useLanguage, type Language } from './i18n';
import {
  buildPlanFromPrompt,
  buildBomCartItems,
  calculateBomLineTotal,
  calculateBomTotal,
  clampBuildQuantity,
  inferAssemblyCount,
  inferPartQuantity,
  parseAuthorizedPriceCsv,
} from './build-assist-model';
import { addCartItem, calculateCartSubtotal } from './cart-model';
import {
  ArrowDown, ArrowRight, BatteryCharging, BookOpen, Bot,
  CheckCircle2, CircuitBoard, Cpu, Gauge, GraduationCap, Grid2X2,
  Info, Layers, LifeBuoy, MapPin, Menu, Minus, PackageCheck, Plus,
  Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Trash2, Truck, Upload, Wifi, X,
} from 'lucide-react';

type Item = { id: string; name: string; price: number; kind: 'component' | 'kit' | 'bom'; sku: string; qty: number };
type AddItem = Omit<Item, 'qty'> & { qty?: number };
type DemoOrder = { orderNumber:string; placedAt:string; items:Item[]; subtotal:number };
type Product = { id: string; name: string; sku: string; category: string; price: number; stock: number; package: string; description: string; voltage: string; interface: string; icon: 'cpu' | 'sensor' | 'power' | 'display' | 'board' | 'parts'; };
type Kit = { id: string; code:string; title: string; category: string; level: 'Beginner' | 'Intermediate' | 'Advanced' | 'All levels'; domain: string; duration: string; price: number; desc: string; parts: string[]; count:string; manual:string; icon: 'weather' | 'robot' | 'energy' | 'lab' | 'plant' | 'logic'; };
type PriceListState = { pricesBySku: Record<string, number>; source: string; updatedAt: string };
const PRICE_LIST_STORAGE_KEY = 'circuits-kw-build-assist-prices';
const normalizePriceSku = (sku: string) => sku.trim().toLocaleUpperCase('en-US');
function readSavedPriceList(): PriceListState | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(PRICE_LIST_STORAGE_KEY) || 'null') as Partial<PriceListState> | null;
    if (!value || !value.pricesBySku || typeof value.pricesBySku !== 'object' || !value.source || !value.updatedAt) return null;
    const pricesBySku = Object.fromEntries(Object.entries(value.pricesBySku).filter(
      ([sku, price]) => Boolean(sku) && typeof price === 'number' && Number.isFinite(price) && price >= 0,
    ));
    if (!Object.keys(pricesBySku).length) return null;
    return { pricesBySku, source: value.source, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

const products: Product[] = [
  { id:'esp32', name:'ESP32-WROOM-32D', sku:'ESP32-WRM-32D', category:'Microcontrollers', price:2.850, stock:142, package:'DIP-38', description:'Dual-core Xtensa 32-bit LX6 @ 240MHz. Integrated RF matching with PCB antenna.', voltage:'2.7V–3.6V (3.3V nom.)', interface:'SPI · I²C · UART · PWM', icon:'cpu' },
  { id:'nucleo', name:'STM32 Nucleo-F401RE', sku:'NUCLEO-F401RE', category:'Microcontrollers', price:6.200, stock:28, package:'Nucleo-64', description:'ARM Cortex-M4 board with on-board ST-LINK debugger and 512KB flash.', voltage:'3.3V / 5V Vin', interface:'USB · UART · SPI', icon:'board' },
  { id:'bme280', name:'BME280 Sensor Module', sku:'SNS-BME280-I2C', category:'Sensors', price:1.950, stock:65, package:'LGA-8 breakout', description:'Combined digital temperature, humidity and barometric pressure sensor module.', voltage:'1.8V–3.6V', interface:'I²C · SPI', icon:'sensor' },
  { id:'hcsr04', name:'HC-SR04 Ultrasonic Sensor', sku:'SNS-HCSR04-5V', category:'Sensors', price:0.850, stock:210, package:'Through-hole', description:'Precision non-contact distance sensor for robotics and ranging.', voltage:'5V DC', interface:'GPIO · trigger', icon:'sensor' },
  { id:'pico', name:'Raspberry Pi Pico W', sku:'RPI-PICOW-2024', category:'Microcontrollers', price:2.100, stock:0, package:'DIP-40', description:'Dual-core RP2040 + 2.4GHz Wi-Fi. 2MB onboard flash; 40-pin castellated module.', voltage:'1.8V–5.5V VSYS', interface:'PIO · SPI · I²C', icon:'board' },
  { id:'lcd', name:'16x2 I2C Character LCD', sku:'DIS-LCD-1602I2C', category:'Displays', price:1.450, stock:54, package:'1602 module', description:'Standard 16-column by 2-row character LCD with integrated backpack.', voltage:'5V DC', interface:'I²C address 0x27', icon:'display' },
  { id:'level', name:'Logic Level Converter 4-Ch', sku:'MOD-LLC-4CH-BI', category:'ICs & Logic Translators', price:0.650, stock:320, package:'4-channel board', description:'Bidirectional logic-level conversion for 3.3V and 5V systems.', voltage:'Up to 5V DC', interface:'I²C · SPI · UART', icon:'power' },
  { id:'resistor', name:'Metal Film Resistors Kit', sku:'PAS-RES-KIT-600', category:'Passives', price:2.500, stock:75, package:'600 pieces', description:'600 precision resistors in a 30-value organizer, 1% tolerance.', voltage:'250mW · 0.25W', interface:'E12 series', icon:'parts' },
  { id:'soil', name:'Capacitive Soil Moisture Sensor v1.2', sku:'SNS-SOIL-CAP-12', category:'Sensors', price:1.200, stock:48, package:'Analog module', description:'Corrosion-resistant PCB with stable 3.3V analog voltage output.', voltage:'3.3V analog', interface:'ADC output', icon:'sensor' },
  { id:'tp4056', name:'TP4056 1A Li-Ion Solar Battery Charger', sku:'PWR-TP4056-C', category:'Power & Battery', price:0.750, stock:92, package:'USB-C module', description:'Dual DW01A protection ICs, USB-C and solder terminals.', voltage:'4.2V charge', interface:'USB-C · Li-ion', icon:'power' },
  { id:'battery', name:'18650 3000mAh Battery Cell with Holder', sku:'BAT-18650-3000', category:'Power & Battery', price:2.200, stock:39, package:'18650 + holder', description:'High-discharge 18650 cell with gold-plated clip-terminal leads.', voltage:'3.7V nominal', interface:'Li-ion · holder', icon:'power' },
];

const kits: Kit[] = [
  { id:'weather-kit', code:'CKW-KIT-0101', title:'IoT Weather Station Kit', category:'IoT & Smart Home', level:'Intermediate', domain:'iot', duration:'1.5–2 hrs', price:12.500, desc:'Telemetry monitoring for barometric pressure, ambient temp, and relative humidity. Streams over Wi-Fi directly to MQTT or Home Assistant dashboards.', parts:['ESP32 NodeMCU','BME280 Sensor','0.96" I2C OLED','Breadboard + Jumpers'], count:'6 Items', manual:'PDF Manual & GitHub Arduino IDE Sketch', icon:'weather' },
  { id:'rover-kit', code:'CKW-KIT-0205', title:'Autonomous Obstacle Avoiding Robot', category:'Robotics', level:'Beginner', domain:'robotics', duration:'3–4 hrs', price:18.750, desc:'Complete differential-drive mobile rover. Employs pulse-width modulation for speed control and sonar sweeps for proactive obstacle traversal.', parts:['2WD Smart Chassis','Arduino Uno R3','L298N Dual Bridge','HC-SR04 Sonar','4xAA Carrier'], count:'9 Items', manual:'Color Wire Chart + Ultrasonic Sweep Code', icon:'robot' },
  { id:'energy-kit', code:'CKW-KIT-0312', title:'Smart Home Power & Energy Meter', category:'IoT & Automation', level:'Intermediate', domain:'iot', duration:'2–3 hrs', price:14.200, desc:'Safe, non-invasive AC mains current monitoring. A sample ESPHome / MQTT project concept for Home Assistant telemetry.', parts:['SCT-013 CT Clamp','ESP32 Dual-Core','Burden Resistor Mod','3.3V Voltage Bias'], count:'7 Items', manual:'ESPHome YAML config + Calibration Guide', icon:'energy' },
  { id:'university-kit', code:'CKW-KIT-KU-EE1', title:'KU Electrical Eng Starter Lab Kit', category:'University Labs', level:'All levels', domain:'university', duration:'Semester-long', price:24.500, desc:'Designed specifically to meet standard lab syllabus requirements for KU EE and AUK circuit design courses. Certified-tolerance component assortment.', parts:['Auto DMM Multimeter','830-Pt Breadboard','Dual 3.3/5V Rail','LM358 & 741 Op-Amps','BJT & MOSFET Assort.'], count:'320+ Parts', manual:'12 Standard Experiment Worksheets', icon:'lab' },
  { id:'plant-kit', code:'CKW-KIT-0408', title:'Plant Soil Telemetry & Auto-Watering', category:'Automation', level:'Beginner', domain:'automation', duration:'1–1.5 hrs', price:8.900, desc:'Corrosion-resistant capacitive moisture sensing paired with an opto-isolated relay for indoor hydroponics or garden watering cycles.', parts:['Capacitive Moisture V1.2','5V Submersible Pump','1-Ch Opto Relay','Arduino Nano (Type-C)'], count:'5 Items', manual:'Auto Calibration Firmware + Tubing Fixture', icon:'plant' },
  { id:'fpga-kit', code:'CKW-KIT-0550', title:'FPGA & Digital Logic Bundle', category:'Digital Logic', level:'Advanced', domain:'university', duration:'6+ hrs', price:32.000, desc:'Deep dive into Verilog/VHDL synthesis. Includes FPGA core carrier, multiplexed digital displays, debounced inputs and fundamental discrete gates.', parts:['FPGA Eval Board','4x 7-Segment Modules','8-Bit DIP Switch Array','74HC00/08/32 ICs','USB-JTAG Blaster'], count:'14 Items', manual:'Verilog Starter Templates + Quartus Lab Manual', icon:'logic' },
];

const categories = ['All components','Microcontrollers','Sensors','Power & Battery','Passives','ICs & Logic Translators','Displays'];
const kitDomains = ['All domains','Robotics','IoT & Smart Home','IoT & Automation','University Labs','Automation'];
const fmt = (value:number) => `${value.toFixed(3)} KWD`;
const queryClient = new QueryClient();

function useDocument(title:string, description:string) {
  useEffect(() => {
    document.title = `${title} | Circuits KW`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name','description'); document.head.append(meta); }
    meta.setAttribute('content',description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content',`${title} | Circuits KW`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content',description);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content',`${title} | Circuits KW`);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content',description);
  },[title,description]);
}

function Logo() {
  const {language}=useLanguage();
  return <Link href="/" className="brand" data-testid="link-home" aria-label={t('Circuits KW home',language)}>
    <span className="brand-mark"><Cpu size={22}/></span>
    <span className="brand-copy"><span className="brand-name">Circuits KW</span><span className="brand-tag">{t('From parts to possibilities.',language)}</span></span>
  </Link>;
}

function Header({ count, search, onSearch }:{count:number; search:string; onSearch:(v:string)=>void}) {
  const [path,setLocation] = useLocation();
  const [open,setOpen] = useState(false);
  const {language,setLanguage}=useLanguage();
  const [cartPulse,setCartPulse]=useState(false);
  const previousCount=useRef(count);
  useEffect(()=>{
    const added=count>previousCount.current;
    previousCount.current=count;
    if(!added){setCartPulse(false);return}
    setCartPulse(true);
    const timer=window.setTimeout(()=>setCartPulse(false),650);
    return ()=>window.clearTimeout(timer);
  },[count]);
  const nav = [['Components','/components'],['Project Kits','/project-kits'],['Build Assist','/build-assist'],['About','/about']] as const;
  return <header className="site-header"><div className="header-inner">
    <Logo/>
    <nav className="nav-links" aria-label={t('Main navigation',language)}>{nav.map(([label,url])=><Link key={url} href={url} className={`nav-link ${path===url?'active':''}`} data-testid={`nav-${url.slice(1)}`}>{t(label,language)}</Link>)}</nav>
    <div className="header-search"><Search size={15}/><input aria-label={t('Search components, part numbers, or tools',language)} placeholder={t('Search components, part numbers, or tools...',language)} value={search} onChange={e=>onSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')setLocation('/components')}} data-testid="input-global-search"/></div>
    <div className="header-actions">
      <div className="language-switch" role="group" aria-label={t('Language preference',language)}>{([['en','EN'],['ar','العربية']] as const).map(([code,label])=><button type="button" key={code} aria-pressed={language===code} className={language===code?'selected':''} onClick={()=>setLanguage(code)} data-testid={`button-language-${code}`}>{label}</button>)}</div>
      <span className="tag" aria-label={t('Prices in Kuwaiti Dinar',language)}>KWD</span>
      <Link href="/cart" className={`icon-button cart-link ${cartPulse?'cart-link-pulse':''}`} aria-label={language==='ar'?`السلة، ${count} عناصر`:`Cart, ${count} items`} data-testid="link-cart"><ShoppingCart key={`cart-icon-${cartPulse?count:'idle'}`} className={cartPulse?'cart-icon-pop':''} size={17}/>{count>0&&<span key={`cart-count-${cartPulse?count:'idle'}`} className={`cart-count ${cartPulse?'cart-count-pop':''}`} data-testid="cart-count">{count}</span>}</Link>
      <button className="icon-button mobile-toggle" aria-label={t(open?'Close navigation':'Open navigation',language)} aria-expanded={open} onClick={()=>setOpen(!open)} data-testid="button-mobile-menu">{open?<X size={18}/>:<Menu size={18}/>}</button>
    </div>
  </div>{open&&<nav className="mobile-nav" aria-label={t('Mobile navigation',language)}>{nav.map(([label,url])=><Link key={url} href={url} onClick={()=>setOpen(false)} className={`nav-link ${path===url?'active':''}`} data-testid={`mobile-nav-${url.slice(1)}`}>{t(label,language)}</Link>)}</nav>}</header>;
}

function Footer() {
  const {language}=useLanguage();
  return <footer className="footer"><div className="container">
    <div className="footer-grid"><div><Logo/><p>{t('Electronic components and practical guidance for engineers, students, and makers in Kuwait.',language)}</p><div className="footer-social"><span>KW</span><span>EST. SHUWAIKH</span><span>HARDWARE / LAB</span></div></div>
      <div><h4>{t('Shop',language)}</h4><Link href="/components">{t('Microcontrollers',language)}</Link><Link href="/components">{t('Sensors',language)}</Link><Link href="/components">{t('Components',language)}</Link><Link href="/components">{t('Tools & passives',language)}</Link><Link href="/project-kits">{t('Project Kits',language)}</Link></div>
      <div><h4>{t('Support',language)}</h4><Link href="/about#hub">{t('Contact & local operations',language)}</Link><Link href="/about#delivery">{t('Kuwait delivery overview',language)}</Link><Link href="/build-assist">{t('BOM planning',language)}</Link></div>
      <div><h4>{t('Company & preferences',language)}</h4><Link href="/about">{t('About Circuits KW',language)}</Link><Link href="/cart">{t('Shopping Cart',language)}</Link><span className="footer-note">{t('EN · العربية-ready',language)}</span><span className="footer-note">{t('KWD (Kuwaiti Dinar)',language)}</span></div>
    </div><div className="footer-bottom"><span>{t('© 2025 Circuits KW. All rights reserved. Made for engineers, students, and makers.',language)}</span><span><i/> {t('Kuwait-local details',language)} &nbsp; | &nbsp; {t('Illustrative catalog data',language)}</span></div>
  </div></footer>;
}

function ProductArt({ icon, id }:{icon:Product['icon'];id:string}) {
  const Icon=icon==='cpu'?Cpu:icon==='sensor'?Gauge:icon==='power'?BatteryCharging:icon==='display'?Grid2X2:icon==='board'?CircuitBoard:Layers;
  const photos:Record<string,string> = {
    esp32:'https://lh3.googleusercontent.com/aida-public/AB6AXuD5i9xYpRTXmjp1tJRhbT-N314l-Oke6SyC3WPkYNQ1vrDctIn61cl_bz7mW2AtW0nPPKeWkzswkfCLxuYhqFIdC3RSsoV2coLADTGUjy5KnFnR1IPPN6Vg3rgTuOEm5tpqGM8wiUPJt7hMbH6rGs6nA9maUsC7jieR0s7g9hLRSZMBUtsv4ZvYuMly3eSGmqSnFcHbhTBLlJ3gPrAZYSdpB3xtFp_gYePW6RLjDS9qJa5M1izD2XFUkw',
    nucleo:'https://lh3.googleusercontent.com/aida-public/AB6AXuB4uXvbO-EQPHiDUlAQvqxbv2hhYINB314ZdBdURjXbiFqZMjwtmFuLWZ61sObg0iBjTLf1BL48HtOrTxtfOSm4avpHGrjh6P5-gFfXZnA0kOoRcy24kxxz1ytrTsOup4zDRyf6reVwwPjFunJeH7kcSZtWrDyaJ1bElG2nQvGxhqoJ5or5QoZ7gF6NiYc8wfJlXAjALB2jWDss3sbOXzkVyr5EIc1Trci4PXumAPJvWIx6Fehgua3LTQ',
    bme280:'https://lh3.googleusercontent.com/aida-public/AB6AXuAtkY3j3sDsueXIFOmc5EYQNCYfr1Wx-MSLn7_Hs_o3ttDutPLIlvBIgxzASmJxw3XaoqxHgkIcp3ql5P71jitLWS104MbvuMEdJ_sIv4qgstVVzW6gc6kEvDnpzVwOj_J7foTePp3RHf7FF_oMtUyXX4BbpjkAheKOdh6a2m-tz3moZSB0eWTABA0VJhM1FBqxsvhtgO4v0D10da3sokMstQoyQn2lJLnSdsyhE1H_tMpKOs_BydAiiA',
    hcsr04:'https://lh3.googleusercontent.com/aida-public/AB6AXuBHGviNlrC7wNPMJGgH4jrBqDx1lR0P6IqKkbqyeLYuNsrp8JsSM6uOm9gFQU__akZ7uzpnWT6uJ5FbzIzdfy1H26d4K2wyp7kQA9CuLvrhnTC_aeUAHib5FUr2k21a4roF5PaLBu0rHj70YQ4Pvj1odNTFA5y_2g-vec9NEVPe8bDqMlmQua7_s1RlEAN3EmKBH7-ULeE17cEWy76QGuKjsWDRPuueeMxQmYcP0m_DzzEw5yIqYWlYGQ',
    pico:'https://lh3.googleusercontent.com/aida-public/AB6AXuBGGgGNOsx5XEJ_-cngKxuYSN34F3L6MtW5GxGdZvXGsTFW0i6G4avYr5yEOV9IuGncakdKEDeWT05xugxFi2njlrZHjGqKctapchPYMt_hSqI8A-Zcmm2MIfpcehwbXgIX_twu-jZ-lXQmPmkQv8_pHKKbMZHUNmQt1QBgvD1ZLSrVSbZ4Ei7iUptVmpGCI8tVEABmIopExzihj_l1T16SbnpOOUzuMT1YaAKLFXPKcsloJxUJvWL5AA',
    lcd:'https://lh3.googleusercontent.com/aida-public/AB6AXuBBak9uaUL7r1yP77PzTrw_LDfJ2a1kV3OMaqTu0vd9P59FM0s0QQfda2KCbSSV2p5pOT4WFOVyIvK6SGAzH9ZCUe_j-xBCG01QD9GCgH2RlD5DMj0hJKov2Bd70fy8sf8SHGDVg5q6zZnemcvhYh_0nFvVqPxu6Mv_KByubero-5yBad0slyF9hEwFARBQt4j16CG42upcxe-0V1_CMJsLPDTZiIrEf5KlFecN_lgxKY2-_-abec07hQ',
    level:'https://lh3.googleusercontent.com/aida-public/AB6AXuDqpDr7S5UcSGlWyUUqCmUbp-dCJHWdPKp8F5YmttqprKRi07ZggtCN6FcSe-SPMbfoeuY2lKm_1mSHaavEWEMOgcPh1m5ho-hWcU0F_OnUilhuRfHpKqZ2YWYY6GHvlP2kQPpx038wgVD53ysbTAUs_D_zR52v91GsQx7UUVvzHfi0iRGCGBidBRHieShkBXudGgYQO53hGg1TElvJnB5nM7tFlDp0IjzLZMm4-NIEWcI-l-Z_qP-ORw',
  };
  return <div className="product-art">{photos[id]&&<img src={photos[id]} alt="" loading="lazy" onLoad={e=>e.currentTarget.parentElement?.classList.add('has-photo')} onError={e=>{e.currentTarget.style.display='none'}}/>}<span className="art-index">CKW // {id.slice(0,4).toUpperCase()}</span><span className="art-visual"><Icon size={30}/></span></div>;
}

function ProductCard({ product, add }:{product:Product;add:(item:AddItem)=>void}) {
  const {language}=useLanguage();
  const [expanded,setExpanded]=useState(false);
  const [animateDescription,setAnimateDescription]=useState(false);
  const detailsId=`product-description-${product.id}`;
  const description=t(product.description,language);
  const descriptionWords=description.trim().split(/\s+/);
  const shortDescription=descriptionWords.slice(0,3).join(' ');
  const hasMoreDescription=descriptionWords.length>3;
  return <article className="product-card surface" data-testid={`card-product-${product.id}`}>
    <ProductArt icon={product.icon} id={product.id}/>
    <div className="product-content">
       <div className="product-meta"><span>{product.stock>0?(language==='ar'?`${product.stock} ${t('sample units',language)}`:`${product.stock} sample units`):t('No sample stock',language)}</span><span>{product.package}</span></div>
       <div><h3>{t(product.name,language)}</h3><div className="mono" style={{fontSize:9,color:'#718096',marginTop:4}}>SKU: {product.sku}</div></div>
       <span className="product-category">{t(product.category,language)} · {t('QUICK OVERVIEW',language)}</span>
       <p className={`product-desc ${expanded?'expanded':''}`} id={detailsId}><span className={`description-copy ${animateDescription?'animated':''}`} key={expanded?'full':'preview'}>{expanded||!hasMoreDescription?description:`${shortDescription}…`}</span></p>
      {hasMoreDescription&&<button className="product-more" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>{setExpanded(value=>!value);setAnimateDescription(true)}} data-testid={`button-product-more-${product.id}`}>
         {t(expanded?'Show less':'Show more',language)} <span aria-hidden="true">{expanded?'−':'+'}</span>
      </button>}
       <div className="specs"><span>{t('Voltage',language)} <b>{product.voltage}</b></span><span>{t('Interface',language)} <b>{product.interface}</b></span></div>
       <div className="product-bottom"><div><div className="price">{fmt(product.price)}</div><div className="stock"><span className="dot"/> {t('Illustrative catalog price',language)}</div></div></div>
       <button className="button button-primary catalog-add" onClick={()=>add({id:product.id,name:product.name,price:product.price,kind:'component',sku:product.sku})} data-testid={`button-add-${product.id}`}><Plus size={15}/> {t('Add to cart',language)}</button>
    </div>
  </article>;
}

function HomePage() {
  const {language}=useLanguage();
  useDocument(t('Parts to possibilities',language),t('Electronic components, development boards, curated kits and practical Build Assist for makers and engineering teams in Kuwait.',language));
  return <>
    <section className="hero"><div className="container hero-grid">
      <div><div className="tag"><span className="dot"/> {t('FOR ENGINEERS · FOR MAKERS',language)}</div>
        <h1>{t('Everything you need for your',language)} <em>{t('next build.',language)}</em></h1>
        <p className="lead">{t('Explore electronic components, development boards, sensors, and tools—with clear specifications to help you choose with confidence.',language)}</p>
        <div className="hero-actions"><Link className="button button-primary" href="/components" data-testid="link-shop-components">{t('Shop components',language)} <ArrowRight size={16}/></Link><Link className="button button-outline" href="/project-kits" data-testid="link-explore-kits">{t('Explore project kits',language)} <Layers size={16}/></Link></div>
        <div className="eyebrow">{t('From parts to possibilities.',language)}</div>
        <div className="trust-row"><span><ShieldCheck size={15}/> {t('Datasheets & specifications',language)}</span><span><Truck size={15}/> {t('Kuwait delivery context',language)}</span><span><Cpu size={15}/> {t('Original OEM parts focus',language)}</span></div>
      </div>
      <div className="bench-visual" aria-label="Illustration of a prototyping board"><div className="bench-canvas"><div className="wire"/><div className="wire two"/><div className="board"><div className="chip">CKW / MCU<br/>ESP32 CORE</div></div><div className="bench-badge badge-one">CORE SOC<b>ESP32 · STM32</b></div><div className="bench-badge badge-two">BUS PROTOCOL<b>I²C / SPI / UART</b></div></div><div className="bench-footer"><span><CircuitBoard size={13}/> BENCH-RIG-KUWAIT // REV 2.4</span><span style={{color:'#007b91'}}>TECHNICAL CATALOG</span></div></div>
    </div></section>
    <section className="section feature-section"><div className="container">
       <div className="feature-head"><div><div className="eyebrow">{t('PRECISION CATALOG & WORKFLOW',language)}</div><h2>{t('The right parts. A clearer path to building.',language)}</h2><p className="lead" style={{fontSize:14,marginBottom:0}}>{t('Find, understand and combine components with a Kuwait-first point of view.',language)}</p></div><span className="tag">{t('DESIGNED FOR THE BENCH',language)}</span></div>
      <div className="feature-grid">
         <article className="surface feature-card"><div><div className="feature-icon"><Search size={23}/></div><h3>{t('Find parts faster',language)}</h3><p>{t('Search by part name, SKU or interface. Filter to the component families that fit your build and compare practical specs at a glance.',language)}</p></div><div className="tag-row"><span className="tag">{t('SKU search',language)}</span><span className="tag">{t('Voltage details',language)}</span><span className="tag">{t('KWD pricing',language)}</span></div></article>
         <article className="surface feature-card"><div><div className="feature-icon"><BookOpen size={23}/></div><h3>{t('Understand every component',language)}</h3><p>{t('Voltage, interfaces and package details help clarify how each part fits your design—before anything reaches the breadboard.',language)}</p></div><div className="tag-row"><span className="tag">{t('Specs up front',language)}</span><span className="tag">{t('Logic levels',language)}</span><span className="tag">{t('Clear identifiers',language)}</span></div></article>
         <article className="surface feature-card"><div><div className="feature-icon"><PackageCheck size={23}/></div><h3>{t('Build with curated kits',language)}</h3><p>{t('Start from a focused kit for robotics, IoT or university labs, with a concise parts list and an illustrative local KWD price.',language)}</p></div><div className="tag-row"><span className="tag">{t('Curated BOMs',language)}</span><span className="tag">{t('Beginner to advanced',language)}</span></div></article>
         <article className="surface feature-card assist-feature"><div><div className="feature-icon"><Bot size={23}/></div><h3>{t('Meet Build Assist',language)}</h3><p>{t('Describe a hardware idea and explore a locally generated demo BOM. Tune a voltage target and budget, then move the sample parts into your local cart.',language)}</p></div><div className="feature-arrow"><Link href="/build-assist" data-testid="link-build-assist-feature">{t('Meet Build Assist',language)} <ArrowRight size={16}/></Link><span className="tag">{t('Rule-based local demo',language)}</span></div></article>
      </div>
    </div></section>
     <section className="section"><div className="container"><div className="dark-cta"><div className="eyebrow" style={{color:'#54d8ec'}}>{t('PARTS · PROJECT KITS · BUILD ASSIST',language)}</div><h2>{t('Your next idea starts with the right parts.',language)}</h2><p>{t('Explore components for your next build, or let Build Assist help you plan a parts list. Kuwait delivery and pickup details are presented as reference information; no fulfillment service is connected.',language)}</p><div className="hero-actions"><Link className="button button-primary" href="/components" data-testid="link-start-building">{t('Start building',language)} <ArrowRight size={16}/></Link><Link className="button button-outline" href="/build-assist" data-testid="link-ask-assist">{t('Ask Build Assist',language)}</Link></div><span className="mono" style={{fontSize:10,color:'#bcc8d1'}}>{t('Kuwait City · Hawalli · Shuwaikh · All governorates — reference zones',language)}</span></div></div></section>
  </>;
}

function CatalogPage({ add, globalSearch }:{add:(item:AddItem)=>void;globalSearch:string}) {
  const {language}=useLanguage();
  useDocument(t('Components catalog',language),t('Search and filter electronic components with clear specifications and illustrative KWD pricing.',language));
  const [query,setQuery]=useState(globalSearch); const [category,setCategory]=useState('All components'); const [stockOnly,setStockOnly]=useState(false); const [voltage,setVoltage]=useState<string[]>([]); const [mount,setMount]=useState<string[]>([]); const [sort,setSort]=useState('verified');
   useEffect(()=>{setQuery(globalSearch)},[globalSearch]);
  const toggle=(values:string[],setter:(v:string[])=>void,value:string)=>setter(values.includes(value)?values.filter(x=>x!==value):[...values,value]);
   const filtered=useMemo(()=>products.filter(p=>{
     const searchValues=[p.name,p.sku,p.category,p.interface,p.description,t(p.name,'ar'),t(p.category,'ar'),t(p.description,'ar')];
     const matchesQuery=!query||searchValues.some(value=>value.toLowerCase().includes(query.toLowerCase()));
     return (category==='All components'||p.category===category)&&(!stockOnly||p.stock>0)&&matchesQuery&&(!voltage.length||voltage.some(v=>p.voltage.toLowerCase().includes(v.toLowerCase().replace(' dc',''))||p.voltage.toLowerCase().includes(v.toLowerCase())))&&(!mount.length||(mount.includes('Through-hole')&&/(dip|through|resistor)/i.test(`${p.package} ${p.category}`))||(mount.includes('Surface mount')&&/(smd|surface|lga)/i.test(`${p.package} ${p.category}`)));
   }),[category,stockOnly,query,voltage,mount]);
  const sorted=[...filtered].sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='stock'?b.stock-a.stock:products.indexOf(a)-products.indexOf(b));
  function reset(){setCategory('All components');setStockOnly(false);setVoltage([]);setMount([]);setQuery('');}
   return <div className="container page-top">
     <div className="catalog-breadcrumb"><Link href="/">{t('Home',language)}</Link><span>/</span><span>{t('Components',language)}</span><span>/</span><b>{t('Catalog',language)}</b><span className="sample-sync"><i/> {t('SAMPLE CATALOG DATA',language)}</span></div>
     <div className="page-heading-row"><div><div className="eyebrow">{t('LOCAL INVENTORY · KUWAIT REFERENCE',language)}</div><h1>{t('Electronic components.',language)}</h1><p className="lead" style={{fontSize:14,marginBottom:20}}>{t('Search by part, compare the details, and plan your next board-level build. Prices, stock and product records shown here are illustrative.',language)}</p></div><span className="tag"><MapPin size={12}/> {t('KWD · Kuwait-focused',language)}</span></div>
     <div className="catalog-search surface"><div className="search-field"><Search size={17}/><input aria-label={t('Search components by name or SKU',language)} placeholder={t('Search boards, sensors, part numbers, interfaces…',language)} value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-component-search"/></div><button className="button button-outline small-button" onClick={reset} data-testid="button-reset-filters"><SlidersHorizontal size={14}/> {t('Reset filters',language)}</button></div>
     <div className="quick-filters" aria-label={t('Popular categories',language)}>{['All components','Microcontrollers','Sensors','Power & Battery','Passives'].map(c=><button key={c} onClick={()=>setCategory(c)} className={category===c?'active':''} data-testid={`quick-category-${c.toLowerCase().replaceAll(' ','-').replace('&-','')}`}>{t(c,language)}</button>)}</div>
    <div className="catalog-layout">
       <aside className="filter-panel surface" aria-label={t('Catalog filters',language)}>
         <div className="filter-group"><div className="filter-title">{t('Local reference',language)} <span className="tag">KW</span></div><label className="filter-option"><input type="checkbox" checked={stockOnly} onChange={e=>setStockOnly(e.target.checked)} data-testid="filter-stock"/> {t('Show sample stocked items',language)}</label><p style={{fontSize:10,color:'#75828a',margin:'3px 0 0 24px'}}>{t('Illustrative sample inventory only',language)}</p></div>
         <div className="filter-group"><div className="filter-title">{t('Categories',language)}</div><div className="category-list">{categories.map(c=><button key={c} className={`category-button ${category===c?'selected':''}`} onClick={()=>setCategory(c)} data-testid={`filter-category-${c.toLowerCase().replaceAll(' ','-')}`}><span>{t(c,language)}</span>{c==='All components'?products.length:products.filter(p=>p.category===c).length}</button>)}</div></div>
         <div className="filter-group"><div className="filter-title">{t('Operating voltage',language)}</div>{['3.3V','5V','12V'].map(v=><label className="filter-option" key={v}><input type="checkbox" checked={voltage.includes(v)} onChange={()=>toggle(voltage,setVoltage,v)} data-testid={`filter-voltage-${v.replace('.','-')}`}/>{v} {t('DC',language)}</label>)}</div>
         <div className="filter-group"><div className="filter-title">{t('Package type',language)}</div>{['Through-hole','Surface mount'].map(v=><label className="filter-option" key={v}><input type="checkbox" checked={mount.includes(v)} onChange={()=>toggle(mount,setMount,v)} data-testid={`filter-package-${v.toLowerCase().replace(' ','-')}`}/>{t(v,language)}</label>)}</div>
         <div className="tag"><Info size={13}/> {t('Sample stock counts are illustrative.',language)}</div>
      </aside>
       <section aria-label={t('Component results',language)}><div className="results-bar"><span data-testid="text-catalog-count">{language==='ar'?`${sorted.length} مكوّنات في هذه الصفحة`:`${sorted.length} component${sorted.length===1?'':'s'} in this view`}</span><label>{t('Sort',language)}&nbsp; <select value={sort} onChange={e=>setSort(e.target.value)} aria-label={t('Sort products',language)} data-testid="select-sort-products"><option value="verified">{t('Featured',language)}</option><option value="low">{t('Price: low to high',language)}</option><option value="high">{t('Price: high to low',language)}</option><option value="stock">{t('Sample stock count',language)}</option></select></label></div>
         {sorted.length?<div className="product-grid">{sorted.map(p=><ProductCard key={p.id} product={p} add={add}/>)}</div>:<div className="surface empty-state"><div className="empty-icon"><Search size={23}/></div><h3>{t('No matching components',language)}</h3><p className="lead" style={{margin:'0 auto 16px',fontSize:13}}>{t('Try another search or clear a filter to widen the catalog.',language)}</p><button className="button button-outline" onClick={reset} data-testid="button-clear-search">{t('Clear filters',language)}</button></div>}
      </section>
    </div>
     <section className="catalog-endcap"><div><span className="eyebrow">{t('FROM PARTS TO POSSIBILITIES',language)}</span><h2>{t('Build from a known starting point.',language)}</h2><p>{t('Move from a catalog search to one of six project-kit concepts, or use Build Assist to shape a local demo BOM. Sample prices and inventory are not live.',language)}</p></div><div className="hero-actions"><Link className="button button-primary" href="/project-kits" data-testid="link-catalog-kits">{t('Explore project kits',language)} <ArrowRight size={15}/></Link><Link className="button button-outline" href="/build-assist" data-testid="link-catalog-assist">{t('Open Build Assist',language)}</Link></div></section>
  </div>;
}

function KitArt({kit}:{kit:Kit}) {
  const {language}=useLanguage();
  const Icon=kit.icon==='robot'?CircuitBoard:kit.icon==='energy'?BatteryCharging:kit.icon==='lab'?GraduationCap:kit.icon==='logic'?Cpu:kit.icon==='plant'?Gauge:Wifi;
  const photos:Record<string,string> = {
    'weather-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuDePpX74wOz-wgt7BKJc4ukKecIYzI-pQoI6MYegsAW5mg4wxLyBXDl6RLOw5wHo6Pgn1nKvBc4G5x_xikdxwcReLZOcg_EeILGPT2rOAKpth4-MzTSTZnCoRVAJ2kB1voqDs3iJ1HdnsiDwbC7idxU-S6CzIG2KqvIsOrAWljh3UoZ-JpNAPqQw-mjkVjVQHnhXuQxFwN552C8o_grPNfz5mCn92LmK_QVRzXKh2yBDiMk8J5k_Zaahg',
    'rover-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuB04mSRt8M4ir0iNZb2uwdOaZKGaiiCZ2qgb8BTDXOe4oWgblJjmHUyOpniGQjdYuoYYLe25zca-1ri2eZER7tLotCsbK6LtgE_QgTc8lGXGd1Jh68f__1_TiW2lyIslg0Wld5mvHJ5D_PdrfPnA4nvnke_bFOVM35qoTEXbnqLtiMGFYhH0VL-tk0Iu6sz9ut2BOrBekfTjaIvg7AlnLBmF9sxa3D1we23FCIqYmFIZNOxJkUZKHeA0w',
    'energy-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuBs_xKA2u7cYB_bJGtiGUqmsH9tOdYFXt__OeE_M0neQ8K9tgV3eDigWpqZpUKK-_kc7L3UZ71Bod5kh2geJCS_XLFMplefDYA3btY5Dxg9YxAeRggfw8690FyfgzsUlceke_KMEe_1mnIf0md6imxcQaQZvc1zo4l3Ex9fBemMFm27QWi2v7A3KhOJq9m0GpBbZvoXEF7KNrlOHK4-uPnGc3xMmmLnWaB1MRWnVbdEBDAudrknZH2YlA',
    'university-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuB3f0cVOGlmskmfAh7Wd-RVQGN7ciUz8AXXiGCRwDlnlR8vhN01vqCPV1D9fTbrk__6_JdbOZHFStftqAS3xtixp6BOmr5WXzM4Qt1vtcQ8L7vW059EUewVU6JHLSTbRbj4fO9NbdDMrXdWXVg2NlzKwjncjegpSLj7unb5_oXu9iH0CrurP2utxQxEmmdZoDqBWbUjPV4qpBT6oOo-ScjuVwO6XtMOSBWTebEZ9JmEGzNUltqzBC9h-g',
    'plant-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuArgStcoEKkTRzAImnnxoDO_qlstSxEQIK2a65wy0coMSTkVwH2qwFeOmQQ62P0mfv9Zz3apMMNsFV6-22pld7DgkJOfIZSlyrbxBbiJohZ56oNNCaveUT_YIAElPBD8hZhH-IgBMeSG9_WONDgyVyNafrgvszNgTHCum_eY2hWpCMoD-yX0io-_usNcwlIeLLnaJM-K7TIcBsrd9ycAOVzukcTw7kzCAQo2-sUwKeQZQ1J4rzffMoH0w',
    'fpga-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuBbx76DvKkdpzREanl31ygUqbZn-p4DAiu2ieU4Q2WOnXbverEpJDMLsIH-F4pMPie4_2Grgn1qacwl3TfN3Ts2kpVRVtsVOBL5yxpE0ZypvXBkArt7yg-YJJu3Wzc_YyZh3meqJJNO01G9eE8nr92aXFK-CIyHk2Qehdz-MmNfUNFGI2tGE2wzYLy_iD6FAobEEX8p8Mja7xXFEgOQ7ZxgH0egDnuztcIBTiPCiZ-gQSWCXLwettKmcg',
  };
  return <div className="kit-art" aria-label={`${t(kit.title,language)} kit photograph`}><img src={photos[kit.id]} alt="" loading="lazy" onLoad={e=>e.currentTarget.parentElement?.classList.add('has-photo')} onError={e=>{e.currentTarget.style.display='none'}}/><span className="kit-photo-tag">{t(kit.category,language)} · BOM: {t(kit.count,language)}</span><div className="kit-plate"><Icon/></div><div className="kit-labels"><span>CIRCUITS KW / KIT</span><span>{kit.domain.toUpperCase()}</span></div></div>;
}

function kitDescriptionPreview(description:string) {
  const words=description.trim().split(/\s+/);
  return words.length>11?`${words.slice(0,11).join(' ')}…`:description;
}

function KitsPage({add}:{add:(item:AddItem)=>void}) {
  const {language}=useLanguage();
  useDocument(t('Project kits',language),t('Explore curated electronics kits for robotics, IoT, automation and university labs in Kuwait.',language));
   const [level,setLevel]=useState('All levels');const [domain,setDomain]=useState('All domains');const [query,setQuery]=useState('');const [selectedKit,setSelectedKit]=useState<Kit|null>(null);const [expandedKitId,setExpandedKitId]=useState<string|null>(null);const [animatedKitId,setAnimatedKitId]=useState<string|null>(null);
   const shown=kits.filter(k=>{
     const searchValues=[k.title,k.desc,k.category,k.level,k.parts.join(' '),t(k.title,'ar'),t(k.desc,'ar'),t(k.category,'ar'),t(k.level,'ar')];
     return (level==='All levels'||k.level===level||k.level==='All levels')&&(domain==='All domains'||k.category===domain)&&(!query||searchValues.some(value=>value.toLowerCase().includes(query.toLowerCase())));
   });
  return <>
      <section className="kit-hero"><div className="container"><div className="eyebrow" style={{color:'#55d7e9'}}>{t('CURATED PROJECT STARTERS · KUWAIT',language)}</div><div className="page-heading-row" style={{alignItems:'center'}}><div><h1>{t('Curated Project Kits.',language)}</h1><p>{t('Pre-selected build concepts with core hardware BOMs, schematic references and illustrative KWD prices. Kit availability is not live.',language)}</p></div><div className="kit-stats"><div className="kit-stat"><strong>06</strong><span>{t('Sample kits',language)}</span></div><div className="kit-stat"><strong>1–6+ hrs</strong><span>{t('Example build duration',language)}</span></div></div></div></div></section>
     <div className="container"><div className="kit-toolbar surface"><div className="chip-row"><span className="eyebrow" style={{marginRight:4}}>{t('Filter kits',language)}</span>{['All levels','Beginner','Intermediate','Advanced'].map(l=><button key={l} className={`filter-chip ${level===l?'active':''}`} onClick={()=>setLevel(l)} data-testid={`filter-kit-level-${l.toLowerCase()}`}>{t(l,language)}</button>)}</div><div className="chip-row">{kitDomains.map(d=><button key={d} className={`filter-chip ${domain===d?'active':''}`} onClick={()=>setDomain(d)} data-testid={`filter-kit-domain-${d.toLowerCase().replaceAll(' ','-').replace('&-','')}`}>{t(d,language)}</button>)}</div></div>
       <div className="search-field" style={{marginTop:17}}><Search size={17}/><input placeholder={t('Search kits by project, part or domain…',language)} value={query} onChange={e=>setQuery(e.target.value)} aria-label={t('Search project kits',language)} data-testid="input-kit-search"/></div>
          {shown.length?<div className="kits-grid">{shown.map(k=>{const kitDescription=t(k.desc,language);return <article className="kit-card surface" key={k.id} data-testid={`card-kit-${k.id}`}><KitArt kit={k}/><div className="kit-body"><div className="kit-code"><span>{k.code}</span><span>{t(k.level==='All levels'?'All Experience Levels':k.level,language)}</span></div><span className="tag" style={{width:'max-content'}}>{t(k.category,language)} · {t(k.duration,language)}</span><h3>{t(k.title,language)}</h3><p className={`kit-description ${expandedKitId===k.id?'expanded':''}`} id={`kit-description-${k.id}`}><span className={`description-copy ${animatedKitId===k.id?'animated':''}`} key={expandedKitId===k.id?'full':'preview'}>{expandedKitId===k.id?kitDescription:kitDescriptionPreview(kitDescription)}</span></p><button className="product-more kit-more" type="button" aria-expanded={expandedKitId===k.id} aria-controls={`kit-description-${k.id}`} onClick={()=>{setExpandedKitId(expandedKitId===k.id?null:k.id);setAnimatedKitId(k.id)}} data-testid={`button-kit-more-${k.id}`}>{t(expandedKitId===k.id?'Show less':'Show more',language)} <span aria-hidden="true">{expandedKitId===k.id?'−':'+'}</span></button><div><div className="filter-title" style={{fontSize:9}}>{t('Core hardware BOM',language)}</div><div className="kit-bom">{k.parts.map(p=><span key={p}>{p}</span>)}</div></div><div className="kit-manual"><BookOpen size={13}/> {t(k.manual,language)}</div><div className="kit-bottom"><span className="mono" style={{fontSize:9,color:'#687680'}}>{t('ILLUSTRATIVE KIT PRICE',language)}</span><span className="price">{fmt(k.price)}</span></div><div className="kit-actions"><button className="button button-outline small-button" onClick={()=>setSelectedKit(k)} data-testid={`button-schematic-${k.id}`}><CircuitBoard size={14}/> {t('Schematic / BOM',language)}</button><button className="button button-primary small-button" onClick={()=>add({id:k.id,name:k.title,price:k.price,kind:'kit',sku:k.code})} data-testid={`button-add-kit-${k.id}`}><ShoppingCart size={14}/> {t('Add Rig',language)}</button></div></div></article>})}</div>:<div className="surface empty-state"><h3>{t('No kits match those filters',language)}</h3><p className="lead" style={{fontSize:13,margin:'0 auto'}}>{t('Choose another domain or search term.',language)}</p></div>}
    </div>
      {selectedKit&&<div className="dialog-scrim" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSelectedKit(null)}}><section className="kit-dialog surface" role="dialog" aria-modal="true" aria-labelledby="kit-dialog-title"><button className="icon-button kit-dialog-close" aria-label={t('Close schematic details',language)} onClick={()=>setSelectedKit(null)}><X size={17}/></button><div className="eyebrow">{t('SCHEMATIC REFERENCE · LOCAL DEMO',language)}</div><h2 id="kit-dialog-title">{t(selectedKit.title,language)}</h2><p>{t(selectedKit.desc,language)}</p><div className="schematic-flow"><span>{t('Power / controller',language)}</span><ArrowRight size={15}/><span>{t('Core modules',language)}</span><ArrowRight size={15}/><span>{t('Project output',language)}</span></div><h3>{t('Core hardware BOM',language)} · {t(selectedKit.count,language)}</h3><div className="kit-dialog-bom">{selectedKit.parts.map((part,i)=><div key={part}><span className="mono">0{i+1}</span><b>{part}</b></div>)}</div><p className="disclosure-note">{t('Reference overview only. The schematic flow is illustrative; no downloadable wiring file or physical kit is connected.',language)}</p><button className="button button-primary" onClick={()=>{add({id:selectedKit.id,name:selectedKit.title,price:selectedKit.price,kind:'kit',sku:selectedKit.code});setSelectedKit(null)}} data-testid={`button-add-dialog-${selectedKit.id}`}><ShoppingCart size={15}/> {t('Add kit',language)} · {fmt(selectedKit.price)}</button></section></div>}
      <section className="section feature-section"><div className="container"><div className="eyebrow">{t('THE CIRCUITS KW KIT STANDARD',language)}</div><h2>{t('Why engineers build with our curated kits',language)}</h2><div className="guarantee-grid" style={{marginTop:22}}>{[['Zero missing silicon','A clearly itemized core BOM makes it easy to see what belongs on the bench.'],['Tested in-house in Kuwait','Bench-minded specifications and pinout details help guide your first connection.'],['Build Assist linked','Carry a kit idea into the locally generated demo BOM workflow.']].map(([title,desc])=><article className="surface guarantee-card" key={title}><span className="feature-icon"><CheckCircle2 size={20}/></span><h3>{t(title,language)}</h3><p>{t(desc,language)}</p></article>)}</div><p className="disclosure-note">{t('Kit contents, example pricing and operational descriptions are illustrative reference data, not a live offer or stock promise.',language)}</p></div></section>
  </>;
}

function BuildAssistPage({add}:{add:(item:AddItem)=>void}) {
  const {language}=useLanguage();
  useDocument(t('Build Assist',language),t('Create a local bill of materials from your project brief and price it with an authorized KWD CSV. Parts without a matching current price are marked unpriced.',language));
  const [prompt,setPrompt]=useState('I want to build an automated greenhouse monitor with soil moisture, solar battery charging, and WhatsApp alerts.');
  const [voltage,setVoltage]=useState('3.3V');
  const [level,setLevel]=useState('Hobbyist');
  const [budget,setBudget]=useState(15);
  const [assemblyOverride,setAssemblyOverride]=useState<number|null>(null);
  const [partQuantities,setPartQuantities]=useState<Record<string,number>>({});
  const [generated,setGenerated]=useState(false);
  const [notice,setNotice]=useState('');
  const [preview,setPreview]=useState<'wiring'|'code'|null>(null);
  const [priceList,setPriceList]=useState<PriceListState|null>(readSavedPriceList);
  const [priceSource,setPriceSource]=useState(()=>readSavedPriceList()?.source??'');
  const [priceUpdatedAt,setPriceUpdatedAt]=useState(()=>readSavedPriceList()?.updatedAt??'');
  const [priceFile,setPriceFile]=useState<File|null>(null);
  const [priceListMessage,setPriceListMessage]=useState('');
  useEffect(()=>{
    if(priceList) localStorage.setItem(PRICE_LIST_STORAGE_KEY,JSON.stringify(priceList));
    else localStorage.removeItem(PRICE_LIST_STORAGE_KEY);
  },[priceList]);
  useEffect(()=>{setAssemblyOverride(null);setPartQuantities({})},[prompt]);
  const plan=useMemo(()=>buildPlanFromPrompt(prompt,voltage,products),[prompt,voltage]);
  const bom=plan.parts.map(part=>({
    ...part,
    price:priceList?.pricesBySku[normalizePriceSku(part.sku)]??null,
  }));
  const assemblies=assemblyOverride??inferAssemblyCount(prompt);
  const quantityFor=(part:Pick<Product,'id'|'category'>)=>clampBuildQuantity(partQuantities[part.id]??inferPartQuantity(prompt,part));
  const pricedBom=bom.flatMap((part)=>part.price===null?[]:[{...part,price:part.price}]);
  const unpricedBom=bom.filter((part)=>part.price===null);
  const total=calculateBomTotal(
    pricedBom.map(part=>({unitPrice:part.price,quantityPerAssembly:quantityFor(part)})),
    assemblies,
  );
  const projectTitle=plan.projectTitleKey;
  const controller=bom.find(part=>['esp32','nucleo','pico'].includes(part.id));
  const bomName=(product:{name:string})=>product.name;
  const generate=()=>{
    if(prompt.trim().length<8){setNotice(t('Add a little more detail to describe your hardware idea.',language));return}
    setGenerated(true);
    setNotice(priceList?t('Estimate recalculated from imported price list and requested quantities.',language):t('Parts list refreshed. Import current KWD prices to calculate the estimate.',language));
  };
  const addBom=()=>{
    const items=buildBomCartItems(bom,quantityFor,assemblies);
    items.forEach(add);
    setNotice(items.length?t('Priced BOM items added to your cart. Unpriced parts were skipped.',language):t('No priced BOM items are available to add. Import current KWD prices first.',language));
  };
  const importPriceList=async()=>{
    if(!priceFile){setPriceListMessage(t('Choose a CSV price file first.',language));return}
    if(!priceSource.trim()||!priceUpdatedAt){setPriceListMessage(t('Enter the supplier or price-list source and its last-updated date.',language));return}
    try{
      const imported=parseAuthorizedPriceCsv(await priceFile.text());
      setPriceList({...imported,source:priceSource.trim(),updatedAt:priceUpdatedAt});
      setPriceListMessage(t('Price list imported successfully.',language));
      setPriceFile(null);
    }catch(error){
      setPriceListMessage(error instanceof Error?error.message:t('Could not read this CSV price list.',language));
    }
  };
  return <div className="container page-top">
    <div className="eyebrow">{t('LOCAL PROJECT PLANNER · KUWAIT',language)}</div>
    <h1 style={{fontSize:'clamp(33px,4vw,48px)'}}>{t('Build Assist:',language)} <span style={{color:'#00687b'}}>{t('describe your idea.',language)}</span></h1>
    <p className="lead">{t('A local demo tool that maps a project brief to a sample parts list. It is not an AI service, live inventory check or engineering review.',language)}</p>
    <div className="tag" style={{margin:'13px 0 20px'}}><Info size={13}/> {t('Demo parts and sample stock · Build Assist prices require your current KWD price CSV · verify electrical compatibility independently',language)}</div>
    <div className="assist-layout">
      <section>
        <div className="assist-form surface">
          <div className="eyebrow">{t('PROJECT SPECIFICATION',language)}</div>
          <div className="assist-section">
            <label htmlFor="project-prompt">{t('What are you building?',language)}</label>
            <textarea id="project-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={500} placeholder={t('Describe sensors, controllers, communication needs or constraints…',language)} data-testid="input-build-prompt"/>
            <div className="mono" style={{textAlign:'right',fontSize:9,color:'#7c8991',marginTop:5}} data-testid="text-prompt-count">{prompt.length} / 500</div>
          </div>
          <div className="assist-section">
            <label>{t('Quick project starters',language)}</label>
            <div className="preset-row">{[['Greenhouse','Automated greenhouse monitor with soil moisture, solar charging, and alerts'],['Parking sensor','Arduino-compatible parking sensor with distance alerts'],['Line follower','Two-motor line follower robot with IR sensor array'],['Weather node','Wi-Fi weather node measuring pressure and humidity']].map(([name,value])=><button type="button" className="preset" key={name} onClick={()=>setPrompt(value)} data-testid={`preset-${name.toLowerCase().replace(' ','-')}`}>{t(name,language)}</button>)}</div>
          </div>
          <div className="assist-section">
            <label>{t('Target logic voltage',language)}</label>
            <div className="segmented">{['3.3V','5V','12V'].map(v=><button type="button" className={voltage===v?'active':''} key={v} onClick={()=>setVoltage(v)} data-testid={`button-voltage-${v.replace('.','-')}`}>{v}<br/><small>{t(v==='3.3V'?'MCU native':v==='5V'?'TTL logic':'actuator rail',language)}</small></button>)}</div>
          </div>
          <div className="assist-section">
            <label>{t('Builder context',language)}</label>
            <div className="segmented">{['Hobbyist','University','Industrial'].map(v=><button type="button" className={level===v?'active':''} key={v} onClick={()=>setLevel(v)} data-testid={`button-level-${v.toLowerCase()}`}>{t(v,language)}</button>)}</div>
          </div>
          <div className="assist-section">
            <label htmlFor="assembly-count">{t('Number of assemblies',language)}</label>
            <input className="assist-number-input" id="assembly-count" type="number" min="1" max="99" step="1" value={assemblies} onChange={e=>setAssemblyOverride(clampBuildQuantity(Number(e.target.value)))} aria-label={t('Number of assemblies',language)} data-testid="input-assembly-count"/>
            <p className="assist-input-hint">{t('Counts such as “3 devices” and “2 sensors” are read from the brief; adjust them here or in the parts list.',language)}</p>
          </div>
          <div className="assist-section">
            <div className="range-line"><label htmlFor="budget-range" style={{margin:0}}>{t('Maximum BOM budget',language)}</label><strong data-testid="text-budget-value">{fmt(budget)}</strong></div>
            <input type="range" id="budget-range" min="3" max="45" step=".5" value={budget} onChange={e=>setBudget(Number(e.target.value))} data-testid="input-budget"/>
            <div className="range-line" style={{color:'#849099',marginTop:4}}><span>3.000 KWD</span><span>45.000 KWD</span></div>
          </div>
          <button className="button button-primary" style={{width:'100%',height:48}} onClick={generate} data-testid="button-generate-bom"><CircuitBoard size={17}/> {t('Generate local demo BOM',language)}</button>
          <p className="mono" style={{textAlign:'center',fontSize:9,color:'#6b7880',margin:'10px 0 0'}}>{t('Rule-based local sample · no external service or live stock check',language)}</p>
          {notice&&<p role="status" className="tag" style={{marginTop:12}} data-testid="status-build-assist">{notice}</p>}
        </div>
        <div className="surface" style={{padding:15,marginTop:14,background:'#e8f1fb'}}>
          <div style={{display:'flex',gap:12,alignItems:'center'}}><span className="feature-icon" style={{margin:0,background:'white'}}><LifeBuoy size={20}/></span><div><strong style={{fontSize:12}}>{t('Need a local lab review?',language)}</strong><p style={{fontSize:11,color:'#566776',margin:'4px 0 0'}}>{t('Review the Shuwaikh operations concept and Kuwait-local details.',language)}</p></div></div>
          <Link href="/about#hub" className="button button-outline small-button" style={{marginTop:12}} data-testid="link-about-lab">{t('About the Kuwait hub',language)} <ArrowRight size={13}/></Link>
        </div>
      </section>
      <section className="bom-panel surface" aria-label={t('Demo bill of materials',language)} data-testid="panel-demo-bom">
        <div className="assist-output-head">
          <div><div className="eyebrow" style={{color:'#9a4600'}}>{t('SAMPLE OUTPUT · NOT VERIFIED',language)}</div><h2>{t(projectTitle,language)}</h2><p>{generated?prompt:t('Preview a local mapping from the project brief. No external service is involved.',language)}</p></div>
          <span className="demo-stamp">{t('LOCAL DEMO',language)}</span>
        </div>
        <div className="diagram">
          <div className="diagram-label"><span>{t('Illustrative connection flow',language)}</span><span>{voltage} {t('logic target',language)}</span></div>
          <div className="diagram-flow"><div className="diagram-node">{plan.isSolar?t('Solar PV',language):t('Power',language)}<br/>{t('source',language)}</div><ArrowRight className="diagram-arrow" size={18}/><div className="diagram-node core">{t(controller?.name??'ESP32-WROOM-32D',language)}<br/>{t('controller',language)}</div><ArrowRight className="diagram-arrow" size={18}/><div className="diagram-node">{plan.isGreenhouse?t('Soil capacitive',language):t('Sensor',language)}<br/>{t('module',language)}</div></div>
        </div>
        <div className="check-grid">
          <div className="check-card"><CheckCircle2 size={16} color="#007b91"/><b>{t('Logic target',language)}</b><span>{voltage} {t('selected',language)}</span></div>
          <div className="check-card"><Gauge size={16} color="#007b91"/><b>{t('Budget target',language)}</b><span>{fmt(budget)}</span></div>
          <div className="check-card"><GraduationCap size={16} color="#007b91"/><b>{t('Context',language)}</b><span>{t(level,language)}</span></div>
        </div>
        <div className="bom-title"><span>{t('Suggested demo bill of materials',language)}</span><span className="mono">{bom.length} {t('items',language)}</span></div>
        <div className="bom-calculation-note">{t('Calculated as imported unit price × quantity per assembly × number of assemblies. Only priced parts are included.',language)}</div>
        <div>{bom.map((part,index)=>{
          const quantity=quantityFor(part);
          const lineTotal=part.price===null?null:calculateBomLineTotal(part.price,quantity,assemblies);
          return <div className="bom-row" key={part.id} data-testid={`row-bom-${part.id}`}>
            <span className="mono bom-index">{String(index+1).padStart(2,'0')}</span>
            <div><div className="bom-name">{t(bomName(part),language)}</div><div className="bom-spec">{part.voltage} · {part.interface} · SKU {part.sku}</div><div className="bom-unit-price">{t('Unit cost',language)}: {part.price===null?<strong data-testid={`text-unpriced-${part.id}`}>{t('Unpriced',language)}</strong>:fmt(part.price)}</div></div>
            <div className="bom-line-controls">
              <label className="bom-quantity-label" htmlFor={`quantity-${part.id}`}>{t('Qty / assembly',language)}</label>
              <input id={`quantity-${part.id}`} className="bom-quantity-input" type="number" min="1" max="99" step="1" value={quantity} onChange={e=>setPartQuantities(current=>({...current,[part.id]:clampBuildQuantity(Number(e.target.value))}))} aria-label={`${t('Qty / assembly',language)} ${t(part.name,language)}`} data-testid={`input-part-quantity-${part.id}`}/>
              <strong className="bom-line-total" data-testid={`text-line-total-${part.id}`}>{lineTotal===null?'—':fmt(lineTotal)}</strong>
              <span className="bom-line-count">{quantity*assemblies} {t('total units',language)}</span>
            </div>
          </div>;
        })}</div>
        <section className="surface" aria-label={t('Import current part prices',language)} style={{padding:14,marginTop:16,background:'#f7fafc'}} data-testid="panel-price-list-import">
          <div className="filter-title">{t('Use your current KWD prices',language)}</div>
          <p className="bom-calculation-note" style={{margin:'6px 0 12px'}}>{t('Import an authorized supplier CSV. Required columns: sku and price (or unit_price); optional currency values must be KWD. Unmatched SKUs stay unpriced.',language)}</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:10}}>
            <label>{t('Supplier or price-list source',language)}<input className="assist-number-input" style={{display:'block',width:'100%',maxWidth:'none',marginTop:5}} value={priceSource} onChange={e=>setPriceSource(e.target.value)} placeholder={t('Supplier name or price list',language)} data-testid="input-price-source"/></label>
            <label>{t('Price list last updated',language)}<input className="assist-number-input" style={{display:'block',width:'100%',maxWidth:'none',marginTop:5}} type="date" value={priceUpdatedAt} onChange={e=>setPriceUpdatedAt(e.target.value)} data-testid="input-price-updated-at"/></label>
          </div>
          <label style={{display:'block',fontSize:10,color:'#53636d',marginBottom:10}}>{t('CSV price file',language)}
            <input style={{display:'block',width:'100%',marginTop:5,fontSize:11}} type="file" accept=".csv,text/csv" onChange={e=>setPriceFile(e.target.files?.[0]??null)} data-testid="input-price-csv"/>
          </label>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            <button className="button button-primary small-button" type="button" onClick={importPriceList} data-testid="button-import-price-csv"><Upload size={14}/>{t('Import price CSV',language)}</button>
            {priceList&&<button className="button button-outline small-button" type="button" onClick={()=>{setPriceList(null);setPriceSource('');setPriceUpdatedAt('');setPriceListMessage(t('Saved price list removed.',language))}} data-testid="button-clear-price-list">{t('Remove saved price list',language)}</button>}
          </div>
          {priceListMessage&&<p role="status" className="bom-calculation-note" style={{margin:'9px 0 0'}} data-testid="status-price-list">{priceListMessage}</p>}
        </section>
        <div className="bom-total"><span>{t('Priced parts subtotal',language)} · {assemblies} {t('assemblies',language)}</span><span className="mono" data-testid="text-build-assist-total">{pricedBom.length?fmt(total):'—'}</span></div>
        <div className="bom-calculation-note" data-testid="text-price-source">{priceList?<><strong>{t('Price source:',language)}</strong> {priceList.source} · <strong>{t('Last updated:',language)}</strong> {priceList.updatedAt}</>:t('No current price list loaded. Import a dated, authorized CSV to calculate costs.',language)}</div>
        {unpricedBom.length>0&&<div className="notice" data-testid="notice-unpriced-parts"><strong>{t('Unpriced parts excluded from subtotal:',language)}</strong> {unpricedBom.map(part=>`${part.name} (${part.sku})`).join(', ')}</div>}
        {plan.unpricedRequirements.length>0&&<div className="notice" data-testid="notice-unpriced-requirements"><strong>{t('Not included in parts subtotal:',language)}</strong> {plan.unpricedRequirements.map(requirement=>t(requirement,language)).join(', ')}</div>}
        {pricedBom.length>0&&total>budget&&<div className="notice" data-testid="notice-over-budget">{t('This priced-parts subtotal is above your stated budget. Review quantities or choose alternative parts before purchase.',language)}</div>}
        {plan.isSolar&&<div className="notice"><strong>{t('Solar charging note:',language)}</strong> {t('Keep panel open-circuit voltage at or below 6V when paired with the TP4056 sample module. Reference design suggests a 5V, 1–2W solar cell. This is not a validated design; verify charging, protection and thermal behavior independently.',language)}</div>}
        <div className="notice"><strong>{t('Electrical safety:',language)}</strong> {t('These suggestions are illustrative only. Check voltage, current, wiring and datasheets for your specific design before powering hardware.',language)}</div>
        <div className="assist-output-actions">
          <button className="button button-outline small-button" onClick={()=>setPreview(preview==='wiring'?null:'wiring')} data-testid="button-preview-wiring"><CircuitBoard size={14}/> {t('Wiring diagram',language)}</button>
          <button className="button button-outline small-button" onClick={()=>setPreview(preview==='code'?null:'code')} data-testid="button-preview-code"><BookOpen size={14}/> {t('Starter code preview',language)}</button>
        </div>
        {preview&&<div className="preview-panel" role="region" aria-label={t(preview==='wiring'?'Local wiring preview':'Local starter code preview',language)}>
          <div className="preview-panel-head"><strong>{t(preview==='wiring'?'Connection notes':'Starter-code outline',language)}</strong><button className="icon-button" aria-label={t('Close preview',language)} onClick={()=>setPreview(null)}><X size={15}/></button></div>
          {preview==='wiring'?<p>{t(controller?.name??'ESP32-WROOM-32D',language)} inputs connect to the selected sensor modules following their datasheets. Power components shown in the BOM require independent compatibility checks; this is illustrative only, not a generated schematic.</p>:<pre>{`# Local example outline — not downloadable firmware\nread_sensor()\ncheck_threshold()\nnotify_placeholder()  # no messaging service connected`}</pre>}
        </div>}
        <button className="button button-primary" style={{width:'100%'}} onClick={addBom} disabled={!pricedBom.length} data-testid="button-add-bom-cart"><ShoppingCart size={16}/> {t('Add priced BOM items to cart',language)} · {pricedBom.length?fmt(total):'—'}</button>
      </section>
    </div>
    <div className="assist-delivery-reference"><div><span className="eyebrow">{t('KUWAIT DELIVERY REFERENCE',language)}</span><strong>{t('Same-day dispatch concept · 15:00 AST cutoff',language)}</strong><span>{t('Source reference mentions a Shuwaikh hub. No courier, delivery or pickup service is currently connected.',language)}</span></div><Link href="/about#delivery" className="button button-outline small-button" data-testid="link-assist-delivery">{t('View sample zones',language)} <ArrowRight size={13}/></Link></div>
  </div>;
}

function AboutPage() {
  const {language}=useLanguage();
  useDocument(t('About Circuits KW',language),t('Kuwait-focused hardware catalog and illustrative local operations details from Circuits KW.',language));
  const pillars=[['100% Genuine OEM Components','A reference for sourcing from franchised distributors and avoiding gray-market, refurbished or counterfeit silicon.'],['Lab-Verified Datasheets & Pinouts','Every sensor, development board and logic shifter is specified with the measurements and pinout details a build needs.'],['Same-Day Local Dispatch','A sample Kuwait dispatch workflow illustrates the 15:00 AST cutoff and a local pickup concept; no courier service is connected.'],['Maker & University Support','A place for student projects, capstones, university lab requirements and local hardware teams.']];
  return <>
     <section className="about-hero"><div className="container"><div className="eyebrow">{t('STATE OF KUWAIT · HARDWARE & LOCAL OPERATIONS',language)}</div><div className="about-grid"><div><h1>{t('Fueling hardware innovation in Kuwait — from university labs to commercial prototypes.',language)}</h1><p className="lead">{t('Circuits KW brings components, project kits and useful engineering detail together for makers, engineering students and hardware teams in Kuwait. This frontend is a locally interactive storefront demo: pricing, stock and all operating details are illustrative.',language)}</p><span className="mono" style={{fontSize:10,color:'#64727d'}}>{t('LOCAL-FIRST · KWD · ENGLISH / العربية-READY',language)}</span></div><div className="about-stats surface"><div className="filter-title">{t('Kuwait operations reference',language)}</div><div className="stat-pair"><div><strong>Shuwaikh</strong><span>{t('Example hub location',language)}</span></div><div><strong>AST +03</strong><span>{t('Kuwait local time',language)}</span></div></div><span className="mono">{t('No account, shipping service, payment or live inventory is connected.',language)}</span></div></div>
       <div className="photo-strip"><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAOTORl_9CZpLmAwLhwVfBFB5ybinplJ3eM55r1M3DB4wK4b__OijqgC13WzPx7prHaXyIn3LVD74MEVX4lbJclBczJwnnSDJ31wQEMQTbupW9DM0WWW-h-LXxhPxSYsf0XU8Qu9e51ulGkefIzX4IMY3FYTRAn8N0ms2n5afBPDXzEGT7qFQ1NtJlyNnuNux_lsjfhhxf9iLZwfSAGI00TZb6uq5HYff0YVW8jOLws7qvRhI91LPeGtg" alt="" loading="lazy"/><div className="photo-caption"><span>{t('Local engineering context',language)}</span><b>{t('Test-bench thinking',language)}</b></div></div><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBent9Os7OUsL5ECe-pfG3Oq-_zTnZEr1c_pC8299wpEF8XlcsXukh-lOfP0n5kQeFikYA0gsAKNZ3eKBaHYj3uWEJyoPIQS9fhQMIRSWOgNrMCfeFVnFrbrGzT0hfu6_JdQP3r3tYVFXz3CLcbKNu3pAXBsz9G-l0szXlPSPoGf4ot5LOnkO_ARQb8tCvAgUkkFhWhsWdIt16cjkkXxdYfZ7487xGWc8qMKy3cw50A4SFP0IjgA5X1ZQ" alt="" loading="lazy"/><div className="photo-caption"><span>{t('Parts organization',language)}</span><b>{t('Ready for the workbench',language)}</b></div></div><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDPST6SmLa4prqF2kH9-dLdulQoTHGwTkYaFiJhhQhet5MFJLjY8IK-HNA7FCsaz0esaijTWJB6RbiQ7pfwHodNHq6KSwvK59ovbvxBnf2qUptZz6_-LJdDcbXlYwffjTyc85DgWqvH8NNmoD5400DiXPv57LmO0M-A80qeIcmV4vKVt8DHm_CTZbZUYRPJlUcwwGuwS6GMPNKxqSjf0z1-p1fAGQZQsueCLqdlVrqV0xEdoaxHsI-PWw" alt="" loading="lazy"/><div className="photo-caption"><span>{t('Academia & makers',language)}</span><b>{t('Capstone build support',language)}</b></div></div></div>
    </div></section>
     <section className="section" id="delivery"><div className="container mission-layout"><div><div className="eyebrow">{t('SECTION 01 // CORE MISSION',language)}</div><h2>{t('Bridging the hardware latency gap across Kuwait.',language)}</h2><p className="lead" style={{fontSize:14}}>{t('For years, developing embedded systems or testing PCB revisions in Kuwait could mean overseas orders, high freight costs and long waits—with uncertainty about footprints, pinouts or part authenticity.',language)}</p><p style={{fontSize:13,lineHeight:1.7,color:'#576671'}}><strong>Circuits KW</strong> {t('is organized around the idea of keeping useful engineering detail and local hardware discovery closer to the workbench. Local fulfillment and counter collection are reference concepts in this demo, not active services.',language)}</p><div className="arabic-note" dir={language==='ar'?'rtl':'ltr'} lang={language}><strong style={{color:'#00687b'}}>{t('Our mission in Kuwait',language)}</strong><p style={{fontSize:13,margin:'6px 0 0'}}>{t('Enable engineers, makers and university students in Kuwait with clear information about electronic parts, project kits and KWD pricing.',language)}</p></div></div>
       <div className="surface" style={{padding:19}}><div className="eyebrow">{t('KUWAIT DELIVERY OVERVIEW · REFERENCE ONLY',language)}</div><h3 style={{margin:'11px 0 5px'}}>{t('Kuwait Same-Day Dispatch Map',language)}</h3><p style={{fontSize:11,color:'#67747e',marginBottom:15}}>{t('Illustrative route zones and time windows from the reference concept. This website has no connected courier, route or order data. Reference cutoff: 15:00 AST.',language)}</p><div className="coverage-grid">{[['Capital & Hawalli','Sharq · Shuwaikh · Jabriya · Hawalli · Salmiya','~2–3 hours · sample evening express'],['Ahmadi & Mubarak','Fintas · Egaila · Mahboula · Mangaf · Sabah Al-Salem','Same afternoon · sample scheduled route'],['Jahra & outlying','Jahra · Saad Al-Abdullah · Amghara · Sulaibiya','18:00 route · illustrative timing']].map(([a,b,c])=><div className="coverage-card surface" key={a}><strong>{t(a,language)}</strong><p>{t(b,language)}</p><span>{t(c,language)}</span></div>)}</div><div className="sample-performance"><div><strong>99.4%</strong><span>{t('sample on-schedule reference figure',language)}</span></div><div className="sample-bar"><i/></div><p>{t('Reference split: 94.0% same-night · 5.4% hub pickup within 45 minutes · 0.6% next morning. Illustrative figures, not live service statistics.',language)}</p></div><div style={{marginTop:13,padding:12,background:'#f2f5f7',borderRadius:7,fontSize:11,color:'#51616d'}}><Truck size={14} style={{verticalAlign:'middle',marginRight:6}}/>{t('Shuwaikh pickup and courier logistics are reference details, not a connected fulfillment service.',language)}</div></div>
    </div></section>
      <section className="section feature-section"><div className="container"><div className="eyebrow">{t('SECTION 02 // ENGINEERING ASSURANCE',language)}</div><h2>{t('The Four Circuits KW Pillars',language)}</h2><div className="pillar-grid" style={{marginTop:20}}>{pillars.map(([title,desc],i)=><article className="surface pillar-card" key={title}><span className="feature-icon"><span className="mono">0{i+1}</span></span><h3>{t(title,language)}</h3><p>{t(desc,language)}</p><span className="mono" style={{fontSize:9,color:'#007b91'}}>{t('CIRCUITS KW / FIELD NOTE',language)}</span></article>)}</div></div></section>
      <section className="section" id="hub"><div className="container"><div className="eyebrow">{t('SECTION 03 // PHYSICAL COUNTER & FACILITY',language)}</div><h2>{t('Shuwaikh Hub & Operations',language)}</h2><p className="disclosure-note">{t('All counter, contact, courier and partner details below are source-reference concepts only. No physical hub, support desk, partnership, fulfillment or payment integration is connected by this demo.',language)}</p><div className="mission-layout" style={{marginTop:20}}><div style={{display:'grid',gap:12}}><article className="surface" style={{padding:17}}><h3><MapPin size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>{t('Physical hub & express pickup',language)}</h3><p style={{fontSize:12,color:'#61717d',lineHeight:1.6,margin:0}}>{t('Reference address: Industrial Shuwaikh, Block 1, Street 14, Kuwait. The source concept includes a counter, anti-static packing area and inspection benches; these are not live facilities.',language)}</p><span className="ops-chip">{t('Reference zone · Industrial 1',language)}</span></article><article className="surface" style={{padding:17}}><h3><Gauge size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>{t('Lab hours concept',language)}</h3><div className="summary-line"><span>{t('Saturday – Thursday',language)}</span><strong>09:00–21:00 AST</strong></div><div className="summary-line"><span>{t('Friday',language)}</span><strong>{t('Closed · restock reference',language)}</strong></div></article><article className="surface" style={{padding:17}}><h3><LifeBuoy size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>{t('Technical contact lines',language)}</h3><p style={{fontSize:12,color:'#61717d',margin:0}}>{t('Customer desk and BOM submission channels are included in the reference concept but intentionally not published as working contact details here.',language)}</p></article></div><div className="map-panel" aria-label={t('Illustrative Kuwait local delivery map',language)}><div className="map-route"/><span className="map-pin one"/><span className="map-pin two"/><span className="map-pin three"/><span className="tag" style={{position:'absolute',top:13,left:13}}><MapPin size={12}/> {t('KUWAIT · ROUTE ILLUSTRATION',language)}</span><span className="mono" style={{position:'absolute',bottom:14,right:14,fontSize:10,color:'#536972'}}>{t('SHUWAIKH HUB → GOVERNORATES',language)}</span></div></div><div className="partner-note">{t('University and maker-lab names in the supplied concept (Kuwait University, AUM, GUST, KFAS and PAAET) are shown for context only; no institutional affiliation is implied.',language)}</div></div></section>
  </>;
}

function CartPage({items,update,remove}:{items:Item[];update:(id:string,qty:number)=>void;remove:(id:string)=>void}) {
  const {language}=useLanguage();
  useDocument(t('Shopping cart',language),t('Review and update your local Circuits KW cart. Demo orders are saved only in this browser; no payment is taken.',language));
  const subtotal=calculateCartSubtotal(items);
  return <div className="container page-top"><div className="eyebrow">{t('YOUR BUILD / LOCAL CART',language)}</div><h1 style={{fontSize:38}}>{t('Cart review',language)}</h1><p className="lead" style={{fontSize:14}}>{t('You can place a local demo order. No payment, shipping or real fulfillment is connected.',language)}</p>
    {!items.length?<div className="surface empty-state"><div className="empty-icon"><ShoppingCart size={23}/></div><h3>{t('Your cart is ready for a build.',language)}</h3><p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>{t('Add components, a project kit or a demo BOM to keep your parts list together.',language)}</p><div style={{display:'flex',justifyContent:'center',gap:9,flexWrap:'wrap'}}><Link className="button button-primary" href="/components" data-testid="link-empty-cart-components">{t('Browse components',language)}</Link><Link className="button button-outline" href="/project-kits" data-testid="link-empty-cart-kits">{t('Explore kits',language)}</Link></div></div>:
      <div className="cart-layout"><section className="cart-list surface" aria-label={t('Cart items',language)}>{items.map(i=><article className="cart-row" key={i.id} data-testid={`row-cart-${i.id}`}><div className="cart-product"><span className="cart-thumb">{i.kind==='kit'?<PackageCheck size={22}/>:i.kind==='bom'?<CircuitBoard size={22}/>:<Cpu size={22}/>}</span><span><strong>{t(i.name,language)}</strong><span>{i.sku} · {t(i.kind==='kit'?'Project kit':i.kind==='bom'?'Build Assist demo item':'Component',language)}</span></span></div><div className="quantity" aria-label={`${t('Quantity',language)} ${t(i.name,language)}`}><button aria-label={t('Decrease quantity',language)} onClick={()=>update(i.id,i.qty-1)} data-testid={`button-decrease-${i.id}`}><Minus size={12}/></button><input aria-label={`${t('Quantity',language)} ${t(i.name,language)}`} type="number" min="1" value={i.qty} onChange={e=>update(i.id,Math.max(1,Number(e.target.value)||1))} data-testid={`input-quantity-${i.id}`}/><button aria-label={t('Increase quantity',language)} onClick={()=>update(i.id,i.qty+1)} data-testid={`button-increase-${i.id}`}><Plus size={12}/></button></div><span className="price">{fmt(i.price*i.qty)}</span><button className="remove" aria-label={`${t('Remove',language)} ${t(i.name,language)}`} onClick={()=>remove(i.id)} data-testid={`button-remove-${i.id}`}><Trash2 size={16}/></button></article>)}</section>
        <aside className="summary-card surface"><div className="eyebrow">{t('CART SUMMARY',language)}</div><div className="summary-line"><span>{t('Items',language)}</span><strong>{items.reduce((n,i)=>n+i.qty,0)}</strong></div><div className="summary-line"><span>{t('Subtotal',language)}</span><strong className="mono">{fmt(subtotal)}</strong></div><div className="summary-line"><span>{t('Delivery',language)}</span><span>{t('Not connected',language)}</span></div><div className="summary-line summary-total"><span>{t('Estimated total',language)}</span><span className="mono">{fmt(subtotal)}</span></div><p style={{fontSize:10,lineHeight:1.5,color:'#6c7880'}}>{t('Demo orders are saved in this browser only. No payment or fulfillment is connected.',language)}</p><Link className="button button-primary" style={{width:'100%'}} href="/checkout" data-testid="link-checkout"><ArrowRight size={14}/> {t('Continue to checkout',language)}</Link><Link className="button button-outline" style={{width:'100%',marginTop:8}} href="/components" data-testid="link-continue-shopping"><ArrowDown size={14}/> {t('Continue shopping',language)}</Link><button className="button button-quiet" style={{width:'100%',marginTop:8}} onClick={()=>items.forEach(i=>remove(i.id))} data-testid="button-clear-cart"><Trash2 size={14}/> {t('Clear cart',language)}</button></aside>
      </div>}
  </div>;
}

function CheckoutFieldError({field,message}:{field:string;message?:string}) {
  return message?<small className="checkout-field-error" id={`checkout-error-${field}`} data-testid={`error-checkout-${field}`}>{message}</small>:null;
}

function checkoutFieldError(field:string,value:string):string|undefined {
  switch(field){
    case 'name':
      if(!value) return 'Enter your full name.';
      if(value.length<2) return 'Enter your full name using at least 2 characters.';
      return;
    case 'email':
      if(!value) return 'Enter your email address.';
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'Enter a valid email address, such as name@example.com.';
      return;
    case 'phone': {
      if(!value) return 'Enter your phone number.';
      const westernDigits=value.replace(/[٠-٩]/g,digit=>String(digit.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,digit=>String(digit.charCodeAt(0)-0x6f0));
      const digits=westernDigits.replace(/\D/g,'');
      if(!/^(?:\d{8}|965\d{8})$/.test(digits)) return 'Use 8 digits, or 965 followed by 8 digits.';
      return;
    }
    case 'governorate':
      return value?'':'Select a governorate.';
    case 'area':
      return value?'':'Enter your area.';
    case 'block':
      return value?'':'Enter your block.';
    case 'street':
      return value?'':'Enter your street.';
    case 'building':
      return value?'':'Enter your building or house number.';
    default:
      return;
  }
}

function CheckoutPage({items,clearCart}:{items:Item[];clearCart:()=>void}) {
  const {language}=useLanguage();
  useDocument(t('Checkout',language),t('Place a local Circuits KW demo order. Only the item summary is saved in this browser.',language));
  const [placedOrder,setPlacedOrder]=useState<DemoOrder|null>(null);
  const [orderError,setOrderError]=useState('');
  const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  useEffect(()=>{
    if(!placedOrder) return;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0,left:0,behavior:reducedMotion?'auto':'smooth'});
  },[placedOrder]);
  const subtotal=calculateCartSubtotal(items);
  const submitDemoOrder=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    setOrderError('');
    const form=event.currentTarget;
    const formData=new FormData(form);
    const value=(field:string)=>String(formData.get(field)??'').trim();
    const errors:Record<string,string>={};
    ['name','email','phone','governorate','area','block','street','building'].forEach(field=>{
      const message=checkoutFieldError(field,value(field));
      if(message) errors[field]=message;
    });
    setFieldErrors(errors);
    if(Object.keys(errors).length){
      setOrderError(t('Checkout couldn’t be completed. Fix the highlighted fields below.',language));
      const firstInvalid=form.elements.namedItem(Object.keys(errors)[0]);
      window.requestAnimationFrame(()=>{
        if(firstInvalid instanceof HTMLElement){
          firstInvalid.focus();
          firstInvalid.scrollIntoView({behavior:'smooth',block:'center'});
        }
      });
      return;
    }
    const order:DemoOrder={
      orderNumber:`CKW-DEMO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
      placedAt:new Date().toISOString(),
      items:items.map(item=>({...item})),
      subtotal,
    };
    try {
      const stored=localStorage.getItem('circuits-kw-demo-orders');
      const previous=stored?JSON.parse(stored) as DemoOrder[]:[];
      if(!Array.isArray(previous)) throw new Error('Saved demo orders are not a list.');
      localStorage.setItem('circuits-kw-demo-orders',JSON.stringify([order,...previous].slice(0,20)));
    } catch {
      setOrderError(t('This browser could not save the demo order. Your cart is unchanged; check local storage and try again.',language));
      return;
    }
    setPlacedOrder(order);
    clearCart();
  };
  if(placedOrder) return <div className="container page-top checkout-confirmation" data-testid="demo-order-confirmation">
    <div className="eyebrow">{t('DEMO ORDER PLACED · LOCAL ONLY',language)}</div>
    <div className="checkout-confirmation-card surface">
      <div className="checkout-confirmation-icon"><CheckCircle2 size={26}/></div>
      <h1>{t('Order placed.',language)}</h1>
      <p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>{t('Your demo order was saved in this browser. No real order was sent, and no payment was taken.',language)}</p>
      <div className="demo-order-number"><span>{t('DEMO ORDER NUMBER',language)}</span><strong data-testid="text-demo-order-number">{placedOrder.orderNumber}</strong><small>{new Date(placedOrder.placedAt).toLocaleString(language==='ar'?'ar-KW':'en-KW')}</small></div>
      <div className="demo-order-items">{placedOrder.items.map(item=><div key={item.id}><span>{t(item.name,language)} · {t('Qty',language)} {item.qty}</span><strong>{fmt(item.price*item.qty)}</strong></div>)}</div>
      <div className="summary-line summary-total"><span>{t('Demo total',language)}</span><span className="mono">{fmt(placedOrder.subtotal)}</span></div>
      <p className="checkout-order-disclaimer">{t('Only the item summary and total are saved locally. Your contact and address details were not stored or sent. Shipping and fulfillment are not connected.',language)}</p>
      <Link className="button button-primary" href="/components" data-testid="link-confirmation-shop">{t('Continue browsing',language)} <ArrowRight size={15}/></Link>
    </div>
  </div>;
  if(!items.length) return <div className="container page-top"><div className="eyebrow">{t('ORDER REVIEW · CHECKOUT PREVIEW',language)}</div><div className="surface empty-state"><div className="empty-icon"><ShoppingCart size={23}/></div><h3>{t('Your cart is empty.',language)}</h3><p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>{t('Add a component or project kit before starting checkout.',language)}</p><Link className="button button-primary" href="/components">{t('Browse components',language)}</Link></div></div>;
  return <div className="container page-top">
    <div className="checkout-heading"><div><div className="eyebrow">{t('ORDER REVIEW · LOCAL DEMO',language)}</div><h1>{t('Checkout',language)}</h1><p className="lead" style={{fontSize:13}}>{t('Place a sample order and get a demo receipt. Your contact and address details aren’t saved or sent.',language)}</p></div><span className="tag"><ShieldCheck size={13}/> {t('No payment connected',language)}</span></div>
    <form className="checkout-layout" noValidate onSubmit={submitDemoOrder} onChange={event=>{
      const changedTarget=event.nativeEvent.target;
      const field=changedTarget instanceof HTMLInputElement||changedTarget instanceof HTMLSelectElement||changedTarget instanceof HTMLTextAreaElement?changedTarget.name:'';
      if(field){
        const currentValue=String(new FormData(event.currentTarget).get(field)??'').trim();
        const message=checkoutFieldError(field,currentValue);
        setFieldErrors(current=>{
          if(current[field]===message) return current;
          const next={...current};
          if(message) next[field]=message;
          else delete next[field];
          return next;
        });
        setOrderError('');
      }
    }} data-testid="form-checkout">
      <div className="checkout-form-column">
        <section className="surface checkout-panel">
          <div className="checkout-section-heading"><span className="checkout-step">01</span><div><h2>{t('Contact details',language)}</h2><p>{t('How can we reach you about this preview?',language)}</p></div></div>
          <div className="checkout-fields">
            <label className="checkout-field"><span>{t('Full name',language)}</span><input name="name" type="text" autoComplete="name" placeholder={t('Your name',language)} required aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name?'checkout-error-name':undefined} data-testid="input-checkout-name"/><CheckoutFieldError field="name" message={fieldErrors.name?t(fieldErrors.name,language):undefined}/></label>
            <label className="checkout-field"><span>{t('Email address',language)}</span><input name="email" type="email" autoComplete="email" placeholder="name@example.com" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email?'checkout-error-email':undefined} data-testid="input-checkout-email"/><CheckoutFieldError field="email" message={fieldErrors.email?t(fieldErrors.email,language):undefined}/></label>
            <label className="checkout-field checkout-field-wide"><span>{t('Phone number',language)}</span><input name="phone" type="tel" autoComplete="tel" placeholder="+965" required aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone?'checkout-error-phone':undefined} data-testid="input-checkout-phone"/><CheckoutFieldError field="phone" message={fieldErrors.phone?t(fieldErrors.phone,language):undefined}/></label>
          </div>
        </section>
        <section className="surface checkout-panel">
          <div className="checkout-section-heading"><span className="checkout-step">02</span><div><h2>{t('Delivery address',language)}</h2><p>{t('Kuwait address details for this local preview.',language)}</p></div></div>
          <div className="checkout-fields">
            <label className="checkout-field"><span>{t('Governorate',language)}</span><select name="governorate" defaultValue="" required aria-invalid={Boolean(fieldErrors.governorate)} aria-describedby={fieldErrors.governorate?'checkout-error-governorate':undefined} data-testid="select-checkout-governorate"><option value="" disabled>{t('Select governorate',language)}</option><option>{t('Capital',language)}</option><option>{t('Hawalli',language)}</option><option>{t('Farwaniya',language)}</option><option>{t('Mubarak Al-Kabeer',language)}</option><option>{t('Ahmadi',language)}</option><option>{t('Jahra',language)}</option></select><CheckoutFieldError field="governorate" message={fieldErrors.governorate?t(fieldErrors.governorate,language):undefined}/></label>
            <label className="checkout-field"><span>{t('Area',language)}</span><input name="area" type="text" autoComplete="address-level2" placeholder={t('Area',language)} required aria-invalid={Boolean(fieldErrors.area)} aria-describedby={fieldErrors.area?'checkout-error-area':undefined} data-testid="input-checkout-area"/><CheckoutFieldError field="area" message={fieldErrors.area?t(fieldErrors.area,language):undefined}/></label>
            <label className="checkout-field"><span>{t('Block',language)}</span><input name="block" type="text" placeholder={t('Block number',language)} required aria-invalid={Boolean(fieldErrors.block)} aria-describedby={fieldErrors.block?'checkout-error-block':undefined} data-testid="input-checkout-block"/><CheckoutFieldError field="block" message={fieldErrors.block?t(fieldErrors.block,language):undefined}/></label>
            <label className="checkout-field"><span>{t('Street',language)}</span><input name="street" type="text" autoComplete="street-address" placeholder={t('Street name or number',language)} required aria-invalid={Boolean(fieldErrors.street)} aria-describedby={fieldErrors.street?'checkout-error-street':undefined} data-testid="input-checkout-street"/><CheckoutFieldError field="street" message={fieldErrors.street?t(fieldErrors.street,language):undefined}/></label>
            <label className="checkout-field"><span>{t('Building / house',language)}</span><input name="building" type="text" placeholder={t('Building number',language)} required aria-invalid={Boolean(fieldErrors.building)} aria-describedby={fieldErrors.building?'checkout-error-building':undefined} data-testid="input-checkout-building"/><CheckoutFieldError field="building" message={fieldErrors.building?t(fieldErrors.building,language):undefined}/></label>
            <label className="checkout-field"><span>{t('Floor / apartment',language)} <small>{t('Optional',language)}</small></span><input name="unit" type="text" placeholder={t('Floor or apartment',language)}/></label>
            <label className="checkout-field checkout-field-wide"><span>{t('Delivery notes',language)} <small>{t('Optional',language)}</small></span><textarea name="notes" rows={3} placeholder={t('Anything the courier should know?',language)}/></label>
          </div>
        </section>
        <section className="checkout-payment-note">
          <ShieldCheck size={18}/><div><strong>{t('Local demo order only',language)}</strong><p>{t('Submitting creates a browser-only receipt and clears the cart. No card details, payment or real fulfillment are involved.',language)}</p></div>
        </section>
        {orderError&&<div className="checkout-error" role="alert" data-testid="checkout-order-error">{orderError}</div>}
        <button type="submit" className="button button-primary checkout-submit" data-testid="button-place-demo-order">{t('Place demo order',language)} <ArrowRight size={15}/></button>
        <p className="checkout-privacy">{t('Contact and address fields stay in this page only. They aren’t stored or transmitted.',language)}</p>
      </div>
      <aside className="surface checkout-summary">
        <div className="eyebrow">{t('YOUR PARTS LIST',language)}</div><h2>{t('Order summary',language)}</h2>
        <div className="checkout-items">{items.map(item=><div className="checkout-item" key={item.id}><div><strong>{t(item.name,language)}</strong><span>{item.sku} · {t('Qty',language)} {item.qty}</span></div><b>{fmt(item.price*item.qty)}</b></div>)}</div>
        <div className="summary-line"><span>{t('Subtotal',language)}</span><strong className="mono">{fmt(subtotal)}</strong></div>
        <div className="summary-line"><span>{t('Delivery',language)}</span><span>{t('Not connected',language)}</span></div>
        <div className="summary-line summary-total"><span>{t('Estimated total',language)}</span><span className="mono">{fmt(subtotal)}</span></div>
        <p className="checkout-total-note">{t('KWD prices and stock are illustrative. Delivery fees are not included.',language)}</p>
        <Link className="checkout-edit-link" href="/cart">← {t('Edit cart',language)}</Link>
      </aside>
    </form>
  </div>;
}

function Shell({children, count, globalSearch, setGlobalSearch}:{children:ReactNode;count:number;globalSearch:string;setGlobalSearch:(v:string)=>void}) {
  return <><Header count={count} search={globalSearch} onSearch={setGlobalSearch}/><main>{children}</main><Footer/></>;
}

function RoutedErrorBoundary({children}:{children:ReactNode}) { const [location]=useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }

function Router({items,add,update,remove,clearCart,search,setSearch}:{items:Item[];add:(item:AddItem)=>void;update:(id:string,qty:number)=>void;remove:(id:string)=>void;clearCart:()=>void;search:string;setSearch:(v:string)=>void}) {
  const [location]=useLocation();
  const count=items.reduce((n,i)=>n+i.qty,0);
  useEffect(()=>{
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0,left:0,behavior:reducedMotion?'auto':'smooth'});
    if(reducedMotion||!('IntersectionObserver' in window)) return;
    const targets=Array.from(document.querySelectorAll<HTMLElement>('.section,.feature-card,.product-card,.kit-card,.checkout-panel,.checkout-summary,.assist-form,.assist-output,.empty-state'));
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },{threshold:0.12,rootMargin:'0px 0px -28px 0px'});
    targets.forEach((target,index)=>{
      target.classList.add('scroll-reveal');
      target.style.setProperty('--reveal-delay',`${(index%3)*55}ms`);
      observer.observe(target);
    });
    return ()=>observer.disconnect();
  },[location]);
  return <RoutedErrorBoundary><Shell count={count} globalSearch={search} setGlobalSearch={setSearch}><div className="page-transition" key={location}><Switch>
    <Route path="/" component={HomePage}/>
    <Route path="/components"><CatalogPage add={add} globalSearch={search}/></Route>
    <Route path="/project-kits"><KitsPage add={add}/></Route>
    <Route path="/build-assist"><BuildAssistPage add={add}/></Route>
    <Route path="/about"><AboutPage/></Route>
    <Route path="/cart"><CartPage items={items} update={update} remove={remove}/></Route>
    <Route path="/checkout"><CheckoutPage items={items} clearCart={clearCart}/></Route>
    <Route component={NotFound}/>
  </Switch></div></Shell></RoutedErrorBoundary>;
}

function App() {
  const [items,setItemsState]=useState<Item[]>(()=>{try{return JSON.parse(localStorage.getItem('circuits-kw-cart')||localStorage.getItem('voltiva-cart')||'[]') as Item[]}catch{return[]}});
  const [language,setLanguage]=useState<Language>(()=>localStorage.getItem('circuits-kw-language')==='ar'?'ar':'en');
  const [search,setSearch]=useState('');
  const [cartNotice,setCartNotice]=useState<{id:number;name:string}|null>(null);
  const cartNoticeId=useRef(0);
  useEffect(()=>{localStorage.setItem('circuits-kw-cart',JSON.stringify(items))},[items]);
  useEffect(()=>{
    localStorage.setItem('circuits-kw-language',language);
    document.documentElement.lang=language;
    document.documentElement.dir=language==='ar'?'rtl':'ltr';
  },[language]);
  useEffect(()=>{
    if(!cartNotice) return;
    const timer=window.setTimeout(()=>setCartNotice(null),2200);
    return ()=>window.clearTimeout(timer);
  },[cartNotice?.id]);
  const add=(item:AddItem)=>{
    setItemsState(old=>addCartItem(old,item));
    cartNoticeId.current+=1;
    setCartNotice({id:cartNoticeId.current,name:item.name});
  };
  const update=(id:string,qty:number)=>setItemsState(old=>qty<=0?old.filter(x=>x.id!==id):old.map(x=>x.id===id?{...x,qty}:x));
  const remove=(id:string)=>setItemsState(old=>old.filter(x=>x.id!==id));
  const clearCart=()=>setItemsState([]);
  return <LanguageProvider language={language} setLanguage={setLanguage}><div lang={language} dir={language==='ar'?'rtl':'ltr'}><QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router items={items} add={add} update={update} remove={remove} clearCart={clearCart} search={search} setSearch={setSearch}/>{cartNotice&&<div key={cartNotice.id} className="cart-toast" role="status" aria-live="polite" data-testid="cart-add-feedback"><span className="cart-toast-icon"><CheckCircle2 size={17}/></span><span className="cart-toast-copy"><strong>{t('Added to cart',language)}</strong><span>{t(cartNotice.name,language)}</span></span><Link href="/cart" className="cart-toast-link" data-testid="link-cart-feedback">{t('View cart',language)} <ArrowRight size={13}/></Link></div>}</WouterRouter><Toaster/></TooltipProvider></QueryClientProvider></div></LanguageProvider>;
}

export default App;

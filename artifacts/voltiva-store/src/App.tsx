import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { LanguageProvider, t, useLanguage, type Language } from './i18n';
import {
  ArrowDown, ArrowRight, BatteryCharging, BookOpen, Bot,
  CheckCircle2, CircuitBoard, Cpu, Gauge, GraduationCap, Grid2X2,
  Info, Layers, LifeBuoy, MapPin, Menu, Minus, PackageCheck, Plus,
  Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Trash2, Truck, Wifi, X,
} from 'lucide-react';

type Item = { id: string; name: string; price: number; kind: 'component' | 'kit' | 'bom'; sku: string; qty: number };
type DemoOrder = { orderNumber:string; placedAt:string; items:Item[]; subtotal:number };
type Product = { id: string; name: string; sku: string; category: string; price: number; stock: number; package: string; description: string; voltage: string; interface: string; icon: 'cpu' | 'sensor' | 'power' | 'display' | 'board' | 'parts'; };
type Kit = { id: string; code:string; title: string; category: string; level: 'Beginner' | 'Intermediate' | 'Advanced' | 'All levels'; domain: string; duration: string; price: number; desc: string; parts: string[]; count:string; manual:string; icon: 'weather' | 'robot' | 'energy' | 'lab' | 'plant' | 'logic'; };

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
  return <Link href="/" className="brand" data-testid="link-home" aria-label="Circuits KW home">
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

function ProductCard({ product, add }:{product:Product;add:(item:Omit<Item,'qty'>)=>void}) {
  const [expanded,setExpanded]=useState(false);
  const [animateDescription,setAnimateDescription]=useState(false);
  const detailsId=`product-description-${product.id}`;
  const descriptionWords=product.description.trim().split(/\s+/);
  const shortDescription=descriptionWords.slice(0,3).join(' ');
  const hasMoreDescription=descriptionWords.length>3;
  return <article className="product-card surface" data-testid={`card-product-${product.id}`}>
    <ProductArt icon={product.icon} id={product.id}/>
    <div className="product-content">
      <div className="product-meta"><span>{product.stock>0?`${product.stock} sample units`:'No sample stock'}</span><span>{product.package}</span></div>
      <div><h3>{product.name}</h3><div className="mono" style={{fontSize:9,color:'#718096',marginTop:4}}>SKU: {product.sku}</div></div>
      <span className="product-category">{product.category} · QUICK OVERVIEW</span>
      <p className={`product-desc ${expanded?'expanded':''}`} id={detailsId}><span className={`description-copy ${animateDescription?'animated':''}`} key={expanded?'full':'preview'}>{expanded||!hasMoreDescription?product.description:`${shortDescription}…`}</span></p>
      {hasMoreDescription&&<button className="product-more" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>{setExpanded(value=>!value);setAnimateDescription(true)}} data-testid={`button-product-more-${product.id}`}>
        {expanded?'Show less':'Show more'} <span aria-hidden="true">{expanded?'−':'+'}</span>
      </button>}
      <div className="specs"><span>Voltage <b>{product.voltage}</b></span><span>Interface <b>{product.interface}</b></span></div>
      <div className="product-bottom"><div><div className="price">{fmt(product.price)}</div><div className="stock"><span className="dot"/> Illustrative catalog price</div></div></div>
      <button className="button button-primary catalog-add" onClick={()=>add({id:product.id,name:product.name,price:product.price,kind:'component',sku:product.sku})} data-testid={`button-add-${product.id}`}><Plus size={15}/> Add to cart</button>
    </div>
  </article>;
}

function HomePage() {
  useDocument('Parts to possibilities','Electronic components, development boards, curated kits and practical Build Assist for makers and engineering teams in Kuwait.');
  return <>
    <section className="hero"><div className="container hero-grid">
      <div><div className="tag"><span className="dot"/> FOR ENGINEERS · FOR MAKERS</div>
        <h1>Everything you need for your <em>next build.</em></h1>
        <p className="lead">Explore electronic components, development boards, sensors, and tools—with clear specifications to help you choose with confidence.</p>
        <div className="hero-actions"><Link className="button button-primary" href="/components" data-testid="link-shop-components">Shop components <ArrowRight size={16}/></Link><Link className="button button-outline" href="/project-kits" data-testid="link-explore-kits">Explore project kits <Layers size={16}/></Link></div>
        <div className="eyebrow">From parts to possibilities.</div>
        <div className="trust-row"><span><ShieldCheck size={15}/> Datasheets &amp; specifications</span><span><Truck size={15}/> Kuwait delivery context</span><span><Cpu size={15}/> Original OEM parts focus</span></div>
      </div>
      <div className="bench-visual" aria-label="Illustration of a prototyping board"><div className="bench-canvas"><div className="wire"/><div className="wire two"/><div className="board"><div className="chip">CKW / MCU<br/>ESP32 CORE</div></div><div className="bench-badge badge-one">CORE SOC<b>ESP32 · STM32</b></div><div className="bench-badge badge-two">BUS PROTOCOL<b>I²C / SPI / UART</b></div></div><div className="bench-footer"><span><CircuitBoard size={13}/> BENCH-RIG-KUWAIT // REV 2.4</span><span style={{color:'#007b91'}}>TECHNICAL CATALOG</span></div></div>
    </div></section>
    <section className="section feature-section"><div className="container">
      <div className="feature-head"><div><div className="eyebrow">PRECISION CATALOG & WORKFLOW</div><h2>The right parts. A clearer path to building.</h2><p className="lead" style={{fontSize:14,marginBottom:0}}>Find, understand and combine components with a Kuwait-first point of view.</p></div><span className="tag">DESIGNED FOR THE BENCH</span></div>
      <div className="feature-grid">
        <article className="surface feature-card"><div><div className="feature-icon"><Search size={23}/></div><h3>Find parts faster</h3><p>Search by part name, SKU or interface. Filter to the component families that fit your build and compare practical specs at a glance.</p></div><div className="tag-row"><span className="tag">SKU search</span><span className="tag">Voltage details</span><span className="tag">KWD pricing</span></div></article>
        <article className="surface feature-card"><div><div className="feature-icon"><BookOpen size={23}/></div><h3>Understand every component</h3><p>Voltage, interfaces and package details help clarify how each part fits your design—before anything reaches the breadboard.</p></div><div className="tag-row"><span className="tag">Specs up front</span><span className="tag">Logic levels</span><span className="tag">Clear identifiers</span></div></article>
        <article className="surface feature-card"><div><div className="feature-icon"><PackageCheck size={23}/></div><h3>Build with curated kits</h3><p>Start from a focused kit for robotics, IoT or university labs, with a concise parts list and an illustrative local KWD price.</p></div><div className="tag-row"><span className="tag">Curated BOMs</span><span className="tag">Beginner to advanced</span></div></article>
        <article className="surface feature-card assist-feature"><div><div className="feature-icon"><Bot size={23}/></div><h3>Meet Build Assist</h3><p>Describe a hardware idea and explore a locally generated demo BOM. Tune a voltage target and budget, then move the sample parts into your local cart.</p></div><div className="feature-arrow"><Link href="/build-assist" data-testid="link-build-assist-feature">Meet Build Assist <ArrowRight size={16}/></Link><span className="tag">Rule-based local demo</span></div></article>
      </div>
    </div></section>
    <section className="section"><div className="container"><div className="dark-cta"><div className="eyebrow" style={{color:'#54d8ec'}}>PARTS · PROJECT KITS · BUILD ASSIST</div><h2>Your next idea starts with the right parts.</h2><p>Explore components for your next build, or let Build Assist help you plan a parts list. Kuwait delivery and pickup details are presented as reference information; no fulfillment service is connected.</p><div className="hero-actions"><Link className="button button-primary" href="/components" data-testid="link-start-building">Start building <ArrowRight size={16}/></Link><Link className="button button-outline" href="/build-assist" data-testid="link-ask-assist">Ask Build Assist</Link></div><span className="mono" style={{fontSize:10,color:'#bcc8d1'}}>Kuwait City · Hawalli · Shuwaikh · All governorates — reference zones</span></div></div></section>
  </>;
}

function CatalogPage({ add, globalSearch }:{add:(item:Omit<Item,'qty'>)=>void;globalSearch:string}) {
  useDocument('Components catalog','Search and filter electronic components with clear specifications and illustrative KWD pricing.');
  const [query,setQuery]=useState(globalSearch); const [category,setCategory]=useState('All components'); const [stockOnly,setStockOnly]=useState(false); const [voltage,setVoltage]=useState<string[]>([]); const [mount,setMount]=useState<string[]>([]); const [sort,setSort]=useState('verified');
   useEffect(()=>{setQuery(globalSearch)},[globalSearch]);
  const toggle=(values:string[],setter:(v:string[])=>void,value:string)=>setter(values.includes(value)?values.filter(x=>x!==value):[...values,value]);
   const filtered=useMemo(()=>products.filter(p=>(category==='All components'||p.category===category)&&(!stockOnly||p.stock>0)&&(!query||`${p.name} ${p.sku} ${p.category} ${p.interface} ${p.description}`.toLowerCase().includes(query.toLowerCase()))&&(!voltage.length||voltage.some(v=>p.voltage.toLowerCase().includes(v.toLowerCase().replace(' dc',''))||p.voltage.toLowerCase().includes(v.toLowerCase())))&&(!mount.length||(mount.includes('Through-hole')&&/(dip|through|resistor)/i.test(`${p.package} ${p.category}`))||(mount.includes('Surface mount')&&/(smd|surface|lga)/i.test(`${p.package} ${p.category}`)))),[category,stockOnly,query,voltage,mount]);
  const sorted=[...filtered].sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='stock'?b.stock-a.stock:products.indexOf(a)-products.indexOf(b));
  function reset(){setCategory('All components');setStockOnly(false);setVoltage([]);setMount([]);setQuery('');}
  return <div className="container page-top">
    <div className="catalog-breadcrumb"><Link href="/">Home</Link><span>/</span><span>Components</span><span>/</span><b>Catalog</b><span className="sample-sync"><i/> SAMPLE CATALOG DATA</span></div>
    <div className="page-heading-row"><div><div className="eyebrow">LOCAL INVENTORY · KUWAIT REFERENCE</div><h1>Electronic components.</h1><p className="lead" style={{fontSize:14,marginBottom:20}}>Search by part, compare the details, and plan your next board-level build. Prices, stock and product records shown here are illustrative.</p></div><span className="tag"><MapPin size={12}/> KWD · Kuwait-focused</span></div>
    <div className="catalog-search surface"><div className="search-field"><Search size={17}/><input aria-label="Search components by name or SKU" placeholder="Search boards, sensors, part numbers, interfaces…" value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-component-search"/></div><button className="button button-outline small-button" onClick={reset} data-testid="button-reset-filters"><SlidersHorizontal size={14}/> Reset filters</button></div>
    <div className="quick-filters" aria-label="Popular categories">{['All components','Microcontrollers','Sensors','Power & Battery','Passives'].map(c=><button key={c} onClick={()=>setCategory(c)} className={category===c?'active':''} data-testid={`quick-category-${c.toLowerCase().replaceAll(' ','-').replace('&-','')}`}>{c}</button>)}</div>
    <div className="catalog-layout">
      <aside className="filter-panel surface" aria-label="Catalog filters">
        <div className="filter-group"><div className="filter-title">Local reference <span className="tag">KW</span></div><label className="filter-option"><input type="checkbox" checked={stockOnly} onChange={e=>setStockOnly(e.target.checked)} data-testid="filter-stock"/> Show sample stocked items</label><p style={{fontSize:10,color:'#75828a',margin:'3px 0 0 24px'}}>Illustrative sample inventory only</p></div>
        <div className="filter-group"><div className="filter-title">Categories</div><div className="category-list">{categories.map(c=><button key={c} className={`category-button ${category===c?'selected':''}`} onClick={()=>setCategory(c)} data-testid={`filter-category-${c.toLowerCase().replaceAll(' ','-')}`}><span>{c}</span>{c==='All components'?products.length:products.filter(p=>p.category===c).length}</button>)}</div></div>
        <div className="filter-group"><div className="filter-title">Operating voltage</div>{['3.3V','5V','12V'].map(v=><label className="filter-option" key={v}><input type="checkbox" checked={voltage.includes(v)} onChange={()=>toggle(voltage,setVoltage,v)} data-testid={`filter-voltage-${v.replace('.','-')}`}/>{v} DC</label>)}</div>
        <div className="filter-group"><div className="filter-title">Package type</div>{['Through-hole','Surface mount'].map(v=><label className="filter-option" key={v}><input type="checkbox" checked={mount.includes(v)} onChange={()=>toggle(mount,setMount,v)} data-testid={`filter-package-${v.toLowerCase().replace(' ','-')}`}/>{v}</label>)}</div>
        <div className="tag"><Info size={13}/> Sample stock counts are illustrative.</div>
      </aside>
      <section aria-label="Component results"><div className="results-bar"><span data-testid="text-catalog-count">{sorted.length} component{sorted.length===1?'':'s'} in this view</span><label>Sort&nbsp; <select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort products" data-testid="select-sort-products"><option value="verified">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="stock">Sample stock count</option></select></label></div>
        {sorted.length?<div className="product-grid">{sorted.map(p=><ProductCard key={p.id} product={p} add={add}/>)}</div>:<div className="surface empty-state"><div className="empty-icon"><Search size={23}/></div><h3>No matching components</h3><p className="lead" style={{margin:'0 auto 16px',fontSize:13}}>Try another search or clear a filter to widen the catalog.</p><button className="button button-outline" onClick={reset} data-testid="button-clear-search">Clear filters</button></div>}
      </section>
    </div>
    <section className="catalog-endcap"><div><span className="eyebrow">FROM PARTS TO POSSIBILITIES</span><h2>Build from a known starting point.</h2><p>Move from a catalog search to one of six project-kit concepts, or use Build Assist to shape a local demo BOM. Sample prices and inventory are not live.</p></div><div className="hero-actions"><Link className="button button-primary" href="/project-kits" data-testid="link-catalog-kits">Explore project kits <ArrowRight size={15}/></Link><Link className="button button-outline" href="/build-assist" data-testid="link-catalog-assist">Open Build Assist</Link></div></section>
  </div>;
}

function KitArt({kit}:{kit:Kit}) {
  const Icon=kit.icon==='robot'?CircuitBoard:kit.icon==='energy'?BatteryCharging:kit.icon==='lab'?GraduationCap:kit.icon==='logic'?Cpu:kit.icon==='plant'?Gauge:Wifi;
  const photos:Record<string,string> = {
    'weather-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuDePpX74wOz-wgt7BKJc4ukKecIYzI-pQoI6MYegsAW5mg4wxLyBXDl6RLOw5wHo6Pgn1nKvBc4G5x_xikdxwcReLZOcg_EeILGPT2rOAKpth4-MzTSTZnCoRVAJ2kB1voqDs3iJ1HdnsiDwbC7idxU-S6CzIG2KqvIsOrAWljh3UoZ-JpNAPqQw-mjkVjVQHnhXuQxFwN552C8o_grPNfz5mCn92LmK_QVRzXKh2yBDiMk8J5k_Zaahg',
    'rover-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuB04mSRt8M4ir0iNZb2uwdOaZKGaiiCZ2qgb8BTDXOe4oWgblJjmHUyOpniGQjdYuoYYLe25zca-1ri2eZER7tLotCsbK6LtgE_QgTc8lGXGd1Jh68f__1_TiW2lyIslg0Wld5mvHJ5D_PdrfPnA4nvnke_bFOVM35qoTEXbnqLtiMGFYhH0VL-tk0Iu6sz9ut2BOrBekfTjaIvg7AlnLBmF9sxa3D1we23FCIqYmFIZNOxJkUZKHeA0w',
    'energy-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuBs_xKA2u7cYB_bJGtiGUqmsH9tOdYFXt__OeE_M0neQ8K9tgV3eDigWpqZpUKK-_kc7L3UZ71Bod5kh2geJCS_XLFMplefDYA3btY5Dxg9YxAeRggfw8690FyfgzsUlceke_KMEe_1mnIf0md6imxcQaQZvc1zo4l3Ex9fBemMFm27QWi2v7A3KhOJq9m0GpBbZvoXEF7KNrlOHK4-uPnGc3xMmmLnWaB1MRWnVbdEBDAudrknZH2YlA',
    'university-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuB3f0cVOGlmskmfAh7Wd-RVQGN7ciUz8AXXiGCRwDlnlR8vhN01vqCPV1D9fTbrk__6_JdbOZHFStftqAS3xtixp6BOmr5WXzM4Qt1vtcQ8L7vW059EUewVU6JHLSTbRbj4fO9NbdDMrXdWXVg2NlzKwjncjegpSLj7unb5_oXu9iH0CrurP2utxQxEmmdZoDqBWbUjPV4qpBT6oOo-ScjuVwO6XtMOSBWTebEZ9JmEGzNUltqzBC9h-g',
    'plant-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuArgStcoEKkTRzAImnnxoDO_qlstSxEQIK2a65wy0coMSTkVwH2qwFeOmQQ62P0mfv9Zz3apMMNsFV6-22pld7DgkJOfIZSlyrbxBbiJohZ56oNNCaveUT_YIAElPBD8hZhH-IgBMeSG9_WONDgyVyNafrgvszNgTHCum_eY2hWpCMoD-yX0io-_usNcwlIeLLnaJM-K7TIcBsrd9ycAOVzukcTw7kzCAQo2-sUwKeQZQ1J4rzffMoH0w',
    'fpga-kit':'https://lh3.googleusercontent.com/aida-public/AB6AXuBbx76DvKkdpzREanl31ygUqbZn-p4DAiu2ieU4Q2WOnXbverEpJDMLsIH-F4pMPie4_2Grgn1qacwl3TfN3Ts2kpVRVtsVOBL5yxpE0ZypvXBkArt7yg-YJJu3Wzc_YyZh3meqJJNO01G9eE8nr92aXFK-CIyHk2Qehdz-MmNfUNFGI2tGE2wzYLy_iD6FAobEEX8p8Mja7xXFEgOQ7ZxgH0egDnuztcIBTiPCiZ-gQSWCXLwettKmcg',
  };
  return <div className="kit-art" aria-label={`${kit.title} kit photograph`}><img src={photos[kit.id]} alt="" loading="lazy" onLoad={e=>e.currentTarget.parentElement?.classList.add('has-photo')} onError={e=>{e.currentTarget.style.display='none'}}/><span className="kit-photo-tag">{kit.category} · BOM: {kit.count}</span><div className="kit-plate"><Icon/></div><div className="kit-labels"><span>CIRCUITS KW / KIT</span><span>{kit.domain.toUpperCase()}</span></div></div>;
}

function kitDescriptionPreview(description:string) {
  const words=description.trim().split(/\s+/);
  return words.length>11?`${words.slice(0,11).join(' ')}…`:description;
}

function KitsPage({add}:{add:(item:Omit<Item,'qty'>)=>void}) {
  useDocument('Project kits','Explore curated electronics kits for robotics, IoT, automation and university labs in Kuwait.');
   const [level,setLevel]=useState('All levels');const [domain,setDomain]=useState('All domains');const [query,setQuery]=useState('');const [selectedKit,setSelectedKit]=useState<Kit|null>(null);const [expandedKitId,setExpandedKitId]=useState<string|null>(null);const [animatedKitId,setAnimatedKitId]=useState<string|null>(null);
   const shown=kits.filter(k=>(level==='All levels'||k.level===level||k.level==='All levels')&&(domain==='All domains'||k.category===domain)&&(!query||`${k.title} ${k.desc} ${k.parts.join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  return <>
     <section className="kit-hero"><div className="container"><div className="eyebrow" style={{color:'#55d7e9'}}>CURATED PROJECT STARTERS · KUWAIT</div><div className="page-heading-row" style={{alignItems:'center'}}><div><h1>Curated Project Kits.</h1><p>Pre-selected build concepts with core hardware BOMs, schematic references and illustrative KWD prices. Kit availability is not live.</p></div><div className="kit-stats"><div className="kit-stat"><strong>06</strong><span>Sample kits</span></div><div className="kit-stat"><strong>1–6+ hrs</strong><span>Example build duration</span></div></div></div></div></section>
    <div className="container"><div className="kit-toolbar surface"><div className="chip-row"><span className="eyebrow" style={{marginRight:4}}>Filter kits</span>{['All levels','Beginner','Intermediate','Advanced'].map(l=><button key={l} className={`filter-chip ${level===l?'active':''}`} onClick={()=>setLevel(l)} data-testid={`filter-kit-level-${l.toLowerCase()}`}>{l}</button>)}</div><div className="chip-row">{kitDomains.map(d=><button key={d} className={`filter-chip ${domain===d?'active':''}`} onClick={()=>setDomain(d)} data-testid={`filter-kit-domain-${d.toLowerCase().replaceAll(' ','-').replace('&-','')}`}>{d}</button>)}</div></div>
      <div className="search-field" style={{marginTop:17}}><Search size={17}/><input placeholder="Search kits by project, part or domain…" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search project kits" data-testid="input-kit-search"/></div>
         {shown.length?<div className="kits-grid">{shown.map(k=><article className="kit-card surface" key={k.id} data-testid={`card-kit-${k.id}`}><KitArt kit={k}/><div className="kit-body"><div className="kit-code"><span>{k.code}</span><span>{k.level==='All levels'?'All Experience Levels':k.level}</span></div><span className="tag" style={{width:'max-content'}}>{k.category} · {k.duration}</span><h3>{k.title}</h3><p className={`kit-description ${expandedKitId===k.id?'expanded':''}`} id={`kit-description-${k.id}`}><span className={`description-copy ${animatedKitId===k.id?'animated':''}`} key={expandedKitId===k.id?'full':'preview'}>{expandedKitId===k.id?k.desc:kitDescriptionPreview(k.desc)}</span></p><button className="product-more kit-more" type="button" aria-expanded={expandedKitId===k.id} aria-controls={`kit-description-${k.id}`} onClick={()=>{setExpandedKitId(expandedKitId===k.id?null:k.id);setAnimatedKitId(k.id)}} data-testid={`button-kit-more-${k.id}`}>{expandedKitId===k.id?'Show less':'Show more'} <span aria-hidden="true">{expandedKitId===k.id?'−':'+'}</span></button><div><div className="filter-title" style={{fontSize:9}}>Core hardware BOM</div><div className="kit-bom">{k.parts.map(p=><span key={p}>{p}</span>)}</div></div><div className="kit-manual"><BookOpen size={13}/> {k.manual}</div><div className="kit-bottom"><span className="mono" style={{fontSize:9,color:'#687680'}}>ILLUSTRATIVE KIT PRICE</span><span className="price">{fmt(k.price)}</span></div><div className="kit-actions"><button className="button button-outline small-button" onClick={()=>setSelectedKit(k)} data-testid={`button-schematic-${k.id}`}><CircuitBoard size={14}/> Schematic / BOM</button><button className="button button-primary small-button" onClick={()=>add({id:k.id,name:k.title,price:k.price,kind:'kit',sku:k.code})} data-testid={`button-add-kit-${k.id}`}><ShoppingCart size={14}/> Add Rig</button></div></div></article>)}</div>:<div className="surface empty-state"><h3>No kits match those filters</h3><p className="lead" style={{fontSize:13,margin:'0 auto'}}>Choose another domain or search term.</p></div>}
    </div>
     {selectedKit&&<div className="dialog-scrim" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSelectedKit(null)}}><section className="kit-dialog surface" role="dialog" aria-modal="true" aria-labelledby="kit-dialog-title"><button className="icon-button kit-dialog-close" aria-label="Close schematic details" onClick={()=>setSelectedKit(null)}><X size={17}/></button><div className="eyebrow">SCHEMATIC REFERENCE · LOCAL DEMO</div><h2 id="kit-dialog-title">{selectedKit.title}</h2><p>{selectedKit.desc}</p><div className="schematic-flow"><span>Power / controller</span><ArrowRight size={15}/><span>Core modules</span><ArrowRight size={15}/><span>Project output</span></div><h3>Core hardware BOM · {selectedKit.count}</h3><div className="kit-dialog-bom">{selectedKit.parts.map((part,i)=><div key={part}><span className="mono">0{i+1}</span><b>{part}</b></div>)}</div><p className="disclosure-note">Reference overview only. The schematic flow is illustrative; no downloadable wiring file or physical kit is connected.</p><button className="button button-primary" onClick={()=>{add({id:selectedKit.id,name:selectedKit.title,price:selectedKit.price,kind:'kit',sku:selectedKit.code});setSelectedKit(null)}} data-testid={`button-add-dialog-${selectedKit.id}`}><ShoppingCart size={15}/> Add kit · {fmt(selectedKit.price)}</button></section></div>}
     <section className="section feature-section"><div className="container"><div className="eyebrow">THE CIRCUITS KW KIT STANDARD</div><h2>Why engineers build with our curated kits</h2><div className="guarantee-grid" style={{marginTop:22}}>{[['Zero missing silicon','A clearly itemized core BOM makes it easy to see what belongs on the bench.'],['Tested in-house in Kuwait','Bench-minded specifications and pinout details help guide your first connection.'],['Build Assist linked','Carry a kit idea into the locally generated demo BOM workflow.']].map(([t,d])=><article className="surface guarantee-card" key={t}><span className="feature-icon"><CheckCircle2 size={20}/></span><h3>{t}</h3><p>{d}</p></article>)}</div><p className="disclosure-note">Kit contents, example pricing and operational descriptions are illustrative reference data, not a live offer or stock promise.</p></div></section>
  </>;
}

function BuildAssistPage({add}:{add:(item:Omit<Item,'qty'>)=>void}) {
  useDocument('Build Assist','Create a local demo bill of materials from your project brief. Results are illustrative, not generated by an AI service.');
   const [prompt,setPrompt]=useState('I want to build an automated greenhouse monitor with soil moisture, solar battery charging, and WhatsApp alerts.');const [voltage,setVoltage]=useState('3.3V');const [level,setLevel]=useState('Hobbyist');const [budget,setBudget]=useState(15);const [generated,setGenerated]=useState(false);const [notice,setNotice]=useState('');const [preview,setPreview]=useState<'wiring'|'code'|null>(null);
  const generate=()=>{if(prompt.trim().length<8){setNotice('Add a little more detail to describe your hardware idea.');return}setGenerated(true);setNotice('Local demo BOM generated from your project details.');};
   const bom=useMemo(()=>{const text=prompt.toLowerCase();let ids=text.includes('solar')?['esp32','soil','tp4056','battery']:text.includes('robot')||text.includes('parking')||text.includes('distance')?['esp32','hcsr04','level','soil']:text.includes('greenhouse')||text.includes('soil')||text.includes('plant')?['esp32','soil','bme280','tp4056']:text.includes('display')||text.includes('screen')?['pico','lcd','tp4056','soil']:['esp32','bme280','soil','tp4056'];return ids.map(id=>products.find(p=>p.id===id)!).filter(Boolean)},[prompt]);
  const total=bom.reduce((n,p)=>n+p.price,0);
   const projectTitle=prompt.toLowerCase().includes('solar')?'Solar-Powered Agricultural IoT Node':prompt.toLowerCase().includes('robot')?'Autonomous Obstacle Avoidance Rover':prompt.toLowerCase().includes('weather')?'Wi-Fi Environmental Sensor Node':'Project Parts Outline';
   const bomName=(p:Product)=>p.id==='esp32'&&prompt.toLowerCase().includes('solar')?'ESP32 Deep-Sleep Node Board':p.name;
   const addBom=()=>{bom.forEach(p=>add({id:`bom-${p.id}`,name:bomName(p),price:p.price,kind:'bom',sku:p.sku}));setNotice(`${bom.length} BOM items added to your local cart.`)};
  return <div className="container page-top"><div className="eyebrow">LOCAL PROJECT PLANNER · KUWAIT</div><h1 style={{fontSize:'clamp(33px,4vw,48px)'}}>Build Assist: <span style={{color:'#00687b'}}>describe your idea.</span></h1><p className="lead">A local demo tool that maps a project brief to a sample parts list. It is not an AI service, live inventory check or engineering review.</p>
    <div className="tag" style={{margin:'13px 0 20px'}}><Info size={13}/> Demo catalog · illustrative KWD prices and sample stock · verify electrical compatibility independently</div>
    <div className="assist-layout">
      <section><div className="assist-form surface"><div className="eyebrow">PROJECT SPECIFICATION</div><div className="assist-section"><label htmlFor="project-prompt">What are you building?</label><textarea id="project-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={500} placeholder="Describe sensors, controllers, communication needs or constraints…" data-testid="input-build-prompt"/><div className="mono" style={{textAlign:'right',fontSize:9,color:'#7c8991',marginTop:5}} data-testid="text-prompt-count">{prompt.length} / 500</div></div>
        <div className="assist-section"><label>Quick project starters</label><div className="preset-row">{[['Greenhouse','Automated greenhouse monitor with soil moisture, solar charging, and alerts'],['Parking sensor','Arduino-compatible parking sensor with distance alerts'],['Line follower','Two-motor line follower robot with IR sensor array'],['Weather node','Wi-Fi weather node measuring pressure and humidity']].map(([name,value])=><button type="button" className="preset" key={name} onClick={()=>setPrompt(value)} data-testid={`preset-${name.toLowerCase().replace(' ','-')}`}>{name}</button>)}</div></div>
        <div className="assist-section"><label>Target logic voltage</label><div className="segmented">{['3.3V','5V','12V'].map(v=><button type="button" className={voltage===v?'active':''} key={v} onClick={()=>setVoltage(v)} data-testid={`button-voltage-${v.replace('.','-')}`}>{v}<br/><small>{v==='3.3V'?'MCU native':v==='5V'?'TTL logic':'actuator rail'}</small></button>)}</div></div>
        <div className="assist-section"><label>Builder context</label><div className="segmented">{['Hobbyist','University','Industrial'].map(v=><button type="button" className={level===v?'active':''} key={v} onClick={()=>setLevel(v)} data-testid={`button-level-${v.toLowerCase()}`}>{v}</button>)}</div></div>
        <div className="assist-section"><div className="range-line"><label htmlFor="budget-range" style={{margin:0}}>Maximum BOM budget</label><strong data-testid="text-budget-value">{fmt(budget)}</strong></div><input type="range" id="budget-range" min="3" max="45" step=".5" value={budget} onChange={e=>setBudget(Number(e.target.value))} data-testid="input-budget"/><div className="range-line" style={{color:'#849099',marginTop:4}}><span>3.000 KWD</span><span>45.000 KWD</span></div></div>
        <button className="button button-primary" style={{width:'100%',height:48}} onClick={generate} data-testid="button-generate-bom"><CircuitBoard size={17}/> Generate local demo BOM</button>
        <p className="mono" style={{textAlign:'center',fontSize:9,color:'#6b7880',margin:'10px 0 0'}}>Rule-based local sample · no external service or live stock check</p>
        {notice&&<p role="status" className="tag" style={{marginTop:12}} data-testid="status-build-assist">{notice}</p>}
      </div><div className="surface" style={{padding:15,marginTop:14,background:'#e8f1fb'}}><div style={{display:'flex',gap:12,alignItems:'center'}}><span className="feature-icon" style={{margin:0,background:'white'}}><LifeBuoy size={20}/></span><div><strong style={{fontSize:12}}>Need a local lab review?</strong><p style={{fontSize:11,color:'#566776',margin:'4px 0 0'}}>Review the Shuwaikh operations concept and Kuwait-local details.</p></div></div><Link href="/about#hub" className="button button-outline small-button" style={{marginTop:12}} data-testid="link-about-lab">About the Kuwait hub <ArrowRight size={13}/></Link></div></section>
       <section className="bom-panel surface" aria-label="Demo bill of materials" data-testid="panel-demo-bom"><div className="assist-output-head"><div><div className="eyebrow" style={{color:'#9a4600'}}>SAMPLE OUTPUT · NOT VERIFIED</div><h2>{projectTitle}</h2><p>{generated?prompt:'Preview a local mapping from the project brief. No external service is involved.'}</p></div><span className="demo-stamp">LOCAL DEMO</span></div>
         <div className="diagram"><div className="diagram-label"><span>Illustrative connection flow</span><span>{voltage} logic target</span></div><div className="diagram-flow"><div className="diagram-node">{prompt.toLowerCase().includes('solar')?'Solar PV':'Power'}<br/>source</div><ArrowRight className="diagram-arrow" size={18}/><div className="diagram-node core">ESP32<br/>controller</div><ArrowRight className="diagram-arrow" size={18}/><div className="diagram-node">{prompt.toLowerCase().includes('soil')||prompt.toLowerCase().includes('greenhouse')?'Soil capacitive':'Sensor'}<br/>module</div></div></div>
        <div className="check-grid"><div className="check-card"><CheckCircle2 size={16} color="#007b91"/><b>Logic target</b><span>{voltage} selected</span></div><div className="check-card"><Gauge size={16} color="#007b91"/><b>Budget target</b><span>{fmt(budget)}</span></div><div className="check-card"><GraduationCap size={16} color="#007b91"/><b>Context</b><span>{level}</span></div></div>
        <div className="bom-title"><span>Suggested demo bill of materials</span><span className="mono">{bom.length} items</span></div>
         <div>{bom.map((p,i)=><div className="bom-row" key={p.id} data-testid={`row-bom-${p.id}`}><span className="mono" style={{fontSize:10,color:'#73808a'}}>0{i+1}</span><div><div className="bom-name">{bomName(p)}</div><div className="bom-spec">{p.voltage} · {p.interface} · SKU {p.sku}</div></div><div className="bom-price">{fmt(p.price)}</div><div className="bom-stock">Sample</div></div>)}</div>
        <div className="bom-total"><span>Estimated demo BOM total</span><span className="mono">{fmt(total)}</span></div>
        {total>budget&&<div className="notice">This sample BOM is above your stated budget. Review quantities or choose alternative parts before purchase.</div>}
         {prompt.toLowerCase().includes('solar')&&<div className="notice"><strong>Solar charging note:</strong> Keep panel open-circuit voltage at or below 6V when paired with the TP4056 sample module. Reference design suggests a 5V, 1–2W solar cell. This is not a validated design; verify charging, protection and thermal behavior independently.</div>}
         <div className="notice"><strong>Electrical safety:</strong> These suggestions are illustrative only. Check voltage, current, wiring and datasheets for your specific design before powering hardware.</div>
         <div className="assist-output-actions"><button className="button button-outline small-button" onClick={()=>setPreview(preview==='wiring'?null:'wiring')} data-testid="button-preview-wiring"><CircuitBoard size={14}/> Wiring diagram</button><button className="button button-outline small-button" onClick={()=>setPreview(preview==='code'?null:'code')} data-testid="button-preview-code"><BookOpen size={14}/> Starter code preview</button></div>
          {preview&&<div className="preview-panel" role="region" aria-label={preview==='wiring'?'Local wiring preview':'Local starter code preview'}><div className="preview-panel-head"><strong>{preview==='wiring'?'Connection notes':'Starter-code outline'}</strong><button className="icon-button" aria-label="Close preview" onClick={()=>setPreview(null)}><X size={15}/></button></div>{preview==='wiring'?<p>ESP32 GPIO34 ← soil sensor analog out · TP4056 BAT+/BAT− ↔ 18650 holder · common ground between controller and sensor. Illustrative only; no generated schematic file.</p>:<pre>{`# Local example outline — not downloadable firmware\nread_sensor()\ncheck_threshold()\nnotify_placeholder()  # no messaging service connected`}</pre>}</div>}
        <button className="button button-primary" style={{width:'100%'}} onClick={addBom} data-testid="button-add-bom-cart"><ShoppingCart size={16}/> Add demo BOM items to cart · {fmt(total)}</button>
      </section>
    </div>
    <div className="assist-delivery-reference"><div><span className="eyebrow">KUWAIT DELIVERY REFERENCE</span><strong>Same-day dispatch concept · 15:00 AST cutoff</strong><span>Source reference mentions a Shuwaikh hub. No courier, delivery or pickup service is currently connected.</span></div><Link href="/about#delivery" className="button button-outline small-button" data-testid="link-assist-delivery">View sample zones <ArrowRight size={13}/></Link></div>
  </div>;
}

function AboutPage() {
  useDocument('About Circuits KW','Kuwait-focused hardware catalog and illustrative local operations details from Circuits KW.');
  const pillars=[['100% Genuine OEM Components','A reference for sourcing from franchised distributors and avoiding gray-market, refurbished or counterfeit silicon.'],['Lab-Verified Datasheets & Pinouts','Every sensor, development board and logic shifter is specified with the measurements and pinout details a build needs.'],['Same-Day Local Dispatch','A sample Kuwait dispatch workflow illustrates the 15:00 AST cutoff and a local pickup concept; no courier service is connected.'],['Maker & University Support','A place for student projects, capstones, university lab requirements and local hardware teams.']];
  return <>
    <section className="about-hero"><div className="container"><div className="eyebrow">STATE OF KUWAIT · HARDWARE & LOCAL OPERATIONS</div><div className="about-grid"><div><h1>Fueling hardware innovation in Kuwait — from university labs to commercial prototypes.</h1><p className="lead">Circuits KW brings components, project kits and useful engineering detail together for makers, engineering students and hardware teams in Kuwait. This frontend is a locally interactive storefront demo: pricing, stock and all operating details are illustrative.</p><span className="mono" style={{fontSize:10,color:'#64727d'}}>LOCAL-FIRST · KWD · ENGLISH / العربية-READY</span></div><div className="about-stats surface"><div className="filter-title">Kuwait operations reference</div><div className="stat-pair"><div><strong>Shuwaikh</strong><span>Example hub location</span></div><div><strong>AST +03</strong><span>Kuwait local time</span></div></div><span className="mono">No account, shipping service, payment or live inventory is connected.</span></div></div>
      <div className="photo-strip"><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAOTORl_9CZpLmAwLhwVfBFB5ybinplJ3eM55r1M3DB4wK4b__OijqgC13WzPx7prHaXyIn3LVD74MEVX4lbJclBczJwnnSDJ31wQEMQTbupW9DM0WWW-h-LXxhPxSYsf0XU8Qu9e51ulGkefIzX4IMY3FYTRAn8N0ms2n5afBPDXzEGT7qFQ1NtJlyNnuNux_lsjfhhxf9iLZwfSAGI00TZb6uq5HYff0YVW8jOLws7qvRhI91LPeGtg" alt="" loading="lazy"/><div className="photo-caption"><span>Local engineering context</span><b>Test-bench thinking</b></div></div><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBent9Os7OUsL5ECe-pfG3Oq-_zTnZEr1c_pC8299wpEF8XlcsXukh-lOfP0n5kQeFikYA0gsAKNZ3eKBaHYj3uWEJyoPIQS9fhQMIRSWOgNrMCfeFVnFrbrGzT0hfu6_JdQP3r3tYVFXz3CLcbKNu3pAXBsz9G-l0szXlPSPoGf4ot5LOnkO_ARQb8tCvAgUkkFhWhsWdIt16cjkkXxdYfZ7487xGWc8qMKy3cw50A4SFP0IjgA5X1ZQ" alt="" loading="lazy"/><div className="photo-caption"><span>Parts organization</span><b>Ready for the workbench</b></div></div><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDPST6SmLa4prqF2kH9-dLdulQoTHGwTkYaFiJhhQhet5MFJLjY8IK-HNA7FCsaz0esaijTWJB6RbiQ7pfwHodNHq6KSwvK59ovbvxBnf2qUptZz6_-LJdDcbXlYwffjTyc85DgWqvH8NNmoD5400DiXPv57LmO0M-A80qeIcmV4vKVt8DHm_CTZbZUYRPJlUcwwGuwS6GMPNKxqSjf0z1-p1fAGQZQsueCLqdlVrqV0xEdoaxHsI-PWw" alt="" loading="lazy"/><div className="photo-caption"><span>Academia & makers</span><b>Capstone build support</b></div></div></div>
    </div></section>
    <section className="section" id="delivery"><div className="container mission-layout"><div><div className="eyebrow">SECTION 01 // CORE MISSION</div><h2>Bridging the hardware latency gap across Kuwait.</h2><p className="lead" style={{fontSize:14}}>For years, developing embedded systems or testing PCB revisions in Kuwait could mean overseas orders, high freight costs and long waits—with uncertainty about footprints, pinouts or part authenticity.</p><p style={{fontSize:13,lineHeight:1.7,color:'#576671'}}><strong>Circuits KW</strong> is organized around the idea of keeping useful engineering detail and local hardware discovery closer to the workbench. Local fulfillment and counter collection are reference concepts in this demo, not active services.</p><div className="arabic-note" dir="rtl" lang="ar"><strong style={{color:'#00687b'}}>مهمتنا في الكويت</strong><p style={{fontSize:13,margin:'6px 0 0'}}>تمكين المهندسين والمبتكرين وطلبة الجامعات في الكويت من خلال معلومات واضحة عن القطع الإلكترونية ومجموعات المشاريع والأسعار بالدينار الكويتي.</p></div></div>
      <div className="surface" style={{padding:19}}><div className="eyebrow">KUWAIT DELIVERY OVERVIEW · REFERENCE ONLY</div><h3 style={{margin:'11px 0 5px'}}>Kuwait Same-Day Dispatch Map</h3><p style={{fontSize:11,color:'#67747e',marginBottom:15}}>Illustrative route zones and time windows from the reference concept. This website has no connected courier, route or order data. Reference cutoff: 15:00 AST.</p><div className="coverage-grid">{[['Capital & Hawalli','Sharq · Shuwaikh · Jabriya · Hawalli · Salmiya','~2–3 hours · sample evening express'],['Ahmadi & Mubarak','Fintas · Egaila · Mahboula · Mangaf · Sabah Al-Salem','Same afternoon · sample scheduled route'],['Jahra & outlying','Jahra · Saad Al-Abdullah · Amghara · Sulaibiya','18:00 route · illustrative timing']].map(([a,b,c])=><div className="coverage-card surface" key={a}><strong>{a}</strong><p>{b}</p><span>{c}</span></div>)}</div><div className="sample-performance"><div><strong>99.4%</strong><span>sample on-schedule reference figure</span></div><div className="sample-bar"><i/></div><p>Reference split: 94.0% same-night · 5.4% hub pickup within 45 minutes · 0.6% next morning. Illustrative figures, not live service statistics.</p></div><div style={{marginTop:13,padding:12,background:'#f2f5f7',borderRadius:7,fontSize:11,color:'#51616d'}}><Truck size={14} style={{verticalAlign:'middle',marginRight:6}}/>Shuwaikh pickup and courier logistics are reference details, not a connected fulfillment service.</div></div>
    </div></section>
     <section className="section feature-section"><div className="container"><div className="eyebrow">SECTION 02 // ENGINEERING ASSURANCE</div><h2>The Four Circuits KW Pillars</h2><div className="pillar-grid" style={{marginTop:20}}>{pillars.map(([title,desc],i)=><article className="surface pillar-card" key={title}><span className="feature-icon"><span className="mono">0{i+1}</span></span><h3>{title}</h3><p>{desc}</p><span className="mono" style={{fontSize:9,color:'#007b91'}}>CIRCUITS KW / FIELD NOTE</span></article>)}</div></div></section>
     <section className="section" id="hub"><div className="container"><div className="eyebrow">SECTION 03 // PHYSICAL COUNTER & FACILITY</div><h2>Shuwaikh Hub &amp; Operations</h2><p className="disclosure-note">All counter, contact, courier and partner details below are source-reference concepts only. No physical hub, support desk, partnership, fulfillment or payment integration is connected by this demo.</p><div className="mission-layout" style={{marginTop:20}}><div style={{display:'grid',gap:12}}><article className="surface" style={{padding:17}}><h3><MapPin size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>Physical hub &amp; express pickup</h3><p style={{fontSize:12,color:'#61717d',lineHeight:1.6,margin:0}}>Reference address: Industrial Shuwaikh, Block 1, Street 14, Kuwait. The source concept includes a counter, anti-static packing area and inspection benches; these are not live facilities.</p><span className="ops-chip">Reference zone · Industrial 1</span></article><article className="surface" style={{padding:17}}><h3><Gauge size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>Lab hours concept</h3><div className="summary-line"><span>Saturday – Thursday</span><strong>09:00–21:00 AST</strong></div><div className="summary-line"><span>Friday</span><strong>Closed · restock reference</strong></div></article><article className="surface" style={{padding:17}}><h3><LifeBuoy size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>Technical contact lines</h3><p style={{fontSize:12,color:'#61717d',margin:0}}>Customer desk and BOM submission channels are included in the reference concept but intentionally not published as working contact details here.</p></article></div><div className="map-panel" aria-label="Illustrative Kuwait local delivery map"><div className="map-route"/><span className="map-pin one"/><span className="map-pin two"/><span className="map-pin three"/><span className="tag" style={{position:'absolute',top:13,left:13}}><MapPin size={12}/> KUWAIT · ROUTE ILLUSTRATION</span><span className="mono" style={{position:'absolute',bottom:14,right:14,fontSize:10,color:'#536972'}}>SHUWAIKH HUB → GOVERNORATES</span></div></div><div className="partner-note">University and maker-lab names in the supplied concept (Kuwait University, AUM, GUST, KFAS and PAAET) are shown for context only; no institutional affiliation is implied.</div></div></section>
  </>;
}

function CartPage({items,update,remove}:{items:Item[];update:(id:string,qty:number)=>void;remove:(id:string)=>void}) {
  useDocument('Shopping cart','Review and update your local Circuits KW cart. Demo orders are saved only in this browser; no payment is taken.');
  const subtotal=items.reduce((n,i)=>n+i.price*i.qty,0);
  return <div className="container page-top"><div className="eyebrow">YOUR BUILD / LOCAL CART</div><h1 style={{fontSize:38}}>Cart review</h1><p className="lead" style={{fontSize:14}}>You can place a local demo order. No payment, shipping or real fulfillment is connected.</p>
    {!items.length?<div className="surface empty-state"><div className="empty-icon"><ShoppingCart size={23}/></div><h3>Your cart is ready for a build.</h3><p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>Add components, a project kit or a demo BOM to keep your parts list together.</p><div style={{display:'flex',justifyContent:'center',gap:9,flexWrap:'wrap'}}><Link className="button button-primary" href="/components" data-testid="link-empty-cart-components">Browse components</Link><Link className="button button-outline" href="/project-kits" data-testid="link-empty-cart-kits">Explore kits</Link></div></div>:
      <div className="cart-layout"><section className="cart-list surface" aria-label="Cart items">{items.map(i=><article className="cart-row" key={i.id} data-testid={`row-cart-${i.id}`}><div className="cart-product"><span className="cart-thumb">{i.kind==='kit'?<PackageCheck size={22}/>:i.kind==='bom'?<CircuitBoard size={22}/>:<Cpu size={22}/>}</span><span><strong>{i.name}</strong><span>{i.sku} · {i.kind==='kit'?'Project kit':i.kind==='bom'?'Build Assist demo item':'Component'}</span></span></div><div className="quantity" aria-label={`Quantity for ${i.name}`}><button aria-label="Decrease quantity" onClick={()=>update(i.id,i.qty-1)} data-testid={`button-decrease-${i.id}`}><Minus size={12}/></button><input aria-label={`Quantity ${i.name}`} type="number" min="1" value={i.qty} onChange={e=>update(i.id,Math.max(1,Number(e.target.value)||1))} data-testid={`input-quantity-${i.id}`}/><button aria-label="Increase quantity" onClick={()=>update(i.id,i.qty+1)} data-testid={`button-increase-${i.id}`}><Plus size={12}/></button></div><span className="price">{fmt(i.price*i.qty)}</span><button className="remove" aria-label={`Remove ${i.name}`} onClick={()=>remove(i.id)} data-testid={`button-remove-${i.id}`}><Trash2 size={16}/></button></article>)}</section>
        <aside className="summary-card surface"><div className="eyebrow">CART SUMMARY</div><div className="summary-line"><span>Items</span><strong>{items.reduce((n,i)=>n+i.qty,0)}</strong></div><div className="summary-line"><span>Subtotal</span><strong className="mono">{fmt(subtotal)}</strong></div><div className="summary-line"><span>Delivery</span><span>Not connected</span></div><div className="summary-line summary-total"><span>Estimated total</span><span className="mono">{fmt(subtotal)}</span></div><p style={{fontSize:10,lineHeight:1.5,color:'#6c7880'}}>Demo orders are saved in this browser only. No payment or fulfillment is connected.</p><Link className="button button-primary" style={{width:'100%'}} href="/checkout" data-testid="link-checkout"><ArrowRight size={14}/> Continue to checkout</Link><Link className="button button-outline" style={{width:'100%',marginTop:8}} href="/components" data-testid="link-continue-shopping"><ArrowDown size={14}/> Continue shopping</Link><button className="button button-quiet" style={{width:'100%',marginTop:8}} onClick={()=>items.forEach(i=>remove(i.id))} data-testid="button-clear-cart"><Trash2 size={14}/> Clear cart</button></aside>
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
      const digits=value.replace(/\D/g,'');
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
  useDocument('Checkout','Place a local Circuits KW demo order. Only the item summary is saved in this browser.');
  const [placedOrder,setPlacedOrder]=useState<DemoOrder|null>(null);
  const [orderError,setOrderError]=useState('');
  const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  useEffect(()=>{
    if(!placedOrder) return;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0,left:0,behavior:reducedMotion?'auto':'smooth'});
  },[placedOrder]);
  const subtotal=items.reduce((n,i)=>n+i.price*i.qty,0);
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
      setOrderError('Checkout couldn’t be completed. Fix the highlighted fields below.');
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
      setOrderError('This browser could not save the demo order. Your cart is unchanged; check local storage and try again.');
      return;
    }
    setPlacedOrder(order);
    clearCart();
  };
  if(placedOrder) return <div className="container page-top checkout-confirmation" data-testid="demo-order-confirmation">
    <div className="eyebrow">DEMO ORDER PLACED · LOCAL ONLY</div>
    <div className="checkout-confirmation-card surface">
      <div className="checkout-confirmation-icon"><CheckCircle2 size={26}/></div>
      <h1>Order placed.</h1>
      <p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>Your demo order was saved in this browser. No real order was sent, and no payment was taken.</p>
      <div className="demo-order-number"><span>DEMO ORDER NUMBER</span><strong data-testid="text-demo-order-number">{placedOrder.orderNumber}</strong><small>{new Date(placedOrder.placedAt).toLocaleString()}</small></div>
      <div className="demo-order-items">{placedOrder.items.map(item=><div key={item.id}><span>{item.name} · Qty {item.qty}</span><strong>{fmt(item.price*item.qty)}</strong></div>)}</div>
      <div className="summary-line summary-total"><span>Demo total</span><span className="mono">{fmt(placedOrder.subtotal)}</span></div>
      <p className="checkout-order-disclaimer">Only the item summary and total are saved locally. Your contact and address details were not stored or sent. Shipping and fulfillment are not connected.</p>
      <Link className="button button-primary" href="/components" data-testid="link-confirmation-shop">Continue browsing <ArrowRight size={15}/></Link>
    </div>
  </div>;
  if(!items.length) return <div className="container page-top"><div className="eyebrow">ORDER REVIEW · CHECKOUT PREVIEW</div><div className="surface empty-state"><div className="empty-icon"><ShoppingCart size={23}/></div><h3>Your cart is empty.</h3><p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>Add a component or project kit before starting checkout.</p><Link className="button button-primary" href="/components">Browse components</Link></div></div>;
  return <div className="container page-top">
    <div className="checkout-heading"><div><div className="eyebrow">ORDER REVIEW · LOCAL DEMO</div><h1>Checkout</h1><p className="lead" style={{fontSize:13}}>Place a sample order and get a demo receipt. Your contact and address details aren’t saved or sent.</p></div><span className="tag"><ShieldCheck size={13}/> No payment connected</span></div>
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
          <div className="checkout-section-heading"><span className="checkout-step">01</span><div><h2>Contact details</h2><p>How can we reach you about this preview?</p></div></div>
          <div className="checkout-fields">
            <label className="checkout-field"><span>Full name</span><input name="name" type="text" autoComplete="name" placeholder="Your name" required aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name?'checkout-error-name':undefined} data-testid="input-checkout-name"/><CheckoutFieldError field="name" message={fieldErrors.name}/></label>
            <label className="checkout-field"><span>Email address</span><input name="email" type="email" autoComplete="email" placeholder="name@example.com" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email?'checkout-error-email':undefined} data-testid="input-checkout-email"/><CheckoutFieldError field="email" message={fieldErrors.email}/></label>
            <label className="checkout-field checkout-field-wide"><span>Phone number</span><input name="phone" type="tel" autoComplete="tel" placeholder="+965" required aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone?'checkout-error-phone':undefined} data-testid="input-checkout-phone"/><CheckoutFieldError field="phone" message={fieldErrors.phone}/></label>
          </div>
        </section>
        <section className="surface checkout-panel">
          <div className="checkout-section-heading"><span className="checkout-step">02</span><div><h2>Delivery address</h2><p>Kuwait address details for this local preview.</p></div></div>
          <div className="checkout-fields">
            <label className="checkout-field"><span>Governorate</span><select name="governorate" defaultValue="" required aria-invalid={Boolean(fieldErrors.governorate)} aria-describedby={fieldErrors.governorate?'checkout-error-governorate':undefined} data-testid="select-checkout-governorate"><option value="" disabled>Select governorate</option><option>Capital</option><option>Hawalli</option><option>Farwaniya</option><option>Mubarak Al-Kabeer</option><option>Ahmadi</option><option>Jahra</option></select><CheckoutFieldError field="governorate" message={fieldErrors.governorate}/></label>
            <label className="checkout-field"><span>Area</span><input name="area" type="text" autoComplete="address-level2" placeholder="Area" required aria-invalid={Boolean(fieldErrors.area)} aria-describedby={fieldErrors.area?'checkout-error-area':undefined} data-testid="input-checkout-area"/><CheckoutFieldError field="area" message={fieldErrors.area}/></label>
            <label className="checkout-field"><span>Block</span><input name="block" type="text" placeholder="Block number" required aria-invalid={Boolean(fieldErrors.block)} aria-describedby={fieldErrors.block?'checkout-error-block':undefined} data-testid="input-checkout-block"/><CheckoutFieldError field="block" message={fieldErrors.block}/></label>
            <label className="checkout-field"><span>Street</span><input name="street" type="text" autoComplete="street-address" placeholder="Street name or number" required aria-invalid={Boolean(fieldErrors.street)} aria-describedby={fieldErrors.street?'checkout-error-street':undefined} data-testid="input-checkout-street"/><CheckoutFieldError field="street" message={fieldErrors.street}/></label>
            <label className="checkout-field"><span>Building / house</span><input name="building" type="text" placeholder="Building number" required aria-invalid={Boolean(fieldErrors.building)} aria-describedby={fieldErrors.building?'checkout-error-building':undefined} data-testid="input-checkout-building"/><CheckoutFieldError field="building" message={fieldErrors.building}/></label>
            <label className="checkout-field"><span>Floor / apartment <small>Optional</small></span><input name="unit" type="text" placeholder="Floor or apartment"/></label>
            <label className="checkout-field checkout-field-wide"><span>Delivery notes <small>Optional</small></span><textarea name="notes" rows={3} placeholder="Anything the courier should know?"/></label>
          </div>
        </section>
        <section className="checkout-payment-note">
          <ShieldCheck size={18}/><div><strong>Local demo order only</strong><p>Submitting creates a browser-only receipt and clears the cart. No card details, payment or real fulfillment are involved.</p></div>
        </section>
        {orderError&&<div className="checkout-error" role="alert" data-testid="checkout-order-error">{orderError}</div>}
        <button type="submit" className="button button-primary checkout-submit" data-testid="button-place-demo-order">Place demo order <ArrowRight size={15}/></button>
        <p className="checkout-privacy">Contact and address fields stay in this page only. They aren’t stored or transmitted.</p>
      </div>
      <aside className="surface checkout-summary">
        <div className="eyebrow">YOUR PARTS LIST</div><h2>Order summary</h2>
        <div className="checkout-items">{items.map(item=><div className="checkout-item" key={item.id}><div><strong>{item.name}</strong><span>{item.sku} · Qty {item.qty}</span></div><b>{fmt(item.price*item.qty)}</b></div>)}</div>
        <div className="summary-line"><span>Subtotal</span><strong className="mono">{fmt(subtotal)}</strong></div>
        <div className="summary-line"><span>Delivery</span><span>Not connected</span></div>
        <div className="summary-line summary-total"><span>Estimated total</span><span className="mono">{fmt(subtotal)}</span></div>
        <p className="checkout-total-note">KWD prices and stock are illustrative. Delivery fees are not included.</p>
        <Link className="checkout-edit-link" href="/cart">← Edit cart</Link>
      </aside>
    </form>
  </div>;
}

function Shell({children, count, globalSearch, setGlobalSearch}:{children:ReactNode;count:number;globalSearch:string;setGlobalSearch:(v:string)=>void}) {
  return <><Header count={count} search={globalSearch} onSearch={setGlobalSearch}/><main>{children}</main><Footer/></>;
}

function RoutedErrorBoundary({children}:{children:ReactNode}) { const [location]=useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }

function Router({items,add,update,remove,clearCart,search,setSearch}:{items:Item[];add:(item:Omit<Item,'qty'>)=>void;update:(id:string,qty:number)=>void;remove:(id:string)=>void;clearCart:()=>void;search:string;setSearch:(v:string)=>void}) {
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
  const add=(item:Omit<Item,'qty'>)=>{
    setItemsState(old=>{const found=old.find(x=>x.id===item.id);return found?old.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x):[...old,{...item,qty:1}]});
    cartNoticeId.current+=1;
    setCartNotice({id:cartNoticeId.current,name:item.name});
  };
  const update=(id:string,qty:number)=>setItemsState(old=>qty<=0?old.filter(x=>x.id!==id):old.map(x=>x.id===id?{...x,qty}:x));
  const remove=(id:string)=>setItemsState(old=>old.filter(x=>x.id!==id));
  const clearCart=()=>setItemsState([]);
  return <LanguageProvider language={language} setLanguage={setLanguage}><div lang={language} dir={language==='ar'?'rtl':'ltr'}><QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router items={items} add={add} update={update} remove={remove} clearCart={clearCart} search={search} setSearch={setSearch}/>{cartNotice&&<div key={cartNotice.id} className="cart-toast" role="status" aria-live="polite" data-testid="cart-add-feedback"><span className="cart-toast-icon"><CheckCircle2 size={17}/></span><span className="cart-toast-copy"><strong>{t('Added to cart',language)}</strong><span>{cartNotice.name}</span></span><Link href="/cart" className="cart-toast-link" data-testid="link-cart-feedback">{t('View cart',language)} <ArrowRight size={13}/></Link></div>}</WouterRouter><Toaster/></TooltipProvider></QueryClientProvider></div></LanguageProvider>;
}

export default App;

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  ArrowDown, ArrowRight, BatteryCharging, BookOpen, Bot,
  CheckCircle2, CircuitBoard, Cpu, Gauge, GraduationCap, Grid2X2,
  Info, Layers, LifeBuoy, MapPin, Menu, Minus, PackageCheck, Plus,
  Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Trash2, Truck, Wifi, X,
} from 'lucide-react';

type Item = { id: string; name: string; price: number; kind: 'component' | 'kit' | 'bom'; sku: string; qty: number };
type Product = { id: string; name: string; sku: string; category: string; price: number; stock: number; package: string; description: string; voltage: string; interface: string; icon: 'cpu' | 'sensor' | 'power' | 'display' | 'board' | 'parts'; };
type Kit = { id: string; title: string; category: string; level: 'Beginner' | 'Intermediate' | 'Advanced' | 'All levels'; domain: string; duration: string; price: number; desc: string; parts: string[]; icon: 'weather' | 'robot' | 'energy' | 'lab' | 'plant' | 'logic'; };

const products: Product[] = [
  { id:'esp32', name:'ESP32-WROOM-32D Dev Board', sku:'ESP32-WRM-32D', category:'Microcontrollers', price:2.850, stock:142, package:'DIP-38', description:'Dual-core Xtensa LX6 at 240MHz with integrated Wi-Fi and Bluetooth.', voltage:'3.3V nominal', interface:'SPI · I²C · UART', icon:'cpu' },
  { id:'nucleo', name:'STM32 Nucleo-F401RE', sku:'NUCLEO-F401RE', category:'Microcontrollers', price:6.200, stock:28, package:'Nucleo-64', description:'ARM Cortex-M4 board with on-board ST-LINK debugger and 512KB flash.', voltage:'3.3V / 5V Vin', interface:'USB · UART · SPI', icon:'board' },
  { id:'bme280', name:'BME280 Environmental Sensor', sku:'SNS-BME280-I2C', category:'Sensors', price:1.950, stock:65, package:'Sensor module', description:'Combined barometric pressure, humidity and temperature sensor.', voltage:'1.8V–3.6V', interface:'I²C · SPI', icon:'sensor' },
  { id:'hcsr04', name:'HC-SR04 Ultrasonic Sensor', sku:'SNS-HCSR04-5V', category:'Sensors', price:0.850, stock:210, package:'Through-hole', description:'Precision non-contact distance sensor for robotics and ranging.', voltage:'5V DC', interface:'GPIO · trigger', icon:'sensor' },
  { id:'pico', name:'Raspberry Pi Pico W', sku:'RPI-PICO-W-2024', category:'Microcontrollers', price:2.100, stock:87, package:'DIP-40', description:'Dual-core RP2040 with 2.4GHz Wi-Fi and Bluetooth 5.2.', voltage:'1.8V–5.5V VSYS', interface:'PIO · SPI · I²C', icon:'board' },
  { id:'lcd', name:'16×2 I²C Character LCD', sku:'LCD-1602-I2C', category:'Displays', price:1.450, stock:54, package:'1602 module', description:'High-contrast character display with integrated I²C backpack.', voltage:'5V DC', interface:'I²C address 0x27', icon:'display' },
  { id:'level', name:'Logic Level Converter 4-Channel', sku:'MOD-LLC-4CH-BI', category:'Power & Logic', price:0.650, stock:320, package:'4-channel board', description:'Bidirectional MOSFET-based 3.3V / 5V signal translation.', voltage:'1.8V–5V', interface:'I²C · SPI · UART', icon:'power' },
  { id:'resistor', name:'Metal Film Resistor Kit', sku:'PAS-RES-KIT-600', category:'Passives', price:2.500, stock:75, package:'600 pieces', description:'1% tolerance assorted axial resistors in a labelled organizer.', voltage:'250mW · 0.25W', interface:'E12 series', icon:'parts' },
  { id:'jumper', name:'Breadboard Jumper Wire Set', sku:'PROTO-JMP-40', category:'Prototyping', price:0.950, stock:183, package:'40-piece set', description:'Male-to-female jumper leads in a practical range of colours.', voltage:'5V logic', interface:'2.54mm pitch', icon:'parts' },
  { id:'soil', name:'Capacitive Soil Moisture Sensor', sku:'SNS-SOIL-CAP-12', category:'Sensors', price:1.200, stock:48, package:'Analog module', description:'Corrosion-resistant PCB sensor with stable analog output.', voltage:'3.3V analog', interface:'ADC output', icon:'sensor' },
  { id:'tp4056', name:'TP4056 Li-Ion Charger Module', sku:'PWR-TP4056-C', category:'Power & Logic', price:0.750, stock:92, package:'USB-C module', description:'Single-cell charging module with battery protection circuit.', voltage:'4.2V charge', interface:'USB-C · Li-ion', icon:'power' },
  { id:'breadboard', name:'830-Point Solderless Breadboard', sku:'PROTO-BB-830', category:'Prototyping', price:1.350, stock:116, package:'830 tie points', description:'Full-size prototyping board with dual power rails.', voltage:'5V logic', interface:'2.54mm pitch', icon:'parts' },
];

const kits: Kit[] = [
  { id:'weather-kit', title:'IoT Weather Station Kit', category:'IoT & Smart Home', level:'Intermediate', domain:'iot', duration:'1.5–2 hrs', price:12.500, desc:'Monitor pressure, temperature and humidity. A compact Wi-Fi telemetry build for MQTT or a local dashboard.', parts:['ESP32 NodeMCU','BME280 sensor','0.96″ I²C OLED','Breadboard + jumpers'], icon:'weather' },
  { id:'rover-kit', title:'Obstacle-Avoiding Rover', category:'Robotics', level:'Beginner', domain:'robotics', duration:'3–4 hrs', price:18.750, desc:'A practical two-wheel mobile robot with PWM speed control and ultrasonic obstacle sensing.', parts:['2WD smart chassis','Arduino-compatible board','Dual H-bridge','HC-SR04 sonar'], icon:'robot' },
  { id:'energy-kit', title:'Smart Home Energy Meter', category:'IoT & Automation', level:'Intermediate', domain:'iot', duration:'2–3 hrs', price:14.200, desc:'Explore safe, non-invasive current measurement and build an energy telemetry prototype.', parts:['SCT-013 CT clamp','ESP32 dual-core','Burden resistor module','3.3V bias circuit'], icon:'energy' },
  { id:'university-kit', title:'KU Electrical Engineering Lab Kit', category:'University Labs', level:'All levels', domain:'university', duration:'Semester-long', price:24.500, desc:'A broad, reusable lab bench set for foundational circuit design and measurement coursework.', parts:['Digital multimeter','830-point breadboard','Dual 3.3/5V rail','Resistor assortment'], icon:'lab' },
  { id:'plant-kit', title:'Plant-Soin Telemetry & Auto-Watering', category:'Automation', level:'Beginner', domain:'automation', duration:'1.5–2 hrs', price:8.900, desc:'A small garden monitor with capacitive sensing and a switched mini-pump output.', parts:['Capacitive soil sensor','Submersible pump','Relay module','Arduino-compatible board'], icon:'plant' },
  { id:'fpga-kit', title:'FPGA & Digital Logic Bundle', category:'Digital Logic', level:'Advanced', domain:'university', duration:'4–6 hrs', price:32.000, desc:'Develop timing, logic and HDL fundamentals with programmable hardware and useful lab tools.', parts:['FPGA development board','7-segment modules','USB-JTAG blaster','Logic probe'], icon:'logic' },
];

const categories = ['All components','Microcontrollers','Sensors','Power & Logic','Passives','Prototyping','Displays'];
const kitDomains = ['All domains','Robotics','IoT & Smart Home','University Labs','Automation'];
const fmt = (value:number) => `${value.toFixed(3)} KWD`;
const queryClient = new QueryClient();

function useDocument(title:string, description:string) {
  useEffect(() => {
    document.title = `${title} | Voltiva Electronics`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name','description'); document.head.append(meta); }
    meta.setAttribute('content',description);
  },[title,description]);
}

function Logo() {
  return <Link href="/" className="brand" data-testid="link-home" aria-label="Voltiva Electronics home">
    <span className="brand-mark"><CircuitBoard size={22}/></span>
    <span><span className="brand-name">Voltiva</span><span className="brand-tag">ELECTRONICS · KUWAIT</span></span>
  </Link>;
}

function Header({ count, search, onSearch }:{count:number; search:string; onSearch:(v:string)=>void}) {
  const [path,setLocation] = useLocation();
  const [open,setOpen] = useState(false);
  const nav = [['Components','/components'],['Project Kits','/project-kits'],['Build Assist','/build-assist'],['About','/about']] as const;
  return <header className="site-header"><div className="header-inner">
    <Logo/>
    <nav className="nav-links" aria-label="Main navigation">{nav.map(([label,url])=><Link key={url} href={url} className={`nav-link ${path===url?'active':''}`} data-testid={`nav-${url.slice(1)}`}>{label}</Link>)}</nav>
    <div className="header-search"><Search size={15}/><input aria-label="Search components" placeholder="Search components..." value={search} onChange={e=>onSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')setLocation('/components')}} data-testid="input-global-search"/></div>
    <div className="header-actions">
      <span className="tag" aria-label="Currency Kuwait Dinar">KWD</span>
      <Link href="/cart" className="icon-button" aria-label={`Cart, ${count} items`} data-testid="link-cart"><ShoppingCart size={17}/>{count>0&&<span className="cart-count" data-testid="cart-count">{count}</span>}</Link>
      <button className="icon-button mobile-toggle" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} onClick={()=>setOpen(!open)} data-testid="button-mobile-menu">{open?<X size={18}/>:<Menu size={18}/>}</button>
    </div>
  </div>{open&&<nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(([label,url])=><Link key={url} href={url} onClick={()=>setOpen(false)} className={`nav-link ${path===url?'active':''}`} data-testid={`mobile-nav-${url.slice(1)}`}>{label}</Link>)}</nav>}</header>;
}

function Footer() {
  return <footer className="footer"><div className="container">
    <div className="footer-grid"><div><Logo/><p>Components, curated kits and engineering guidance for people building real hardware in Kuwait.</p><span className="tag"><span className="dot"/> Kuwait · AST (UTC+3)</span></div>
      <div><h4>Explore</h4><Link href="/components">Component catalog</Link><Link href="/project-kits">Project kits</Link><Link href="/build-assist">Build Assist</Link><Link href="/cart">Shopping cart</Link></div>
      <div><h4>Voltiva</h4><Link href="/about">About Voltiva</Link><a href="/about#delivery">Kuwait delivery</a><a href="/about#hub">Shuwaikh hub</a></div>
      <div><h4>Local details</h4><span className="footer-note">Prices shown in KWD</span><span className="footer-note">English · العربية-ready</span><span className="footer-note">Illustrative catalog data</span></div>
    </div><div className="footer-bottom"><span>© 2025 Voltiva Electronics · Made for Kuwait’s makers and engineering teams.</span><span>Local-first hardware, clearly specified.</span></div>
  </div></footer>;
}

function ProductArt({ icon, id }:{icon:Product['icon'];id:string}) {
  const Icon=icon==='cpu'?Cpu:icon==='sensor'?Gauge:icon==='power'?BatteryCharging:icon==='display'?Grid2X2:icon==='board'?CircuitBoard:Layers;
  return <div className="product-art" aria-hidden="true"><span className="art-index">VLT // {id.slice(0,4).toUpperCase()}</span><span className="art-visual"><Icon size={30}/></span></div>;
}

function ProductCard({ product, add }:{product:Product;add:(item:Omit<Item,'qty'>)=>void}) {
  return <article className="product-card surface" data-testid={`card-product-${product.id}`}>
    <ProductArt icon={product.icon} id={product.id}/>
    <div className="product-content">
      <div className="product-meta"><span>{product.stock} sample units</span><span>{product.package}</span></div>
      <div><h3>{product.name}</h3><div className="mono" style={{fontSize:9,color:'#718096',marginTop:4}}>SKU: {product.sku}</div></div>
      <p className="product-desc">{product.description}</p>
      <div className="specs"><span>Voltage <b>{product.voltage}</b></span><span>Interface <b>{product.interface}</b></span></div>
      <div className="product-bottom"><div><div className="price">{fmt(product.price)}</div><div className="stock"><span className="dot"/> Kuwait catalog sample</div></div></div>
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
        <p className="lead">Explore electronic components, development boards, sensors and tools—with clear specifications to help you choose with confidence.</p>
        <div className="hero-actions"><Link className="button button-primary" href="/components" data-testid="link-shop-components">Shop components <ArrowRight size={16}/></Link><Link className="button button-outline" href="/project-kits" data-testid="link-explore-kits">Explore project kits <Layers size={16}/></Link></div>
        <div className="eyebrow">From parts to possibilities</div>
        <div className="trust-row"><span><ShieldCheck size={15}/> Datasheets and specs, clearly listed</span><span><Truck size={15}/> Kuwait-local delivery details</span><span><Cpu size={15}/> OEM-focused catalog</span></div>
      </div>
      <div className="bench-visual" aria-label="Illustration of a prototyping board"><div className="bench-canvas"><div className="wire"/><div className="wire two"/><div className="board"><div className="chip">VLT / MCU<br/>ESP32 CORE</div></div><div className="bench-badge badge-one">CORE SOC<b>ESP32 · STM32</b></div><div className="bench-badge badge-two">BUS PROTOCOL<b>I²C / SPI / UART</b></div></div><div className="bench-footer"><span><CircuitBoard size={13}/> BENCH-RIG-KW // REV 2.4</span><span style={{color:'#007b91'}}>TECHNICAL CATALOG</span></div></div>
    </div></section>
    <section className="section feature-section"><div className="container">
      <div className="feature-head"><div><div className="eyebrow">PRECISION CATALOG & WORKFLOW</div><h2>The right parts. A clearer path to building.</h2><p className="lead" style={{fontSize:14,marginBottom:0}}>Find, understand and combine components with a Kuwait-first point of view.</p></div><span className="tag">DESIGNED FOR THE BENCH</span></div>
      <div className="feature-grid">
        <article className="surface feature-card"><div><div className="feature-icon"><Search size={23}/></div><h3>Find parts faster</h3><p>Search by part name, SKU or interface. Filter to the component families that fit your build and compare practical specs at a glance.</p></div><div className="tag-row"><span className="tag">SKU search</span><span className="tag">Voltage details</span><span className="tag">KWD pricing</span></div></article>
        <article className="surface feature-card"><div><div className="feature-icon"><BookOpen size={23}/></div><h3>Choose with confidence</h3><p>Component cards put operating voltage, package and common interfaces in view, so your next wiring decision starts with the facts.</p></div><div className="tag-row"><span className="tag">Specs up front</span><span className="tag">Logic levels</span><span className="tag">Clear identifiers</span></div></article>
        <article className="surface feature-card"><div><div className="feature-icon"><PackageCheck size={23}/></div><h3>Build with curated kits</h3><p>Start from a focused kit for robotics, IoT or university labs, with a concise parts list and an illustrative local KWD price.</p></div><div className="tag-row"><span className="tag">Curated BOMs</span><span className="tag">Beginner to advanced</span></div></article>
        <article className="surface feature-card assist-feature"><div><div className="feature-icon"><Bot size={23}/></div><h3>Meet Build Assist</h3><p>Describe a project and get a locally generated demo BOM. Tune your target voltage and budget, then move its parts into your cart.</p></div><div className="feature-arrow"><Link href="/build-assist" data-testid="link-build-assist-feature">Explore Build Assist <ArrowRight size={16}/></Link><span className="tag">Local demo tool</span></div></article>
      </div>
    </div></section>
    <section className="section"><div className="container"><div className="dark-cta"><div className="eyebrow" style={{color:'#54d8ec'}}>LOCAL CATALOG · KUWAIT DELIVERY DETAILS</div><h2>Your next idea starts with the right parts.</h2><p>Browse components or plan a parts list with Build Assist. See local delivery information for Kuwait governorates before you make your next move.</p><div className="hero-actions"><Link className="button button-primary" href="/components" data-testid="link-start-building">Start building <ArrowRight size={16}/></Link><Link className="button button-outline" href="/build-assist" data-testid="link-ask-assist">Plan a BOM</Link></div><span className="mono" style={{fontSize:10,color:'#bcc8d1'}}>Kuwait City · Hawalli · Shuwaikh · All governorates</span></div></div></section>
  </>;
}

function CatalogPage({ add, globalSearch }:{add:(item:Omit<Item,'qty'>)=>void;globalSearch:string}) {
  useDocument('Components catalog','Search and filter electronic components with clear specifications and illustrative KWD pricing.');
  const [query,setQuery]=useState(globalSearch); const [category,setCategory]=useState('All components'); const [stockOnly,setStockOnly]=useState(false); const [voltage,setVoltage]=useState<string[]>([]); const [mount,setMount]=useState<string[]>([]); const [sort,setSort]=useState('verified');
  useEffect(()=>{if(globalSearch)setQuery(globalSearch)},[globalSearch]);
  const toggle=(values:string[],setter:(v:string[])=>void,value:string)=>setter(values.includes(value)?values.filter(x=>x!==value):[...values,value]);
  const filtered=useMemo(()=>products.filter(p=>(category==='All components'||p.category===category)&&(!stockOnly||p.stock>0)&&(!query||`${p.name} ${p.sku} ${p.category} ${p.interface} ${p.description}`.toLowerCase().includes(query.toLowerCase()))&&(!voltage.length||voltage.some(v=>p.voltage.toLowerCase().includes(v.toLowerCase().replace(' dc',''))||p.voltage.toLowerCase().includes(v.toLowerCase())))&&(!mount.length||(mount.includes('Through-hole')&&p.package.toLowerCase().includes('dip'))||(mount.includes('Surface mount')&&p.package.toLowerCase().includes('smd')))),[category,stockOnly,query,voltage,mount]);
  const sorted=[...filtered].sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='stock'?b.stock-a.stock:products.indexOf(a)-products.indexOf(b));
  function reset(){setCategory('All components');setStockOnly(false);setVoltage([]);setMount([]);setQuery('');}
  return <div className="container page-top">
    <div className="page-heading-row"><div><div className="eyebrow">CATALOG / KUWAIT HUB</div><h1>Components catalog</h1><p className="lead" style={{fontSize:14,marginBottom:20}}>A clear starting point for the parts on your bench. Catalog prices and sample inventory are illustrative.</p></div><span className="tag"><MapPin size={12}/> Kuwait · Shuwaikh reference</span></div>
    <div className="catalog-search surface"><div className="search-field"><Search size={17}/><input aria-label="Search components by name or SKU" placeholder="Search boards, sensors, part numbers, interfaces…" value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-component-search"/></div><button className="button button-outline small-button" onClick={reset} data-testid="button-reset-filters"><SlidersHorizontal size={14}/> Reset filters</button></div>
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
  </div>;
}

function KitArt({kit}:{kit:Kit}) {
  const Icon=kit.icon==='robot'?CircuitBoard:kit.icon==='energy'?BatteryCharging:kit.icon==='lab'?GraduationCap:kit.icon==='logic'?Cpu:kit.icon==='plant'?Gauge:Wifi;
  return <div className="kit-art" aria-label={`${kit.title} illustration`}><div className="kit-plate"><Icon/></div><div className="kit-labels"><span>VLT / KIT</span><span>{kit.domain.toUpperCase()}</span></div></div>;
}

function KitsPage({add}:{add:(item:Omit<Item,'qty'>)=>void}) {
  useDocument('Project kits','Explore curated electronics kits for robotics, IoT, automation and university labs in Kuwait.');
  const [level,setLevel]=useState('All levels');const [domain,setDomain]=useState('All domains');const [query,setQuery]=useState('');
  const shown=kits.filter(k=>(level==='All levels'||k.level===level||k.level==='All levels')&&(domain==='All domains'||k.category===domain)&&(!query||`${k.title} ${k.desc} ${k.parts.join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  return <>
    <section className="kit-hero"><div className="container"><div className="eyebrow" style={{color:'#55d7e9'}}>CURATED PROJECT STARTERS · KUWAIT</div><div className="page-heading-row" style={{alignItems:'center'}}><div><h1>Curated project kits.</h1><p>Pre-selected parts for practical builds, with the core BOM and an illustrative KWD price up front.</p></div><div className="kit-stats"><div className="kit-stat"><strong>06</strong><span>Sample kits</span></div><div className="kit-stat"><strong>01–06h</strong><span>Typical build time</span></div></div></div></div></section>
    <div className="container"><div className="kit-toolbar surface"><div className="chip-row"><span className="eyebrow" style={{marginRight:4}}>Filter kits</span>{['All levels','Beginner','Intermediate','Advanced'].map(l=><button key={l} className={`filter-chip ${level===l?'active':''}`} onClick={()=>setLevel(l)} data-testid={`filter-kit-level-${l.toLowerCase()}`}>{l}</button>)}</div><div className="chip-row">{kitDomains.map(d=><button key={d} className={`filter-chip ${domain===d?'active':''}`} onClick={()=>setDomain(d)} data-testid={`filter-kit-domain-${d.toLowerCase().replaceAll(' ','-').replace('&-','')}`}>{d}</button>)}</div></div>
      <div className="search-field" style={{marginTop:17}}><Search size={17}/><input placeholder="Search kits by project, part or domain…" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search project kits" data-testid="input-kit-search"/></div>
      {shown.length?<div className="kits-grid">{shown.map(k=><article className="kit-card surface" key={k.id} data-testid={`card-kit-${k.id}`}><KitArt kit={k}/><div className="kit-body"><div className="kit-code"><span>VLT-KIT-{k.id.toUpperCase()}</span><span>{k.level}</span></div><span className="tag" style={{width:'max-content'}}>{k.category} · {k.duration}</span><h3>{k.title}</h3><p>{k.desc}</p><div><div className="filter-title" style={{fontSize:9}}>Core parts</div><div className="kit-bom">{k.parts.map(p=><span key={p}>{p}</span>)}</div></div><div className="kit-bottom"><span className="mono" style={{fontSize:9,color:'#687680'}}>ILLUSTRATIVE KIT PRICE</span><span className="price">{fmt(k.price)}</span></div><div className="kit-actions"><button className="button button-outline small-button" onClick={()=>window.alert(`${k.title}\n\nCore BOM: ${k.parts.join(', ')}\n\nThis local demo includes a kit overview only.`)} data-testid={`button-schematic-${k.id}`}><CircuitBoard size={14}/> BOM details</button><button className="button button-primary small-button" onClick={()=>add({id:k.id,name:k.title,price:k.price,kind:'kit',sku:`VLT-KIT-${k.id.toUpperCase()}`})} data-testid={`button-add-kit-${k.id}`}><ShoppingCart size={14}/> Add kit</button></div></div></article>)}</div>:<div className="surface empty-state"><h3>No kits match those filters</h3><p className="lead" style={{fontSize:13,margin:'0 auto'}}>Choose another domain or search term.</p></div>}
    </div>
    <section className="section feature-section"><div className="container"><div className="eyebrow">THE VOLTIVA KIT STANDARD</div><h2>Why start with a curated kit?</h2><div className="guarantee-grid" style={{marginTop:22}}>{[['Zero missing parts','An itemized parts list makes it easier to see what belongs on your bench.'],['Built around learning','Project concepts connect components to useful engineering fundamentals.'],['Local context','KWD pricing and Kuwait delivery information stay in view while you plan.']].map(([t,d],i)=><article className="surface guarantee-card" key={t}><span className="feature-icon"><CheckCircle2 size={20}/></span><h3>{t}</h3><p>{d}</p></article>)}</div></div></section>
  </>;
}

function BuildAssistPage({add}:{add:(item:Omit<Item,'qty'>)=>void}) {
  useDocument('Build Assist','Create a local demo bill of materials from your project brief. Results are illustrative, not generated by an AI service.');
  const [prompt,setPrompt]=useState('I want to build a greenhouse monitor with soil moisture and temperature readings.');const [voltage,setVoltage]=useState('3.3V');const [level,setLevel]=useState('University');const [budget,setBudget]=useState(15);const [generated,setGenerated]=useState(false);const [notice,setNotice]=useState('');
  const generate=()=>{if(prompt.trim().length<8){setNotice('Add a little more detail to describe your hardware idea.');return}setGenerated(true);setNotice('Local demo BOM generated from your project details.');};
  const bom=useMemo(()=>{const text=prompt.toLowerCase();let ids=text.includes('robot')||text.includes('parking')||text.includes('distance')?['esp32','hcsr04','level','jumper']:text.includes('greenhouse')||text.includes('soil')||text.includes('plant')?['esp32','soil','bme280','tp4056']:text.includes('display')||text.includes('screen')?['pico','lcd','jumper','breadboard']:['esp32','bme280','breadboard','jumper'];return ids.map(id=>products.find(p=>p.id===id)!).filter(Boolean)},[prompt]);
  const total=bom.reduce((n,p)=>n+p.price,0);
  const addBom=()=>{bom.forEach(p=>add({id:`bom-${p.id}`,name:p.name,price:p.price,kind:'bom',sku:p.sku}));setNotice(`${bom.length} BOM items added to your local cart.`)};
  return <div className="container page-top"><div className="eyebrow">LOCAL PROJECT PLANNER · KUWAIT</div><h1 style={{fontSize:'clamp(33px,4vw,48px)'}}>Build Assist: <span style={{color:'#00687b'}}>describe your idea.</span></h1><p className="lead">A local demo tool that maps a project brief to a sample parts list. It is not an AI service, live inventory check or engineering review.</p>
    <div className="tag" style={{margin:'13px 0 20px'}}><Info size={13}/> Demo catalog · illustrative KWD prices and sample stock · verify electrical compatibility independently</div>
    <div className="assist-layout">
      <section><div className="assist-form surface"><div className="eyebrow">PROJECT SPECIFICATION</div><div className="assist-section"><label htmlFor="project-prompt">What are you building?</label><textarea id="project-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={500} placeholder="Describe sensors, controllers, communication needs or constraints…" data-testid="input-build-prompt"/><div className="mono" style={{textAlign:'right',fontSize:9,color:'#7c8991',marginTop:5}} data-testid="text-prompt-count">{prompt.length} / 500</div></div>
        <div className="assist-section"><label>Quick project starters</label><div className="preset-row">{[['Greenhouse','Greenhouse monitor with soil moisture and temperature sensors'],['Parking sensor','Arduino-compatible parking sensor with distance alerts'],['Line follower','Two-motor line follower robot with IR sensor array'],['Weather node','Wi-Fi weather node measuring pressure and humidity']].map(([name,value])=><button type="button" className="preset" key={name} onClick={()=>setPrompt(value)} data-testid={`preset-${name.toLowerCase().replace(' ','-')}`}>{name}</button>)}</div></div>
        <div className="assist-section"><label>Target logic voltage</label><div className="segmented">{['3.3V','5V','12V'].map(v=><button type="button" className={voltage===v?'active':''} key={v} onClick={()=>setVoltage(v)} data-testid={`button-voltage-${v.replace('.','-')}`}>{v}<br/><small>{v==='3.3V'?'MCU native':v==='5V'?'TTL logic':'actuator rail'}</small></button>)}</div></div>
        <div className="assist-section"><label>Builder context</label><div className="segmented">{['Hobbyist','University','Industrial'].map(v=><button type="button" className={level===v?'active':''} key={v} onClick={()=>setLevel(v)} data-testid={`button-level-${v.toLowerCase()}`}>{v}</button>)}</div></div>
        <div className="assist-section"><div className="range-line"><label htmlFor="budget-range" style={{margin:0}}>Maximum BOM budget</label><strong data-testid="text-budget-value">{fmt(budget)}</strong></div><input type="range" id="budget-range" min="3" max="45" step=".5" value={budget} onChange={e=>setBudget(Number(e.target.value))} data-testid="input-budget"/><div className="range-line" style={{color:'#849099',marginTop:4}}><span>3.000 KWD</span><span>45.000 KWD</span></div></div>
        <button className="button button-primary" style={{width:'100%',height:48}} onClick={generate} data-testid="button-generate-bom"><CircuitBoard size={17}/> Generate local demo BOM</button>
        <p className="mono" style={{textAlign:'center',fontSize:9,color:'#6b7880',margin:'10px 0 0'}}>Rule-based local sample · no external service or live stock check</p>
        {notice&&<p role="status" className="tag" style={{marginTop:12}} data-testid="status-build-assist">{notice}</p>}
      </div><div className="surface" style={{padding:15,marginTop:14,background:'#e8f1fb'}}><div style={{display:'flex',gap:12,alignItems:'center'}}><span className="feature-icon" style={{margin:0,background:'white'}}><LifeBuoy size={20}/></span><div><strong style={{fontSize:12}}>Need a local lab review?</strong><p style={{fontSize:11,color:'#566776',margin:'4px 0 0'}}>Read about Voltiva’s Shuwaikh hub and local support details.</p></div></div><Link href="/about#hub" className="button button-outline small-button" style={{marginTop:12}} data-testid="link-about-lab">About the Kuwait hub <ArrowRight size={13}/></Link></div></section>
      <section className="bom-panel surface" aria-label="Demo bill of materials" data-testid="panel-demo-bom"><div className="assist-output-head"><div><div className="eyebrow" style={{color:'#9a4600'}}>SAMPLE OUTPUT · NOT VERIFIED</div><h2>{generated?'Project parts outline':'Greenhouse monitor outline'}</h2><p>{generated?prompt:'Example preview — generate a local demo BOM from your own project brief.'}</p></div><span className="demo-stamp">LOCAL DEMO</span></div>
        <div className="diagram"><div className="diagram-label"><span>Illustrative connection flow</span><span>{voltage} logic target</span></div><div className="diagram-flow"><div className="diagram-node">Power<br/>source</div><ArrowRight className="diagram-arrow" size={18}/><div className="diagram-node core">ESP32<br/>controller</div><ArrowRight className="diagram-arrow" size={18}/><div className="diagram-node">Sensor<br/>module</div></div></div>
        <div className="check-grid"><div className="check-card"><CheckCircle2 size={16} color="#007b91"/><b>Logic target</b><span>{voltage} selected</span></div><div className="check-card"><Gauge size={16} color="#007b91"/><b>Budget target</b><span>{fmt(budget)}</span></div><div className="check-card"><GraduationCap size={16} color="#007b91"/><b>Context</b><span>{level}</span></div></div>
        <div className="bom-title"><span>Suggested demo bill of materials</span><span className="mono">{bom.length} items</span></div>
        <div>{bom.map((p,i)=><div className="bom-row" key={p.id} data-testid={`row-bom-${p.id}`}><span className="mono" style={{fontSize:10,color:'#73808a'}}>0{i+1}</span><div><div className="bom-name">{p.name}</div><div className="bom-spec">{p.voltage} · {p.interface} · SKU {p.sku}</div></div><div className="bom-price">{fmt(p.price)}</div><div className="bom-stock">Sample</div></div>)}</div>
        <div className="bom-total"><span>Estimated demo BOM total</span><span className="mono">{fmt(total)}</span></div>
        {total>budget&&<div className="notice">This sample BOM is above your stated budget. Review quantities or choose alternative parts before purchase.</div>}
        <div className="notice"><strong>Electrical safety:</strong> These suggestions are illustrative only. Check voltage, current, wiring and datasheets for your specific design before powering hardware.</div>
        <button className="button button-primary" style={{width:'100%'}} onClick={addBom} data-testid="button-add-bom-cart"><ShoppingCart size={16}/> Add demo BOM items to cart · {fmt(total)}</button>
      </section>
    </div>
  </div>;
}

function AboutPage() {
  useDocument('About Voltiva','Learn about Voltiva Electronics, our Kuwait-focused hardware catalog and local delivery details.');
  const pillars=[['Genuine component focus','Clear part identifiers, specifications and product context help makers choose intentionally.'],['Bench-minded details','Voltage, package and interface notes bring useful engineering information forward.'],['Kuwait-local logistics','Delivery and pickup details are presented for Kuwait-based builders.'],['Maker and university support','A practical resource for student projects, capstones and hardware teams.']];
  return <>
    <section className="about-hero"><div className="container"><div className="eyebrow">STATE OF KUWAIT · HARDWARE & LOCAL DELIVERY</div><div className="about-grid"><div><h1>Fueling hardware innovation in Kuwait—from university labs to commercial prototypes.</h1><p className="lead">Voltiva Electronics is a Kuwait-focused storefront for makers, engineering students and hardware teams. We bring parts, project kits and clear local delivery information into one practical place.</p><span className="mono" style={{fontSize:10,color:'#64727d'}}>LOCAL-FIRST · KWD PRICING · ENGLISH / العربية-READY</span></div><div className="about-stats surface"><div className="filter-title">Kuwait operations context</div><div className="stat-pair"><div><strong>Shuwaikh</strong><span>Hub reference</span></div><div><strong>AST +03</strong><span>Kuwait local time</span></div></div><span className="mono">Catalog and inventory figures are illustrative demo data.</span></div></div>
      <div className="photo-strip"><div className="photo-panel"><div className="photo-caption"><span>Local engineering context</span><b>Test-bench thinking</b></div></div><div className="photo-panel"><div className="photo-caption"><span>Parts organization</span><b>Ready for the workbench</b></div></div><div className="photo-panel"><div className="photo-caption"><span>Academia & makers</span><b>Capstone build support</b></div></div></div>
    </div></section>
    <section className="section" id="delivery"><div className="container mission-layout"><div><div className="eyebrow">01 / OUR LOCAL APPROACH</div><h2>Make the hardware path feel closer.</h2><p className="lead" style={{fontSize:14}}>International lead times and unclear specifications can slow down a good idea. Voltiva is designed around Kuwait builders who want approachable component discovery, useful product details and a straightforward view of local delivery.</p><p style={{fontSize:13,lineHeight:1.7,color:'#576671'}}>From a first breadboard prototype to a university lab requirement, the storefront connects components and curated project kits with local context. No complicated logistics language—just the useful information needed to plan.</p><div className="arabic-note" dir="rtl" lang="ar"><strong style={{color:'#00687b'}}>مصمم لصنّاع ومهندسي الكويت</strong><p style={{fontSize:13,margin:'6px 0 0'}}>مكونات إلكترونية ومجموعات مشاريع للمهندسين والطلاب والمبتكرين في الكويت، مع معلومات واضحة عن الأسعار بالدينار الكويتي والتوصيل المحلي.</p></div></div>
      <div className="surface" style={{padding:19}}><div className="eyebrow">KUWAIT DELIVERY OVERVIEW</div><h3 style={{margin:'11px 0 5px'}}>Local zones, easy to understand.</h3><p style={{fontSize:11,color:'#67747e',marginBottom:15}}>Example delivery coverage and timing shown for planning. Confirm availability and arrangements directly when this service is operational.</p><div className="coverage-grid">{[['Capital & Hawalli','Sharq · Shuwaikh · Jabriya · Salmiya','Illustrative same-day zone'],['Ahmadi & Mubarak','Fintas · Egaila · Mahboula · Mangaf','Illustrative scheduled route'],['Jahra & outlying','Jahra · Sulaibiya · Amghara','Illustrative daily route']].map(([a,b,c])=><div className="coverage-card surface" key={a}><strong>{a}</strong><p>{b}</p><span>{c}</span></div>)}</div><div style={{marginTop:13,padding:12,background:'#f2f5f7',borderRadius:7,fontSize:11,color:'#51616d'}}><Truck size={14} style={{verticalAlign:'middle',marginRight:6}}/>Shuwaikh pickup and courier logistics are reference details, not a connected fulfillment service.</div></div>
    </div></section>
    <section className="section feature-section"><div className="container"><div className="eyebrow">02 / ENGINEERING ASSURANCE</div><h2>Built for people who build.</h2><div className="pillar-grid" style={{marginTop:20}}>{pillars.map(([title,desc],i)=><article className="surface pillar-card" key={title}><span className="feature-icon"><span className="mono">0{i+1}</span></span><h3>{title}</h3><p>{desc}</p><span className="mono" style={{fontSize:9,color:'#007b91'}}>VOLTIVA / FIELD NOTE</span></article>)}</div></div></section>
    <section className="section" id="hub"><div className="container"><div className="eyebrow">03 / PHYSICAL COUNTER & FACILITY DETAILS</div><h2>Shuwaikh hub & operations</h2><div className="mission-layout" style={{marginTop:20}}><div style={{display:'grid',gap:12}}><article className="surface" style={{padding:17}}><h3><MapPin size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>Hub reference</h3><p style={{fontSize:12,color:'#61717d',lineHeight:1.6,margin:0}}>Industrial Shuwaikh, Block 1, Street 14, Kuwait. Address and counter details are illustrative reference content for this frontend demo.</p></article><article className="surface" style={{padding:17}}><h3><Gauge size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>Hours reference</h3><div className="summary-line"><span>Saturday – Thursday</span><strong>09:00–21:00 AST</strong></div><div className="summary-line"><span>Friday</span><strong>Closed</strong></div></article><article className="surface" style={{padding:17}}><h3><LifeBuoy size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>Engineering desk</h3><p style={{fontSize:12,color:'#61717d',margin:0}}>Contact and consultation services are not connected in this demo.</p></article></div><div className="map-panel" aria-label="Stylized Kuwait local delivery map illustration"><div className="map-route"/><span className="map-pin one"/><span className="map-pin two"/><span className="map-pin three"/><span className="tag" style={{position:'absolute',top:13,left:13}}><MapPin size={12}/> KUWAIT · ROUTE ILLUSTRATION</span><span className="mono" style={{position:'absolute',bottom:14,right:14,fontSize:10,color:'#536972'}}>SHUWAIKH HUB → GOVERNORATES</span></div></div></div></section>
  </>;
}

function CartPage({items,update,remove}:{items:Item[];update:(id:string,qty:number)=>void;remove:(id:string)=>void}) {
  useDocument('Shopping cart','Review and update the locally stored Voltiva Electronics cart. No order or payment is submitted.');
  const subtotal=items.reduce((n,i)=>n+i.price*i.qty,0);
  return <div className="container page-top"><div className="eyebrow">YOUR BUILD / LOCAL CART</div><h1 style={{fontSize:38}}>Cart review</h1><p className="lead" style={{fontSize:14}}>Your selections stay in this browser. This demo does not submit orders or payments.</p>
    {!items.length?<div className="surface empty-state"><div className="empty-icon"><ShoppingCart size={23}/></div><h3>Your cart is ready for a build.</h3><p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>Add components, a project kit or a demo BOM to keep your parts list together.</p><div style={{display:'flex',justifyContent:'center',gap:9,flexWrap:'wrap'}}><Link className="button button-primary" href="/components" data-testid="link-empty-cart-components">Browse components</Link><Link className="button button-outline" href="/project-kits" data-testid="link-empty-cart-kits">Explore kits</Link></div></div>:
      <div className="cart-layout"><section className="cart-list surface" aria-label="Cart items">{items.map(i=><article className="cart-row" key={i.id} data-testid={`row-cart-${i.id}`}><div className="cart-product"><span className="cart-thumb">{i.kind==='kit'?<PackageCheck size={22}/>:i.kind==='bom'?<CircuitBoard size={22}/>:<Cpu size={22}/>}</span><span><strong>{i.name}</strong><span>{i.sku} · {i.kind==='kit'?'Project kit':i.kind==='bom'?'Build Assist demo item':'Component'}</span></span></div><div className="quantity" aria-label={`Quantity for ${i.name}`}><button aria-label="Decrease quantity" onClick={()=>update(i.id,i.qty-1)} data-testid={`button-decrease-${i.id}`}><Minus size={12}/></button><input aria-label={`Quantity ${i.name}`} type="number" min="1" value={i.qty} onChange={e=>update(i.id,Math.max(1,Number(e.target.value)||1))} data-testid={`input-quantity-${i.id}`}/><button aria-label="Increase quantity" onClick={()=>update(i.id,i.qty+1)} data-testid={`button-increase-${i.id}`}><Plus size={12}/></button></div><span className="price">{fmt(i.price*i.qty)}</span><button className="remove" aria-label={`Remove ${i.name}`} onClick={()=>remove(i.id)} data-testid={`button-remove-${i.id}`}><Trash2 size={16}/></button></article>)}</section>
        <aside className="summary-card surface"><div className="eyebrow">CART SUMMARY</div><div className="summary-line"><span>Items</span><strong>{items.reduce((n,i)=>n+i.qty,0)}</strong></div><div className="summary-line"><span>Subtotal</span><strong className="mono">{fmt(subtotal)}</strong></div><div className="summary-line"><span>Delivery</span><span>Calculated separately</span></div><div className="summary-line summary-total"><span>Estimated total</span><span className="mono">{fmt(subtotal)}</span></div><p style={{fontSize:10,lineHeight:1.5,color:'#6c7880'}}>Illustrative catalog prices only. No checkout, payment, live inventory or order submission is connected.</p><Link className="button button-outline" style={{width:'100%'}} href="/components" data-testid="link-continue-shopping"><ArrowDown size={14}/> Continue shopping</Link><button className="button button-quiet" style={{width:'100%',marginTop:8}} onClick={()=>items.forEach(i=>remove(i.id))} data-testid="button-clear-cart"><Trash2 size={14}/> Clear cart</button></aside>
      </div>}
  </div>;
}

function Shell({children, count, globalSearch, setGlobalSearch}:{children:ReactNode;count:number;globalSearch:string;setGlobalSearch:(v:string)=>void}) {
  return <><Header count={count} search={globalSearch} onSearch={setGlobalSearch}/><main>{children}</main><Footer/></>;
}

function RoutedErrorBoundary({children}:{children:ReactNode}) { const [location]=useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }

function Router({items,add,update,remove,search,setSearch}:{items:Item[];add:(item:Omit<Item,'qty'>)=>void;update:(id:string,qty:number)=>void;remove:(id:string)=>void;search:string;setSearch:(v:string)=>void}) {
  const count=items.reduce((n,i)=>n+i.qty,0);
  return <RoutedErrorBoundary><Shell count={count} globalSearch={search} setGlobalSearch={setSearch}><Switch>
    <Route path="/" component={HomePage}/>
    <Route path="/components"><CatalogPage add={add} globalSearch={search}/></Route>
    <Route path="/project-kits"><KitsPage add={add}/></Route>
    <Route path="/build-assist"><BuildAssistPage add={add}/></Route>
    <Route path="/about"><AboutPage/></Route>
    <Route path="/cart"><CartPage items={items} update={update} remove={remove}/></Route>
    <Route component={NotFound}/>
  </Switch></Shell></RoutedErrorBoundary>;
}

function App() {
  const [items,setItemsState]=useState<Item[]>(()=>{try{return JSON.parse(localStorage.getItem('voltiva-cart')||'[]') as Item[]}catch{return[]}});
  const [search,setSearch]=useState('');
  useEffect(()=>{localStorage.setItem('voltiva-cart',JSON.stringify(items))},[items]);
  const add=(item:Omit<Item,'qty'>)=>setItemsState(old=>{const found=old.find(x=>x.id===item.id);return found?old.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x):[...old,{...item,qty:1}]});
  const update=(id:string,qty:number)=>setItemsState(old=>qty<=0?old.filter(x=>x.id!==id):old.map(x=>x.id===id?{...x,qty}:x));
  const remove=(id:string)=>setItemsState(old=>old.filter(x=>x.id!==id));
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router items={items} add={add} update={update} remove={remove} search={search} setSearch={setSearch}/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;

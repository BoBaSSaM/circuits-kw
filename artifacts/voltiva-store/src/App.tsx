import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { arSA, enUS } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import { getGetAdminAccessQueryKey, getGetCatalogQueryKey, getGetMyOrdersQueryKey, setBaseUrl, useCreateCheckoutOrder, useGetAdminAccess, useGetCatalog, useGetMyOrders, useSyncCurrentUser } from '@workspace/api-client-react';
import type { CatalogKit, CatalogProduct } from '@workspace/api-client-react';
import { LanguageProvider, t, useLanguage, type Language } from './i18n';
import {
  buildPlanFromPrompt,
  buildBomCartItems,
  calculateBomLineTotal,
  calculateBomTotal,
  clampBuildQuantity,
  inferPartQuantity,
  isPriceListStale,
  parseAuthorizedPriceCsv,
  PRICE_LIST_FRESHNESS_DAYS,
} from './build-assist-model';
import { addCartItem, calculateCartSubtotal, removeSupplierPricedBomItems } from './cart-model';
import { AdminDashboardPage } from './AdminDashboardPage';
import {
  ArrowDown, ArrowRight, BatteryCharging, BookOpen, Bot,
  CheckCircle2, CircuitBoard, Cpu, Gauge, GraduationCap, Grid2X2,
  Info, Layers, LifeBuoy, MapPin, Menu, Minus, PackageCheck, Plus,
  Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Trash2, Truck, UserRound, Wifi, X,
} from 'lucide-react';

type Item = { id: string; name: string; price: number; kind: 'component' | 'kit' | 'bom'; sku: string; qty: number; priceSource?: 'catalog' | 'supplier-list' };
type AddItem = Omit<Item, 'qty'> & { qty?: number };
type DemoOrder = { orderNumber:string; placedAt:string; items:Item[]; subtotal:number };
type Product = CatalogProduct;
type Kit = CatalogKit;
type PriceListState = { pricesBySku: Record<string, number>; source: string; updatedAt: string };
const PRICE_LIST_STORAGE_KEY = 'circuits-kw-build-assist-prices';
const normalizePriceSku = (sku: string) => sku.trim().toLocaleUpperCase('en-US');
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
setBaseUrl(basePath || null);
const clerkPublishableKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPublishableKey) {
  throw new Error('Clerk is not configured: VITE_CLERK_PUBLISHABLE_KEY is missing.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  variables: {
    colorPrimary: '#00b8d9',
    colorForeground: '#101c30',
    colorMutedForeground: '#64727d',
    colorBackground: '#ffffff',
    colorInput: '#fbfcfd',
    colorInputForeground: '#233744',
    colorDanger: '#a23128',
    colorNeutral: '#dce5ea',
    fontFamily: '"IBM Plex Sans", "IBM Plex Sans Arabic", sans-serif',
    borderRadius: '12px',
  },
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-xl max-w-full overflow-hidden shadow-none',
    card: '!bg-transparent !shadow-none !border-0',
    footer: '!bg-transparent !shadow-none !border-0',
    headerTitle: 'text-[#172d3b]',
    headerSubtitle: 'text-[#64727d]',
    socialButtonsBlockButtonText: 'text-[#172d3b]',
    formFieldLabel: 'text-[#394b58]',
    footerActionLink: 'text-[#00687b] hover:text-[#00a3c2]',
    footerActionText: 'text-[#64727d]',
    dividerText: 'text-[#64727d]',
    identityPreviewEditButton: 'text-[#00687b]',
    formFieldSuccessText: 'text-[#26734b]',
    formFieldHintText: 'text-[#64727d]',
    formFieldErrorText: 'text-[#a23128]',
    alertText: 'text-[#a23128]',
    formButtonPrimary: 'bg-[#00b8d9] text-[#101c30] hover:bg-[#00a3c2]',
    formFieldInput: 'border-[#dce5ea] bg-[#fbfcfd] text-[#233744]',
    otpCodeFieldInput: 'border-[#dce5ea] bg-[#fbfcfd] text-[#233744]',
    socialButtonsBlockButton: 'border-[#dce5ea] bg-white hover:bg-[#f7f9fc]',
    dividerLine: 'bg-[#e5eaf0]',
    alert: 'border-[#f0b5b0] bg-[#fff4f2]',
    main: 'w-full',
  },
};

function stripBasePath(path: string) {
  if (!basePath) return path;
  if (path === basePath) return '/';
  return path.startsWith(`${basePath}/`) ? path.slice(basePath.length) : path;
}

function preserveAuthReturnQuery(path: string) {
  if (new URLSearchParams(window.location.search).get('returnTo') !== 'checkout') return path;
  const target = new URL(path, window.location.origin);
  const route = stripBasePath(target.pathname);
  const isAuthRoute = route === '/sign-in' || route.startsWith('/sign-in/')
    || route === '/sign-up' || route.startsWith('/sign-up/');
  if (!isAuthRoute || target.searchParams.has('returnTo')) return path;
  target.searchParams.set('returnTo', 'checkout');
  return `${target.pathname}${target.search}${target.hash}`;
}

function ClerkProfileSync() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { language } = useLanguage();
  const [syncError, setSyncError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { mutateAsync: syncCurrentUser } = useSyncCurrentUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) {
      setSyncError(false);
      return;
    }

    let active = true;
    setSyncError(false);
    void syncCurrentUser()
      .then(() => {
        if (active) setSyncError(false);
      })
      .catch(() => {
        if (active) setSyncError(true);
      });

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, user?.id, user?.updatedAt, retryCount, syncCurrentUser]);

  if (!isLoaded || !isSignedIn || !syncError) return null;

  return <div className="profile-sync-warning" role="alert" data-testid="profile-sync-warning">
    <span>{t('Your account profile could not be saved. Please retry.', language)}</span>
    <button type="button" onClick={() => setRetryCount(count => count + 1)}>
      {t('Retry', language)}
    </button>
  </div>;
}

function ClerkRouterBridge({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();
  const baseLocalization = language === 'ar' ? arSA : enUS;
  const localization = {
    ...baseLocalization,
    signIn: {
      ...baseLocalization.signIn,
      start: {
        ...baseLocalization.signIn?.start,
        title: language === 'ar' ? 'مرحباً بعودتك' : 'Welcome back',
        subtitle: language === 'ar'
          ? 'سجّل الدخول إلى حسابك في Circuits KW'
          : 'Sign in to your Circuits KW account',
      },
    },
    signUp: {
      ...baseLocalization.signUp,
      start: {
        ...baseLocalization.signUp?.start,
        title: language === 'ar' ? 'أنشئ حسابك' : 'Create your account',
        subtitle: language === 'ar'
          ? 'أنشئ حساب Circuits KW للبدء'
          : 'Create a Circuits KW account to get started',
      },
    },
  };

  return <ClerkProvider
    publishableKey={clerkPublishableKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={localization}
    routerPush={path => setLocation(stripBasePath(preserveAuthReturnQuery(path)))}
    routerReplace={path => setLocation(stripBasePath(preserveAuthReturnQuery(path)), { replace: true })}
  ><ClerkProfileSync />{children}</ClerkProvider>;
}

function readBrowserStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeBrowserStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeBrowserStorage(key: string): boolean {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function isSavedCartItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.name === 'string' && item.name.length > 0
    && typeof item.sku === 'string'
    && (item.kind === 'component' || item.kind === 'kit' || item.kind === 'bom')
    && typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0
    && typeof item.qty === 'number' && Number.isFinite(item.qty) && item.qty > 0;
}

function readSavedCart(): { items: Item[]; storageAvailable: boolean } {
  if (typeof window === 'undefined') return { items: [], storageAvailable: true };
  try {
    const saved = window.localStorage.getItem('circuits-kw-cart') || window.localStorage.getItem('voltiva-cart') || '[]';
    const value: unknown = JSON.parse(saved);
    return { items: Array.isArray(value) ? value.filter(isSavedCartItem) : [], storageAvailable: true };
  } catch {
    return { items: [], storageAvailable: false };
  }
}

function readStoredCartSnapshot(): { items: Item[]; storageAvailable: boolean } {
  try {
    const saved = window.localStorage.getItem('circuits-kw-cart')
      ?? window.localStorage.getItem('voltiva-cart')
      ?? '[]';
    const value: unknown = JSON.parse(saved);
    return { items: Array.isArray(value) ? value.filter(isSavedCartItem) : [], storageAvailable: true };
  } catch {
    return { items: [], storageAvailable: false };
  }
}

function sameCartItemList(left: Item[], right: Item[]): boolean {
  return left.length === right.length && left.every((item, index) => sameCartItem(item, right[index]));
}

function sameCartItem(left: Item | undefined, right: Item | undefined): boolean {
  if (!left || !right) return left === right;
  return left.id === right.id
    && left.name === right.name
    && left.price === right.price
    && left.kind === right.kind
    && left.sku === right.sku
    && left.priceSource === right.priceSource
    && left.qty === right.qty;
}

function mergeConcurrentCartChanges(base: Item[], local: Item[], remote: Item[]): Item[] {
  const baseById = new Map(base.map(item => [item.id, item]));
  const localById = new Map(local.map(item => [item.id, item]));
  const remoteById = new Map(remote.map(item => [item.id, item]));
  const mergedById = new Map<string, Item>();

  for (const id of new Set([...remoteById.keys(), ...localById.keys(), ...baseById.keys()])) {
    const baseItem = baseById.get(id);
    const localItem = localById.get(id);
    const remoteItem = remoteById.get(id);
    const localChanged = !sameCartItem(localItem, baseItem);
    const remoteChanged = !sameCartItem(remoteItem, baseItem);

    // When both tabs changed the same line before seeing each other's update,
    // the latest value already committed to storage wins consistently.
    const chosen = localChanged && !remoteChanged ? localItem : remoteItem;
    if (chosen) mergedById.set(id, chosen);
  }

  const orderedIds = [...remote.map(item => item.id), ...local.map(item => item.id), ...base.map(item => item.id)];
  const seen = new Set<string>();
  return orderedIds.flatMap(id => {
    const item = mergedById.get(id);
    if (!item || seen.has(id)) return [];
    seen.add(id);
    return [item];
  });
}

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

type BuildOption = { id:string; title:string; description:string; prompt:string; partIds:string[] };
const buildOptions: BuildOption[] = [
  { id:'greenhouse', title:'Greenhouse Monitor', description:'Monitor soil moisture and local climate using the ESP32, BME280, and capacitive probe.', prompt:'Greenhouse monitor with soil moisture and temperature humidity pressure readings.', partIds:['esp32','bme280','soil'] },
  { id:'weather-station', title:'Wi-Fi Weather Station', description:'Measure temperature, humidity, and air pressure with a Wi-Fi microcontroller.', prompt:'Wi-Fi weather station measuring temperature humidity and pressure with BME280.', partIds:['esp32','bme280'] },
  { id:'soil-monitor', title:'Soil Moisture Monitor', description:'Read soil moisture on the ESP32 using a corrosion-resistant capacitive probe.', prompt:'ESP32 soil moisture monitor.', partIds:['esp32','soil'] },
  { id:'parking-sensor', title:'Parking Distance Sensor', description:'Measure distance with HC-SR04 and convert its 5V signal for a 3.3V controller.', prompt:'ESP32 parking distance sensor using HC-SR04 ultrasonic sensor.', partIds:['esp32','hcsr04','level'] },
  { id:'parking-display', title:'Parking Distance Display', description:'Add a 16×2 screen to show readings from the ultrasonic distance sensor.', prompt:'ESP32 parking distance display with HC-SR04 ultrasonic sensor and 16x2 LCD.', partIds:['esp32','hcsr04','level','lcd'] },
  { id:'lcd-weather-display', title:'LCD Weather Display', description:'Show BME280 temperature, humidity, and pressure readings on a 16×2 LCD.', prompt:'ESP32 weather display with BME280 temperature humidity pressure sensor and 16x2 LCD.', partIds:['esp32','bme280','level','lcd'] },
  { id:'portable-weather-node', title:'Portable Weather Node', description:'Power a Wi-Fi weather sensor from a rechargeable 18650 battery pack.', prompt:'Portable battery-powered Wi-Fi weather node using a 18650 battery and TP4056 charger with BME280.', partIds:['esp32','bme280','battery','tp4056'] },
  { id:'stm32-weather-node', title:'STM32 Weather Node', description:'Build an STM32-based station for temperature, humidity, and pressure.', prompt:'STM32 Nucleo weather monitor measuring temperature humidity and pressure with BME280.', partIds:['nucleo','bme280'] },
];

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
  const {isLoaded,isSignedIn}=useUser();
  const access=useGetAdminAccess({query:{enabled:Boolean(isLoaded&&isSignedIn),retry:false,queryKey:getGetAdminAccessQueryKey()}});
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
  const canManage=access.data?.role==='admin'||access.data?.role==='editor';
  const nav = [['Components','/components'],['Project Kits','/project-kits'],['Build Assist','/build-assist'],['About','/about'],...(canManage?[['Dashboard','/dashboard'] as const]:[])] as const;
  const accountHref=isLoaded&&isSignedIn?'/account':'/sign-in';
  const accountLabel=isLoaded&&isSignedIn?t('Account',language):t('Sign in',language);
  const accountActive=path.startsWith('/account')||path.startsWith('/sign-in')||path.startsWith('/sign-up')||path==='/sign-out';
  return <header className="site-header"><div className="header-inner">
    <Logo/>
    <nav className="nav-links" aria-label={t('Main navigation',language)}>{nav.map(([label,url])=><Link key={url} href={url} className={`nav-link ${path===url?'active':''}`} data-testid={`nav-${url.slice(1)}`}>{t(label,language)}</Link>)}</nav>
     <div className="header-search"><Search size={15}/><input aria-label={t('Search parts by name or SKU',language)} placeholder={t('Search parts or SKU…',language)} value={search} onChange={e=>onSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')setLocation('/components')}} data-testid="input-global-search"/></div>
    <div className="header-actions">
      <Link href={accountHref} className={`header-account-link ${accountActive?'active':''}`} data-testid={isLoaded&&isSignedIn?'link-account':'link-sign-in'}><UserRound size={15}/><span>{accountLabel}</span></Link>
      <div className="language-switch" role="group" aria-label={t('Language preference',language)}>{([['en','EN'],['ar','العربية']] as const).map(([code,label])=><button type="button" key={code} aria-pressed={language===code} className={language===code?'selected':''} onClick={()=>setLanguage(code)} data-testid={`button-language-${code}`}>{label}</button>)}</div>
      <span className="tag" aria-label={t('Prices in Kuwaiti Dinar',language)}>KWD</span>
      <Link href="/cart" className={`icon-button cart-link ${cartPulse?'cart-link-pulse':''}`} aria-label={language==='ar'?`السلة، ${count} عناصر`:`Cart, ${count} items`} data-testid="link-cart"><ShoppingCart key={`cart-icon-${cartPulse?count:'idle'}`} className={cartPulse?'cart-icon-pop':''} size={17}/>{count>0&&<span key={`cart-count-${cartPulse?count:'idle'}`} className={`cart-count ${cartPulse?'cart-count-pop':''}`} data-testid="cart-count">{count}</span>}</Link>
      <button className="icon-button mobile-toggle" aria-label={t(open?'Close navigation':'Open navigation',language)} aria-expanded={open} onClick={()=>setOpen(!open)} data-testid="button-mobile-menu">{open?<X size={18}/>:<Menu size={18}/>}</button>
    </div>
  </div>{open&&<nav className="mobile-nav" aria-label={t('Mobile navigation',language)}>{nav.map(([label,url])=><Link key={url} href={url} onClick={()=>setOpen(false)} className={`nav-link ${path===url?'active':''}`} data-testid={`mobile-nav-${url.slice(1)}`}>{t(label,language)}</Link>)}{isLoaded&&<Link href={accountHref} onClick={()=>setOpen(false)} className={`nav-link mobile-account-link ${accountActive?'active':''}`} data-testid="mobile-nav-account">{accountLabel}</Link>}</nav>}</header>;
}

function Footer() {
  const {language}=useLanguage();
  return <footer className="footer"><div className="container">
     <div className="footer-grid"><div><Logo/><p>{t('Parts and practical guidance for Kuwait’s makers, students and engineers.',language)}</p><div className="footer-social"><span>KW</span><span>EST. SHUWAIKH</span><span>HARDWARE / LAB</span></div></div>
      <div><h4>{t('Shop',language)}</h4><Link href="/components">{t('Microcontrollers',language)}</Link><Link href="/components">{t('Sensors',language)}</Link><Link href="/components">{t('Components',language)}</Link><Link href="/components">{t('Tools & passives',language)}</Link><Link href="/project-kits">{t('Project Kits',language)}</Link></div>
      <div><h4>{t('Support',language)}</h4><Link href="/about#hub">{t('Contact & local operations',language)}</Link><Link href="/about#delivery">{t('Kuwait delivery overview',language)}</Link><Link href="/build-assist">{t('BOM planning',language)}</Link></div>
      <div><h4>{t('Company & preferences',language)}</h4><Link href="/about">{t('About Circuits KW',language)}</Link><Link href="/cart">{t('Shopping Cart',language)}</Link><span className="footer-note">{t('EN · العربية-ready',language)}</span><span className="footer-note">{t('KWD (Kuwaiti Dinar)',language)}</span></div>
     </div><div className="footer-bottom"><span>{t('© 2025 Circuits KW · Built for makers and engineers.',language)}</span><span><i/> {t('Kuwait-local details',language)} &nbsp; | &nbsp; {t('Illustrative catalog data',language)}</span></div>
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
  useDocument(t('Parts to possibilities',language),t('Components, kits and build planning for Kuwait’s makers and engineers.',language));
  return <>
    <section className="hero"><div className="container hero-grid">
      <div><div className="tag"><span className="dot"/> {t('FOR ENGINEERS · FOR MAKERS',language)}</div>
        <h1>{t('Everything you need for your',language)} <em>{t('next build.',language)}</em></h1>
        <p className="lead">{t('Boards, sensors and tools—with clear specs for your next build.',language)}</p>
        <div className="hero-actions"><Link className="button button-primary" href="/components" data-testid="link-shop-components">{t('Shop components',language)} <ArrowRight size={16}/></Link><Link className="button button-outline" href="/project-kits" data-testid="link-explore-kits">{t('Explore project kits',language)} <Layers size={16}/></Link></div>
        <div className="eyebrow">{t('From parts to possibilities.',language)}</div>
        <div className="trust-row"><span><ShieldCheck size={15}/> {t('Datasheets & specifications',language)}</span><span><Truck size={15}/> {t('Kuwait delivery context',language)}</span><span><Cpu size={15}/> {t('Original OEM parts focus',language)}</span></div>
      </div>
      <div className="bench-visual" aria-label="Illustration of a prototyping board"><div className="bench-canvas"><div className="wire"/><div className="wire two"/><div className="board"><div className="chip">CKW / MCU<br/>ESP32 CORE</div></div><div className="bench-badge badge-one">CORE SOC<b>ESP32 · STM32</b></div><div className="bench-badge badge-two">BUS PROTOCOL<b>I²C / SPI / UART</b></div></div><div className="bench-footer"><span><CircuitBoard size={13}/> BENCH-RIG-KUWAIT // REV 2.4</span><span style={{color:'#007b91'}}>TECHNICAL CATALOG</span></div></div>
    </div></section>
    <section className="section feature-section"><div className="container">
       <div className="feature-head"><div><div className="eyebrow">{t('PRECISION CATALOG & WORKFLOW',language)}</div><h2>{t('The right parts. A clearer path to building.',language)}</h2><p className="lead" style={{fontSize:14,marginBottom:0}}>{t('Find, understand and combine components with a Kuwait-first point of view.',language)}</p></div><span className="tag">{t('DESIGNED FOR THE BENCH',language)}</span></div>
        <div className="feature-grid">
          <article className="surface feature-card"><div><div className="feature-icon"><Search size={23}/></div><h3>{t('Find parts faster',language)}</h3><p>{t('Search by part, SKU or interface. Compare key specs fast.',language)}</p></div><div className="tag-row"><span className="tag">{t('SKU search',language)}</span><span className="tag">{t('Voltage details',language)}</span><span className="tag">{t('KWD pricing',language)}</span></div></article>
          <article className="surface feature-card"><div><div className="feature-icon"><BookOpen size={23}/></div><h3>{t('Understand every component',language)}</h3><p>{t('Check voltage, interfaces and package before you build.',language)}</p></div><div className="tag-row"><span className="tag">{t('Specs up front',language)}</span><span className="tag">{t('Logic levels',language)}</span><span className="tag">{t('Clear identifiers',language)}</span></div></article>
          <article className="surface feature-card"><div><div className="feature-icon"><PackageCheck size={23}/></div><h3>{t('Build with curated kits',language)}</h3><p>{t('Curated kits for robotics, IoT and university labs.',language)}</p></div><div className="tag-row"><span className="tag">{t('Curated BOMs',language)}</span><span className="tag">{t('Beginner to advanced',language)}</span></div></article>
          <article className="surface feature-card assist-feature"><div><div className="feature-icon"><Bot size={23}/></div><h3>{t('Meet Build Assist',language)}</h3><p>{t('Plan a sample BOM, set voltage and budget, then add parts to your cart.',language)}</p></div><div className="feature-arrow"><Link href="/build-assist" data-testid="link-build-assist-feature">{t('Meet Build Assist',language)} <ArrowRight size={16}/></Link><span className="tag">{t('Rule-based local demo',language)}</span></div></article>
      </div>
    </div></section>
      <section className="section"><div className="container"><div className="dark-cta"><div className="eyebrow" style={{color:'#54d8ec'}}>{t('PARTS · PROJECT KITS · BUILD ASSIST',language)}</div><h2>{t('Your next idea starts with the right parts.',language)}</h2><p>{t('Browse parts or plan a BOM. Delivery is illustrative; fulfillment is not connected.',language)}</p><div className="hero-actions"><Link className="button button-primary" href="/components" data-testid="link-start-building">{t('Start building',language)} <ArrowRight size={16}/></Link><Link className="button button-outline" href="/build-assist" data-testid="link-ask-assist">{t('Ask Build Assist',language)}</Link></div><span className="mono" style={{fontSize:10,color:'#bcc8d1'}}>{t('Kuwait City · Hawalli · Shuwaikh · All governorates — reference zones',language)}</span></div></div></section>
  </>;
}

function CatalogLoadState({ loading, retry }:{loading:boolean;retry:()=>void}) {
  const {language}=useLanguage();
  return <div className="container page-top"><div className="surface empty-state" role={loading?'status':'alert'} data-testid="catalog-load-state"><div className="empty-icon"><PackageCheck size={23}/></div><h3>{t(loading?'Loading catalog':'Catalog unavailable',language)}</h3><p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>{t(loading?'Products and kits are being loaded.':'The saved catalog could not be reached. Try again.',language)}</p>{!loading&&<button className="button button-outline" onClick={retry} data-testid="button-retry-catalog">{t('Retry',language)}</button>}</div></div>;
}

function CatalogPage({ add, globalSearch, products, loading, error, retry }:{add:(item:AddItem)=>void;globalSearch:string;products:Product[];loading:boolean;error:boolean;retry:()=>void}) {
  const {language}=useLanguage();
   useDocument(t('Components catalog',language),t('Browse components with key specs and sample KWD prices.',language));
  const [query,setQuery]=useState(globalSearch); const [category,setCategory]=useState('All components'); const [stockOnly,setStockOnly]=useState(false); const [voltage,setVoltage]=useState<string[]>([]); const [mount,setMount]=useState<string[]>([]); const [sort,setSort]=useState('verified');
   useEffect(()=>{setQuery(globalSearch)},[globalSearch]);
   const categories=useMemo(()=>['All components',...Array.from(new Set(products.map(product=>product.category)))],[products]);
  const toggle=(values:string[],setter:(v:string[])=>void,value:string)=>setter(values.includes(value)?values.filter(x=>x!==value):[...values,value]);
   const filtered=useMemo(()=>products.filter(p=>{
     const searchValues=[p.name,p.sku,p.category,p.interface,p.description,t(p.name,'ar'),t(p.category,'ar'),t(p.description,'ar')];
     const matchesQuery=!query||searchValues.some(value=>value.toLowerCase().includes(query.toLowerCase()));
     return (category==='All components'||p.category===category)&&(!stockOnly||p.stock>0)&&matchesQuery&&(!voltage.length||voltage.some(v=>p.voltage.toLowerCase().includes(v.toLowerCase().replace(' dc',''))||p.voltage.toLowerCase().includes(v.toLowerCase())))&&(!mount.length||(mount.includes('Through-hole')&&/(dip|through|resistor)/i.test(`${p.package} ${p.category}`))||(mount.includes('Surface mount')&&/(smd|surface|lga)/i.test(`${p.package} ${p.category}`)));
    }),[products,category,stockOnly,query,voltage,mount]);
  const sorted=[...filtered].sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='stock'?b.stock-a.stock:products.indexOf(a)-products.indexOf(b));
  function reset(){setCategory('All components');setStockOnly(false);setVoltage([]);setMount([]);setQuery('');}
   if(loading||error) return <CatalogLoadState loading={loading} retry={retry}/>;
   return <div className="container page-top">
     <div className="catalog-breadcrumb"><Link href="/">{t('Home',language)}</Link><span>/</span><span>{t('Components',language)}</span><span>/</span><b>{t('Catalog',language)}</b><span className="sample-sync"><i/> {t('SAMPLE CATALOG DATA',language)}</span></div>
      <div className="page-heading-row"><div><div className="eyebrow">{t('LOCAL INVENTORY · KUWAIT REFERENCE',language)}</div><h1>{t('Electronic components.',language)}</h1><p className="lead" style={{fontSize:14,marginBottom:20}}>{t('Search parts and compare specs. Prices and stock are samples.',language)}</p></div><span className="tag"><MapPin size={12}/> {t('KWD · Kuwait-focused',language)}</span></div>
      <div className="catalog-search surface"><div className="search-field"><Search size={17}/><input aria-label={t('Search components by name or SKU',language)} placeholder={t('Search components or SKU…',language)} value={query} onChange={e=>setQuery(e.target.value)} data-testid="input-component-search"/></div><button className="button button-outline small-button" onClick={reset} data-testid="button-reset-filters"><SlidersHorizontal size={14}/> {t('Reset filters',language)}</button></div>
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
      <section className="catalog-endcap"><div><span className="eyebrow">{t('FROM PARTS TO POSSIBILITIES',language)}</span><h2>{t('Build from a known starting point.',language)}</h2><p>{t('Browse six kit concepts or plan a sample BOM. Prices and stock are illustrative.',language)}</p></div><div className="hero-actions"><Link className="button button-primary" href="/project-kits" data-testid="link-catalog-kits">{t('Explore project kits',language)} <ArrowRight size={15}/></Link><Link className="button button-outline" href="/build-assist" data-testid="link-catalog-assist">{t('Open Build Assist',language)}</Link></div></section>
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

function KitsPage({add,kits,loading,error,retry}:{add:(item:AddItem)=>void;kits:Kit[];loading:boolean;error:boolean;retry:()=>void}) {
  const {language}=useLanguage();
   useDocument(t('Project kits',language),t('Sample kits for robotics, IoT, automation and university labs.',language));
   const [level,setLevel]=useState('All levels');const [domain,setDomain]=useState('All domains');const [query,setQuery]=useState('');const [selectedKit,setSelectedKit]=useState<Kit|null>(null);const [expandedKitId,setExpandedKitId]=useState<string|null>(null);const [animatedKitId,setAnimatedKitId]=useState<string|null>(null);
   const shown=kits.filter(k=>{
     const searchValues=[k.title,k.desc,k.category,k.level,k.parts.join(' '),t(k.title,'ar'),t(k.desc,'ar'),t(k.category,'ar'),t(k.level,'ar')];
     return (level==='All levels'||k.level===level||k.level==='All levels')&&(domain==='All domains'||k.category===domain)&&(!query||searchValues.some(value=>value.toLowerCase().includes(query.toLowerCase())));
   });
   if(loading||error) return <CatalogLoadState loading={loading} retry={retry}/>;
  return <>
        <section className="kit-hero"><div className="container"><div className="eyebrow" style={{color:'#55d7e9'}}>{t('CURATED PROJECT STARTERS · KUWAIT',language)}</div><div className="page-heading-row" style={{alignItems:'center'}}><div><h1>{t('Curated Project Kits.',language)}</h1><p>{t('Sample kits with BOMs and schematic references. Availability is not live.',language)}</p></div><div className="kit-stats"><div className="kit-stat"><strong>{String(kits.length).padStart(2,'0')}</strong><span>{t('Saved kits',language)}</span></div><div className="kit-stat"><strong>1–6+ hrs</strong><span>{t('Example build duration',language)}</span></div></div></div></div></section>
     <div className="container"><div className="kit-toolbar surface"><div className="chip-row"><span className="eyebrow" style={{marginRight:4}}>{t('Filter kits',language)}</span>{['All levels','Beginner','Intermediate','Advanced'].map(l=><button key={l} className={`filter-chip ${level===l?'active':''}`} onClick={()=>setLevel(l)} data-testid={`filter-kit-level-${l.toLowerCase()}`}>{t(l,language)}</button>)}</div><div className="chip-row">{kitDomains.map(d=><button key={d} className={`filter-chip ${domain===d?'active':''}`} onClick={()=>setDomain(d)} data-testid={`filter-kit-domain-${d.toLowerCase().replaceAll(' ','-').replace('&-','')}`}>{t(d,language)}</button>)}</div></div>
       <div className="search-field" style={{marginTop:17}}><Search size={17}/><input placeholder={t('Search kits…',language)} value={query} onChange={e=>setQuery(e.target.value)} aria-label={t('Search project kits',language)} data-testid="input-kit-search"/></div>
          {shown.length?<div className="kits-grid">{shown.map(k=>{const kitDescription=t(k.desc,language);return <article className="kit-card surface" key={k.id} data-testid={`card-kit-${k.id}`}><KitArt kit={k}/><div className="kit-body"><div className="kit-code"><span>{k.code}</span><span>{t(k.level==='All levels'?'All Experience Levels':k.level,language)}</span></div><span className="tag" style={{width:'max-content'}}>{t(k.category,language)} · {t(k.duration,language)}</span><h3>{t(k.title,language)}</h3><p className={`kit-description ${expandedKitId===k.id?'expanded':''}`} id={`kit-description-${k.id}`}><span className={`description-copy ${animatedKitId===k.id?'animated':''}`} key={expandedKitId===k.id?'full':'preview'}>{expandedKitId===k.id?kitDescription:kitDescriptionPreview(kitDescription)}</span></p><button className="product-more kit-more" type="button" aria-expanded={expandedKitId===k.id} aria-controls={`kit-description-${k.id}`} onClick={()=>{setExpandedKitId(expandedKitId===k.id?null:k.id);setAnimatedKitId(k.id)}} data-testid={`button-kit-more-${k.id}`}>{t(expandedKitId===k.id?'Show less':'Show more',language)} <span aria-hidden="true">{expandedKitId===k.id?'−':'+'}</span></button><div><div className="filter-title" style={{fontSize:9}}>{t('Core hardware BOM',language)}</div><div className="kit-bom">{k.parts.map(p=><span key={p}>{p}</span>)}</div></div><div className="kit-manual"><BookOpen size={13}/> {t(k.manual,language)}</div><div className="kit-bottom"><span className="mono" style={{fontSize:9,color:'#687680'}}>{t('ILLUSTRATIVE KIT PRICE',language)}</span><span className="price">{fmt(k.price)}</span></div><div className="kit-actions"><button className="button button-outline small-button" onClick={()=>setSelectedKit(k)} data-testid={`button-schematic-${k.id}`}><CircuitBoard size={14}/> {t('Schematic / BOM',language)}</button><button className="button button-primary small-button" onClick={()=>add({id:k.id,name:k.title,price:k.price,kind:'kit',sku:k.code})} data-testid={`button-add-kit-${k.id}`}><ShoppingCart size={14}/> {t('Add Rig',language)}</button></div></div></article>})}</div>:<div className="surface empty-state"><h3>{t('No kits match those filters',language)}</h3><p className="lead" style={{fontSize:13,margin:'0 auto'}}>{t('Choose another domain or search term.',language)}</p></div>}
    </div>
       {selectedKit&&<div className="dialog-scrim" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSelectedKit(null)}}><section className="kit-dialog surface" role="dialog" aria-modal="true" aria-labelledby="kit-dialog-title"><button className="icon-button kit-dialog-close" aria-label={t('Close schematic details',language)} onClick={()=>setSelectedKit(null)}><X size={17}/></button><div className="eyebrow">{t('SCHEMATIC REFERENCE · LOCAL DEMO',language)}</div><h2 id="kit-dialog-title">{t(selectedKit.title,language)}</h2><p>{t(selectedKit.desc,language)}</p><div className="schematic-flow"><span>{t('Power / controller',language)}</span><ArrowRight size={15}/><span>{t('Core modules',language)}</span><ArrowRight size={15}/><span>{t('Project output',language)}</span></div><h3>{t('Core hardware BOM',language)} · {t(selectedKit.count,language)}</h3><div className="kit-dialog-bom">{selectedKit.parts.map((part,i)=><div key={part}><span className="mono">0{i+1}</span><b>{part}</b></div>)}</div><p className="disclosure-note">{t('Illustrative only; no downloadable wiring or physical kit.',language)}</p><button className="button button-primary" onClick={()=>{add({id:selectedKit.id,name:selectedKit.title,price:selectedKit.price,kind:'kit',sku:selectedKit.code});setSelectedKit(null)}} data-testid={`button-add-dialog-${selectedKit.id}`}><ShoppingCart size={15}/> {t('Add kit',language)} · {fmt(selectedKit.price)}</button></section></div>}
       <section className="section feature-section"><div className="container"><div className="eyebrow">{t('THE CIRCUITS KW KIT STANDARD',language)}</div><h2>{t('Why engineers build with our curated kits',language)}</h2><div className="guarantee-grid" style={{marginTop:22}}>{[['Zero missing silicon','See every core part before you build.'],['Tested in-house in Kuwait','Clear specs and pinouts for your first connection.'],['Build Assist linked','Turn kit ideas into a sample BOM.']].map(([title,desc])=><article className="surface guarantee-card" key={title}><span className="feature-icon"><CheckCircle2 size={20}/></span><h3>{t(title,language)}</h3><p>{t(desc,language)}</p></article>)}</div><p className="disclosure-note">{t('Sample contents and prices; not a live offer or stock promise.',language)}</p></div></section>
  </>;
}

function getPriceCsvImportError(error: unknown, language: Language) {
  const message = error instanceof Error ? error.message : '';
  const rowError = message.match(/^CSV row (\d+) (is missing an SKU or price|must have a non-negative KWD price with up to 3 decimals|currency must be KWD)\.$/);
  if (rowError) {
    return t(`CSV row {row} ${rowError[2]}.`, language).replace('{row}', rowError[1]);
  }
  const duplicateSku = message.match(/^CSV contains duplicate SKU (.+)\.$/);
  if (duplicateSku) return t('CSV contains duplicate SKU {sku}.', language).replace('{sku}', duplicateSku[1]);
  const translated = t(message, language);
  return message && translated !== message
    ? translated
    : t('CSV could not be imported. Check required columns, row values, KWD prices, and duplicate SKUs.', language);
}

function BuildAssistPage({add,removeSupplierPricedItems,products,loading,error,retry}:{add:(item:AddItem)=>void;removeSupplierPricedItems:(pricesBySku:Readonly<Record<string,number>>)=>number;products:Product[];loading:boolean;error:boolean;retry:()=>void}) {
  const {language}=useLanguage();
   useDocument(t('Build Assist',language),t('Choose a project and preview its parts and saved prices.',language));
  const [selectedProjectId,setSelectedProjectId]=useState(buildOptions[0].id);
  const selectedProject=buildOptions.find(option=>option.id===selectedProjectId)??buildOptions[0];
  const prompt=selectedProject.prompt;
  const [voltage,setVoltage]=useState('3.3V');
  const [level,setLevel]=useState('Hobbyist');
  const [budget,setBudget]=useState(15);
  const [assemblyOverride,setAssemblyOverride]=useState<number|null>(null);
  const [partQuantities,setPartQuantities]=useState<Record<string,number>>({});
  const [generated,setGenerated]=useState(false);
  const [notice,setNotice]=useState('');
  const [preview,setPreview]=useState<'wiring'|'code'|null>(null);
  const [priceList,setPriceList]=useState<PriceListState|null>(readSavedPriceList);
  const [priceListRemoved,setPriceListRemoved]=useState(false);
  const [priceSource,setPriceSource]=useState(()=>readSavedPriceList()?.source??'');
  const [priceUpdatedAt,setPriceUpdatedAt]=useState(()=>readSavedPriceList()?.updatedAt??new Date().toISOString().slice(0,10));
  const [priceFile,setPriceFile]=useState<File|null>(null);
  const [priceImportError,setPriceImportError]=useState('');
  const priceFileInputRef=useRef<HTMLInputElement>(null);
  const priceListIsStale=priceList!==null&&isPriceListStale(priceList.updatedAt);
  useEffect(()=>{setAssemblyOverride(null);setPartQuantities({});setGenerated(false);setPriceListRemoved(false);setNotice('');setPreview(null)},[selectedProjectId]);
   const plan=useMemo(()=>buildPlanFromPrompt(prompt,voltage,products),[prompt,voltage,products]);
  const bom=plan.parts.map(part=>({
    ...part,
    price:priceList
      ?(priceList.pricesBySku[normalizePriceSku(part.sku)]??null)
      :priceListRemoved?null:part.price,
  }));
  const assemblies=assemblyOverride??1;
  const quantityFor=(part:Pick<Product,'id'|'category'>)=>clampBuildQuantity(partQuantities[part.id]??inferPartQuantity(prompt,part));
  const pricedBom=bom.flatMap((part)=>part.price===null?[]:[{...part,price:part.price}]);
  const unpricedBom=bom.filter((part)=>part.price===null);
  const total=calculateBomTotal(
    pricedBom.map(part=>({unitPrice:part.price,quantityPerAssembly:quantityFor(part)})),
    assemblies,
  );
  if(loading||error) return <CatalogLoadState loading={loading} retry={retry}/>;
  const controller=bom.find(part=>['esp32','nucleo','pico'].includes(part.id));
  const bomName=(product:{name:string})=>product.name;
  const generate=()=>{
    if(prompt.trim().length<8){setNotice(t('Add a little more detail to describe your hardware idea.',language));return}
    setPriceListRemoved(false);
    setGenerated(true);
    setNotice(priceList?t('Estimate recalculated from saved price list and requested quantities.',language):t('Using illustrative catalog prices; import a supplier CSV for current prices.',language));
  };
  const importPriceList=async()=>{
    if(!priceFile){
      setPriceImportError(t('Select a CSV file first.',language));
      return;
    }
    if(!priceSource.trim()||!priceUpdatedAt){
      setPriceImportError(t('Enter a source and last-updated date.',language));
      return;
    }
    let csv: string;
    try {
      csv = await priceFile.text();
    } catch {
      setPriceImportError(t('Could not read the selected CSV file. Try again or save it as UTF-8 CSV.', language));
      return;
    }
    try{
      const imported=parseAuthorizedPriceCsv(csv);
      const nextPriceList={...imported,source:priceSource.trim(),updatedAt:priceUpdatedAt};
      const saved=writeBrowserStorage(PRICE_LIST_STORAGE_KEY,JSON.stringify(nextPriceList));
      setPriceList(nextPriceList);
      setPriceListRemoved(false);
      setPriceImportError('');
      setPriceFile(null);
      if(priceFileInputRef.current) priceFileInputRef.current.value='';
      setNotice(saved
        ?t('Price list imported.',language)
        :t('Price list imported for this estimate, but browser storage rejected the save. It will not be available after refresh.',language));
    }catch(error){
      setPriceImportError(getPriceCsvImportError(error, language));
    }
  };
  const removePriceList=()=>{
    const removedCartItems=priceList
      ?removeSupplierPricedItems(priceList.pricesBySku)
      :0;
    const removed=removeBrowserStorage(PRICE_LIST_STORAGE_KEY);
    setPriceList(null);
    setPriceListRemoved(true);
    setPriceSource('');
    setPriceUpdatedAt(new Date().toISOString().slice(0,10));
    setGenerated(false);
    setPriceFile(null);
    if(priceFileInputRef.current) priceFileInputRef.current.value='';
    setPriceImportError('');
    const removalNotice=removed
      ?t('Price list removed.',language)
      :t('Price list removed from this estimate, but browser storage rejected the removal. It may return after refresh.',language);
    setNotice(removedCartItems
      ?`${removalNotice} ${removedCartItems} ${t('supplier-priced BOM cart item(s) were removed.',language)}`
      :removalNotice);
  };
  const addBom=()=>{
    const items=buildBomCartItems(bom,quantityFor,assemblies);
    items.forEach(item=>add({
      ...item,
      priceSource:priceList?'supplier-list':'catalog',
    }));
    setNotice(items.length?t('Priced BOM items added to your cart. Unpriced parts were skipped.',language):t('No priced BOM items are available to add.',language));
  };
  return <div className="container page-top">
    <div className="eyebrow">{t('LOCAL PROJECT PLANNER · KUWAIT',language)}</div>
    <h1 style={{fontSize:'clamp(33px,4vw,48px)'}}>{t('Build Assist:',language)} <span style={{color:'#00687b'}}>{t('choose a project.',language)}</span></h1>
     <p className="lead">{t('Choose a project to see parts and estimates. Stock and compatibility are not verified.',language)}</p>
     <div className="tag" style={{margin:'13px 0 20px'}}><Info size={13}/> {t('Sample data · saved prices when available · verify electrical compatibility.',language)}</div>
    <div className="assist-layout">
      <section>
        <div className="assist-form surface">
          <div className="eyebrow">{t('PROJECT SPECIFICATION',language)}</div>
          <details className="price-list-details" data-testid="details-price-list">
            <summary data-testid="summary-price-list">
              <span className="price-list-summary-copy">
                <strong>{t('Supplier prices',language)}</strong>
                <small>{priceList?`${priceList.source} · ${priceList.updatedAt}`:t('No saved price list',language)}</small>
              </span>
              <span className="price-list-summary-action">{priceList?t('Update prices',language):t('Add prices',language)}</span>
            </summary>
            <div className="price-list-fields">
              <p>{t('CSV needs SKU and price; KWD only.',language)}</p>
              <div className="price-list-grid">
                <div>
                  <label htmlFor="price-list-source">{t('Source',language)}</label>
                  <input className="assist-number-input" id="price-list-source" value={priceSource} onChange={event=>setPriceSource(event.target.value)} placeholder={t('Supplier or price list',language)} data-testid="input-price-list-source"/>
                </div>
                <div>
                  <label htmlFor="price-list-updated">{t('Updated',language)}</label>
                  <input className="assist-number-input" id="price-list-updated" type="date" value={priceUpdatedAt} onChange={event=>setPriceUpdatedAt(event.target.value)} data-testid="input-price-list-updated"/>
                </div>
                <div className="price-list-file">
                  <label htmlFor="price-list-file">{t('CSV file',language)}</label>
                  <input ref={priceFileInputRef} className="assist-number-input" id="price-list-file" type="file" accept=".csv,text/csv" onChange={event=>setPriceFile(event.target.files?.[0]??null)} data-testid="input-price-list-file"/>
                </div>
              </div>
              <div className="price-list-actions">
                <button type="button" className="button button-primary small-button" onClick={importPriceList} data-testid="button-import-price-csv">{t('Import CSV',language)}</button>
                {priceList&&<button type="button" className="button button-outline small-button" onClick={removePriceList} data-testid="button-remove-price-list">{t('Remove list',language)}</button>}
              </div>
              {priceImportError&&<p role="alert" className="notice" data-testid="error-price-list-import">{priceImportError}</p>}
            </div>
          </details>
          <div className="assist-section">
            <div className="assist-project-label" id="ready-project-heading">{t('Choose a ready-to-build project',language)}</div>
             <p className="assist-project-hint">{t('Catalog parts only. Choose a card to update the estimate.',language)}</p>
            <div className="build-project-grid" role="group" aria-labelledby="ready-project-heading">
              {buildOptions.map(option=>{
                const selected=selectedProjectId===option.id;
                return <button type="button" key={option.id} className={`build-project-option ${selected?'active':''}`} onClick={()=>setSelectedProjectId(option.id)} aria-pressed={selected} data-testid={`button-build-project-${option.id}`}>
                  <span className="build-project-title-row"><strong>{t(option.title,language)}</strong>{selected&&<span className="build-project-selected"><CheckCircle2 size={12}/>{t('Selected',language)}</span>}</span>
                  <span className="build-project-description">{t(option.description,language)}</span>
                  <span className="build-project-parts">{option.partIds.map(id=>{const part=products.find(product=>product.id===id);return part?<span className="build-project-part" key={id} title={part.name}>{t(part.name,language)}</span>:null})}</span>
                </button>;
              })}
            </div>
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
            <p className="assist-input-hint">{t('Set the number of copies here; adjust part quantities per copy in the estimate.',language)}</p>
          </div>
          <div className="assist-section">
            <div className="range-line"><label htmlFor="budget-range" style={{margin:0}}>{t('Maximum BOM budget',language)}</label><strong data-testid="text-budget-value">{fmt(budget)}</strong></div>
            <input type="range" id="budget-range" min="3" max="45" step=".5" value={budget} onChange={e=>setBudget(Number(e.target.value))} data-testid="input-budget"/>
            <div className="range-line" style={{color:'#849099',marginTop:4}}><span>3.000 KWD</span><span>45.000 KWD</span></div>
          </div>
          <button className="button button-primary" style={{width:'100%',height:48}} onClick={generate} data-testid="button-generate-bom"><CircuitBoard size={17}/> {t(generated?'Update local demo BOM':'Generate local demo BOM',language)}</button>
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
          <div><div className="eyebrow" style={{color:'#9a4600'}}>{t('SAMPLE OUTPUT · NOT VERIFIED',language)}</div><h2>{t(selectedProject.title,language)}</h2><p>{generated?t(selectedProject.description,language):t('Preview parts; generate to confirm.',language)}</p></div>
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
         <div className="bom-calculation-note">{t('Unit price × quantity × assemblies. Unpriced parts are excluded.',language)}</div>
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
        <div className="bom-total"><span>{t('Priced parts subtotal',language)} · {assemblies} {t('assemblies',language)}</span><span className="mono" data-testid="text-build-assist-total">{pricedBom.length?fmt(total):'—'}</span></div>
        {priceListIsStale&&<div className="notice" role="alert" data-testid="notice-stale-price-list"><strong>{t('Stale price warning:',language)}</strong> {t('Price list is',language)} {PRICE_LIST_FRESHNESS_DAYS} {t('days old. Verify with the supplier.',language)}</div>}
   <div className="bom-calculation-note" data-testid="text-price-source">{priceList?<><strong>{t('Price source:',language)}</strong> {priceList.source} · <strong>{t('Last updated:',language)}</strong> {priceList.updatedAt}</>:priceListRemoved?t('No current price list loaded. Import a dated, authorized CSV to calculate costs.',language):t('Illustrative catalog prices; supplier CSV overrides them.',language)}</div>
        {unpricedBom.length>0&&<div className="notice" data-testid="notice-unpriced-parts"><strong>{t('Unpriced parts excluded from subtotal:',language)}</strong> {unpricedBom.map(part=>`${part.name} (${part.sku})`).join(', ')}</div>}
        {plan.unpricedRequirements.length>0&&<div className="notice" data-testid="notice-unpriced-requirements"><strong>{t('Not included in parts subtotal:',language)}</strong> {plan.unpricedRequirements.map(requirement=>t(requirement,language)).join(', ')}</div>}
        {pricedBom.length>0&&total>budget&&<div className="notice" data-testid="notice-over-budget">{t('Above budget. Review quantities or choose alternatives.',language)}</div>}
        {plan.isSolar&&<div className="notice"><strong>{t('Solar charging note:',language)}</strong> {t('TP4056: panel ≤6V open-circuit (example 5V, 1–2W). Verify charging, protection and heat; design unvalidated.',language)}</div>}
         <div className="notice"><strong>{t('Electrical safety:',language)}</strong> {t('Illustrative only. Verify voltage, current, wiring and datasheets before powering hardware.',language)}</div>
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
     <div className="assist-delivery-reference"><div><span className="eyebrow">{t('KUWAIT DELIVERY REFERENCE',language)}</span><strong>{t('Same-day dispatch concept · 15:00 AST cutoff',language)}</strong><span>{t('Shuwaikh hub is a reference only; delivery and pickup are not connected.',language)}</span></div><Link href="/about#delivery" className="button button-outline small-button" data-testid="link-assist-delivery">{t('View sample zones',language)} <ArrowRight size={13}/></Link></div>
  </div>;
}

function AboutPage() {
  const {language}=useLanguage();
  useDocument(t('About Circuits KW',language),t('Parts, kits and local operations information for Kuwait.',language));
  const pillars=[['100% Genuine OEM Components','Source from authorized distributors; avoid gray-market and counterfeit parts.'],['Lab-Verified Datasheets & Pinouts','Key specs and pinouts for sensors, boards and level shifters.'],['Same-Day Local Dispatch','Sample 15:00 dispatch concept. No courier service is active.'],['Maker & University Support','For student projects, labs and local hardware teams.']];
  return <>
      <section className="about-hero"><div className="container"><div className="eyebrow">{t('STATE OF KUWAIT · HARDWARE & LOCAL OPERATIONS',language)}</div><div className="about-grid"><div><h1>{t('Hardware innovation in Kuwait, from labs to prototypes.',language)}</h1><p className="lead">{t('Parts, kits and specs for Kuwait’s makers. Prices, stock and operations are illustrative.',language)}</p><span className="mono" style={{fontSize:10,color:'#64727d'}}>{t('LOCAL-FIRST · KWD · ENGLISH / العربية-READY',language)}</span></div><div className="about-stats surface"><div className="filter-title">{t('Kuwait operations reference',language)}</div><div className="stat-pair"><div><strong>Shuwaikh</strong><span>{t('Example hub location',language)}</span></div><div><strong>AST +03</strong><span>{t('Kuwait local time',language)}</span></div></div><span className="mono">{t('No account, shipping service, payment or live inventory is connected.',language)}</span></div></div>
       <div className="photo-strip"><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAOTORl_9CZpLmAwLhwVfBFB5ybinplJ3eM55r1M3DB4wK4b__OijqgC13WzPx7prHaXyIn3LVD74MEVX4lbJclBczJwnnSDJ31wQEMQTbupW9DM0WWW-h-LXxhPxSYsf0XU8Qu9e51ulGkefIzX4IMY3FYTRAn8N0ms2n5afBPDXzEGT7qFQ1NtJlyNnuNux_lsjfhhxf9iLZwfSAGI00TZb6uq5HYff0YVW8jOLws7qvRhI91LPeGtg" alt="" loading="lazy"/><div className="photo-caption"><span>{t('Local engineering context',language)}</span><b>{t('Test-bench thinking',language)}</b></div></div><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBent9Os7OUsL5ECe-pfG3Oq-_zTnZEr1c_pC8299wpEF8XlcsXukh-lOfP0n5kQeFikYA0gsAKNZ3eKBaHYj3uWEJyoPIQS9fhQMIRSWOgNrMCfeFVnFrbrGzT0hfu6_JdQP3r3tYVFXz3CLcbKNu3pAXBsz9G-l0szXlPSPoGf4ot5LOnkO_ARQb8tCvAgUkkFhWhsWdIt16cjkkXxdYfZ7487xGWc8qMKy3cw50A4SFP0IjgA5X1ZQ" alt="" loading="lazy"/><div className="photo-caption"><span>{t('Parts organization',language)}</span><b>{t('Ready for the workbench',language)}</b></div></div><div className="photo-panel"><img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDPST6SmLa4prqF2kH9-dLdulQoTHGwTkYaFiJhhQhet5MFJLjY8IK-HNA7FCsaz0esaijTWJB6RbiQ7pfwHodNHq6KSwvK59ovbvxBnf2qUptZz6_-LJdDcbXlYwffjTyc85DgWqvH8NNmoD5400DiXPv57LmO0M-A80qeIcmV4vKVt8DHm_CTZbZUYRPJlUcwwGuwS6GMPNKxqSjf0z1-p1fAGQZQsueCLqdlVrqV0xEdoaxHsI-PWw" alt="" loading="lazy"/><div className="photo-caption"><span>{t('Academia & makers',language)}</span><b>{t('Capstone build support',language)}</b></div></div></div>
    </div></section>
      <section className="section" id="delivery"><div className="container mission-layout"><div><div className="eyebrow">{t('SECTION 01 // CORE MISSION',language)}</div><h2>{t('Hardware sourcing, closer to the workbench.',language)}</h2><p className="lead" style={{fontSize:14}}>{t('Overseas orders can be slow and costly. This demo shows local sourcing.',language)}</p><p style={{fontSize:13,lineHeight:1.7,color:'#576671'}}><strong>Circuits KW</strong> {t('brings parts and engineering details closer to makers. Fulfillment and pickup are demo concepts only.',language)}</p><div className="arabic-note" dir={language==='ar'?'rtl':'ltr'} lang={language}><strong style={{color:'#00687b'}}>{t('Our mission in Kuwait',language)}</strong><p style={{fontSize:13,margin:'6px 0 0'}}>{t('Clear parts, kits and KWD pricing for Kuwait’s engineers, students and makers.',language)}</p></div></div>
        <div className="surface" style={{padding:19}}><div className="eyebrow">{t('KUWAIT DELIVERY OVERVIEW · REFERENCE ONLY',language)}</div><h3 style={{margin:'11px 0 5px'}}>{t('Kuwait Same-Day Dispatch Map',language)}</h3><p style={{fontSize:11,color:'#67747e',marginBottom:15}}>{t('Sample routes only. No courier or live order data; cutoff 15:00 AST.',language)}</p><div className="coverage-grid">{[['Capital & Hawalli','Sharq · Shuwaikh · Jabriya · Hawalli · Salmiya','~2–3 hours · sample evening express'],['Ahmadi & Mubarak','Fintas · Egaila · Mahboula · Mangaf · Sabah Al-Salem','Same afternoon · sample scheduled route'],['Jahra & outlying','Jahra · Saad Al-Abdullah · Amghara · Sulaibiya','18:00 route · illustrative timing']].map(([a,b,c])=><div className="coverage-card surface" key={a}><strong>{t(a,language)}</strong><p>{t(b,language)}</p><span>{t(c,language)}</span></div>)}</div><div className="sample-performance"><div><strong>99.4%</strong><span>{t('sample on-schedule reference figure',language)}</span></div><div className="sample-bar"><i/></div><p>{t('Illustrative timing only—not live service data.',language)}</p></div><div style={{marginTop:13,padding:12,background:'#f2f5f7',borderRadius:7,fontSize:11,color:'#51616d'}}><Truck size={14} style={{verticalAlign:'middle',marginRight:6}}/>{t('Shuwaikh pickup and courier are demo concepts, not active services.',language)}</div></div>
    </div></section>
      <section className="section feature-section"><div className="container"><div className="eyebrow">{t('SECTION 02 // ENGINEERING ASSURANCE',language)}</div><h2>{t('The Four Circuits KW Pillars',language)}</h2><div className="pillar-grid" style={{marginTop:20}}>{pillars.map(([title,desc],i)=><article className="surface pillar-card" key={title}><span className="feature-icon"><span className="mono">0{i+1}</span></span><h3>{t(title,language)}</h3><p>{t(desc,language)}</p><span className="mono" style={{fontSize:9,color:'#007b91'}}>{t('CIRCUITS KW / FIELD NOTE',language)}</span></article>)}</div></div></section>
       <section className="section" id="hub"><div className="container"><div className="eyebrow">{t('SECTION 03 // PHYSICAL COUNTER & FACILITY',language)}</div><h2>{t('Shuwaikh Hub & Operations',language)}</h2><p className="disclosure-note">{t('Illustrative details only; no active hub, support, delivery or payment service.',language)}</p><div className="mission-layout" style={{marginTop:20}}><div style={{display:'grid',gap:12}}><article className="surface" style={{padding:17}}><h3><MapPin size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>{t('Physical hub & express pickup',language)}</h3><p style={{fontSize:12,color:'#61717d',lineHeight:1.6,margin:0}}>{t('Reference address and facility concept; no physical hub or inspection service.',language)}</p><span className="ops-chip">{t('Reference zone · Industrial 1',language)}</span></article><article className="surface" style={{padding:17}}><h3><Gauge size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>{t('Lab hours concept',language)}</h3><div className="summary-line"><span>{t('Saturday – Thursday',language)}</span><strong>09:00–21:00 AST</strong></div><div className="summary-line"><span>{t('Friday',language)}</span><strong>{t('Closed · restock reference',language)}</strong></div></article><article className="surface" style={{padding:17}}><h3><LifeBuoy size={17} style={{verticalAlign:'middle',color:'#007b91',marginRight:7}}/>{t('Technical contact lines',language)}</h3><p style={{fontSize:12,color:'#61717d',margin:0}}>{t('Contact details are not available in this demo.',language)}</p></article></div><div className="map-panel" aria-label={t('Illustrative Kuwait local delivery map',language)}><div className="map-route"/><span className="map-pin one"/><span className="map-pin two"/><span className="map-pin three"/><span className="tag" style={{position:'absolute',top:13,left:13}}><MapPin size={12}/> {t('KUWAIT · ROUTE ILLUSTRATION',language)}</span><span className="mono" style={{position:'absolute',bottom:14,right:14,fontSize:10,color:'#536972'}}>{t('SHUWAIKH HUB → GOVERNORATES',language)}</span></div></div><div className="partner-note">{t('University names are illustrative; no affiliation is implied.',language)}</div></div></section>
  </>;
}

function CartPage({items,update,remove}:{items:Item[];update:(id:string,qty:number)=>void;remove:(id:string)=>void}) {
  const {language}=useLanguage();
  useDocument(t('Shopping cart',language),t('Review your cart. Signed-in demo orders are saved to your account; no payment is taken.',language));
  const subtotal=calculateCartSubtotal(items);
  return <div className="container page-top"><div className="eyebrow">{t('YOUR BUILD / LOCAL CART',language)}</div><h1 style={{fontSize:38}}>{t('Cart review',language)}</h1><p className="lead" style={{fontSize:14}}>{t('Place a demo order. Payment and shipping are not connected.',language)}</p>
    {!items.length?<div className="surface empty-state"><div className="empty-icon"><ShoppingCart size={23}/></div><h3>{t('Your cart is ready for a build.',language)}</h3><p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>{t('Add parts or a kit to your cart.',language)}</p><div style={{display:'flex',justifyContent:'center',gap:9,flexWrap:'wrap'}}><Link className="button button-primary" href="/components" data-testid="link-empty-cart-components">{t('Browse components',language)}</Link><Link className="button button-outline" href="/project-kits" data-testid="link-empty-cart-kits">{t('Explore kits',language)}</Link></div></div>:
      <div className="cart-layout"><section className="cart-list surface" aria-label={t('Cart items',language)}>{items.map(i=><article className="cart-row" key={i.id} data-testid={`row-cart-${i.id}`}><div className="cart-product"><span className="cart-thumb">{i.kind==='kit'?<PackageCheck size={22}/>:i.kind==='bom'?<CircuitBoard size={22}/>:<Cpu size={22}/>}</span><span><strong>{t(i.name,language)}</strong><span>{i.sku} · {t(i.kind==='kit'?'Project kit':i.kind==='bom'?'Build Assist demo item':'Component',language)}</span></span></div><div className="quantity" aria-label={`${t('Quantity',language)} ${t(i.name,language)}`}><button aria-label={t('Decrease quantity',language)} onClick={()=>update(i.id,i.qty-1)} data-testid={`button-decrease-${i.id}`}><Minus size={12}/></button><input aria-label={`${t('Quantity',language)} ${t(i.name,language)}`} type="number" min="1" value={i.qty} onChange={e=>update(i.id,Math.max(1,Number(e.target.value)||1))} data-testid={`input-quantity-${i.id}`}/><button aria-label={t('Increase quantity',language)} onClick={()=>update(i.id,i.qty+1)} data-testid={`button-increase-${i.id}`}><Plus size={12}/></button></div><span className="price">{fmt(i.price*i.qty)}</span><button className="remove" aria-label={`${t('Remove',language)} ${t(i.name,language)}`} onClick={()=>remove(i.id)} data-testid={`button-remove-${i.id}`}><Trash2 size={16}/></button></article>)}</section>
         <aside className="summary-card surface"><div className="eyebrow">{t('CART SUMMARY',language)}</div><div className="summary-line"><span>{t('Items',language)}</span><strong>{items.reduce((n,i)=>n+i.qty,0)}</strong></div><div className="summary-line"><span>{t('Subtotal',language)}</span><strong className="mono">{fmt(subtotal)}</strong></div><div className="summary-line"><span>{t('Delivery',language)}</span><span>{t('Not connected',language)}</span></div><div className="summary-line summary-total"><span>{t('Estimated total',language)}</span><span className="mono">{fmt(subtotal)}</span></div><p style={{fontSize:10,lineHeight:1.5,color:'#6c7880'}}>{t('Demo order only. No payment or fulfillment.',language)}</p><Link className="button button-primary" style={{width:'100%'}} href="/checkout" data-testid="link-checkout"><ArrowRight size={14}/> {t('Continue to checkout',language)}</Link><Link className="button button-outline" style={{width:'100%',marginTop:8}} href="/components" data-testid="link-continue-shopping"><ArrowDown size={14}/> {t('Continue shopping',language)}</Link><button className="button button-quiet" style={{width:'100%',marginTop:8}} onClick={()=>items.forEach(i=>remove(i.id))} data-testid="button-clear-cart"><Trash2 size={14}/> {t('Clear cart',language)}</button></aside>
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
  const {isLoaded,isSignedIn,user}=useUser();
  useDocument(t('Checkout',language),t('Demo orders are saved for Circuits KW order management.',language));
  const createOrder=useCreateCheckoutOrder();
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
       setOrderError(t('Check the highlighted fields.',language));
      const firstInvalid=form.elements.namedItem(Object.keys(errors)[0]);
      window.requestAnimationFrame(()=>{
        if(firstInvalid instanceof HTMLElement){
          firstInvalid.focus();
          firstInvalid.scrollIntoView({behavior:'smooth',block:'center'});
        }
      });
      return;
    }
    createOrder.mutate({
      data:{
        customer:{name:value('name'),email:value('email'),phone:value('phone')},
        shipping:{
          governorate:value('governorate'),
          area:value('area'),
          block:value('block'),
          street:value('street'),
          building:value('building'),
          ...(value('unit')?{unit:value('unit')}:{ }),
          ...(value('notes')?{notes:value('notes')}:{ }),
        },
        items:items.map(item=>({
          id:item.id,
          kind:item.kind,
          sku:item.sku,
          qty:item.qty,
          ...(item.kind==='bom'?{estimateUnitPrice:item.price}:{}),
        })),
      },
    },{
      onSuccess:saved=>{
        setPlacedOrder({
          orderNumber:saved.orderNumber,
          placedAt:new Date(saved.placedAt).toISOString(),
          items:saved.items.map(item=>({id:item.id,name:item.name,price:item.price,kind:item.kind,sku:item.sku,qty:item.qty})),
          subtotal:saved.subtotal,
        });
        clearCart();
      },
      onError:error=>{
        const data=(error as {data?:unknown}).data;
        const payload=data&&typeof data==='object'?data as {error?:unknown;details?:unknown}:null;
        if(payload?.error==='catalog_item_unavailable'){
          setOrderError(t('One or more items are no longer available. Refresh the catalog and update your cart.',language));
          return;
        }
        if(payload?.error==='invalid_order'&&Array.isArray(payload.details)){
          const fieldByPath:Record<string,string>={'customer.name':'name','customer.email':'email','customer.phone':'phone','shipping.governorate':'governorate','shipping.area':'area','shipping.block':'block','shipping.street':'street','shipping.building':'building'};
          const fields=Array.from(new Set(payload.details.flatMap(issue=>{
            if(!issue||typeof issue!=='object'||!('path' in issue)||!Array.isArray(issue.path))return [];
            const field=fieldByPath[issue.path.join('.')];
            return field?[field]:[];
          })));
          if(fields.length){
            setFieldErrors(current=>({...current,...Object.fromEntries(fields.map(field=>[field,checkoutFieldError(field,value(field))||t('Please check this field.',language)]))}));
            setOrderError(t('The server could not validate some details. Review the highlighted fields.',language));
            return;
          }
        }
        setOrderError(t('The order could not be saved. Your cart is still here; please try again shortly.',language));
      },
    });
  };
  if(placedOrder) return <div className="container page-top checkout-confirmation" data-testid="demo-order-confirmation">
    <div className="eyebrow">{t('DEMO ORDER PLACED · SAVED',language)}</div>
    <div className="checkout-confirmation-card surface">
      <div className="checkout-confirmation-icon"><CheckCircle2 size={26}/></div>
      <h1>{t('Order placed.',language)}</h1>
       <p className="lead" style={{fontSize:13,margin:'0 auto 18px'}} data-testid="text-order-storage-status">{t('Saved for demo order management. No payment or fulfillment is connected.',language)}</p>
      <div className="demo-order-number"><span>{t('DEMO ORDER NUMBER',language)}</span><strong data-testid="text-demo-order-number">{placedOrder.orderNumber}</strong><small>{new Date(placedOrder.placedAt).toLocaleString(language==='ar'?'ar-KW':'en-KW')}</small></div>
      <div className="demo-order-items">{placedOrder.items.map(item=><div key={item.id} data-testid={`row-confirmation-${item.id}`}><span>{t(item.name,language)} · {t('Qty',language)} {item.qty}</span><strong>{fmt(item.price*item.qty)}</strong></div>)}</div>
      <div className="summary-line summary-total"><span>{t('Demo total',language)}</span><span className="mono" data-testid="text-demo-order-subtotal">{fmt(placedOrder.subtotal)}</span></div>
        <p className="checkout-order-disclaimer">{t('Order contact and delivery details are saved for admin review. Payment and fulfillment are not connected.',language)}</p>
      <Link className="button button-primary" href="/components" data-testid="link-confirmation-shop">{t('Continue browsing',language)} <ArrowRight size={15}/></Link>
    </div>
  </div>;
  if(!items.length) return <div className="container page-top"><div className="eyebrow">{t('ORDER REVIEW · CHECKOUT PREVIEW',language)}</div><div className="surface empty-state"><div className="empty-icon"><ShoppingCart size={23}/></div><h3>{t('Your cart is empty.',language)}</h3><p className="lead" style={{fontSize:13,margin:'0 auto 18px'}}>{t('Add parts or a kit before checkout.',language)}</p><Link className="button button-primary" href="/components">{t('Browse components',language)}</Link></div></div>;
  return <div className="container page-top">
     <div className="checkout-heading"><div><div className="eyebrow">{t('ORDER REVIEW · LOCAL DEMO',language)}</div><h1>{t('Checkout',language)}</h1><p className="lead" style={{fontSize:13}}>{t('Demo order only. Contact and delivery details are saved for order management.',language)}</p></div><span className="tag"><ShieldCheck size={13}/> {t('No payment connected',language)}</span></div>
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
        <section className="surface checkout-panel checkout-account-panel" data-testid="checkout-account-options">
          <div className="checkout-account-copy">
            <strong>{isLoaded&&isSignedIn?t('Signed in as',language):t('Checkout account',language)}</strong>
            <span>{isLoaded&&isSignedIn
              ? user?.primaryEmailAddress?.emailAddress || user?.fullName || t('Your account',language)
              : t('Sign in or create an account, or continue as a guest.',language)}</span>
          </div>
          <div className="checkout-account-actions">
            {isLoaded&&isSignedIn
              ? <Link href="/account" className="button button-outline small-button" data-testid="link-checkout-account">{t('Manage account',language)}</Link>
              : <>
                  <Link href="/sign-in?returnTo=checkout" className="button button-outline small-button" data-testid="link-checkout-sign-in">{t('Sign in',language)}</Link>
                  <Link href="/sign-up?returnTo=checkout" className="button button-primary small-button" data-testid="link-checkout-sign-up">{t('Create account',language)}</Link>
                </>}
          </div>
          <p className="checkout-account-note">{t('Guest checkout is available. Signed-in orders are linked to your account.',language)}</p>
        </section>
        <section className="surface checkout-panel">
           <div className="checkout-section-heading"><span className="checkout-step">01</span><div><h2>{t('Contact details',language)}</h2><p>{t('For this demo order.',language)}</p></div></div>
          <div className="checkout-fields">
            <label className="checkout-field"><span>{t('Full name',language)}</span><input name="name" type="text" autoComplete="name" placeholder={t('Your name',language)} required aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name?'checkout-error-name':undefined} data-testid="input-checkout-name"/><CheckoutFieldError field="name" message={fieldErrors.name?t(fieldErrors.name,language):undefined}/></label>
            <label className="checkout-field"><span>{t('Email address',language)}</span><input name="email" type="email" autoComplete="email" placeholder="name@example.com" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email?'checkout-error-email':undefined} data-testid="input-checkout-email"/><CheckoutFieldError field="email" message={fieldErrors.email?t(fieldErrors.email,language):undefined}/></label>
            <label className="checkout-field checkout-field-wide"><span>{t('Phone number',language)}</span><input name="phone" type="tel" autoComplete="tel" placeholder="+965" required aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone?'checkout-error-phone':undefined} data-testid="input-checkout-phone"/><CheckoutFieldError field="phone" message={fieldErrors.phone?t(fieldErrors.phone,language):undefined}/></label>
          </div>
        </section>
        <section className="surface checkout-panel">
           <div className="checkout-section-heading"><span className="checkout-step">02</span><div><h2>{t('Delivery address',language)}</h2><p>{t('Kuwait delivery address.',language)}</p></div></div>
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
          <ShieldCheck size={18}/><div><strong>{t('Local demo order only',language)}</strong><p>{t('Saves an order record for admin review. No payment or fulfillment.',language)}</p></div>
        </section>
        {orderError&&<div className="checkout-error" role="alert" data-testid="checkout-order-error">{orderError}</div>}
        <button type="submit" className="button button-primary checkout-submit" disabled={createOrder.isPending} data-testid="button-place-demo-order">{createOrder.isPending?t('Saving order',language):t('Place demo order',language)} <ArrowRight size={15}/></button>
        <p className="checkout-privacy">{t('Contact and delivery details are saved with the demo order for admin order management.',language)}</p>
      </div>
      <aside className="surface checkout-summary">
        <div className="eyebrow">{t('YOUR PARTS LIST',language)}</div><h2>{t('Order summary',language)}</h2>
        <div className="checkout-items">{items.map(item=><div className="checkout-item" key={item.id} data-testid={`row-checkout-${item.id}`}><div><strong>{t(item.name,language)}</strong><span>{item.sku} · {t('Qty',language)} {item.qty}</span></div><b>{fmt(item.price*item.qty)}</b></div>)}</div>
        <div className="summary-line"><span>{t('Subtotal',language)}</span><strong className="mono" data-testid="text-checkout-subtotal">{fmt(subtotal)}</strong></div>
        <div className="summary-line"><span>{t('Delivery',language)}</span><span>{t('Not connected',language)}</span></div>
        <div className="summary-line summary-total"><span>{t('Estimated total',language)}</span><span className="mono">{fmt(subtotal)}</span></div>
        <p className="checkout-total-note">{t('Sample KWD prices; delivery fees excluded.',language)}</p>
        <Link className="checkout-edit-link" href="/cart">← {t('Edit cart',language)}</Link>
      </aside>
    </form>
  </div>;
}

function AuthPageFrame({title,children}:{title:string;children:ReactNode}) {
  const {language}=useLanguage();
  return <div className="container page-top auth-page">
    <div className="auth-page-heading">
      <div><div className="eyebrow">{t('Circuits KW account',language)}</div><h1>{t(title,language)}</h1></div>
      <Link className="checkout-edit-link" href="/">{t('Return to store',language)}</Link>
    </div>
    {children}
  </div>;
}

function authRedirectPath() {
  const destination=new URLSearchParams(window.location.search).get('returnTo')==='checkout'?'checkout':'account';
  return `${basePath}/${destination}`;
}

function authReturnQuery() {
  return new URLSearchParams(window.location.search).get('returnTo')==='checkout'?'?returnTo=checkout':'';
}

function SignInPage() {
  const {language}=useLanguage();
  useDocument(t('Sign in',language),t('Sign in to your Circuits KW account.',language));
  const returnQuery=authReturnQuery();
  return <AuthPageFrame title="Account access">
    <div className="auth-clerk-frame" data-testid="page-sign-in">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up${returnQuery}`}
        forceRedirectUrl={authRedirectPath()}
        appearance={clerkAppearance}
      />
    </div>
  </AuthPageFrame>;
}

function SignUpPage() {
  const {language}=useLanguage();
  useDocument(t('Create account',language),t('Create a Circuits KW account.',language));
  const returnQuery=authReturnQuery();
  return <AuthPageFrame title="Create account">
    <div className="auth-clerk-frame" data-testid="page-sign-up">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in${returnQuery}`}
        forceRedirectUrl={authRedirectPath()}
        appearance={clerkAppearance}
      />
    </div>
  </AuthPageFrame>;
}

function AccountPage() {
  const {language}=useLanguage();
  const {isLoaded,isSignedIn,user}=useUser();
  const ordersQuery=useGetMyOrders({
    query:{
      enabled:Boolean(isLoaded&&isSignedIn&&user),
      queryKey:[...getGetMyOrdersQueryKey(),user?.id??'signed-out'],
    },
  });
  useDocument(t('Account',language),t('Your account',language));

  if(!isLoaded) return <AuthPageFrame title="Account"><div className="surface account-panel" aria-live="polite">{t('Loading account…',language)}</div></AuthPageFrame>;
  if(!isSignedIn||!user) return <AuthPageFrame title="Account">
    <section className="surface account-panel">
      <p>{t('Sign in or create an account to view your profile.',language)}</p>
      <div className="account-actions">
        <Link href="/sign-in" className="button button-primary">{t('Sign in',language)}</Link>
        <Link href="/sign-up" className="button button-outline">{t('Create account',language)}</Link>
      </div>
    </section>
  </AuthPageFrame>;

  return <AuthPageFrame title="Your account">
    <section className="surface account-panel" data-testid="page-account">
      <div className="account-avatar"><UserRound size={23}/></div>
      <div className="eyebrow">{t('Account details',language)}</div>
      <h2>{user.fullName||t('Your account',language)}</h2>
      <p className="account-email">{user.primaryEmailAddress?.emailAddress}</p>
      <p className="account-demo-note">{t('Demo orders you place while signed in are saved here. Guest orders are not linked to your account.',language)}</p>
      <div className="account-actions">
        <Link href="/sign-out" className="button button-outline" data-testid="link-sign-out">{t('Sign out',language)}</Link>
        <Link href="/" className="button button-quiet">{t('Return to store',language)}</Link>
      </div>
    </section>
    <section className="surface account-panel account-orders-panel" data-testid="account-demo-orders">
      <div className="eyebrow">{t('DEMO ORDER HISTORY',language)}</div>
      <h2>{t('Your demo orders',language)}</h2>
      <p className="account-orders-intro">{t('These saved records are demos only. No payment or fulfillment is connected.',language)}</p>
      {ordersQuery.isLoading
        ? <p className="account-orders-state" aria-live="polite">{t('Loading your demo orders…',language)}</p>
        : ordersQuery.isError
          ? <div className="account-orders-state" role="alert">
              <p>{t('Your demo orders could not be loaded.',language)}</p>
              <button className="button button-outline small-button" type="button" onClick={()=>void ordersQuery.refetch()}>{t('Retry',language)}</button>
            </div>
          : ordersQuery.data?.orders.length
            ? <div className="account-orders-list">
                {ordersQuery.data.orders.map(order=><article className="account-order-card" key={order.id} data-testid={`account-demo-order-${order.id}`}>
                  <div className="account-order-heading">
                    <div><span className="account-order-label">{t('Demo order',language)}</span><strong>{order.orderNumber}</strong></div>
                    <time dateTime={new Date(order.placedAt).toISOString()}>{new Date(order.placedAt).toLocaleString(language==='ar'?'ar-KW':'en-KW')}</time>
                  </div>
                  <div className="account-order-items">
                    {order.items.map((item,index)=><div key={`${item.id}-${index}`}>
                      <span>{t(item.name,language)} · {t('Qty',language)} {item.qty}</span>
                      <strong>{fmt(item.price*item.qty)}</strong>
                    </div>)}
                  </div>
                  <div className="account-order-total"><span>{t('Demo total',language)}</span><strong>{fmt(order.subtotal)}</strong></div>
                </article>)}
              </div>
            : <p className="account-orders-state">{t('No demo orders are linked to your account yet. Orders placed as a guest are not included.',language)}</p>}
    </section>
  </AuthPageFrame>;
}

function SignOutPage() {
  const {language}=useLanguage();
  const {isLoaded,isSignedIn}=useUser();
  const {signOut}=useClerk();
  const [isSigningOut,setIsSigningOut]=useState(false);
  const [error,setError]=useState('');
  useDocument(t('Sign out',language),t('Sign out of your Circuits KW account.',language));

  const confirmSignOut=async()=>{
    setIsSigningOut(true);
    setError('');
    try {
      await signOut({redirectUrl:`${basePath}/`});
    } catch {
      setIsSigningOut(false);
      setError(t('Could not sign out. Please try again.',language));
    }
  };

  return <AuthPageFrame title="Sign out">
    <section className="surface account-panel" data-testid="page-sign-out">
      {!isLoaded
        ? <p aria-live="polite">{t('Loading account…',language)}</p>
        : isSignedIn
          ? <>
              <h2>{t('Sign out of your account?',language)}</h2>
              <p>{t('You can sign in again at any time.',language)}</p>
              {error&&<div className="checkout-error" role="alert">{error}</div>}
              <div className="account-actions">
                <button type="button" className="button button-primary" onClick={confirmSignOut} disabled={isSigningOut} data-testid="button-confirm-sign-out">{t(isSigningOut?'Signing out…':'Sign out',language)}</button>
                <Link href="/account" className="button button-outline">{t('Cancel',language)}</Link>
              </div>
            </>
          : <>
              <h2>{t('You are signed out.',language)}</h2>
              <p>{t('Sign in again or return to the store.',language)}</p>
              <div className="account-actions">
                <Link href="/sign-in" className="button button-primary">{t('Sign in',language)}</Link>
                <Link href="/" className="button button-outline">{t('Return to store',language)}</Link>
              </div>
            </>}
    </section>
  </AuthPageFrame>;
}

function Shell({children, count, globalSearch, setGlobalSearch, cartStorageUnavailable}:{children:ReactNode;count:number;globalSearch:string;setGlobalSearch:(v:string)=>void;cartStorageUnavailable:boolean}) {
  const {language}=useLanguage();
  return <><Header count={count} search={globalSearch} onSearch={setGlobalSearch}/>{cartStorageUnavailable&&<div className="storage-warning" role="status" aria-live="polite" data-testid="cart-storage-warning">{t('Browser storage is unavailable. Your cart still works in this tab, but changes may not persist after you leave or reload.',language)}</div>}<main>{children}</main><Footer/></>;
}

function RoutedErrorBoundary({children}:{children:ReactNode}) { const [location]=useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }

function Router({items,add,removeSupplierPricedItems,update,remove,clearCart,search,setSearch,cartStorageUnavailable}:{items:Item[];add:(item:AddItem)=>void;removeSupplierPricedItems:(pricesBySku:Readonly<Record<string,number>>)=>number;update:(id:string,qty:number)=>void;remove:(id:string)=>void;clearCart:()=>void;search:string;setSearch:(v:string)=>void;cartStorageUnavailable:boolean}) {
  const [location]=useLocation();
  const count=items.reduce((n,i)=>n+i.qty,0);
  const catalogEnabled=['/components','/project-kits','/build-assist'].includes(location);
  const catalogQuery=useGetCatalog({query:{enabled:catalogEnabled,queryKey:getGetCatalogQueryKey()}});
  const products=catalogQuery.data?.products??[];
  const kits=catalogQuery.data?.kits??[];
  const catalogLoading=catalogEnabled&&catalogQuery.isLoading;
  const catalogError=catalogEnabled&&catalogQuery.isError;
  const retryCatalog=()=>{void catalogQuery.refetch();};
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
  return <RoutedErrorBoundary><Shell count={count} globalSearch={search} setGlobalSearch={setSearch} cartStorageUnavailable={cartStorageUnavailable}><div className="page-transition" key={location}><Switch>
    <Route path="/" component={HomePage}/>
    <Route path="/components"><CatalogPage add={add} globalSearch={search} products={products} loading={catalogLoading} error={catalogError} retry={retryCatalog}/></Route>
    <Route path="/project-kits"><KitsPage add={add} kits={kits} loading={catalogLoading} error={catalogError} retry={retryCatalog}/></Route>
    <Route path="/build-assist"><BuildAssistPage add={add} removeSupplierPricedItems={removeSupplierPricedItems} products={products} loading={catalogLoading} error={catalogError} retry={retryCatalog}/></Route>
    <Route path="/dashboard" component={AdminDashboardPage}/>
    <Route path="/about"><AboutPage/></Route>
    <Route path="/cart"><CartPage items={items} update={update} remove={remove}/></Route>
    <Route path="/checkout"><CheckoutPage items={items} clearCart={clearCart}/></Route>
    <Route path="/sign-in/*?" component={SignInPage}/>
    <Route path="/sign-up/*?" component={SignUpPage}/>
    <Route path="/account" component={AccountPage}/>
    <Route path="/sign-out" component={SignOutPage}/>
    <Route component={NotFound}/>
  </Switch></div></Shell></RoutedErrorBoundary>;
}

function App() {
  const [initialCart] = useState(readSavedCart);
  const [items,setItemsState]=useState<Item[]>(initialCart.items);
  const cartItemsRef=useRef<Item[]>(initialCart.items);
  const sharedCartRef=useRef<Item[]>(initialCart.items);
  const [cartStorageUnavailable,setCartStorageUnavailable]=useState(!initialCart.storageAvailable);
  const [language,setLanguage]=useState<Language>(()=>readBrowserStorage('circuits-kw-language')==='ar'?'ar':'en');
  const [search,setSearch]=useState('');
  const [cartNotice,setCartNotice]=useState<{id:number;type:'added';name:string}|{id:number;type:'updated'}|null>(null);
  const cartNoticeId=useRef(0);
  const firstCartSave=useRef(true);
  useEffect(()=>{
    const isFirstSave=firstCartSave.current;
    if(isFirstSave) {
      firstCartSave.current=false;
      if(!initialCart.storageAvailable) return;
    }
    const stored=readStoredCartSnapshot();
    const nextItems=stored.storageAvailable
      ? mergeConcurrentCartChanges(sharedCartRef.current,items,stored.items)
      : items;
    if(stored.storageAvailable) sharedCartRef.current=stored.items;
    const serialized=JSON.stringify(nextItems);
    const storedSerialized=stored.storageAvailable?JSON.stringify(stored.items):null;
    if(!sameCartItemList(nextItems,items)) {
      cartItemsRef.current=nextItems;
      setItemsState(nextItems);
    }
    const saved=serialized===storedSerialized
      && !isFirstSave
      ? true
      : writeBrowserStorage('circuits-kw-cart',serialized);
    if(saved) {
      sharedCartRef.current=nextItems;
    }
    setCartStorageUnavailable(!initialCart.storageAvailable || !saved);
  },[items,initialCart.storageAvailable]);
  useEffect(()=>{
    const syncCartFromOtherTab=(event:StorageEvent)=>{
      if(event.key!=='circuits-kw-cart') return;
      const stored=readStoredCartSnapshot();
      if(!stored.storageAvailable) return;
      const nextItems=mergeConcurrentCartChanges(sharedCartRef.current,cartItemsRef.current,stored.items);
      sharedCartRef.current=stored.items;
      const cartChanged=!sameCartItemList(nextItems,cartItemsRef.current);
      cartItemsRef.current=nextItems;
      if(cartChanged) {
        setItemsState(nextItems);
        cartNoticeId.current+=1;
        setCartNotice({id:cartNoticeId.current,type:'updated'});
      }
    };
    window.addEventListener('storage',syncCartFromOtherTab);
    return ()=>window.removeEventListener('storage',syncCartFromOtherTab);
  },[]);
  useEffect(()=>{
    writeBrowserStorage('circuits-kw-language',language);
    document.documentElement.lang=language;
    document.documentElement.dir=language==='ar'?'rtl':'ltr';
  },[language]);
  useEffect(()=>{
    if(!cartNotice) return;
    const timer=window.setTimeout(()=>setCartNotice(null),2200);
    return ()=>window.clearTimeout(timer);
  },[cartNotice?.id]);
  const changeCart=(change:(current:Item[])=>Item[])=>{
    const nextItems=change(cartItemsRef.current);
    cartItemsRef.current=nextItems;
    setItemsState(nextItems);
  };
  const add=(item:AddItem)=>{
    changeCart(old=>addCartItem(old,item));
    cartNoticeId.current+=1;
    setCartNotice({id:cartNoticeId.current,type:'added',name:item.name});
  };
  const update=(id:string,qty:number)=>changeCart(old=>qty<=0?old.filter(x=>x.id!==id):old.map(x=>x.id===id?{...x,qty}:x));
  const remove=(id:string)=>changeCart(old=>old.filter(x=>x.id!==id));
  const clearCart=()=>changeCart(()=>[]);
  const removeSupplierPricedItems=(pricesBySku:Readonly<Record<string,number>>)=>{
    let removedCount=0;
    changeCart(current=>{
      const next=removeSupplierPricedBomItems(current,pricesBySku);
      removedCount=current.length-next.length;
      return next;
    });
    return removedCount;
  };
  return <LanguageProvider language={language} setLanguage={setLanguage}><div lang={language} dir={language==='ar'?'rtl':'ltr'}><QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ClerkRouterBridge><Router items={items} add={add} removeSupplierPricedItems={removeSupplierPricedItems} update={update} remove={remove} clearCart={clearCart} search={search} setSearch={setSearch} cartStorageUnavailable={cartStorageUnavailable}/>{cartNotice&&<div key={cartNotice.id} className="cart-toast" role="status" aria-live="polite" data-testid="cart-add-feedback"><span className="cart-toast-icon"><CheckCircle2 size={17}/></span><span className="cart-toast-copy"><strong>{t(cartNotice.type==='added'?'Added to cart':'Cart updated in another tab',language)}</strong><span>{cartNotice.type==='added'?t(cartNotice.name,language):t('Items, quantities, or totals may have changed.',language)}</span></span><Link href="/cart" className="cart-toast-link" data-testid="link-cart-feedback">{t('View cart',language)} <ArrowRight size={13}/></Link></div>}</ClerkRouterBridge></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider></div></LanguageProvider>;
}

export default App;

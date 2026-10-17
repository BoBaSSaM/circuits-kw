import { t, type Language } from './i18n';

type ReceiptPdfOrder = {
  orderNumber: string;
  items: { name: string; price: number; qty: number }[];
  subtotal: number;
  isDemo: boolean;
};

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_MARGIN = 100;
const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const encoder = new TextEncoder();

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function textHeight(lines: string[], fontSize: number) {
  return Math.max(1, lines.length) * Math.round(fontSize * 1.32);
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: { size?: number; weight?: number; align?: CanvasTextAlign; direction?: CanvasDirection; color?: string } = {},
) {
  const { size = 42, weight = 400, align = 'left', direction = 'ltr', color = '#172d3b' } = options;
  context.font = `${weight} ${size}px Arial, "Noto Sans Arabic", sans-serif`;
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.direction = direction;
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { size?: number; weight?: number; align?: CanvasTextAlign; direction?: CanvasDirection; color?: string } = {},
) {
  const size = options.size ?? 42;
  context.font = `${options.weight ?? 400} ${size}px Arial, "Noto Sans Arabic", sans-serif`;
  const lines = wrapText(context, text, maxWidth);
  const lineHeight = Math.round(size * 1.32);
  lines.forEach((line, index) => drawText(context, line, x, y + index * lineHeight, options));
  return textHeight(lines, size);
}

function createReceiptPage(
  order: ReceiptPdfOrder,
  language: Language,
  items: ReceiptPdfOrder['items'],
  pageIndex: number,
  pageCount: number,
  isLastPage: boolean,
) {
  const isArabic = language === 'ar';
  const direction: CanvasDirection = isArabic ? 'rtl' : 'ltr';
  const align: CanvasTextAlign = isArabic ? 'right' : 'left';
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas for the receipt.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  const title = t(order.isDemo ? 'Demo receipt' : 'Payment receipt', language);
  const badge = t(order.isDemo ? 'DEMO ORDER · NO PAYMENT TAKEN' : 'PAID · STRIPE CHECKOUT', language);
  const notice = t(
    order.isDemo
      ? 'This is a demo order receipt. No payment or fulfillment is connected.'
      : 'Payment was confirmed by Stripe. Delivery details are saved for order management.',
    language,
  );
  const titleX = isArabic ? PAGE_WIDTH - PAGE_MARGIN : PAGE_MARGIN;
  const headerHeight = pageIndex === 0 ? 375 : 270;

  drawText(context, 'CIRCUITS KW', titleX, 105, { size: 26, weight: 700, align, direction, color: '#17677b' });
  drawText(context, badge, titleX, 170, { size: 27, weight: 700, align, direction, color: '#17677b' });
  drawText(context, title, titleX, 245, { size: 54, weight: 700, align, direction });
  drawText(context, t('Order number', language), titleX, 330, { size: 32, align, direction, color: '#52616c' });
  drawText(context, order.orderNumber, isArabic ? PAGE_MARGIN : PAGE_WIDTH - PAGE_MARGIN, 330, {
    size: 32,
    weight: 700,
    align: isArabic ? 'left' : 'right',
    direction: 'ltr',
  });
  if (pageCount > 1) {
    drawText(context, `${pageIndex + 1} / ${pageCount}`, isArabic ? PAGE_MARGIN : PAGE_WIDTH - PAGE_MARGIN, 410, {
      size: 25,
      align: isArabic ? 'left' : 'right',
      direction: 'ltr',
      color: '#52616c',
    });
  }

  const itemX = isArabic ? PAGE_WIDTH - PAGE_MARGIN : PAGE_MARGIN;
  const amountX = isArabic ? PAGE_MARGIN : PAGE_WIDTH - PAGE_MARGIN;
  const quantityX = Math.round(PAGE_WIDTH / 2);
  let y = headerHeight + PAGE_MARGIN;
  context.strokeStyle = '#c8dce3';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(PAGE_MARGIN, y);
  context.lineTo(PAGE_WIDTH - PAGE_MARGIN, y);
  context.stroke();
  y += 54;

  drawText(context, t('Item', language), itemX, y, { size: 27, weight: 700, align, direction, color: '#52616c' });
  drawText(context, t('Quantity', language), quantityX, y, { size: 27, weight: 700, align: 'center', direction, color: '#52616c' });
  drawText(context, t('Amount', language), amountX, y, {
    size: 27,
    weight: 700,
    align: isArabic ? 'left' : 'right',
    direction: isArabic ? 'rtl' : 'ltr',
    color: '#52616c',
  });
  y += 62;

  const itemMaxWidth = 390;
  for (const item of items) {
    context.font = `400 35px Arial, "Noto Sans Arabic", sans-serif`;
    const nameLines = wrapText(context, t(item.name, language), itemMaxWidth);
    context.font = `400 29px Arial, "Noto Sans Arabic", sans-serif`;
    const quantityLines = wrapText(context, `${t('Quantity', language)}: ${item.qty}`, 220);
    const rowHeight = Math.max(80, textHeight(nameLines, 35), textHeight(quantityLines, 29)) + 28;
    drawWrappedText(context, t(item.name, language), itemX, y + 25, itemMaxWidth, {
      size: 35,
      align,
      direction,
    });
    drawWrappedText(context, `${t('Quantity', language)}: ${item.qty}`, quantityX, y + 25, 220, {
      size: 29,
      align: 'center',
      direction,
      color: '#52616c',
    });
    drawText(context, `${(item.price * item.qty).toFixed(3)} KWD`, amountX, y + 25, {
      size: 29,
      align: isArabic ? 'left' : 'right',
      direction: 'ltr',
    });
    y += rowHeight;
    context.strokeStyle = '#dfe8eb';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(PAGE_MARGIN, y);
    context.lineTo(PAGE_WIDTH - PAGE_MARGIN, y);
    context.stroke();
    y += 10;
  }

  if (isLastPage) {
    y += 28;
    drawText(context, t('Subtotal', language), itemX, y + 30, { size: 35, weight: 700, align, direction });
    drawText(context, `${order.subtotal.toFixed(3)} KWD`, amountX, y + 30, {
      size: 35,
      weight: 700,
      align: isArabic ? 'left' : 'right',
      direction: 'ltr',
    });
    y += 88;
    context.strokeStyle = '#172d3b';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(PAGE_MARGIN, y);
    context.lineTo(PAGE_WIDTH - PAGE_MARGIN, y);
    context.stroke();
    y += 58;
    drawWrappedText(context, notice, itemX, y, PAGE_WIDTH - PAGE_MARGIN * 2, {
      size: 29,
      align,
      direction,
      color: '#52616c',
    });
  }

  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) {
        reject(new Error('Could not encode the receipt page.'));
        return;
      }
      try {
        resolve(new Uint8Array(await blob.arrayBuffer()));
      } catch (error) {
        reject(error);
      }
    }, 'image/jpeg', 0.92);
  });
}

function textBytes(text: string) {
  return encoder.encode(text);
}

function joinBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function makePdf(images: Uint8Array[]) {
  const objects: Uint8Array[][] = [];
  const setObject = (id: number, parts: Uint8Array[]) => {
    objects[id] = parts;
  };
  const ref = (id: number) => `${id} 0 R`;
  const pageIds = images.map((_, index) => 3 + index * 3);
  const contentIds = pageIds.map(id => id + 1);
  const imageIds = pageIds.map(id => id + 2);

  setObject(1, [textBytes(`<< /Type /Catalog /Pages ${ref(2)} >>`)]);
  setObject(2, [textBytes(`<< /Type /Pages /Kids [${pageIds.map(ref).join(' ')}] /Count ${images.length} >>`)]);

  images.forEach((image, index) => {
    const pageId = pageIds[index];
    const contentId = contentIds[index];
    const imageId = imageIds[index];
    const content = textBytes(
      `q ${PDF_PAGE_WIDTH} 0 0 ${PDF_PAGE_HEIGHT} 0 0 cm /Im0 Do Q`,
    );
    setObject(pageId, [
      textBytes(
        `<< /Type /Page /Parent ${ref(2)} /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] ` +
          `/Resources << /XObject << /Im0 ${ref(imageId)} >> >> /Contents ${ref(contentId)} >>`,
      ),
    ]);
    setObject(contentId, [
      textBytes(`<< /Length ${content.length} >>\nstream\n`),
      content,
      textBytes('\nendstream'),
    ]);
    setObject(imageId, [
      textBytes(
        `<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
      ),
      image,
      textBytes('\nendstream'),
    ]);
  });

  const parts: Uint8Array[] = [textBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let byteOffset = parts[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = byteOffset;
    const objectParts = [textBytes(`${id} 0 obj\n`), ...objects[id], textBytes('\nendobj\n')];
    parts.push(...objectParts);
    byteOffset += objectParts.reduce((total, part) => total + part.length, 0);
  }

  const xrefOffset = byteOffset;
  const xref = [
    `xref\n0 ${objects.length}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`),
  ].join('');
  parts.push(textBytes(xref));
  parts.push(
    textBytes(
      `trailer\n<< /Size ${objects.length} /Root ${ref(1)} >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return new Blob([joinBytes(parts)], { type: 'application/pdf' });
}

export async function downloadReceiptPdf(order: ReceiptPdfOrder, language: Language) {
  await document.fonts?.ready;
  const rowFontSize = 35;
  const firstPageCapacity = PAGE_HEIGHT - PAGE_MARGIN * 2 - 375 - 54 - 62 - 290;
  const laterPageCapacity = PAGE_HEIGHT - PAGE_MARGIN * 2 - 270 - 54 - 62 - 290;
  const itemRows = order.items.map(item => {
    const measureCanvas = document.createElement('canvas');
    const context = measureCanvas.getContext('2d');
    if (!context) throw new Error('Could not measure receipt text.');
    context.font = `400 ${rowFontSize}px Arial, "Noto Sans Arabic", sans-serif`;
    const nameLines = wrapText(context, t(item.name, language), 390);
    context.font = '400 29px Arial, "Noto Sans Arabic", sans-serif';
    const quantityLines = wrapText(context, `${t('Quantity', language)}: ${item.qty}`, 220);
    return {
      item,
      height: Math.max(80, textHeight(nameLines, rowFontSize), textHeight(quantityLines, 29)) + 38,
    };
  });

  const chunks: ReceiptPdfOrder['items'][] = [];
  let current: ReceiptPdfOrder['items'] = [];
  let usedHeight = 0;
  for (const row of itemRows) {
    const capacity = chunks.length === 0 ? firstPageCapacity : laterPageCapacity;
    if (current.length && usedHeight + row.height > capacity) {
      chunks.push(current);
      current = [];
      usedHeight = 0;
    }
    current.push(row.item);
    usedHeight += row.height;
  }
  if (current.length || chunks.length === 0) chunks.push(current);

  const pages = chunks.map((items, index) =>
    createReceiptPage(order, language, items, index, chunks.length, index === chunks.length - 1),
  );
  const pdf = makePdf(await Promise.all(pages.map(canvasToJpeg)));
  const url = URL.createObjectURL(pdf);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${order.isDemo ? 'demo' : 'payment'}-receipt-${order.orderNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

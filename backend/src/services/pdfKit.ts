import PDFDocument from 'pdfkit';

/**
 * Small layout kit on top of pdfkit for official A4 reports: header band, key/value
 * meta, stat cards, bar chart, tables with page-break handling, signature block,
 * and a numbered footer on every page. Pure vector output — prints cleanly.
 */
export const INK = '#0f172a';
export const MUTED = '#64748b';
export const LINE = '#e2e8f0';
export const ACCENT = '#0284c7';
export const ACCENT_SOFT = '#bae6fd';

export const fmtNum = (n: number) => new Intl.NumberFormat('id-ID').format(n);
export const fmtDate = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = (d: Date) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
export const fmtShortDate = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export interface TableColumn {
  h: string;
  w: number;
  align?: 'left' | 'right';
}

export class ReportPdf {
  readonly doc: PDFKit.PDFDocument;
  readonly W: number;
  readonly L: number;
  private pageNo = 1;

  constructor(
    stream: NodeJS.WritableStream,
    private readonly opts: { title: string; org: string; generatedAt: Date; author?: string; landscape?: boolean },
  ) {
    this.doc = new PDFDocument({ size: 'A4', layout: opts.landscape ? 'landscape' : 'portrait', margin: 48, info: { Title: opts.title, Author: opts.org } });
    this.doc.pipe(stream);
    this.W = this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
    this.L = this.doc.page.margins.left;
    this.doc.on('pageAdded', () => {
      this.pageNo++;
      this.footer();
    });
  }

  /** Bottom-of-page caption; margins lifted so pdfkit never auto-paginates from inside the footer. */
  private footer() {
    const { doc, L, W } = this;
    const { x, y } = doc;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 36;
    doc.save().fontSize(8).fillColor(MUTED).text(`${this.opts.org} · ${this.opts.title} · dicetak ${fmtDate(this.opts.generatedAt)} ${fmtTime(this.opts.generatedAt)}`, L, fy, { width: W * 0.8, lineBreak: false });
    doc.text(`Halaman ${this.pageNo}`, L, fy, { width: W, align: 'right', lineBreak: false }).restore();
    doc.page.margins.bottom = bottom;
    doc.x = x;
    doc.y = y;
  }

  ensure(h: number) {
    const { doc } = this;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom - 24) doc.addPage();
  }

  header(subtitle: string, meta: Array<[string, string]>) {
    const { doc, L, W } = this;
    doc.rect(L, doc.y, 6, 44).fill(ACCENT);
    doc.fontSize(18).fillColor(INK).font('Helvetica-Bold').text(this.opts.title.toUpperCase(), L + 16, doc.y, { lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(subtitle, L + 16, doc.y + 22, { width: W - 16, lineBreak: false, ellipsis: true });
    doc.y += 56;
    let my = doc.y;
    meta.forEach(([k, v]) => {
      doc.fontSize(9).fillColor(MUTED).text(k, L, my, { width: 120, lineBreak: false });
      doc.fillColor(INK).text(v, L + 120, my, { width: W - 120, lineBreak: false, ellipsis: true });
      my += 14;
    });
    doc.x = L;
    doc.y = my;
    this.footer();
  }

  heading(t: string, note?: string) {
    const { doc, L, W } = this;
    this.ensure(44);
    doc.x = L;
    doc.moveDown(0.8).fontSize(12).fillColor(INK).font('Helvetica-Bold').text(t, L, doc.y, { width: W }).font('Helvetica');
    if (note) doc.fontSize(8).fillColor(MUTED).text(note, L, doc.y, { width: W });
    doc.moveTo(L, doc.y + 3).lineTo(L + W, doc.y + 3).lineWidth(0.6).strokeColor(LINE).stroke();
    doc.moveDown(0.6);
  }

  paragraph(t: string) {
    const { doc, L, W } = this;
    this.ensure(30);
    doc.fontSize(9).fillColor(MUTED).text(t, L, doc.y, { width: W });
    doc.moveDown(0.4);
  }

  cards(items: Array<[string, string]>, perRow = 4) {
    const { doc, L, W } = this;
    const gap = 12;
    const cw = (W - gap * (perRow - 1)) / perRow;
    const ch = 48;
    const rows = Math.ceil(items.length / perRow);
    this.ensure(rows * (ch + gap));
    const top = doc.y;
    items.forEach(([label, value], i) => {
      const x = L + (i % perRow) * (cw + gap);
      const y = top + Math.floor(i / perRow) * (ch + gap);
      doc.roundedRect(x, y, cw, ch, 6).lineWidth(0.6).strokeColor(LINE).stroke();
      doc.fontSize(8).fillColor(MUTED).text(label, x + 10, y + 9, { width: cw - 20, height: 10, lineBreak: false, ellipsis: true });
      doc.fontSize(15).fillColor(INK).font('Helvetica-Bold').text(value, x + 10, y + 23, { width: cw - 20, lineBreak: false }).font('Helvetica');
    });
    doc.x = L;
    doc.y = top + rows * (ch + gap) - 4;
  }

  /** Grouped bar chart: one bar per label, up to two series (primary + secondary). */
  barChart(points: Array<{ label: string; a: number; b?: number }>, legend: [string, string?], height = 90) {
    const { doc, L, W } = this;
    this.ensure(height + 40);
    const max = Math.max(1, ...points.flatMap((p) => [p.a, p.b ?? 0]));
    const legendY = doc.y;
    doc.rect(L, legendY + 1, 8, 8).fill(ACCENT);
    doc.fontSize(7).fillColor(MUTED).text(legend[0], L + 12, legendY, { lineBreak: false });
    if (legend[1]) {
      doc.rect(L + 90, legendY + 1, 8, 8).fill(ACCENT_SOFT);
      doc.fillColor(MUTED).text(legend[1], L + 102, legendY, { lineBreak: false });
    }
    doc.fillColor(MUTED).text(`maks. ${fmtNum(max)}`, L, legendY, { width: W, align: 'right', lineBreak: false });
    const top = legendY + 14;
    const baseY = top + height;
    const slot = W / points.length;
    doc.moveTo(L, baseY).lineTo(L + W, baseY).lineWidth(0.6).strokeColor(LINE).stroke();
    points.forEach((p, i) => {
      const x0 = L + i * slot + 1.5;
      const bw = Math.max((slot - 3) / (legend[1] ? 2 : 1), 1);
      const ha = (p.a / max) * (height - 10);
      if (ha > 0) doc.rect(x0, baseY - ha, bw, ha).fill(ACCENT);
      if (legend[1]) {
        const hb = ((p.b ?? 0) / max) * (height - 10);
        if (hb > 0) doc.rect(x0 + bw, baseY - hb, bw, hb).fill(ACCENT_SOFT);
      }
      const every = Math.max(1, Math.ceil(points.length / 5));
      if (i % every === 0 || i === points.length - 1) {
        const last = i === points.length - 1;
        doc.fontSize(7).fillColor(MUTED).text(p.label, last ? L + W - 40 : L + i * slot, baseY + 4, { width: 40, align: last ? 'right' : 'left', lineBreak: false });
      }
    });
    doc.x = L;
    doc.y = baseY + 22;
  }

  table(cols: TableColumn[], rows: string[][], opts: { rowH?: number; emptyText?: string } = {}) {
    const { doc, L, W } = this;
    const rowH = opts.rowH ?? 18;
    const draw = (cells: string[], y: number, bold = false, color = INK) => {
      let x = L;
      doc.fontSize(8.5).fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      cells.forEach((c, i) => {
        doc.text(c, x + 4, y + 5, { width: cols[i].w - 8, height: 11, align: cols[i].align ?? 'left', lineBreak: false, ellipsis: true });
        x += cols[i].w;
      });
      doc.font('Helvetica');
    };
    const headerRow = () => {
      doc.rect(L, doc.y, W, rowH).fill('#f1f5f9');
      draw(cols.map((c) => c.h), doc.y, true, MUTED);
      doc.y += rowH;
    };
    this.ensure(rowH * 2);
    headerRow();
    if (!rows.length) {
      const y0 = doc.y;
      doc.fontSize(9).fillColor(MUTED).text(opts.emptyText ?? 'Belum ada data pada periode/cakupan ini.', L + 4, y0 + 5, { lineBreak: false });
      doc.y = y0 + rowH;
    }
    rows.forEach((r) => {
      if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage();
        headerRow();
      }
      doc.moveTo(L, doc.y + rowH).lineTo(L + W, doc.y + rowH).lineWidth(0.4).strokeColor(LINE).stroke();
      draw(r, doc.y);
      doc.y += rowH;
    });
    doc.x = L;
    doc.moveDown(0.4);
  }

  signature(name: string, role: string, disclaimer: string) {
    const { doc, L, W } = this;
    this.ensure(110);
    doc.moveDown(1.2);
    doc.fontSize(9).fillColor(MUTED).text(disclaimer, L, doc.y, { width: W });
    doc.moveDown(1.5);
    const sx = L + W - 200;
    doc.fontSize(9).fillColor(INK).text('Mengetahui,', sx, doc.y, { width: 200 });
    doc.moveDown(3);
    doc.moveTo(sx, doc.y).lineTo(sx + 200, doc.y).lineWidth(0.6).strokeColor(INK).stroke();
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica-Bold').text(name, sx, doc.y, { width: 200 }).font('Helvetica');
    doc.fontSize(8).fillColor(MUTED).text(role, sx, doc.y, { width: 200 });
  }

  end() {
    this.doc.end();
  }
}

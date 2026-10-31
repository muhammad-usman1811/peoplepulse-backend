const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { once } = require('node:events');
const { setImmediate: yieldToEventLoop } = require('node:timers/promises');
const { stringify } = require('csv-stringify');
const PDFDocument = require('pdfkit');
const { DateTime } = require('luxon');
const Attendance = require('../models/Attendance');
const ApiResponse = require('../utils/apiResponse');
const { decrypt } = require('../utils/cryptoUtils');
const { APP_TIMEZONE } = require('../config/timezone');

// The cursor populates employees once per batch instead of once per record.
const CURSOR_BATCH_SIZE = 500;
// Mongoose queues a cursor with no timeout while disconnected (bufferTimeoutMS does not
// apply to cursors), so the wait for the first batch needs its own limit.
const FIRST_BATCH_TIMEOUT_MS = 15000;
// Only these employee fields leave the API; never email, phone, salary, or auth data.
const EXPORT_EMPLOYEE_FIELDS = 'name employeeId';

// Both formats share these columns; pdfWidth (points) sums to the A4 landscape table width.
const EXPORT_COLUMNS = [
  { key: 'employeeName', header: 'Employee Name', pdfWidth: 200 },
  { key: 'employeeId', header: 'Employee ID', pdfWidth: 110 },
  { key: 'date', header: 'Date', pdfWidth: 90 },
  { key: 'checkIn', header: 'Check In', pdfWidth: 90 },
  { key: 'checkOut', header: 'Check Out', pdfWidth: 90 },
  { key: 'status', header: 'Status', pdfWidth: 85 },
  { key: 'workingHours', header: 'Working Hours', pdfWidth: 95 },
];
const CSV_COLUMNS = EXPORT_COLUMNS.map(({ key, header }) => ({ key, header }));

const PDF_MARGIN = 40;
const PDF_ROW_HEIGHT = 20;
const PDF_FONT_SIZE = 9;
const PDF_CELL_PADDING = 4;
const PDF_TABLE_WIDTH = EXPORT_COLUMNS.reduce((total, column) => total + column.pdfWidth, 0);
const PDF_TEXT_COLOR = '#111827';
const PDF_HEADER_FILL = '#e5e7eb';
const PDF_STRIPE_FILL = '#f9fafb';

// One local calendar day in APP_TIMEZONE; Attendance.date is that day's local midnight in UTC.
// Shared with the HR attendance list so both endpoints select exactly the same records.
const buildDayFilter = (day) => ({
  date: {
    $gte: day.startOf('day').toUTC().toJSDate(),
    $lte: day.endOf('day').toUTC().toJSDate(),
  },
});

// Fixed locale so AM/PM reads the same whatever the server's locale is.
const formatTime = (value) =>
  value ? DateTime.fromJSDate(value, { zone: APP_TIMEZONE, locale: 'en-US' }).toFormat('hh:mm a') : '';

const formatWorkingHours = (clockIn, clockOut) => {
  if (!clockIn || !clockOut || clockOut < clockIn) return '';
  const minutes = Math.floor((clockOut - clockIn) / (60 * 1000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

const toExportRow = (record) => {
  const employee = record.employee || null;
  return {
    // User.name is encrypted at rest and decrypted by a schema getter, which lean() skips.
    // decrypt() mirrors that getter: plaintext passes through, and it never throws.
    employeeName: String(decrypt(employee?.name) ?? ''),
    employeeId: String(employee?.employeeId ?? ''),
    date: DateTime.fromJSDate(record.date).setZone(APP_TIMEZONE).toFormat('yyyy-MM-dd'),
    checkIn: formatTime(record.clockIn),
    checkOut: formatTime(record.clockOut),
    status: record.status,
    workingHours: formatWorkingHours(record.clockIn, record.clockOut),
  };
};

/**
 * Opens a lean cursor over one local day and waits for its first batch (or the end of an
 * empty result) before the caller commits to a file response, so a failed query can still be
 * answered with a JSON 500. If the client disconnects at any point, the cursor is destroyed,
 * which closes it on the server and frees the connection.
 * @returns {Promise<{ cursor: import('stream').Readable, clientGone: AbortSignal } | null>}
 *   null when the response is already handled: the 500 was sent or the client left.
 */
const openDayCursor = async (date, res) => {
  const day = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: APP_TIMEZONE });
  const clientGone = new AbortController();
  let cursor;

  res.on('close', () => {
    if (res.writableFinished) return;
    clientGone.abort();
    if (cursor) cursor.destroy();
  });

  try {
    cursor = Attendance.find(buildDayFilter(day))
      .select('employee date clockIn clockOut status')
      .sort({ clockIn: 1, _id: 1 })
      .populate('employee', EXPORT_EMPLOYEE_FIELDS)
      .lean()
      .cursor({ batchSize: CURSOR_BATCH_SIZE });

    // The caller's stream handling reports errors; this listener only stops an error raised
    // before that handling is attached from becoming an uncaught exception.
    cursor.on('error', () => {});

    await once(cursor, 'readable', {
      signal: AbortSignal.any([clientGone.signal, AbortSignal.timeout(FIRST_BATCH_TIMEOUT_MS)]),
    });
    if (cursor.errored) throw cursor.errored;
  } catch (err) {
    if (cursor) cursor.destroy();
    if (clientGone.signal.aborted) return null;
    console.error('[Attendance Export] Query failed before streaming:', err);
    ApiResponse.error(res, 'Failed to export attendance.', null, 500);
    return null;
  }

  return { cursor, clientGone: clientGone.signal };
};

// Every export is an attachment named after its day. no-store: the file holds employee
// names and IDs, so browsers and proxies must not keep a copy.
const setDownloadHeaders = (res, contentType, date, extension) => {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${date}.${extension}"`);
  res.setHeader('Cache-Control', 'no-store');
};

// --- CSV ---

// Spreadsheets run cells starting with these characters as formulas (CSV injection);
// a leading apostrophe makes them display as plain text.
const neutralizeFormula = (value) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const toCsvRow = (record) => {
  const row = toExportRow(record);
  return {
    ...row,
    employeeName: neutralizeFormula(row.employeeName),
    employeeId: neutralizeFormula(row.employeeId),
  };
};

// A throw inside transform() would escape the stream and crash the process, so it is
// handed to the callback, where pipeline turns it into a normal stream error.
const toCsvRowStream = () =>
  new Transform({
    objectMode: true,
    transform(record, _encoding, callback) {
      let row;
      try {
        row = toCsvRow(record);
      } catch (err) {
        return callback(err);
      }
      callback(null, row);
    },
  });

/**
 * Streams every attendance record for one local day to res as CSV, one cursor batch
 * at a time; the result set is never held in memory. Never rejects.
 * @param {string} date Validated YYYY-MM-DD calendar day
 * @param {import('express').Response} res
 */
const streamCsv = async (date, res) => {
  const opened = await openDayCursor(date, res);
  if (!opened) return;

  setDownloadHeaders(res, 'text/csv; charset=utf-8', date, 'csv');

  try {
    // bom: Excel otherwise misreads non-ASCII names in UTF-8 CSV.
    await pipeline(
      opened.cursor,
      toCsvRowStream(),
      stringify({ header: true, bom: true, columns: CSV_COLUMNS }),
      res
    );
  } catch (err) {
    // pipeline has already destroyed every stream: the cursor is closed and the response
    // is aborted, so the client sees a failed download instead of a silently truncated file.
    if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return; // client disconnected
    console.error('[Attendance Export] Stream failed after headers were sent:', err);
  }
};

// --- PDF ---

// Mongoose's own for-await support reads with cursor.next(), which skips the documents
// openDayCursor() already buffered in the stream; Node's stream iterator reads those first.
const iterateStream = (cursor) => Readable.prototype[Symbol.asyncIterator].call(cursor);

// PDFKit pushes output without honouring backpressure, and while rows come from an already
// buffered batch the drawing loop never yields, so finished pages pile up in the document
// instead of reaching res. Drawing (and reading the cursor) pauses until the document's
// output has been handed to res and res has drained to the client.
const waitForClient = async (doc, res, signal) => {
  while (!doc.destroyed && (doc.readableLength > 0 || res.writableNeedDrain)) {
    if (res.writableNeedDrain) await once(res, 'drain', { signal });
    else await yieldToEventLoop(undefined, { signal });
  }
};

const drawPdfRow = (doc, values, y, { bold = false, fill = null } = {}) => {
  if (fill) doc.rect(PDF_MARGIN, y, PDF_TABLE_WIDTH, PDF_ROW_HEIGHT).fill(fill);
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(PDF_FONT_SIZE).fillColor(PDF_TEXT_COLOR);

  let x = PDF_MARGIN;
  EXPORT_COLUMNS.forEach((column, index) => {
    // A one-line height with ellipsis cuts long values off instead of wrapping into the next row.
    doc.text(values[index], x + PDF_CELL_PADDING, y + (PDF_ROW_HEIGHT - PDF_FONT_SIZE) / 2, {
      width: column.pdfWidth - PDF_CELL_PADDING * 2,
      height: PDF_FONT_SIZE * 1.25,
      ellipsis: true,
    });
    x += column.pdfWidth;
  });
  return y + PDF_ROW_HEIGHT;
};

const drawPdfTableHeader = (doc, y) =>
  drawPdfRow(doc, EXPORT_COLUMNS.map((column) => column.header), y, { bold: true, fill: PDF_HEADER_FILL });

/**
 * Streams every attendance record for one local day to res as a PDF table, drawing rows
 * one at a time as the cursor yields them. Each finished page is flushed to the client
 * before the next starts, so memory holds at most one page. Never rejects.
 * @param {string} date Validated YYYY-MM-DD calendar day
 * @param {import('express').Response} res
 */
const streamPdf = async (date, res) => {
  const opened = await openDayCursor(date, res);
  if (!opened) return;
  const { cursor, clientGone } = opened;

  setDownloadHeaders(res, 'application/pdf', date, 'pdf');

  const title = `Attendance Report - ${date}`;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: PDF_MARGIN, info: { Title: title } });
  // Settles instead of rejecting, so a failed delivery cannot become an unhandled
  // rejection while rows are still being drawn.
  const delivered = pipeline(doc, res).then(() => null, (err) => err);
  const pageBottom = () => doc.page.height - PDF_MARGIN;

  try {
    doc.font('Helvetica-Bold').fontSize(16).fillColor(PDF_TEXT_COLOR).text(title, PDF_MARGIN, PDF_MARGIN);
    doc.font('Helvetica').fontSize(PDF_FONT_SIZE).fillColor('#6b7280')
      .text(`Times shown in ${APP_TIMEZONE}`, PDF_MARGIN, PDF_MARGIN + 22);

    let y = PDF_MARGIN + 44;
    let count = 0;

    for await (const record of iterateStream(cursor)) {
      if (count > 0 && y + PDF_ROW_HEIGHT > pageBottom()) {
        doc.addPage(); // writes out the finished page
        await waitForClient(doc, res, clientGone);
        y = drawPdfTableHeader(doc, PDF_MARGIN);
      } else if (count === 0) {
        y = drawPdfTableHeader(doc, y);
      }

      const row = toExportRow(record);
      y = drawPdfRow(doc, EXPORT_COLUMNS.map((column) => row[column.key]), y, {
        fill: count % 2 ? PDF_STRIPE_FILL : null,
      });
      count += 1;
    }

    if (count === 0) {
      doc.font('Helvetica').fontSize(11).fillColor(PDF_TEXT_COLOR).text('No records found for this date', PDF_MARGIN, y);
    } else {
      if (y + PDF_ROW_HEIGHT > pageBottom()) {
        doc.addPage();
        y = PDF_MARGIN;
      }
      doc.font('Helvetica-Bold').fontSize(PDF_FONT_SIZE).fillColor(PDF_TEXT_COLOR)
        .text(`Total records: ${count}`, PDF_MARGIN + PDF_CELL_PADDING, y + 8);
    }
    doc.end();
  } catch (err) {
    if (!clientGone.aborted) console.error('[Attendance Export] PDF stream failed after headers were sent:', err);
    cursor.destroy();
    // pipeline then aborts the response, so the client sees a failed download instead of a
    // silently truncated file.
    doc.destroy(err);
    await delivered;
    return;
  }

  const err = await delivered;
  if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
    console.error('[Attendance Export] PDF stream failed after headers were sent:', err);
  }
};

module.exports = {
  buildDayFilter,
  streamCsv,
  streamPdf,
};

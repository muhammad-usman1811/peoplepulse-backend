const { z } = require('zod');
const { DateTime } = require('luxon');
const { APP_TIMEZONE } = require('../config/timezone');

const EXPORT_FORMATS = ['csv', 'pdf'];
const EXPORT_FORMAT_MESSAGE = "format is required and must be 'csv' or 'pdf'";
const EXPORT_DATE_MESSAGE = 'date is required and must be a valid date in YYYY-MM-DD format';
const EXPORT_FUTURE_DATE_MESSAGE = 'date cannot be in the future';

const parseDay = (value) => DateTime.fromFormat(value, 'yyyy-MM-dd', { zone: APP_TIMEZONE });

// Same rules as the HR list's date check: the string must round-trip, so 2026-02-31 is
// rejected, and the day cannot be after today in APP_TIMEZONE.
const isCalendarDate = (value) => {
  const day = parseDay(value);
  return day.isValid && day.toFormat('yyyy-MM-dd') === value;
};
const isNotInFuture = (value) => parseDay(value) <= DateTime.now().setZone(APP_TIMEZONE).startOf('day');

// Unknown keys such as page and limit are stripped: the export is never paginated.
// Repeated params (?format=csv&format=pdf) arrive as arrays and fail the type check.
// abort: an impossible date reports only the format message, not the future-date one too.
const attendanceExportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS, { error: EXPORT_FORMAT_MESSAGE }),
  date: z
    .string({ error: EXPORT_DATE_MESSAGE })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: EXPORT_DATE_MESSAGE, abort: true })
    .refine(isCalendarDate, { error: EXPORT_DATE_MESSAGE, abort: true })
    .refine(isNotInFuture, { error: EXPORT_FUTURE_DATE_MESSAGE }),
});

module.exports = {
  EXPORT_FORMATS,
  EXPORT_FORMAT_MESSAGE,
  EXPORT_DATE_MESSAGE,
  EXPORT_FUTURE_DATE_MESSAGE,
  attendanceExportQuerySchema,
};

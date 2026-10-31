const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const { parsePositiveInteger } = require('../utils/pagination');
const { buildDayFilter, streamCsv, streamPdf } = require('../services/attendanceExportService');
const { APP_TIMEZONE } = require('../config/timezone');
const HR_LIST_DEFAULT_LIMIT = 10;
const HR_LIST_MAX_LIMIT = 50;
// Only these employee fields leave the API on the HR list; never email, phone, salary, or auth data.
const HR_LIST_EMPLOYEE_FIELDS = 'name employeeId department designation';

const getTodayRange = () => {
  const localToday = DateTime.now().setZone(APP_TIMEZONE);
  return {
    start: localToday.startOf('day').toUTC().toJSDate(),
    end: localToday.endOf('day').toUTC().toJSDate(),
  };
};

const getClockInStatus = (clockInTime) => {
  const localClockIn = DateTime.fromJSDate(clockInTime).setZone(APP_TIMEZONE);
  const allowedStart = localClockIn.startOf('day').set({ hour: 9, minute: 0, second: 0, millisecond: 0 });

  return localClockIn > allowedStart;
};

const parseAttendanceFilters = (query) => {
  const filters = {};
  const dateQuery = {};

  for (const field of ['from', 'to']) {
    if (query[field] === undefined) continue;
    if (typeof query[field] !== 'string') {
      return { error: `${field} must use YYYY-MM-DD format` };
    }

    const date = DateTime.fromFormat(query[field], 'yyyy-MM-dd', { zone: APP_TIMEZONE });
    if (!date.isValid || date.toFormat('yyyy-MM-dd') !== query[field]) {
      return { error: `${field} must use YYYY-MM-DD format` };
    }

    dateQuery[field === 'from' ? '$gte' : '$lte'] = (field === 'from'
      ? date.startOf('day')
      : date.endOf('day')
    ).toUTC().toJSDate();
  }

  if (dateQuery.$gte && dateQuery.$lte && dateQuery.$gte > dateQuery.$lte) {
    return { error: 'from must be on or before to' };
  }

  if (query.limit !== undefined) {
    if (!/^\d+$/.test(String(query.limit))) {
      return { error: 'limit must be an integer between 1 and 100' };
    }
    const limit = Number(query.limit);
    if (limit < 1 || limit > 100) {
      return { error: 'limit must be an integer between 1 and 100' };
    }
    filters.limit = limit;
  } else {
    filters.limit = 30;
  }

  if (Object.keys(dateQuery).length > 0) filters.date = dateQuery;
  return filters;
};

const isAttendanceDuplicate = (err) =>
  err.code === 11000 && err.keyPattern && err.keyPattern.employee && err.keyPattern.date;

exports.clockIn = async (req, res, next) => {
  try {
    const employeeId = req.user._id;
    const { start, end } = getTodayRange();
    const existing = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 });

    if (existing && existing.clockIn && !existing.clockOut) {
      return ApiResponse.error(res, 'You are already clocked in for today.', null, 409);
    }

    if (existing && existing.clockIn && existing.clockOut) {
      return ApiResponse.error(res, 'You have already clocked out for today.', null, 409);
    }

    const now = new Date();
    const isLate = getClockInStatus(now);
    const attendance = await Attendance.create({
      employee: employeeId,
      date: new Date(start),
      clockIn: now,
      status: isLate ? 'late' : 'present',
      isLate,
    });

    return ApiResponse.success(res, 'Clock-in successful.', { attendance }, 201);
  } catch (err) {
    if (isAttendanceDuplicate(err)) {
      return ApiResponse.error(res, 'Already clocked in today.', null, 409);
    }
    next(err);
  }
};

exports.clockOut = async (req, res, next) => {
  try {
    const employeeId = req.user._id;
    const { start, end } = getTodayRange();

    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 });

    if (!attendance) {
      return ApiResponse.error(res, 'No attendance record found for today. Please clock in first.', null, 400);
    }

    if (!attendance.clockIn) {
      return ApiResponse.error(res, 'You have not clocked in yet.', null, 400);
    }

    if (attendance.clockOut) {
      return ApiResponse.error(res, 'You have already clocked out for today.', null, 409);
    }

    attendance.clockOut = new Date();

    const totalMinutes = (attendance.clockOut - attendance.clockIn) / (60 * 1000);
    if (totalMinutes < 240) {
      attendance.isLate = attendance.isLate || attendance.status === 'late';
      attendance.isHalfDay = true;
      if (!attendance.isLate) attendance.status = 'half-day';
    }

    await attendance.save();

    return ApiResponse.success(res, 'Clock-out successful.', { attendance });
  } catch (err) {
    next(err);
  }
};

exports.getMyAttendance = async (req, res, next) => {
  try {
    const employeeId = req.user._id;
    const filters = parseAttendanceFilters(req.query);
    if (filters.error) return ApiResponse.error(res, filters.error, null, 400);

    const query = { employee: employeeId };
    if (filters.date) query.date = filters.date;

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(filters.limit)
      .populate('employee', 'name email role');

    return ApiResponse.success(res, 'Your attendance history retrieved successfully.', {
      attendance,
    });
  } catch (err) {
    next(err);
  }
};

exports.getTeamAttendance = async (req, res, next) => {
  try {
    const filters = parseAttendanceFilters(req.query);
    if (filters.error) return ApiResponse.error(res, filters.error, null, 400);

    const teamMembers = await User.find({
      manager: req.user._id,
      role: 'employee',
      isActive: true,
    }).select('_id');

    const query = { employee: { $in: teamMembers.map((member) => member._id) } };
    if (filters.date) query.date = filters.date;

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(filters.limit)
      .populate('employee', 'name email employeeId role manager');

    return ApiResponse.success(res, 'Team attendance retrieved successfully.', {
      attendance,
      teamSize: teamMembers.length,
    });
  } catch (err) {
    next(err);
  }
};

exports.getAttendance = async (req, res, next) => {
  try {
    const filters = parseAttendanceFilters(req.query);
    if (filters.error) return ApiResponse.error(res, filters.error, null, 400);

    const query = {};
    if (filters.date) query.date = filters.date;

    if (req.query.employeeId !== undefined) {
      if (typeof req.query.employeeId !== 'string' || !req.query.employeeId.trim()) {
        return ApiResponse.error(res, 'employeeId must be a valid employee ID', null, 400);
      }

      const employee = mongoose.isValidObjectId(req.query.employeeId)
        ? await User.findById(req.query.employeeId).select('_id')
        : await User.findOne({ employeeId: req.query.employeeId.trim() }).select('_id');

      if (!employee) return ApiResponse.error(res, 'Employee not found', null, 404);
      query.employee = employee._id;
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(filters.limit)
      .populate('employee', 'name email employeeId role');

    return ApiResponse.success(res, 'Attendance records retrieved successfully.', { attendance });
  } catch (err) {
    next(err);
  }
};

const parseHrAttendanceQuery = (query) => {
  let day = null;
  if (query.date !== undefined) {
    const parsed = typeof query.date === 'string'
      ? DateTime.fromFormat(query.date, 'yyyy-MM-dd', { zone: APP_TIMEZONE })
      : null;
    if (!parsed || !parsed.isValid || parsed.toFormat('yyyy-MM-dd') !== query.date) {
      return { error: 'date must be a valid calendar date in YYYY-MM-DD format' };
    }
    if (parsed > DateTime.now().setZone(APP_TIMEZONE).startOf('day')) {
      return { error: 'date cannot be in the future' };
    }
    day = parsed;
  }

  const page = parsePositiveInteger(query.page, 1);
  if (page === null) return { error: 'page must be a positive integer (minimum 1)' };

  const limit = parsePositiveInteger(query.limit, HR_LIST_DEFAULT_LIMIT, HR_LIST_MAX_LIMIT);
  if (limit === null) return { error: `limit must be an integer between 1 and ${HR_LIST_MAX_LIMIT}` };

  return { day, page, limit };
};

const toHrAttendanceRecord = (record) => {
  const { employee } = record;
  return {
    id: String(record._id),
    employee: employee
      ? {
          id: String(employee._id),
          employeeId: employee.employeeId || null,
          name: employee.name,
          department: employee.department,
          designation: employee.designation,
        }
      : null,
    date: DateTime.fromJSDate(record.date).setZone(APP_TIMEZONE).toFormat('yyyy-MM-dd'),
    clockIn: record.clockIn,
    clockOut: record.clockOut,
    status: record.status,
    isLate: record.isLate,
    isHalfDay: record.isHalfDay,
  };
};

exports.listHrAttendance = async (req, res, next) => {
  try {
    const params = parseHrAttendanceQuery(req.query);
    if (params.error) return ApiResponse.error(res, params.error, null, 400);

    const { page, limit } = params;
    let { day } = params;

    // No date: show the most recent day that has attendance, never one after today.
    if (!day) {
      const endOfToday = DateTime.now().setZone(APP_TIMEZONE).endOf('day').toUTC().toJSDate();
      const latest = await Attendance.findOne({ date: { $lte: endOfToday } })
        .sort({ date: -1 })
        .select('date');
      if (latest) day = DateTime.fromJSDate(latest.date).setZone(APP_TIMEZONE);
    }

    if (!day) {
      return ApiResponse.success(res, 'Attendance records retrieved successfully.', {
        date: null,
        records: [],
        pagination: { page, limit, totalRecords: 0, totalPages: 0 },
      });
    }

    const filter = buildDayFilter(day);

    // _id breaks clock-in ties so a record never appears on two pages.
    const [totalRecords, records] = await Promise.all([
      Attendance.countDocuments(filter),
      Attendance.find(filter)
        .sort({ clockIn: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('employee', HR_LIST_EMPLOYEE_FIELDS),
    ]);

    return ApiResponse.success(res, 'Attendance records retrieved successfully.', {
      date: day.toFormat('yyyy-MM-dd'),
      records: records.map(toHrAttendanceRecord),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.exportHrAttendance = async (req, res, next) => {
  try {
    const { format, date } = req.validatedQuery;
    if (format === 'pdf') return await streamPdf(date, res);
    return await streamCsv(date, res);
  } catch (err) {
    next(err);
  }
};

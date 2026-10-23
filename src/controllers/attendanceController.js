const { decrypt } = require('../utils/cryptoUtils');
const { DateTime } = require('luxon');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Karachi';

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
    const { date, page = '1', limit = '10' } = req.query;
    for (const [key, value, max] of [['page', page, Number.MAX_SAFE_INTEGER], ['limit', limit, 50]]) {
      if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) {
        return ApiResponse.error(res, `${key} must be an integer between 1 and ${max}`, null, 400);
      }
    }
    const offset = (Number(page) - 1) * Number(limit);
    if (!Number.isSafeInteger(offset)) return ApiResponse.error(res, 'page is too large', null, 400);
    const today = DateTime.now().setZone(APP_TIMEZONE).startOf('day');
    let day;
    if (date !== undefined) {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return ApiResponse.error(res, 'date must use YYYY-MM-DD format', null, 400);
      }
      day = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: APP_TIMEZONE });
      if (!day.isValid || day.toFormat('yyyy-MM-dd') !== date || day > today) {
        return ApiResponse.error(res, 'date must be a valid YYYY-MM-DD date and not in the future', null, 400);
      }
    } else {
      const latest = await Attendance.findOne({ date: { $lt: today.plus({ days: 1 }).toJSDate() } })
        .sort({ date: -1, _id: -1 }).select('date').lean();
      if (latest) day = DateTime.fromJSDate(latest.date).setZone(APP_TIMEZONE).startOf('day');
    }
    const pagination = { page: Number(page), limit: Number(limit), totalRecords: 0, totalPages: 0 };
    if (!day) return ApiResponse.success(res, 'Attendance fetched successfully', { date: null, records: [], pagination });
    const filter = { date: { $gte: day.startOf('day').toJSDate(), $lt: day.plus({ days: 1 }).startOf('day').toJSDate() } };
    const totalRecords = await Attendance.countDocuments(filter);
    let records = [];
    if (totalRecords && offset < totalRecords) {
      // Names are encrypted at rest: resolve name order, then paginate attendance in MongoDB.
      const employeeIds = await Attendance.distinct('employee', filter);
      const employees = await User.find({ _id: { $in: employeeIds } }).select('_id name').lean();
      const names = employees.map(employee => ({ ...employee, name: decrypt(employee.name) || '' }));
      const orderedIds = names.sort((a, b) => a.name.localeCompare(b.name, 'en') || String(a._id).localeCompare(String(b._id))).map(employee => employee._id);
      const slice = await Attendance.aggregate([
        { $match: filter },
        { $set: { employeeOrder: { $indexOfArray: [orderedIds, '$employee'] } } },
        { $sort: { employeeOrder: 1, _id: 1 } },
        { $skip: offset },
        { $limit: Number(limit) },
        { $project: { _id: 1 } },
      ]);
      const attendance = await Attendance.find({ _id: { $in: slice.map(row => row._id) } })
        .select('employee clockIn clockOut status').populate('employee', 'name department employeeId').lean();
      const byId = new Map(attendance.map(row => [String(row._id), row]));
      const time = value => value ? DateTime.fromJSDate(value).setZone(APP_TIMEZONE).toFormat('HH:mm') : null;
      records = slice.map(({ _id }) => {
        const row = byId.get(String(_id));
        return {
          employeeId: row.employee?.employeeId || row.employee?._id || null,
          name: decrypt(row.employee?.name) || '',
          department: row.employee?.department || '',
          checkIn: time(row.clockIn), checkOut: time(row.clockOut), status: row.status,
        };
      });
    }
    return ApiResponse.success(res, 'Attendance fetched successfully', {
      date: day.toFormat('yyyy-MM-dd'), records,
      pagination: { ...pagination, totalRecords, totalPages: Math.ceil(totalRecords / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

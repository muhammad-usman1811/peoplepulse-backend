const Attendance = require('../models/Attendance');
const ApiResponse = require('../utils/apiResponse');

const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const getClockInStatus = (clockInTime) => {
  const allowedStart = new Date(clockInTime);
  allowedStart.setHours(9, 0, 0, 0);

  return clockInTime > allowedStart ? 'late' : 'present';
};

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
    const attendance = await Attendance.create({
      employee: employeeId,
      date: new Date(start),
      clockIn: now,
      status: getClockInStatus(now),
    });

    return ApiResponse.success(res, 'Clock-in successful.', { attendance }, 201);
  } catch (err) {
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
      attendance.status = 'half-day';
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

    const query = { employee: employeeId };
    if (req.query.from || req.query.to) {
      query.date = {};
      if (req.query.from) {
        query.date.$gte = new Date(req.query.from);
      }
      if (req.query.to) {
        query.date.$lte = new Date(req.query.to);
      }
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(limit)
      .populate('employee', 'name email role');

    return ApiResponse.success(res, 'Your attendance history retrieved successfully.', {
      attendance,
    });
  } catch (err) {
    next(err);
  }
};

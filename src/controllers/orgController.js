const ApiResponse = require('../utils/apiResponse');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Location = require('../models/Location');

const models = { Department, Designation, Location };

const listRecords = (Model, label, resourceKey) => async (req, res, next) => {
  try {
    const records = await Model.find().sort({ name: 1 });
    return ApiResponse.success(res, `${label} retrieved successfully`, { [resourceKey]: records });
  } catch (err) {
    next(err);
  }
};

const createRecord = (Model, label, resourceKey) => async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return ApiResponse.error(res, `${label} name is required`, null, 400);
    }

    const record = await Model.create({ name });
    return ApiResponse.success(res, `${label} created successfully`, { [resourceKey.slice(0, -1)]: record }, 201);
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, `${label} name already exists`, null, 409);
    }
    next(err);
  }
};

const handlers = (modelName, label, resourceKey) => ({
  list: listRecords(models[modelName], label, resourceKey),
  create: createRecord(models[modelName], label, resourceKey),
});

module.exports = {
  departments: handlers('Department', 'Department', 'departments'),
  designations: handlers('Designation', 'Designation', 'designations'),
  locations: handlers('Location', 'Location', 'locations'),
};
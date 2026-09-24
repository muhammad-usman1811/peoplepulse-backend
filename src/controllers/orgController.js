const ApiResponse = require('../utils/apiResponse');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Location = require('../models/Location');

const models = { Department, Designation, Location };

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listRecords = (Model, label, resourceKey) => async (req, res, next) => {
  try {
    const query = {};
    const filterValues = [
      req.query.search,
      req.query.q,
      req.query.name,
      req.query.location,
    ].filter((value) => typeof value === 'string' && value.trim().length > 0);

    if (filterValues.length > 0) {
      query.$or = filterValues.map((value) => ({
        name: { $regex: escapeRegex(value.trim()), $options: 'i' },
      }));
    }

    const records = await Model.find(query).sort({ name: 1 });
    return ApiResponse.success(res, `${label} retrieved successfully`, { [resourceKey]: records });
  } catch (err) {
    next(err);
  }
};

const getRecordById = (Model, label, resourceKey) => async (req, res, next) => {
  try {
    const record = await Model.findById(req.params.id);
    if (!record) {
      return ApiResponse.error(res, `${label} not found`, null, 404);
    }

    return ApiResponse.success(res, `${label} retrieved successfully`, { [resourceKey.slice(0, -1)]: record });
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

const updateRecord = (Model, label, resourceKey) => async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return ApiResponse.error(res, `${label} name is required`, null, 400);
    }

    const record = await Model.findById(req.params.id);
    if (!record) {
      return ApiResponse.error(res, `${label} not found`, null, 404);
    }

    record.name = name;
    await record.save();

    return ApiResponse.success(res, `${label} updated successfully`, { [resourceKey.slice(0, -1)]: record });
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, `${label} name already exists`, null, 409);
    }
    next(err);
  }
};

const deleteRecord = (Model, label, resourceKey) => async (req, res, next) => {
  try {
    const record = await Model.findByIdAndDelete(req.params.id);
    if (!record) {
      return ApiResponse.error(res, `${label} not found`, null, 404);
    }

    return ApiResponse.success(res, `${label} deleted successfully`, { [resourceKey.slice(0, -1)]: record });
  } catch (err) {
    next(err);
  }
};

const handlers = (modelName, label, resourceKey) => ({
  list: listRecords(models[modelName], label, resourceKey),
  getById: getRecordById(models[modelName], label, resourceKey),
  create: createRecord(models[modelName], label, resourceKey),
  update: updateRecord(models[modelName], label, resourceKey),
  delete: deleteRecord(models[modelName], label, resourceKey),
});

module.exports = {
  departments: handlers('Department', 'Department', 'departments'),
  designations: handlers('Designation', 'Designation', 'designations'),
  locations: handlers('Location', 'Location', 'locations'),
};
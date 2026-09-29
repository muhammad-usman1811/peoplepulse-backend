const mongoose = require('mongoose');

const EmployeeCounterSchema = new mongoose.Schema({
  _id: { type: String, default: 'employee' },
  sequence: { type: Number, required: true, default: 1000 },
});

module.exports = mongoose.model('EmployeeCounter', EmployeeCounterSchema);
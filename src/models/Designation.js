const mongoose = require('mongoose');

const DesignationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Designation name is required'],
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Designation', DesignationSchema);
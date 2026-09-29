const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { encrypt, decrypt, hashToken, isEncryptedValue } = require('../utils/cryptoUtils');
const { buildNameSearchTokens } = require('../utils/searchIndex');
const { getJwtSecret } = require('../config/security');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a full name'],
      trim: true,
      validate: {
        validator(value) {
          const plaintext = isEncryptedValue(value) ? decrypt(value) : value;
          return typeof plaintext === 'string' && plaintext.length <= 120;
        },
        message: 'Name must not exceed 120 characters',
      },
      // Field-level AES-256 encryption at rest
      set: (val) => (val && !isEncryptedValue(val) ? encrypt(val) : val),
      get: (val) => (val ? decrypt(val) : val),
    },
    nameSearchTokens: {
      type: [String],
      default: [],
      select: false,
    },
    email: {
      type: String,
      required: [true, 'Please provide a work email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        'Please provide a valid corporate email address',
      ],
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      maxlength: [72, 'Password must not exceed 72 characters'],
      select: false, // Never return password in regular queries
    },
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'hr', 'employee'],
      default: 'employee',
    },
    department: {
      type: String,
      default: 'General',
      trim: true,
    },
    designation: {
      type: String,
      default: 'Team Member',
      trim: true,
    },
    location: {
      // Employee location remains the canonical Location.name string for API compatibility.
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'on-leave'],
      default: 'active',
      trim: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notificationPreferences: {
      email: {
        type: Boolean,
        default: true,
      },
      push: {
        type: Boolean,
        default: true,
      },
    },
    avatar: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lastLogin: {
      type: Date,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      getters: true,
    },
  }
);

// Pre-save hook: Hash password with bcrypt if modified
UserSchema.pre('save', async function (next) {
  if (this.isModified('name')) this.nameSearchTokens = buildNameSearchTokens(this.name);
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Method: Compare entered password with hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method: Generate signed JWT token
UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      role: this.role,
      tokenVersion: this.tokenVersion || 0,
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRE || '7d',
    }
  );
};

// Method: Generate and hash password reset token
UserSchema.methods.getResetPasswordToken = function () {
  // Generate random 32-byte hex token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = hashToken(resetToken);

  // Set expiration (30 minutes from now)
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000;

  return resetToken;
};

UserSchema.index({ role: 1, isActive: 1, createdAt: -1 });
UserSchema.index({ nameSearchTokens: 1 });
UserSchema.index({ manager: 1, role: 1, isActive: 1 });
UserSchema.index({ resetPasswordToken: 1, resetPasswordExpire: 1 });

module.exports = mongoose.model('User', UserSchema);

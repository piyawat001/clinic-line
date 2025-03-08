const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'กรุณากรอกชื่อ'],
      trim: true
    },
    lastName: {
      type: String,
      required: [true, 'กรุณากรอกนามสกุล'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'กรุณากรอกเบอร์โทรศัพท์'],
      trim: true,
      unique: true
    },
    email: {
      type: String,
      required: [true, 'กรุณากรอกอีเมล'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'กรุณากรอกอีเมลที่ถูกต้อง'
      ]
    },
    password: {
      type: String,
      required: [true, 'กรุณากรอกรหัสผ่าน'],
      minlength: [6, 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร']
    },
    address: {
      street: { type: String },
      city: { type: String },
      district: { type: String },
      province: { type: String },
      postalCode: { type: String }
    },
    lineUserId: {
      type: String,
      default: null
    },
    isAdmin: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Create User model
const User = mongoose.model('User', userSchema);

module.exports = User;
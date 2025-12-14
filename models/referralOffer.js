const mongoose = require('mongoose');

const referralOfferSchema = new mongoose.Schema({
  refferalBonus: {
    type: Number,
    required: true,
    default: 100
  },
  maxUsesPerUser: {
    type: Number,
    required: true,
    min: 1,
    default: 5
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ReferralOffer', referralOfferSchema);
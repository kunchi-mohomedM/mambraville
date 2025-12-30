
const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletTransactionSchema = new Schema({
  amount: {
    type: Number,
    required: true
  },

  type: {
    type: String,
    enum: ["credit", "debit"],
    required: true
  },

  reason: {
    type: String,
    enum: [
      "Order Refund",
      "Order Cancel Refund",
      "Order Item Cancellation Refund",
      "Wallet Topup",
      "Order Payment",
      "Admin Adjustment",
      "Referral Bonus",     
    "Referral Reward",    
    ],
    required: true
  },

  orderId: {
    type: Schema.Types.ObjectId,
    ref: "Order",
    default: null
  },

  description: {
    type: String,
    default: ""
  },


  createdAt: {
    type: Date,
    default: Date.now
  }
});

const walletSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },

  balance: {
    type: Number,
    default: 0
  },

  transactions: [walletTransactionSchema]
});

module.exports = mongoose.model("Wallet", walletSchema);


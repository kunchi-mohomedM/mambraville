const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    name: { type: String, required: true },
    image: { type: String, required: true },
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ["Pending",
            "Delivered",
            "Cancelled",
            "Return Requested",
            "Returned"],
        default: "Pending"
    },
    cancelReason: { type: String, default: "" },
    returnReason: { type: String, default: "" },
    returnRequestedAt: Date,
    returnApprovedAt: Date
});

const addressSchema = new mongoose.Schema({
    fullname: String,
    street: String,
    city: String,
    state: String,
    pincode: String,
});

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },

    items: [orderItemSchema],

    address: addressSchema,

    status: {
        type: String,
        enum: [
            "Pending",
            "Confirmed",
            "Paid",
            "Processing",
            "Shipped",
            "Delivered",
            "Cancelled",
            "Returned",
            "Failed"
        ],
        default: "Pending"
    },

    paymentMethod: {
        type: String,
        enum: ["COD", "Razorpay", "Wallet"],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ["Pending", "Paid", "Failed"],
        default: "Pending"

    },

    razorpayOrderId: {
        type: String,
        default: null
    },
    razorpayPaymentId: {
        type: String,
        default: null
    },

    orderedAt: {
        type: Date,
        default: Date.now
    },

    deliveredAt: {
        type: Date,
        default: null
    },

    totalAmount: {
        type: Number,
        required: true
    },
    cancelReason: { type: String, default: "" },
    returnReason: { type: String, default: "" }
});

module.exports = mongoose.model("Order", orderSchema);


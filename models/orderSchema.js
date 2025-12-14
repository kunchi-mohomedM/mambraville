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

    // 🔒 LOCKED PRICING
    finalPrice: { type: Number, required: true },

    discountPercent: { type: Number, default: 0 },
    discountSource: {
        type: String,
        enum: ["product", "category", "none"],
        default: "none"
    },

    subtotal: { type: Number, required: true },

    status: {
        type: String,
        enum: [
            "Pending",
            "Delivered",
            "Cancelled",
            "Return Requested",
            "Returned"
        ],
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

const couponSchema = new mongoose.Schema({
    couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
        default: null
    },
    code: {
        type: String,
        default: null
    },
    discountType: {
        type: String,
        enum: ["percentage"],
        default: null
    },
    discountValue: {
        type: Number,
        default: 0
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    minPurchase: {
        type: Number,
        default: 0
    }
}, { _id: false });


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

    address: {
        fullname: String,
        phone: String,
        addressLine: String,
        locality: String,
        city: String,
        state: String,
        pincode: String
    },

    // 🔹 COUPON DETAILS
    coupon: {
        type: couponSchema,
        default: null
    },

    subtotalAmount: {
        type: Number,
        required: true
    },

    couponDiscountAmount: {
        type: Number,
        default: 0
    },


    totalAmount: {
        type: Number,
        required: true
    },

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

    razorpayOrderId: String,
    razorpayPaymentId: String,

    orderedAt: {
        type: Date,
        default: Date.now
    },

    deliveredAt: Date,

    cancelReason: { type: String, default: "" },
    returnReason: { type: String, default: "" }

}, { timestamps: true });


module.exports = mongoose.model("Order", orderSchema);


// models/Address.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const addressSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true           // good for queries by user
    },
    address: [{
        name: {
            type: String,
            required: true,
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
            trim: true
        },
        pincode: {
            type: Number,
            required: true
        },
        phone: {
            type: String,
            required: true,
            trim: true
        }
       
    }]
}, { timestamps: true });

const Address = mongoose.model("Address", addressSchema);
module.exports = Address;
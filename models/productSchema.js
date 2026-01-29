const mongoose= require("mongoose");
const {Schema} = mongoose;

const productSchema = new Schema({
    productName:{
        type:String,
        required:true,
    },
    description:{
        type:String,
        required:true,
    },
    brand:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        required:true, 
    },
    category:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required:true,  
    },
    price:{
        type:Number,
        required:true,
    },
    discount:{
        type:Number,
        default:0,
    },
    sellingPrice:{
        type:Number,
        required:true,
        min:0,
    },activeDiscountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    discountAppliedBy: {
      type: String,
      enum: ["none", "product", "category"],
      default: "none",
    },
    quantity:{
        type:Number,
        required:true,
    },
    productImage: [
        {
            url: { type: String, required: true },
            public_id: { type: String }
        }
    ],
    isDeleted:{
        type:Boolean,
        default:false
    },
    status:{
        type:String,
        enum:["Available","out of stock","Discontinued"],
        required:true,
        default:"Available"
    },   
}, {timestamps:true});

productSchema.index({ sellingPrice: 1 });
productSchema.index({ category: 1, sellingPrice: 1 });

const Product = mongoose.model("Product",productSchema);
module.exports = Product;
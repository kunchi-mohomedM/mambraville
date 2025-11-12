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
    quantity:{
        type:Number,
        required:true,
    },
    productImage:[String],
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

const Product = mongoose.model("Product",productSchema);
module.exports = Product;
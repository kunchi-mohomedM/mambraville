
const mongoose=require("mongoose")

const cartSchema = new mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        unique:true
    },
    items:[{ 
        productId:{
            type:mongoose.Schema.Types.ObjectId,
            ref:"Product",
            required:true,
        },
        name:{type:String,required:true},
        image:{type:String,required:true},
        qty:{type:Number,required:true},
        price:{type:Number,required:true},
        discount:{type:Number,default:0},
        subtotal:{type:Number,required:true}
    }],
    cartTotal:{type:Number,default:0}},
    {timestamps:true});

    module.exports=mongoose.model("Cart",cartSchema)
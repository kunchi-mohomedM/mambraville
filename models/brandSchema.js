const mongoose = require("mongoose");
const {Schema} = mongoose;

const brandSchema = new Schema({
    brandname:{
        type:String,
        required:true,
        unique:true
    },
    description:{
        type:String,
        required:true,
    },
    isListed:{
        type:Boolean,
        default:true,
    },
},{timestamps:true})

const brand = mongoose.model("Brand",brandSchema);
module.exports=brand;
const mongoose = require("mongoose");
const {Schema} = mongoose;

const userSchema = new Schema({
    fullname:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true,
        unique:false,
    },
    googleId:{
        type:String,
        unique:true,
    },
    password:{
        type:String,
        required:false,
    },
    isBlocked:{
        type :Boolean,
        default:false
    },
},{timestamps:true})


const User = mongoose.model("User",userSchema);
module.exports = User
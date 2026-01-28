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
    },
    password:{
        type:String,
        required:false,
    },
    isBlocked:{
        type :Boolean,
        default:false
    },
    referralId:{
        type:String,
        unique:true,
        sparse:true
    },

    referredBy:{
        type:String,
        default:null
    },
    referredUsers:[
        {
            userId:{type : mongoose.Schema.Types.ObjectId,ref:"User"},
            date:{type : Date , default : Date.now }
        }
    ],

   
    
    
},{timestamps:true})


const User = mongoose.model("User",userSchema);
module.exports = User
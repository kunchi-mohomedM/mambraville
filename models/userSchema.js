const mongoose = require("mongoose");
const {Schema} = mongoose;

const addressSchema=new Schema({
            fullname:{type:String,required:true},
            phone:{type:String,required:true},
            pincode:{type:String,required:true},
            addressLine:{type:String,required:true},
            locality:{type:String,required:true},
            city:{type:String,required:true},
            state:{type:String,required:true},
            isDefault:{type:Boolean,default:false}
},{_id:true});

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

    address:[addressSchema],
    wallet:{type:Number , defualt:0}
    
},{timestamps:true})


const User = mongoose.model("User",userSchema);
module.exports = User
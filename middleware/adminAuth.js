const User = require("../models/userSchema")



const adminAuth = (req,res,next)=>{
    if(req.session.admin){
            next();
        }else{
            res.redirect("/admin/login")
        }
}

const islogin=(req,res,next)=>{
    if(req.session.admin){
        res.redirect("/admin/dashboard")
    }else{
        next()
    }
}

module.exports={
    adminAuth,
    islogin
}

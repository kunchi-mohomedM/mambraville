const User = require("../models/userSchema")

const userAuth = (req,res,next)=>{
    if(req.session.user){
        User.findById(req.session.user)
        .then(data=>{
            if(data && !data.isBlocked){
                next();
            }else{
                res.redirect("/login")
            }
        }).catch(error=>{
            console.log("Error in user auth middleware");
            res.status(500).send("Internal server error")
        })
    }else{
        res.redirect("/login")
    }
}

const isLogin= (req,res,next)=>{
    if(req.session.user){
        res.locals.user=true
        return res.redirect('/')
    }
    next()
}

module.exports={userAuth,isLogin}
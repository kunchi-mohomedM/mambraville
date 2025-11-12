const loaddashboard = async(req,res)=>{
    try {
        res.render("dashboard")
    } catch (error) {
        console.log("Error occured while rendering dashboard page",error)
    }
}


module.exports={
    loaddashboard
}

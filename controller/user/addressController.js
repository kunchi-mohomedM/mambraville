const User = require("../../models/userSchema");

const addAddress=async(req,res)=>{
    try {

        const userId = req.session.user;

        if(!userId) return res.redirect("/login");

        const {fullname , phone , pincode ,addressLine , locality , city ,state}=req.body;

        await User.findByIdAndUpdate(userId ,{
            $push:{
                address:{
                   fullname,
                   phone,
                   pincode,
                   addressLine,
                   locality,
                   city,
                   state
                }
            }
        }
    );
    return res.redirect("/addressmanagement");

    } catch (error) {
        console.log("Error adding address:",error);
        res.redirect("/pageNotFound");
    }
};


const editAddress=async(req,res)=>{
   
    try{

         const userId=req.session.user;
         const addressId=req.params.id;

         const {fullname , phone , pincode ,addressLine , locality , city ,state}=req.body;
    
         await User.updateOne(
                     {_id:userId,"address._id":addressId},
                     {
                        $set:{
                            "address.$.fullname":fullname,
                            "address.$.phone":phone,
                            "address.$.pincode":pincode,
                            "address.$.addressLine":addressLine,
                            "address.$.locality":locality,
                            "address.$.city":city,
                            "address.$.state":state

                        }
                     }
                 );
                 return res.redirect("/addressmanagement");
    }catch(error){
        console.log("Error editing address:",error);
        res.redirect("/pageNotFound");
    }
};


const deleteAddress=async(req,res)=>{
    try{
        const userId=req.session.user;
        const addressId=req.params.id;

        await User.findByIdAndUpdate(userId,{
            $pull:{
                address:{
                    _id:addressId
                }
            }
        });

        res.redirect("/addressmanagement");

    }catch(error){
        console.log("Error deleting address:",error);
        res.redirect("/pageNotFound");
    }
};

const setDefaultAddress=async(req,res)=>{
    try {
        const userId=req.session.user;
        const addressId=req.params.id;

        const userData=await User.findById(userId);

        if(!userData) return res.redirect("/login");

        userData.address.forEach(a=>{
            a.isDefault=(a._id.toString()===addressId);
        });

        await userData.save({validateBeforeSave:false});

        return res.redirect("/addressmanagement");

    } catch (error) {
        console.log("Error setting default address:",error);
        res.redirect("/pageNotFound");
    }
};

const loadAddAddressPage=(req,res)=>{
    res.render("addaddress");
}

const loadEditAddressPage=async(req,res)=>{
    const userId=req.session.user;
    const addressId=req.params.id;

    const user=await User.findById(userId).lean();
    const address=user.address.find(a=>a._id.toString()===addressId);

    res.render("editaddress",{address});
}

module.exports={
    addAddress,
    editAddress,
    deleteAddress,
    setDefaultAddress,
    loadAddAddressPage,
    loadEditAddressPage
}
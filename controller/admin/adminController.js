const Admin=require("../../models/adminModel");
const bcrypt=require("bcryptjs");
const Users= require('../../models/userSchema')


const loadlogin=async(req,res)=>{
    try {
        res.render("adminlogin")
    } catch (error) {
        console.log('error occured while login page rendering');
    }
}


const login = async(req,res)=>{
 try {
    const {email,password}=req.body;
    console.log(email , password)
 
    const admin = await Admin.findOne({ email })
    console.log("Admin Found:", admin);

    if(!admin){
        return res.render('adminlogin',{message:'Invalid Email or Username'})
    }
    let status =await bcrypt.compare(password,admin.password)
    if(!status){
        return res.render("adminlogin",{message:"Invalid Password"})
    }
    req.session.admin=true;
  res.redirect("/admin/dashboard")

 } catch (error) {
    console.log(error)
 }
}


const toggleBlockUser = async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Find the user
        const user = await Users.findById(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        
        user.isBlocked = !user.isBlocked;
        await user.save();

        if (user.isBlocked) {
            // We don't destroy session here (hard without session store)
            // → middleware will handle it on next request
            console.log(`User ${userId} blocked → sessions will be cleared on next action`);
        }

        return res.status(200).json({
            success: true,
            message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
            isBlocked: user.isBlocked
        });

    } catch (error) {
        console.error('Error in toggleBlockUser:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
};





const loaduser = async (req, res) => {
    try {
       
        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        const limit = 10;
        let sort = req.query.sort || 'asc'; 

        
        let query = {
            $or: [
                { fullname: { $regex: search, $options: 'i' } }, 
                { email: { $regex: search, $options: 'i' } }
            ]
        };

       
        let sortOption = {};
        switch (sort) {
            case 'asc':
                sortOption = { fullname: 1 }; 
                break;
            case 'desc':
                sortOption = { fullname: -1 }; 
                break;
            case 'active':
                query.isBlocked = false; 
                sortOption = { fullname: 1 };
                break;
            case 'blocked':
                query.isBlocked = true; 
                sortOption = { fullname: 1 };
                break;
            default:
                sortOption = { fullname: 1 };
        }
       
       
        const users = await Users.find(query)
            .sort(sortOption)
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        
        const count = await Users.countDocuments(query);
        const totalPages = Math.ceil(count / limit);

        
        res.render('users', {
            users,
            search,
            page,
            totalPages,
            sort
        });
    } catch (error) {
        console.error('Error occurred while rendering users page:', error);
        res.status(500).send('Internal Server Error');
    }
};






module.exports ={
    loadlogin,
    login,
    loaduser,
    toggleBlockUser,
   
}
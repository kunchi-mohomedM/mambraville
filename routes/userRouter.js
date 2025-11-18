const express= require("express");
const router = express.Router();
const userController =require("../controller/user/userController")
const userproductController=require("../controller/user/userproductController")
const addressController=require("../controller/user/addressController")
const ordersummaryController=require("../controller/user/ordersummaryController");
const cartControler=require("../controller/user/cartController")
const {userAuth,isLogin}= require('../middleware/userAuth');
const passport = require("passport");


router.get("/pageNotFound",userController.pageNotFound);

router.get("/signup",userController.loadSignup)
router.post("/signup",userController.signUp)

router.get('/login',isLogin, userController.loadLogin);
router.post('/login',isLogin, userController.login);
router.get('/logout', userController.logout);

router.post('/verify-otp',userController.verifyOtp)
router.post("/resend-otp",userController.resendOtp)

router.get("/forgot-password",isLogin,userController.forgotpassword)
router.post("/forgot-password",isLogin,userController.emailverification)
router.get("/reset-password",isLogin,userController.loadresetpassword)
router.post("/reset-password",isLogin,userController.resetpasswordverification)


router.get('/products-user',userproductController.loadUserProducts)
router.get('/productdetails/:id',userproductController.loadproductdetails)

router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    req.session.user=req.user._id
    res.redirect('/')
})


router.get("/user-Profile",userAuth,userController.loaduserprofile)

router.get("/addressmanagement",userAuth,userController.loadaddressmanagement)

//address operations
router.post("/add-address",userAuth,addressController.addAddress);
router.post("/edit-address/:id",userAuth,addressController.editAddress);
router.get("/delete-address/:id",userAuth,addressController.deleteAddress);
router.get("/set-default-address/:id",userAuth,addressController.setDefaultAddress);

router.get("/add-address-page",userAuth,addressController.loadAddAddressPage);
router.get("/edit-address-page/:id",userAuth,addressController.loadEditAddressPage);


router.get("/order-summary",userAuth,ordersummaryController.loadOrderSummary);



router.get("/cart",userAuth,cartControler.loadCart)

router.get("/",userController.loadHomepage);




module.exports = router;
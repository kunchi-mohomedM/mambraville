const express= require("express");
const router = express.Router();
const userController =require("../controller/user/userController")
const userproductController=require("../controller/user/userproductController")
const addressController=require("../controller/user/addressController")
const cartController=require("../controller/user/cartController")
const orderController =require("../controller/user/orderController");
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
router.get("/change-password",userAuth,userController.loadChangePassword);
router.post("/change-password",userAuth,userController.changePassword);

router.get("/addressmanagement",userAuth,userController.loadaddressmanagement)

//address operations
router.post("/add-address",userAuth,addressController.addAddress);
router.post("/edit-address/:id",userAuth,addressController.editAddress);
router.get("/delete-address/:id",userAuth,addressController.deleteAddress);
router.get("/set-default-address/:id",userAuth,addressController.setDefaultAddress);

router.get("/add-address-page",userAuth,addressController.loadAddAddressPage);
router.get("/edit-address-page/:id",userAuth,addressController.loadEditAddressPage);


router.get("/order-summary",userAuth,orderController.loadOrderSummary);



router.get("/cart",userAuth,cartController.loadCart)
router.get("/add-to-cart/:id",userAuth,cartController.addTocart)
router.post("/cart/remove/:id",userAuth,cartController.removeItem);
router.get("/cart/increase/:id",userAuth,cartController.increaseQty);
router.get("/cart/decrease/:id",userAuth,cartController.decreaseqty);


router.get("/checkout",userAuth,orderController.loadCheckout);
router.post("/order/place",userAuth,orderController.placeOrder);
router.get("/order/success/:orderId",userAuth,orderController.loadOrderSuccess);
router.get("/order/details/:id",userAuth,orderController.loadOrderDetails)
router.post("/order/cancel/:orderId",userAuth,orderController.cancelOrder);
router.post("/order/return/:orderId",userAuth,orderController.returnOrder);


router.get("/",userController.loadHomepage);




module.exports = router;
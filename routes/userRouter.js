const express= require("express");
const router = express.Router();
const userController =require("../controller/user/userController")
const userproductController=require("../controller/user/userproductController")
const addressController=require("../controller/user/addressController")
const cartController=require("../controller/user/cartController")
const orderController =require("../controller/user/orderController");
const wishlistController = require("../controller/user/wishlistController");
const walletController = require("../controller/user/walletController");
const couponController = require("../controller/user/couponController");
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
router.post("/update-username",userAuth,userController.updateUserName);
router.get("/change-password",userAuth,userController.loadChangePassword);
router.post("/change-password",userAuth,userController.changePassword);
router.get("/addressmanagement",userAuth,userController.loadaddressmanagement)
router.get("/aboutPage",userController.loadAboutpage);

//address operations
router.post("/add-address",userAuth,addressController.addAddress);
router.post("/edit-address/:id",userAuth,addressController.editAddress);
router.get("/delete-address/:id",userAuth,addressController.deleteAddress);
router.get("/set-default-address/:id",userAuth,addressController.setDefaultAddress);
router.get("/edit-address-page/:id",userAuth,addressController.loadEditAddressPage);


router.get("/cart",userAuth,cartController.loadCart);
router.get("/add-to-cart/:id",userAuth,cartController.addTocart);
router.post("/cart/remove/:id",userAuth,cartController.removeItem);
router.get("/cart/increase/:id",userAuth,cartController.increaseQty);
router.get("/cart/decrease/:id",userAuth,cartController.decreaseqty);


router.get("/order-summary",userAuth,orderController.loadOrderSummary);
router.get("/checkout",userAuth,orderController.loadCheckout);
router.post("/order/place",userAuth,orderController.placeOrder);

router.post("/order/verify-payment",userAuth,orderController.verifyPayment)
// Route
router.post("/order/payment-failed", userAuth, orderController.markPaymentFailed);

router.get("/order/success/:orderId",userAuth,orderController.loadOrderSuccess);

router.get('/order/payment-failed/:orderId',userAuth,orderController.loadOrderFailure);
router.post("/order/retry-payment-create/:orderId", orderController.retryPaymentCreate);

router.get("/order/details/:orderId",userAuth,orderController.loadOrderDetails)
router.post("/order/cancel/:orderId",userAuth,orderController.cancelOrder);

router.post("/order/cancel-item/:orderId/:itemId",userAuth,orderController.cancelItem);
router.post("/order/return-item/:orderId/:itemId",userAuth,orderController.returnItem);


router.get("/wishlist",userAuth, wishlistController.loadWishlist);
router.get("/wishlist/toggle/:productId", userAuth,wishlistController.toggleWishlist);
router.post("/wishlist/move-to-cart",userAuth, wishlistController.moveToCart);
router.post('/wishlist/remove',userAuth,wishlistController.removeFromWishlist)


router.get('/wallet',userAuth,walletController.loadWallet)
router.post("/wallet/create-order", userAuth, walletController.createWalletOrder);
router.post("/wallet/verify-payment", userAuth, walletController.verifyWalletPayment);







router.post("/coupon/apply",userAuth,couponController.applyCoupon);




router.get("/",userController.loadHomepage);




module.exports = router;
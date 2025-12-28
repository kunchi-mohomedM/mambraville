const express =require("express");
const router = express.Router();
const adminController=require("../controller/admin/adminController")
const {adminAuth,islogin}= require("../middleware/adminAuth")
const categoryController = require("../controller/admin/categoryController")
const brandController = require("../controller/admin/brandController")
const productController= require("../controller/admin/productController")
const dashboardController=require("../controller/admin/dashboardController")
const adminOrderController = require("../controller/admin/adminOrderController");
const couponController = require("../controller/admin/couponController")
const offerController = require("../controller/admin/offerController")
const {deleteCategory}=require('../controller/admin/categoryController');
const salesReportController = require("../controller/admin/salesReportController");
const upload=require("../config/multer");
const { userAuth } = require("../middleware/userAuth");



router.get("/login",islogin,adminController.loadlogin)
router.post("/login",islogin,adminController.login)
router.get("/users",adminAuth,adminController.loaduser)
router.post('/users/block/:userId',adminAuth,adminController.toggleBlockUser);


router.get('/dashboard',adminAuth,dashboardController.loadDashboard);



router.get("/category",adminAuth,categoryController.categoryInfo);
router.get("/addCategory",adminAuth,categoryController.loadaddCategory);
router.post("/addCategory",adminAuth,categoryController.addCategory);
router.get("/editCategory/:id",adminAuth,categoryController.loadeditcategory)
router.post("/editCategory",adminAuth,categoryController.editCategory)
router.get('/category/delete/:id',deleteCategory);


router.get("/brands",adminAuth,brandController.brandInfo);
router.get("/addBrands",adminAuth,brandController.loadaddBrands);
router.post("/addBrands",adminAuth,brandController.addBrands);
router.get("/editBrands/:id",adminAuth,brandController.loadeditBrands)
router.post("/editBrands",adminAuth,brandController.editBrands)


router.get("/products",adminAuth,productController.loadproductpage)
router.get("/addproduct",adminAuth,productController.loadaddproduct)
router.post("/addproduct", adminAuth, upload.array('productImages', 4), productController.addproducts);
router.get("/editproduct/:id",adminAuth,productController.loadeditproduct)

router.post('/editproduct/:id', upload.array('productImages', 4),productController.editproduct);
router.post('/delete-product-image/:productId/:imageIndex', productController.deleteProductImage);
router.patch('/product/delete',adminAuth,productController.toggleDeletedproduct)




router.get("/orders", adminAuth, adminOrderController.listOrders);
router.get("/order/:orderId", adminAuth, adminOrderController.viewOrder);
router.post("/order/status/:orderId", adminAuth, adminOrderController.updateOrderStatus);
router.post("/orders/:orderId/verify-return/:itemId", adminAuth, adminOrderController.verifyReturn);
router.post("/orders/:orderId/cancel", adminAuth, adminOrderController.cancelOrderByAdmin);
router.get(
  "/orders/returns",
  adminAuth,
  adminOrderController.listReturnRequests
);

router.post(
  "/orders/returns/approve/:orderId/:itemId",
  adminAuth,
  adminOrderController.approveReturn
);

router.post(
  "/orders/returns/reject/:orderId/:itemId",
  adminAuth,
  adminOrderController.rejectReturn
);



//Coupon Management
router.get("/coupon",adminAuth,couponController.loadCouponManagement);
router.get("/addCoupon",adminAuth,couponController.loadAddCoupon);
router.post("/addCoupon",adminAuth,couponController.addCoupon);
router.get('/coupon/delete/:id',adminAuth,couponController.deleteCoupon);




router.get('/offers',adminAuth,offerController.loadOfferManagement)
router.put('/offers/referral/update', adminAuth, offerController.updateReferralOffer);
router.patch('/offers/referral/toggle', adminAuth, offerController.toggleReferralOfferStatus);


router.post('/offers/category/create', adminAuth, offerController.createCategoryOffer);
router.put('/offers/category/:id', adminAuth, offerController.updateCategoryOffer);
router.patch('/offers/category/:id/toggle', adminAuth, offerController.toggleCategoryOfferStatus);
router.delete('/offers/category/:id', adminAuth, offerController.deleteCategoryOffer); // Optional



router.get("/sales-report/excel",adminAuth,salesReportController.downloadExcel);
router.get("/sales-report/pdf",adminAuth,salesReportController.downloadPDF);


module.exports = router;
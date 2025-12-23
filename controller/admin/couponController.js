const Coupon = require("../../models/couponSchema")

const loadCouponManagement = async(req,res) =>{
    try {
        
        const Coupons = await Coupon.find({});

        res.render("couponManagement",{Coupons})
    } catch (error) {
        console.log(error)
    }
}


const loadAddCoupon = async(req,res)=>{
    try { 
        return res.render("addCouponForm");
    } catch (error) {
        console.log(error);
    }
}

const addCoupon = async (req, res) => {
    try {
        const {
            couponcode,
            discount,
            minpurchaseamount,
            maxdiscountamount,
            expiredate,
            discountType
        } = req.body;

        if (!couponcode || discount === undefined || !expiredate || !discountType) {
            return res.status(400).json({ error: "All required fields must be filled" });
        }

        const type = discountType.toLowerCase();
        if (!['percentage', 'fixed'].includes(type)) {
            return res.status(400).json({ error: "Invalid discount type" });
        }

        if (type === 'percentage' && discount > 100) {
            return res.status(400).json({ error: "Percentage discount cannot exceed 100%" });
        }

        if (new Date(expiredate) <= new Date()) {
            return res.status(400).json({ error: "Expiry date must be in the future" });
        }

        const existingCoupon = await Coupon.findOne({
            code: { $regex: new RegExp(`^${couponcode.trim()}$`, 'i') }
        });

        if (existingCoupon) {
            return res.status(400).json({ error: "Coupon already exists" });
        }

        const newCoupon = new Coupon({
            code: couponcode.trim(),
            discountType: type,
            discountValue: Number(discount),
            minPurchase: Number(minpurchaseamount) || 0,
            maxDiscount: type === 'percentage' ? Number(maxdiscountamount) || 0 : 0,
            expiryDate: new Date(expiredate),
            isActive: true
        });
        console.log(newCoupon.expiryDate)

        await newCoupon.save();

        return res.status(201).json({
    message: "Coupon added successfully"
});


    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;

        if (!couponId) {
            return res.redirect('/admin/coupon?msg=Invalid coupon ID');
        }

        const deleted = await Coupon.findByIdAndDelete(couponId);

        if (!deleted) {
            return res.redirect('/admin/coupon?msg=Coupon not found');
        }

        return res.redirect('/admin/coupon?msg=Coupon deleted successfully');

    } catch (error) {
        console.error('Delete coupon error:', error);
        return res.redirect('/admin/coupon?msg=Error deleting coupon');
    }
};






module.exports = {
    loadCouponManagement,
    loadAddCoupon,
    addCoupon,
    deleteCoupon,
    

}
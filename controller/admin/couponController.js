const Coupon = require("../../models/couponSchema")

const loadCouponManagement = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

       
        const [total, Coupons] = await Promise.all([
            Coupon.countDocuments({}),
            Coupon.find({})
                .skip(skip)
                .limit(limit)
        ]);

        const totalPages = total === 0 ? 1 : Math.ceil(total / limit);
        

        res.render("couponManagement", {
            Coupons,
            page,
            totalPages
        });

    } catch (error) {
        console.log(error);
        res.status(500).send("Server Error");
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

const loadEditcoupon = async(req,res)=>{
  try {
    const couponId=req.params.id;
        const coupon=await Coupon.findById(couponId)
        if(!coupon){
            return res.status(404).send("Coupon not found") 
        }
        console.log(coupon)
        return res.render("editCoupon",{coupon: {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minPurchase: coupon.minPurchase,
    maxDiscount: coupon.maxDiscount,
    expiryDate: coupon.expiryDate 
      ? coupon.expiryDate.toISOString().split('T')[0] 
      : ''
  }})
  } catch (error) {
    console.log("Error occured while loading Editcoupon",error)
  }
}

const editCoupon = async (req, res) => {
  try {
    const { couponId, code, discountType, discountValue, minPurchase, maxDiscount, expiryDate } = req.body;

    if (!couponId) {
      return res.status(400).json({ error: "Coupon ID is required" });
    }

    const updateData = {
      code: code.toUpperCase().trim(),
      discountType,
      discountValue: Number(discountValue),
      minPurchase: Number(minPurchase),
      maxDiscount: Number(maxDiscount),
      expiryDate: new Date(expiryDate)  
    };

    const updatedCoupon = await Coupon.findByIdAndUpdate(couponId, updateData, {
      new: true,
      runValidators: true
    });

    if (!updatedCoupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    res.json({ message: "Coupon updated successfully!" });

  } catch (error) {
    console.error("Error editing coupon:", error);

    if (error.code === 11000) {
      return res.status(400).json({ error: "Coupon code already exists" });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(", ") });
    }

    res.status(500).json({ error: "Internal server error" });
  }
};




module.exports = {
    loadCouponManagement,
    loadAddCoupon,
    addCoupon,
    deleteCoupon,
    loadEditcoupon,
    editCoupon
    

}
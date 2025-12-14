const Category = require("../../models/categorySchema");
const ReferralOffer = require("../../models/referralOffer");
const CategoryOffer = require("../../models/categoryOffer");

const loadOfferManagement = async (req, res) => {
  try {
    let referralOffer = await ReferralOffer.findOne({});
    
    if (!referralOffer) {
      referralOffer = await ReferralOffer.create({
        refferalBonus:500,
        maxUsesPerUser: 5,
        isActive: true,
      });
    }
    const categoryOffers = await CategoryOffer.find({}).populate('categoryId','categoryname')
    const categories = await Category.find({ isListed: true });
  
    if (!categories) {
      return res.status(404).send("No categories found");
    }
    res.render("offerManagement", {
      referralOffer,
      categoryOffers,
      categories,
    });
  } catch (error) {
    console.error(error);
  }
};

const updateReferralOffer= async (req,res)=>{
  try {
        const { refferalBonus, maxUsesPerUser } = req.body;

        if (!refferalBonus || !maxUsesPerUser) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }


        if (maxUsesPerUser < 1) {
            return res.json({ 
                success: false, 
                message: 'Max uses must be at least 1' 
            });
        }

        const referralOffer = await ReferralOffer.findOne();
        
        if (!referralOffer) {
            return res.json({ 
                success: false, 
                message: 'Referral offer not found' 
            });
        }

        referralOffer.refferalBonus = refferalBonus;
        referralOffer.maxUsesPerUser = maxUsesPerUser;
        await referralOffer.save();

        res.json({ 
            success: true, 
            message: 'Referral offer updated successfully' 
        });
    } catch (error) {
        console.error('Error updating referral offer:', error);
        res.json({ 
            success: false, 
            message: 'Failed to update referral offer' 
        });
    }
};

// Toggle Referral Offer Status
const toggleReferralOfferStatus = async (req, res) => {
    try {
        const { isActive } = req.body;

        const referralOffer = await ReferralOffer.findOne();
        
        if (!referralOffer) {
            return res.json({ 
                success: false, 
                message: 'Referral offer not found' 
            });
        }

        referralOffer.isActive = isActive;
        await referralOffer.save();

        res.json({ 
            success: true, 
            message: `Referral offer ${isActive ? 'enabled' : 'disabled'} successfully` 
        });
    } catch (error) {
        console.error('Error toggling referral offer:', error);
        res.json({ 
            success: false, 
            message: 'Failed to toggle referral offer status' 
        });
    }
};

const createCategoryOffer = async(req,res)=>{
     try {
        const { categoryId, discountPercentage, startDate, endDate } = req.body;

        if (!categoryId || !discountPercentage || !startDate || !endDate) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        if (discountPercentage < 1 || discountPercentage > 100) {
            return res.json({ 
                success: false, 
                message: 'Discount must be between 1 and 100' 
            });
        }

        if (new Date(endDate) <= new Date(startDate)) {
            return res.json({ 
                success: false, 
                message: 'End date must be after start date' 
            });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.json({ 
                success: false, 
                message: 'Category not found' 
            });
        }

        const overlappingOffer = await CategoryOffer.findOne({
            categoryId: categoryId,
            isActive: true,
            $or: [
                { 
                    startDate: { $lte: new Date(startDate) },
                    endDate: { $gte: new Date(startDate) }
                },
                { 
                    startDate: { $lte: new Date(endDate) },
                    endDate: { $gte: new Date(endDate) }
                },
                { 
                    startDate: { $gte: new Date(startDate) },
                    endDate: { $lte: new Date(endDate) }
                }
            ]
        });

        if (overlappingOffer) {
            return res.json({ 
                success: false, 
                message: 'An active offer already exists for this category in the specified date range' 
            });
        }

        const categoryOffer = await CategoryOffer.create({
            categoryId,
            discountPercentage,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            isActive: true
        });

        res.json({ 
            success: true, 
            message: 'Category offer created successfully',
            data: categoryOffer
        });
    } catch (error) {
        console.error('Error creating category offer:', error);
        res.json({ 
            success: false, 
            message: 'Failed to create category offer' 
        });
    }
}


const updateCategoryOffer = async(req,res)=>{
    try {
        const { id } = req.params;
        const { discountPercentage, startDate, endDate } = req.body;

        if (!discountPercentage || !startDate || !endDate) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        if (discountPercentage < 1 || discountPercentage > 100) {
            return res.json({ 
                success: false, 
                message: 'Discount must be between 1 and 100' 
            });
        }

        if (new Date(endDate) <= new Date(startDate)) {
            return res.json({ 
                success: false, 
                message: 'End date must be after start date' 
            });
        }

        const categoryOffer = await CategoryOffer.findById(id);
        
        if (!categoryOffer) {
            return res.json({ 
                success: false, 
                message: 'Category offer not found' 
            });
        }

        const overlappingOffer = await CategoryOffer.findOne({
            _id: { $ne: id },
            categoryId: categoryOffer.categoryId,
            isActive: true,
            $or: [
                { 
                    startDate: { $lte: new Date(startDate) },
                    endDate: { $gte: new Date(startDate) }
                },
                { 
                    startDate: { $lte: new Date(endDate) },
                    endDate: { $gte: new Date(endDate) }
                },
                { 
                    startDate: { $gte: new Date(startDate) },
                    endDate: { $lte: new Date(endDate) }
                }
            ]
        });

        if (overlappingOffer) {
            return res.json({ 
                success: false, 
                message: 'Another active offer exists for this category in the specified date range' 
            });
        }

        categoryOffer.discountPercentage = discountPercentage;
        categoryOffer.startDate = new Date(startDate);
        categoryOffer.endDate = new Date(endDate);
        await categoryOffer.save();

        res.json({ 
            success: true, 
            message: 'Category offer updated successfully' 
        });
    } catch (error) {
        console.error('Error updating category offer:', error);
        res.json({ 
            success: false, 
            message: 'Failed to update category offer' 
        });
    }
}


const toggleCategoryOfferStatus = async(req,res)=>{
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const categoryOffer = await CategoryOffer.findById(id);
        
        if (!categoryOffer) {
            return res.json({ 
                success: false, 
                message: 'Category offer not found' 
            });
        }

        categoryOffer.isActive = isActive;
        await categoryOffer.save();

        res.json({ 
            success: true, 
            message: `Category offer ${isActive ? 'enabled' : 'disabled'} successfully` 
        });
    } catch (error) {
        console.error('Error toggling category offer:', error);
        res.json({ 
            success: false, 
            message: 'Failed to toggle category offer status' 
        });
    }
}


    const deleteCategoryOffer = async(req,res)=>{}

module.exports = {
  loadOfferManagement,
  updateReferralOffer,
  toggleReferralOfferStatus,
  createCategoryOffer,
  updateCategoryOffer,
  toggleCategoryOfferStatus,
  deleteCategoryOffer
};

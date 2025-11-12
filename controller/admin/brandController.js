const brand = require("../../models/brandSchema");



const brandInfo = async(req,res)=>{
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4 ;
        const skip = (page-1)*limit;

        const BrandData = await brand.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalBrands = await brand.countDocuments();
        const totalPages = Math.ceil(totalBrands/limit)
        res.render("brands",{
            brands:BrandData,
            currentPage:page,
            totalPages:totalPages,
            totalBrands:totalBrands
        });


    } catch (error) {
        console.error(error);
        res.redirect("/pageerror")
    }
}

const addBrands = async (req, res) => {
    const { brandname, description } = req.body;

    console.log(req.body)

    // Backend validation
    if (!brandname || typeof brandname !== 'string' || brandname.trim() === '') {
        return res.status(400).json({ error: 'brand name is required and must be a non-empty string' });
    }

    try {
        // Check for existing brand (case-insensitive)
        const existingBrand = await brand.findOne({ 
            brandname: { $regex: new RegExp(`^${brandname.trim()}$`, 'i') }
        });

        if (existingBrand) {
            return res.status(400).json({ error: 'Brand already exists' });
        }

        // Create new brand
        const newBrand = new brand({
            brandname: brandname.trim(),
            description: description ? description.trim() : ''
        });

        const savedBrand = await newBrand.save();

        return res.status(201).json({
            message: 'Brand added successfully',
            brands: {
                id: savedBrand._id,
                name: savedBrand.brandname,
                description: savedBrand.products
            }
        });
    } catch (error) {
        console.error('Error adding brand:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const loadaddBrands = async(req,res)=>{
    try {
       return res.render("addbrands",{});
    } catch (error) {
        console.error("Error occured while rendering add brands page",error)
    }
}

const editBrands = async(req,res)=>{
    try {
        const {brandId,brandname, description}=req.body;
        console.log(req.body)
        const updatedBrand=await brand.findByIdAndUpdate(brandId , {brandname ,description:description})
        res.redirect("/admin/brands")
    } catch (error) {
        console.error("Error occured while rendering brands page")
    }
}


const loadeditBrands=async(req,res)=>{
    try {
        const brandId=req.params.id
        const brands=await brand.findById(brandId)
        if(!brands){
            return res.status(404).send("brand not found") 
        }
        return res.render("editbrand",{brands})
    } catch (error) {
        console.error("Error occured while rendering edit brands page",error)
    }
}


module.exports={
    loadeditBrands,
    editBrands,
    loadaddBrands,
    addBrands,
    brandInfo

}
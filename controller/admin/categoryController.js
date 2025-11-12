const Category = require("../../models/categorySchema");



const categoryInfo = async(req,res)=>{
    try {
        const message=req.query.mssg;
        const page = parseInt(req.query.page) || 1;
        const limit = 4 ;
        const skip = (page-1)*limit;

        const categoryData = await Category.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories/limit)
        res.render("category",{
            categories:categoryData,
            currentPage:page,
            totalPages:totalPages,
            totalCategories:totalCategories,
            message
        });


    } catch (error) {
        console.error(error);
        res.redirect("/pageerror")
    }
}

const addCategory = async (req, res) => {
    const { categoryname, categorydesc } = req.body;

    console.log(req.body)

    // Backend validation
    if (!categoryname || typeof categoryname !== 'string' || categoryname.trim() === '') {
        return res.status(400).json({ error: 'Category name is required and must be a non-empty string' });
    }

    try {
        // Check for existing category (case-insensitive)
        const existingCategory = await Category.findOne({ 
            categoryname: { $regex: new RegExp(`^${categoryname.trim()}$`, 'i') }
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Category already exists' });
        }

        // Create new category
        const newCategory = new Category({
            categoryname: categoryname.trim(),
            description: categorydesc ? categorydesc.trim() : ''
        });

        const savedCategory = await newCategory.save();

        return res.status(201).json({
            message: 'Category added successfully',
            category: {
                id: savedCategory._id,
                name: savedCategory.categoryname,
                description: savedCategory.categorydesc
            }
        });
    } catch (error) {
        console.error('Error adding category:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const loadaddCategory = async(req,res)=>{
    try {
       return res.render("addCategory",{});
    } catch (error) {
        console.error("Error occured while rendering add category page",error)
    }
}

const editCategory = async(req,res)=>{
    try {
        const {categoryId,categoryname,categorydesc}=req.body;
       // console.log(req.body)
        const updatedCategory=await Category.findByIdAndUpdate(categoryId , {categoryname , description:categorydesc})
        console.log(updatedCategory)
        res.redirect("/admin/category")
    } catch (error) {
        console.error("Error occured while redirect category page")
        res.redirect('/admin/category?mssg=Entered Category name already exists.Try again.')
    }
}


const loadeditcategory=async(req,res)=>{
    try {
        const categoryId=req.params.id;
        const category=await Category.findById(categoryId)
        if(!category){
            return res.status(404).send("Category not found") 
        }
        return res.render("editcategory",{category})
    } catch (error) {
        console.error("Error occured while rendering edit category page",error)
    }
}


module.exports={
    categoryInfo,
    addCategory,
    loadaddCategory,
    loadeditcategory,
    editCategory

}